import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';
import type { Track } from '@/api/audius';

const key = (t: Track) => (t.source || 'audius') + '-' + t.id;
const root = () => new Directory(Paths.document, 'lull-downloads');
const folder = (t: Track) => new Directory(root(), key(t));
const audio = (d: Directory, t: Track) => new File(d, t.source === 'yt' ? 'audio.m4a' : 'audio.mp3');
export const useDownloads = create<{ tracks: Track[]; busy: string[] }>(() => ({ tracks: [], busy: [] }));
const jobs = new Map<string, Promise<void>>();
let initialized = false;

export function loadDownloads() {
  if (initialized || Platform.OS === 'web') return;
  const dir = root();
  dir.create({ intermediates: true, idempotent: true });
  const tracks: Track[] = [];
  for (const item of dir.list()) {
    if (!(item instanceof Directory)) continue;
    if (item.name.endsWith('.part')) { item.delete(); continue; }
    try {
      const t = JSON.parse(new File(item, 'track.json').textSync()) as Track;
      if (key(t) === item.name && audio(item,t).size > 0) tracks.push(t);
    } catch {}
  }
  initialized = true;
  useDownloads.setState({ tracks });
}

export function downloaded(t: Track) {
  if (Platform.OS === 'web' || !/^[\w-]+$/.test(t.id)) return;
  try {
    loadDownloads();
    if (!useDownloads.getState().tracks.some(x => key(x) === key(t))) return;
    const f = audio(folder(t),t);
    if (f.exists && f.size > 0) return f.uri;
  } catch {}
}

export function saveDownload(t: Track, url: string): Promise<void> {
  if (!/^[\w-]+$/.test(t.id) || Platform.OS === 'web') return Promise.reject(new Error('Сохранение недоступно'));
  if (downloaded(t)) return Promise.resolve();
  const id = key(t);
  const existing = jobs.get(id);
  if (existing) return existing;
  const task = (async () => {
    loadDownloads();
    const tmp = new Directory(root(), id + '.part');
    tmp.create({ intermediates: true, idempotent: true });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
      const file = await File.downloadFileAsync(url, audio(tmp,t), { idempotent: true, signal: ac.signal });
      if (!file.size) throw new Error('Пустой файл');
      await new File(tmp, 'track.json').write(JSON.stringify(t));
      const dest = folder(t);
      if (dest.exists) dest.delete();
      await tmp.move(dest);
      useDownloads.setState(s => ({ tracks: [t, ...s.tracks.filter(x => key(x) !== id)] }));
    } catch (e) { if (tmp.exists && tmp.name.endsWith('.part')) tmp.delete(); throw e; }
    finally { clearTimeout(timer); }
  })().finally(() => { jobs.delete(id); useDownloads.setState({ busy: [...jobs.keys()] }); });
  jobs.set(id,task);
  useDownloads.setState({ busy: [...jobs.keys()] });
  return task;
}

export function removeDownload(t: Track) {
  if (!downloaded(t)) return;
  folder(t).delete();
  useDownloads.setState(s => ({ tracks: s.tracks.filter(x => key(x) !== key(t)) }));
}
