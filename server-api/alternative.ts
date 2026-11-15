import { yt, search } from '../electron/yt';
type Credit = { name?: string; id?: string; channel_id?: string; verified?: boolean };
type Song = { id: string; title: string; artists: Credit[]; durationSec?: number };
const tracks = new Map<string, Song>();
const pairs = new Map<string, { ids: string[]; until: number }>();
const valid = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id);
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const title = (s: string) => norm(s.replace(/[([](?:official (?:music )?video|official audio|официальный клип)[)\]]/gi,''));
function creditedTitle(source:Song, candidate:Song) {
  let text=norm(candidate.title
    .replace(/[([](?:english subtitles|русские субтитры|lyrics|lyric video|текст(?: песни)?|official (?:music |lyric )?video|official audio)[)\]]/gi,'')
    .replace(/\|\s*(?:lyrics|текст(?: песни)?)\s*\|\s*$/gi,''));
  if(!source.artists.length)return false;
  // Collaborative uploads put both credits in the title, with &, feat. or commas.
  // Remove only the actual source credits; remix/live/speed edits remain and fail.
  for(const artist of source.artists) {
    if(!artist.name)return false;
    const words=norm(artist.name).split(' ').map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const pattern=new RegExp('(?:^| )'+words.join('\\s*')+'(?= |$)','iu');
    if(!pattern.test(text))return false;
    text=text.replace(pattern,' ').trim();
  }
  text=text.replace(/\b(?:feat|ft|featuring|and|with)\b/gi,' ').replace(/\s+/g,' ').trim();
  return text===title(source.title);
}
export const alternativeHint=(id:string)=>tracks.get(id);
/** YouTube now returns LockupView beside legacy Video nodes. */
export function videoCandidates(result:any): Song[] {
  const found=new Map<string,Song>();
  for(const v of [...(result.videos || []),...(result.results || [])]) {
    if(v.type==='LockupView') {
      if(v.content_type!=='VIDEO' || !valid(v.content_id))continue;
      const rows=v.metadata?.metadata?.metadata_rows || [];
      const credits=rows.flatMap((row:any)=>(row.metadata_parts || []).flatMap((part:any)=>{
        const text=part.text;
        const runs=text?.runs?.length ? text.runs : [text];
        return runs.filter((run:any)=>run?.endpoint?.payload?.browseId?.startsWith('UC')).map((run:any)=>({name:String(run.text ?? text),id:run.endpoint.payload.browseId}));
      }));
      found.set(v.content_id,{id:v.content_id,title:String(v.metadata?.title || ''),artists:credits,durationSec:v.duration?.seconds});
    } else if(valid(v.video_id)) {
      found.set(v.video_id,{id:v.video_id,title:String(v.title || ''),artists:[{name:v.author?.name,id:v.author?.id,verified:v.author?.is_verified_artist}],durationSec:v.duration?.seconds});
    }
  }
  return [...found.values()];
}
export function rememberTracks(value: any, level = 0) {
  if (!value || typeof value !== 'object' || level > 8) return;
  if (valid(value.id) && typeof value.title === 'string' && Array.isArray(value.artists)) {
    const old=tracks.get(value.id);
    const artists=value.artists.length ? value.artists.map((artist:Credit)=>({
      name:artist.name,channel_id:artist.channel_id,id:artist.id || artist.channel_id || old?.artists.find(a=>a.name && artist.name && norm(a.name)===norm(artist.name))?.id,
    })) : old?.artists || [];
    const durationSec=value.durationSec || old?.durationSec;
    if(old && ((!old.durationSec && durationSec) || artists.some((a:Credit)=>a.id && !old.artists.some(b=>b.id===a.id))))pairs.delete(value.id);
    tracks.set(value.id, {id:value.id,title:value.title,artists,durationSec});
    if (tracks.size > 8000) tracks.delete(tracks.keys().next().value!);
    return;
  }
  for (const child of Object.values(value)) rememberTracks(child,level+1);
}
export function sameRecording(a: Song, b: Song) {
  if (!valid(b.id) || a.id === b.id) return false;
  const artist = a.artists.some(x => x.name && b.artists.some(y => y.name && norm(x.name!) === norm(y.name)));
  const inTitle = a.artists.some(x => x.name && [norm(x.name)+' '+title(a.title), title(a.title)+' '+norm(x.name)].includes(title(b.title)));
  const stableCredit=a.artists.some(x=>b.artists.some(y=>((x.id || x.channel_id) && (y.id || y.channel_id)===(x.id || x.channel_id)) || (y.verified && x.name && y.name && norm(x.name)===norm(y.name))));
  const exactTitle=title(a.title)===title(b.title) || inTitle || creditedTitle(a,b);
  if (!a.durationSec || !b.durationSec) {
    // An official upload with the same artist channel and exact title is safe
    // even when Music omits duration. Never accept a cover by name alone here.
    return stableCredit && exactTitle;
  }
  if(Math.abs(a.durationSec-b.durationSec)>12){
    // Official music videos may add a short intro/outro to the album audio.
    // This wider window is exclusive to the same stable artist channel/title.
    return stableCredit && exactTitle && Math.abs(a.durationSec-b.durationSec)<=Math.min(30,a.durationSec*.18);
  }
  if (!artist) return (inTitle || creditedTitle(a,b)) && Math.abs(a.durationSec-b.durationSec) <= 3;
  return !!title(a.title) && exactTitle;
}

