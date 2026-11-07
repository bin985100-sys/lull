export type Entry = {title:string; artist:string};
export type FileList = {name:string; tracks:Entry[]};
export function parseLibrary(text:string, filename:string):FileList[] {
  const groups=new Map<string,Entry[]>();
  const fallback=filename.replace(/\.[^.]+$/,'');
  function add(group:unknown, title:unknown, artist:unknown) {
    if (typeof title !== 'string' || !title.trim() || typeof artist !== 'string' || !artist.trim()) return;
    const name=String(group || fallback);
    if (!groups.has(name)) groups.set(name,[]);
    groups.get(name)!.push({title:title.trim(),artist:artist.trim()});
  }
  text=text.replace(/^\uFEFF/,'').trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    const data=JSON.parse(text);
    const lists=Array.isArray(data) ? [{name:fallback,items:data}] : data.playlists || [data];
    for (const list of lists) for (const item of list.items || list.tracks || []) {
      const t=item.track || item;
      add(list.name || list.title,t.trackName || t.title || t.name,t.artistName || t.artist || t.artists?.map((a:any)=>a.name || a).join(', '));
    }
  } else {
    const header=text.split(/\r?\n/,1)[0];
    const sep=header.includes('\t') ? '\t' : header.split(';').length>header.split(',').length ? ';' : ',';
    const rows:string[][]=[]; let row:string[]=[], cell='', quoted=false;
    for (let i=0;i<text.length;i++) {
      const c=text[i];
      if (c==='"') {if (quoted && text[i+1]==='"') {cell+='"';i++;} else quoted=!quoted;}
      else if (!quoted && c===sep) {row.push(cell);cell='';}
      else if (!quoted && c==='\n') {row.push(cell.trimEnd());rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if (quoted) throw Error('В файле не закрыта кавычка');
    row.push(cell.trimEnd());rows.push(row);
    const names=rows.shift()!.map(h=>h.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''));
    const col=(keys:string[])=>names.findIndex(h=>keys.includes(h));
    const ti=col(['trackname','tracktitle','title','name','название','трек']);
    const ar=col(['artist','artistname','artistnames','artists','исполнитель']);
    const pl=col(['playlist','playlistname','sourcename','sourceplaylist','плейлист']);
    if (ti<0 || ar<0) throw Error('Нужны столбцы Track Name и Artist. Столбец Playlist задаёт плейлист.');
    for (const r of rows) add(r[pl],r[ti],r[ar]);
  }
  if (!groups.size) throw Error('В файле нет названий треков и исполнителей');
  return [...groups].map(([name,tracks])=>({name,tracks}));
}
