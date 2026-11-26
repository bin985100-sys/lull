import { Pressable, View } from 'react-native';
import {useRef,useState} from 'react';
import { Btn,Press,T } from '@/ui/kit';
import { closeSheet, openSheet, toast } from '@/ui/overlay';
import { setSleep, useSleep } from '@/player/player';
import { downloaded, saveDownload } from '@/player/downloads';
import { streamUrl, type Track } from '@/api/audius';
import { streamUrlYt } from '@/api/lull';
import { Icon } from '@/ui/Icon';

export async function saveTracks(tracks: Track[],progress?:(done:number)=>void) {
  let ok = 0;
  toast('Скачивание началось', 'download');
  let done=0;
  for (const t of tracks) {
    try { if (!downloaded(t)) await saveDownload(t,t.source === 'yt' ? streamUrlYt(t.id) : streamUrl(t.id)); ok++; } catch {}
    progress?.(++done);
  }
  toast(`Скачано ${ok} из ${tracks.length}`, ok === tracks.length ? 'check' : 'info');
}
export function OfflineSaveButton({tracks}:{tracks:Track[]}) {
  const [done,setDone]=useState<number | null>(null);
  const busy=useRef(false);
  return <Btn label={done===null ? 'Скачать для офлайна' : `Скачиваем: ${done} из ${tracks.length}`} kind="dark" icon="download" disabled={done!==null} style={{marginTop:12,opacity:1}}
    onPress={()=>{if(busy.current)return;busy.current=true;setDone(0);void saveTracks(tracks,setDone).catch(()=>toast('Не удалось начать скачивание','info')).finally(()=>{busy.current=false;setDone(null);});}}/>;
}
export function SleepButton() {
  const state = useSleep();
  const label = state.endTrack ? 'До конца трека' : state.deadline ? 'До ' + new Date(state.deadline).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Таймер сна';
  return <Press accessibilityRole="button" accessibilityLabel={state.endTrack || state.deadline ? `Таймер сна: ${label}` : label} onPress={() => openSheet(() => <View><T v="h2">Таймер сна</T>
    {([15,30,45,'track',null] as const).map(m => <Pressable key={String(m)} style={{paddingVertical:14}} onPress={() => { setSleep(m); closeSheet(); }}>
      <T>{m === null ? 'Выключить' : m === 'track' ? 'До конца трека' : m + ' минут'}</T></Pressable>)}</View>)}
    style={{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',paddingHorizontal:2,gap:5,minHeight:62}}>
      <Icon name="clock" size={24} color={state.endTrack || state.deadline ? '#b4eaff' : undefined}/>
      <T v="small" numberOfLines={1} style={{fontSize:11.5}}>{label}</T>
    </Press>;
}