export function sameOfficialVideo(source:Song, original:Song | undefined, candidate:Song) {
  if(!original || original.id!==source.id || !original.artists.some(a=>a.verified) || candidate.id===source.id || !valid(candidate.id))return false;
  if(!source.durationSec || !candidate.durationSec || Math.abs(source.durationSec-candidate.durationSec)>3)return false;
  const canonical=title(original.title);
  // The actual official video can name a guest missing from Music's credits.
  // Use that full title as the anchor; never infer guests from an unrelated hit.
  if(!source.artists.some(a=>a.name && canonical.includes(norm(a.name))) || !canonical.includes(title(source.title)))return false;
  const actual=title(candidate.title);
  return actual===canonical || (actual.startsWith(canonical+' ') && /^(?:19|20)\d{2}$/.test(actual.slice(canonical.length+1)));
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
      source = { id, title:source?.title || selected.title.toString(), artists:source?.artists.length ? source.artists : selected.artists?.length ? selected.artists : [{name:selected.author}], durationSec:source?.durationSec || selected.duration?.seconds };
      break;
    }
  } catch {}
  if (source) {
    rememberTracks(source);
    const q = source.artists.map(x => x.name).filter(Boolean).join(' ') + ' ' + source.title;
    const [songs,videos,primary] = await Promise.all([search(q,'songs').then(r=>r.tracks).catch(()=>[]), c.music.search(q,{type:'video'}).then(r => (r.contents || []).flatMap((s:any) => (s.contents || []).map((v:any) => ({id:v.id,title:v.title || '',artists:v.artists || v.authors || [],durationSec:v.duration?.seconds})))).catch(()=>[]),search(q,'all').then(r=>r.top?.track ? [r.top.track] : []).catch(()=>[])]);
    const general = await c.search(q,{type:'video'}).then(videoCandidates).catch(()=>[]);
    const candidates=[...primary,...videos,...general,...songs];
    if(process.env.LULL_ALT_DEBUG==='1')console.info('[alternate candidates]',JSON.stringify({id,source,general,candidates:candidates.slice(0,8).map(({id,title,artists,durationSec})=>({id,title,artists,durationSec}))}));
    const original=general.find(candidate=>candidate.id===id);
    const matched=candidates.filter(candidate=>sameRecording(source!,candidate) || sameOfficialVideo(source!,original,candidate));
    // An audio upload closest to the album duration beats a video with an intro.
    const official=(track:Song)=>track.artists.some(x=>x.verified || source!.artists.some(y=>(y.id || y.channel_id) && (x.id || x.channel_id)===(y.id || y.channel_id)));
    matched.sort((a,b)=>{
      return Number(official(b))-Number(official(a)) || Math.abs((a.durationSec || source!.durationSec || 0)-(source!.durationSec || 0))-Math.abs((b.durationSec || source!.durationSec || 0)-(source!.durationSec || 0));
    });
    const trusted=matched.filter(official), independent=matched.filter(track=>!official(track));
    // Several label uploads can share one regional restriction. Try a separate
    // matching upload after the best official recording, before more label copies.
    ids.unshift(...[...trusted.slice(0,1),...independent,...trusted.slice(1)].map(candidate=>candidate.id));
  }
  const unique = [...new Set(ids)].slice(0,5);
  if (unique.length || source) {
    pairs.set(id,{ids:unique, until:Date.now()+(unique.length ? 3600000 : 30000)});
    if (pairs.size > 2000) pairs.delete(pairs.keys().next().value!);
  }
  return unique;
}
