import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Track } from '@/api/audius';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useTaste, type WaveMode } from '@/store/taste';
import { buildWave } from './engine';

type WaveSession={autoContinue:boolean;active:boolean;busy:boolean;seed:Track|null;error:string|null};
export const useWaveSession=create<WaveSession>()(persist(():WaveSession=>({autoContinue:true,active:false,busy:false,seed:null,error:null}),{name:'lull.wave.v1',storage:createJSONStorage(()=>AsyncStorage),partialize:s=>({autoContinue:s.autoContinue})}));
let request:AbortController|null=null,pending:{seed:string;tracks:Track[];queue:Track[]}|null=null,applying=false;
let members=new Set<string>();
const attempted=new Set<string>();
const key=(t:Track)=>`${t.source}:${t.id}`;
function preserveUpcoming(seed:Track,tracks:Track[]){const s=usePlayer.getState(),seen=new Set(s.queue.map(key));return [seed,...s.queue.slice(s.index+1),...tracks.slice(1).filter(t=>!seen.has(key(t)))];}

function apply(seed:Track,tracks:Track[]){
 const state=usePlayer.getState(),cur=currentTrack(state);
 if(!cur||key(cur)!==key(seed))return;
 if(!state.playing){pending={seed:key(seed),tracks,queue:state.queue};return;}
 applying=true;
 try{members=new Set(tracks.map(key));useWaveSession.setState({active:true});player.startWave(tracks);}finally{applying=false;}
}

/** Explicit wave starts the seed immediately; recommendations arrive in the background. */
export async function startPersonalWave(seed:Track,mode?:WaveMode){
 request?.abort();pending=null;
 const ac=new AbortController();request=ac;
 const r=useTaste.getState().reco;
 const cur=currentTrack();
 useWaveSession.setState({busy:true,error:null,seed,active:true});
 attempted.add(key(seed));
 if(!cur||key(cur)!==key(seed))void player.play([seed],seed.id);
 else if(!usePlayer.getState().playing)player.toggle();
 const originalQueue=usePlayer.getState().queue;
 try{
  const list=await buildWave(seed,mode??r.waveMode,r.waveLength,ac.signal);
  if(ac.signal.aborted||key(currentTrack()??seed)!==key(seed))return false;
  if(list.length<2)throw Error('Пока не нашли похожие треки. Попробуй другой характер волны.');
  apply(seed,usePlayer.getState().queue===originalQueue?list:preserveUpcoming(seed,list));
  return true;
 }catch(e){if(!ac.signal.aborted)useWaveSession.setState({error:e instanceof Error?e.message:'Не удалось собрать волну'});return false;}
 finally{if(request===ac){request=null;useWaveSession.setState({busy:false});}}
}

/** Appends only near the end. Explicit playlists keep their existing order. */
export function startWaveContinuation(){
 const check=()=>{
  if(applying)return;
  const state=usePlayer.getState(),cur=currentTrack(state),ui=useWaveSession.getState();
  if(!cur)return;
  if(ui.active&&!request&&!pending&&members.size>0&&!members.has(key(cur)))useWaveSession.setState({active:false});
  if(pending){if(pending.seed!==key(cur))pending=null;else if(state.playing){const next=pending;pending=null;apply(cur,state.queue===next.queue?next.tracks:preserveUpcoming(cur,next.tracks));return;}}
  if(request&&ui.seed&&key(cur)!==key(ui.seed)){request.abort();request=null;useWaveSession.setState({busy:false});}
  if(!state.playing||!ui.autoContinue||request)return;
  const remaining=state.queue.length-state.index-1;
  if(remaining>0&&(!ui.active||!members.has(key(cur))||remaining>2))return;
  if(attempted.has(key(cur)))return;
  attempted.add(key(cur));
  // Bound bookkeeping over long sessions; queue history is owned by the player.
  if(attempted.size>300)attempted.delete(attempted.values().next().value!);
  const seed=cur,ac=new AbortController();request=ac;
  useWaveSession.setState({active:true,seed,busy:true,error:null});
  const r=useTaste.getState().reco;
  void buildWave(seed,r.waveMode,r.waveLength,ac.signal).then(list=>{
   const now=usePlayer.getState(),current=currentTrack(now);
   if(ac.signal.aborted||!current||key(current)!==key(seed))return;
   const seen=new Set(now.queue.map(key));
   const more=list.filter(t=>!seen.has(key(t)));
   if(more.length)apply(seed,[seed,...now.queue.slice(now.index+1),...more]);
  }).catch(()=>{if(!ac.signal.aborted)useWaveSession.setState({error:'Не удалось продолжить волну. Можно попробовать снова.'});}).finally(()=>{if(request===ac){request=null;useWaveSession.setState({busy:false});}});
 };
 const offPlayer=usePlayer.subscribe(check),offSettings=useWaveSession.subscribe((s,p)=>{if(s.autoContinue!==p.autoContinue){if(!s.autoContinue){request?.abort();request=null;pending=null;useWaveSession.setState({busy:false});}else check();}});
 check();
 return()=>{offPlayer();offSettings();request?.abort();request=null;pending=null;};
}
