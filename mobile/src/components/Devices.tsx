import { SlidingPill, usePillGroup } from '@/ui/SlidingPill';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { transferPlayback } from '@/api/playback';
import { useLibrary } from '@/store/library';
import { currentTrack, usePlayer, useProgress } from '@/player/player';
import { useCoverColors } from '@/theme/useCoverColors';
import { PlayerBackdrop } from '@/ui/PlayerBackdrop';
import { listOutputs, openBluetooth, openOutputPicker, outputSupport, selectedOutput, selectOutput, type OutputDevice } from '@/player/audio-output';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, T } from '@/ui/kit';
import { closeSheet, openSheet, toast } from '@/ui/overlay';

export function openDevices(){openSheet(()=><Devices/>,()=><DeviceBackdrop/>);}
function DeviceBackdrop(){
 const track=usePlayer(currentTrack),colors=useCoverColors(track?.artwork,track?.id);
 return <PlayerBackdrop uri={track?.artwork} colors={colors} active variant="sheet"/>;
}
function Devices(){
 usePlayer(s=>s.playing);useProgress(s=>s.duration);
 const {colors:C}=useTheme(),token=useLibrary(s=>s.account.token),support=outputSupport();
 const [devices,setDevices]=useState<OutputDevice[]>([{id:'',label:'Системный аудиовыход'}]),[selected,setSelected]=useState(selectedOutput),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const selection=usePillGroup(selected);
 useEffect(()=>{let live=true;const refresh=()=>{void listOutputs().then(rows=>{if(live){setDevices(rows);setSelected(rows.some(d=>d.id===selectedOutput())?selectedOutput():'');}},()=>{});};refresh();if(Platform.OS==='web')navigator.mediaDevices?.addEventListener?.('devicechange',refresh);return()=>{live=false;if(Platform.OS==='web')navigator.mediaDevices?.removeEventListener?.('devicechange',refresh);};},[]);
 const act=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();setSelected(selectedOutput());void listOutputs().then(setDevices,()=>{});}catch(e){setError(e instanceof Error?e.message:'Не удалось переключить звук');}finally{setBusy(false);}};
 return <View style={{gap:18}}><View style={{alignItems:'center',gap:12,paddingVertical:8}}><View style={{width:66,height:66,borderRadius:33,backgroundColor:C.s2,alignItems:'center',justifyContent:'center'}}><Icon name="device" size={36}/></View><T v="h2">Где слушаем?</T></View>
  <View style={{gap:8}}>{devices.map(d=><Pressable key={d.id} onLayout={selection.layout(d.id)} disabled={busy||!support.choices} accessibilityRole="radio" accessibilityLabel={d.label} accessibilityState={{checked:d.id===selected,disabled:busy||!support.choices}} onPress={()=>void act(async()=>{await selectOutput(d.id);setSelected(d.id);})} style={{minHeight:68,padding:18,borderRadius:34,backgroundColor:C.bg,borderWidth:.8,borderColor:C.line,flexDirection:'row',alignItems:'center',gap:14}}><Icon name={d.id?'headphones':'device'} size={28}/><T numberOfLines={2} style={{flex:1,fontFamily:F.semi,fontSize:14}}>{d.label}</T>{d.id===selected?<Icon name="check" size={23}/>:null}</Pressable>)}<SlidingPill motion={selection.pill} borderColor={C.tx}/></View>
  {support.picker?<Btn label={support.airplay?'AirPlay':'Выбрать устройство'} icon="device" disabled={busy} onPress={()=>void act(openOutputPicker)}/>:<T v="small" style={{textAlign:'center'}}>{Platform.OS==='ios'?'AirPlay и наушники доступны в Пункте управления.':'Аудиовыход можно выбрать в настройках системы.'}</T>}
  {Platform.OS==='android'?<Btn label="Bluetooth и наушники" icon="headphones" kind="dark" disabled={busy} onPress={()=>void act(openBluetooth)}/>:null}
  {error?<T style={{fontSize:12,lineHeight:18,color:C.danger,textAlign:'center'}}>{error}</T>:null}
  <View style={{height:1,backgroundColor:C.line,marginVertical:4}}/>
  <T style={{fontFamily:F.bold,fontSize:16}}>Продолжить в Lull</T>
  <T v="small">Один аккаунт на обоих устройствах. Передай очередь, затем прими её на другом.</T>
  {token?<View style={{gap:10}}><Btn label="Передать очередь" icon="arrowUR" disabled={busy} onPress={()=>void act(async()=>{await transferPlayback(true);closeSheet();toast('Очередь готова. Прими её на другом устройстве.','check');})}/><Btn label="Принять очередь здесь" icon="download" kind="dark" disabled={busy} onPress={()=>void act(async()=>{await transferPlayback(false);closeSheet();})}/></View>:<Btn label="Войти для переноса" kind="dark" icon="user" onPress={()=>{closeSheet();router.push('/auth');}}/>}
 </View>;
}
