import type { Track } from '@/api/audius';
import type { HistoryItem } from './library';
export type HistoryRow={key:string;kind:'heading';title:string}|{key:string;kind:'track';track:Track;list:Track[]};
export function historyRows(history:readonly HistoryItem[],now=Date.now()):HistoryRow[]{
 const midnight=new Date(now);midnight.setHours(0,0,0,0);
 const groups:Record<string,Track[]>={Сегодня:[],Вчера:[],Раньше:[]},seen=new Set<string>();
 for(const item of history){const group=item.at>=+midnight?'Сегодня':item.at>=+midnight-864e5?'Вчера':'Раньше',key=group+':'+(item.track.source??'audius')+':'+item.track.id;if(seen.has(key))continue;seen.add(key);groups[group].push(item.track);}
 const rows:HistoryRow[]=[];
 for(const [title,list] of Object.entries(groups)){if(!list.length)continue;rows.push({key:title,kind:'heading',title});for(const track of list)rows.push({key:title+':'+(track.source??'audius')+':'+track.id,kind:'track',track,list});}
 return rows;
}
