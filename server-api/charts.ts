import {find} from './importer';
import {storeGet,storeSet} from '../electron/store';
import type {HomeSection,Track} from '../shared/types';

type Snapshot={at:number;updated:string;tracks:Track[]};
let snapshot=storeGet<Snapshot>('chart-ru-v1');
let running:Promise<void> | undefined;
export async function refreshCharts() {
  if(snapshot?.tracks.length && Date.now()-snapshot.at<6*3600_000)return;
  if(running)return running;
  running=(async()=>{
    let feed:any;
    for(let attempt=0;attempt<2;attempt++){
      try {
        const response=await fetch('https://rss.marketingtools.apple.com/api/v2/ru/music/most-played/25/songs.json',{signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw Error('chart HTTP '+response.status);
        feed=(await response.json() as any).feed;
        if(!Array.isArray(feed?.results) || !feed.results.length)throw Error('empty chart');
        break;
      }catch(error){if(attempt===1)throw error;}
    }
    const found:(Track | null)[]=new Array(feed.results.length).fill(null);let cursor=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(cursor<feed.results.length){
        const index=cursor++, song=feed.results[index];
        if(typeof song.name!=='string' || typeof song.artistName!=='string')continue;
        const track=await find({title:song.name,artist:song.artistName},true).catch(()=>null);
        if(track)found[index]={...track,thumb:track.thumb || song.artworkUrl100?.replace('100x100','600x600')};
      }
    }));
    const seen=new Set<string>();const tracks=found.filter((t):t is Track=>!!t && !seen.has(t.id) && !!seen.add(t.id));
    if(tracks.length<5)throw Error('chart matching incomplete');
    snapshot={at:Date.now(),updated:String(feed.updated || ''),tracks};storeSet('chart-ru-v1',snapshot);
    console.info('[charts] Russia',tracks.length,'matched');
  })().finally(()=>{running=undefined;});
  return running;
}
export async function publicCharts():Promise<HomeSection[]> {
  if(!snapshot?.tracks.length)await refreshCharts();
  else void refreshCharts().catch(error=>console.warn('[charts]',error.message));
  if(!snapshot?.tracks.length || Date.now()-snapshot.at>7*24*3600_000)throw Error('Чарт временно недоступен');
  const date=new Date(snapshot.updated || snapshot.at).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
  return [{title:'Популярное в России',subtitle:`Рейтинг Apple Music · Россия · ${date}`,layout:'tracks',items:snapshot.tracks.map(track=>({kind:'track',id:track.id,title:track.title,thumb:track.thumb,track}))}];
}
