import { Directory, File, Paths } from 'expo-file-system';
import { deleteAsync, getInfoAsync, makeDirectoryAsync, readAsStringAsync, readDirectoryAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import type { Track } from '@/api/audius';

const key = (t: Track) => (t.source || 'audius') + '-' + t.id;
const valid = (t: Track) => !!t && /^[\w-]+$/.test(t.id) && (!t.source || t.source === 'yt' || t.source === 'audius');
const root = () => new Directory(Paths.document, 'lull-downloads');
const folder = (t: Track) => new Directory(root(), key(t));
const audio = (d: Directory, t: Track) => new File(d, t.source === 'yt' ? 'audio.m4a' : 'audio.mp3');
const INDEX = 'lull.downloads.index.v2';
type Entry = { track: Track; uri: string; checked: number };
const entries = new Map<string, Entry>(), revisions = new Map<string, number>();
let revision = 0, initialized = false, flight: Promise<void> | null = null;
export const useDownloads = create<{ tracks: Track[]; busy: string[]; loading: boolean; error: boolean }>(() => ({ tracks: [], busy: [], loading: false, error: false }));
const jobs = new Map<string, Promise<void>>();
const publish = () => useDownloads.setState({ tracks: [...entries.values()].map(e => e.track) });
const persistIndex = () => AsyncStorage.setItem(INDEX, JSON.stringify([...entries.values()].map(e => e.track))).catch(() => {});

/** Disk enumeration and metadata reads never run on the UI/JS thread. The
 * small saved index paints first, while bounded batches reconcile actual files. */
export function loadDownloads(): Promise<void> {
  if (initialized || Platform.OS === 'web') return Promise.resolve();
  if (flight) return flight;
  useDownloads.setState({ loading: true, error: false });
  const started = revision;
  flight = (async () => {
    try {
      const cached = JSON.parse(await AsyncStorage.getItem(INDEX) || '[]');
      if (Array.isArray(cached)) for (const t of cached) if (valid(t) && !revisions.has(key(t))) entries.set(key(t), { track: t, uri: audio(folder(t),t).uri, checked: 0 });
    } catch {}
    if (entries.size) publish();
    const directory = root();
    await makeDirectoryAsync(directory.uri, { intermediates: true });
    const names = (await readDirectoryAsync(directory.uri)).filter(name => /^(yt|audius)-[\w-]+$/.test(name));
    const found = new Set<string>();
    for (let start = 0; start < names.length; start += 12) {
      await Promise.all(names.slice(start,start+12).map(async name => {
        try {
          const dir = new Directory(directory,name), t = JSON.parse(await readAsStringAsync(new File(dir,'track.json').uri)) as Track;
          if (!valid(t) || key(t) !== name) return;
          const uri = audio(dir,t).uri, info = await getInfoAsync(uri);
          if (!info.exists || info.isDirectory || info.size <= 0) return;
          found.add(name);
          if ((revisions.get(name) || 0) <= started) entries.set(name,{ track:t, uri, checked:Date.now() });
        } catch {}
      }));
      publish();
      // Large libraries yield between batches even when native promises resolve together.
      await new Promise<void>(resolve => setTimeout(resolve,0));
    }
    for (const id of entries.keys()) if (!found.has(id) && (revisions.get(id) || 0) <= started) entries.delete(id);
    initialized = true; publish(); await persistIndex();
  })().catch(() => { useDownloads.setState({ error: true }); }).finally(() => { flight = null; useDownloads.setState({ loading: false }); });
  return flight;
}

/** Playback checks one chosen file asynchronously, never a whole directory. */
export async function prepareDownload(t: Track): Promise<string | undefined> {
  if (Platform.OS === 'web' || !valid(t)) return;
  const id = key(t), cached = entries.get(id);
  if (cached && Date.now()-cached.checked < 60000) return cached.uri;
  try {
    const uri = cached?.uri ?? audio(folder(t),t).uri, info = await getInfoAsync(uri);
    if (info.exists && !info.isDirectory && info.size > 0) {
      entries.set(id,{track:t,uri,checked:Date.now()});revisions.set(id,++revision);return uri;
    }
  } catch {}
  if (entries.delete(id)) { revisions.set(id,++revision);publish();void persistIndex(); }
}

/** A constant-time lookup; safe in the player's status/queue hot path. */
export function downloaded(t: Track) {
  const entry=Platform.OS!=='web'&&valid(t)?entries.get(key(t)):undefined;
  return entry&&Date.now()-entry.checked<60000?entry.uri:undefined;
}

export async function saveDownload(t: Track, url: string): Promise<void> {
  if (!valid(t) || Platform.OS === 'web') throw new Error('Сохранение недоступно');
  if (await prepareDownload(t)) return;
  const id = key(t), existing = jobs.get(id);
  if (existing) return existing;
  const task = (async () => {
    await makeDirectoryAsync(root().uri,{intermediates:true});
    const tmp = new Directory(root(),id+'.part');tmp.create({intermediates:true,idempotent:true});
    const ac = new AbortController(), timer = setTimeout(()=>ac.abort(),180000);
    try {
      const file = await File.downloadFileAsync(url,audio(tmp,t),{idempotent:true,signal:ac.signal});
      if (!file.size) throw new Error('Пустой файл');
      await new File(tmp,'track.json').write(JSON.stringify(t));
      const dest = folder(t);await deleteAsync(dest.uri,{idempotent:true});await tmp.move(dest);
      entries.set(id,{track:t,uri:audio(dest,t).uri,checked:Date.now()});revisions.set(id,++revision);publish();await persistIndex();
    } catch (e) { await deleteAsync(tmp.uri,{idempotent:true}).catch(()=>{});throw e; }
    finally { clearTimeout(timer); }
  })().finally(()=>{jobs.delete(id);useDownloads.setState({busy:[...jobs.keys()]});});
  jobs.set(id,task);useDownloads.setState({busy:[...jobs.keys()]});return task;
}

export async function removeDownload(t: Track) {
  if (!valid(t) || Platform.OS === 'web') return;
  await deleteAsync(folder(t).uri,{idempotent:true});
  entries.delete(key(t));revisions.set(key(t),++revision);publish();await persistIndex();
}
