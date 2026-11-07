import { yt, search } from '../electron/yt';
type Credit = { name?: string; id?: string; channel_id?: string };
type Song = { id: string; title: string; artists: Credit[]; durationSec?: number };
const tracks = new Map<string, Song>();
const pairs = new Map<string, { ids: string[]; until: number }>();
const valid = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id);
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const title = (s: string) => norm(s.replace(/[([](?:official (?:music )?video|official audio|официальный клип)[)\]]/gi,''));
export function rememberTracks(value: any, level = 0) {
  if (!value || typeof value !== 'object' || level > 8) return;
  if (valid(value.id) && typeof value.title === 'string' && Array.isArray(value.artists)) {
    tracks.set(value.id, {id:value.id,title:value.title,artists:value.artists,durationSec:value.durationSec});
    if (tracks.size > 8000) tracks.delete(tracks.keys().next().value!);
    return;
  }
  for (const child of Object.values(value)) rememberTracks(child,level+1);
}
export function sameRecording(a: Song, b: Song) {
  if (!valid(b.id) || a.id === b.id || !a.durationSec || !b.durationSec || Math.abs(a.durationSec-b.durationSec)>12) return false;
  const artist = a.artists.some(x => x.name && b.artists.some(y => y.name && norm(x.name!) === norm(y.name)));
  const inTitle = a.artists.some(x => x.name && [norm(x.name)+' '+title(a.title), title(a.title)+' '+norm(x.name)].includes(title(b.title)));
  if (!artist) return inTitle && Math.abs(a.durationSec-b.durationSec) <= 3;
  const expected = title(a.title), actual = title(b.title);
  return !!expected && (actual === expected || a.artists.some(x => x.name && actual === norm(x.name)+' '+expected));
}

export async function alternatives(id: string): Promise<string[]> {
  const hit = pairs.get(id);
  if (hit && hit.until > Date.now()) return hit.ids;
  const c = await yt();
  let source = tracks.get(id);
  const ids: string[] = [];
  try {
    const panel = await c.music.getUpNext(id,false);
    for (const entry of panel.contents as any[]) {
      const related = [entry.primary || entry, ...(entry.counterpart || [])].filter(Boolean);
      const selected = related.find(x => x.video_id === id);
      if (!selected) continue;
      ids.push(...related.filter(x => x.video_id !== id && valid(x.video_id)).map(x => x.video_id));
      if (!source) source = { id, title: selected.title.toString(), artists: selected.artists?.length ? selected.artists : [{name:selected.author}], durationSec:selected.duration?.seconds };
      break;
    }
  } catch {}
  if (source) {
    const q = source.artists.map(x => x.name).filter(Boolean).join(' ') + ' ' + source.title;
    const [songs,videos] = await Promise.all([search(q,'songs').then(r=>r.tracks).catch(()=>[]), c.music.search(q,{type:'video'}).then(r => (r.contents || []).flatMap((s:any) => (s.contents || []).map((v:any) => ({id:v.id,title:v.title || '',artists:v.artists || v.authors || [],durationSec:v.duration?.seconds})))).catch(()=>[])]);
    const general = await c.search(q,{type:'video'}).then(r => r.videos.map((v:any) => ({
      id:v.video_id || v.id, title:v.title.toString(), artists:[{name:v.author?.name}], durationSec:v.duration?.seconds
    }))).catch(()=>[]);
    for (const candidate of [...videos,...general,...songs]) if (sameRecording(source,candidate)) ids.push(candidate.id);
  }
  const unique = [...new Set(ids)].slice(0,5);
  if (unique.length || source) {
    pairs.set(id,{ids:unique, until:Date.now()+(unique.length ? 3600000 : 30000)});
    if (pairs.size > 2000) pairs.delete(pairs.keys().next().value!);
  }
  return unique;
}
