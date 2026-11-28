import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { router, useIsFocused } from 'expo-router';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Track } from '@/api/audius';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';
import { prepareTrackWave, startMyWave, startPersonalWave, useWaveSession } from '@/reco/wave-session';
import { useConnectivity } from '@/store/connectivity';
import { useTaste } from '@/store/taste';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { WaveArt } from '@/ui/WaveArt';
import { haptic, Press, T } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { useCoverColors } from '@/theme/useCoverColors';
import { PlayPause } from '@/ui/PlayPause';
import { WaveCoverDeck } from './WaveCoverDeck';
import { offerWaveTracks, previewWaveTrack, useWavePresentation } from '@/reco/wave-presentation';
const key=(t:Track)=>t.source+':'+t.id;

export function WaveHero({fallback,candidates,large=false,header,visible=true}:{fallback?:Track;candidates?:Track[];large?:boolean;header?:ReactNode;visible?:boolean}){
 const layout=useLayout(),narrow=layout.content<320,{height}=useWindowDimensions(),compact=height<650,{colors:C}=useTheme();
 const focused=useIsFocused();
 const cur=usePlayer(currentTrack),queue=usePlayer(s=>s.queue),history=useLibrary(s=>s.history),liked=useLibrary(s=>s.liked);
 const playing=usePlayer(s=>s.playing),wave=usePlayer(s=>s.wave),active=!!wave&&!!cur;
 const session=usePlayer(s=>s.session),prepared=useWaveSession(s=>s.tracks),preparedSeed=useWaveSession(s=>s.seed),epoch=useConnectivity(s=>s.epoch);
 const seed=cur??history[0]?.track??liked[0]??fallback,busy=useWaveSession(s=>s.busy),error=useWaveSession(s=>s.error),mode=useTaste(s=>s.reco.waveMode);
 const idle=useWavePresentation(s=>s.idleTracks),previewKey=useWavePresentation(s=>s.previewKey);
 useEffect(()=>{if(!cur&&candidates?.length)offerWaveTracks([...(seed?[seed]:[]),...candidates]);},[cur,seed,candidates]);
 const tracks=useMemo(()=>active&&wave&&queue.length?queue.slice(wave.startIndex):cur?(preparedSeed&&key(preparedSeed)===key(cur)&&prepared.length?prepared:[cur]):idle.length?idle:seed?[seed]:[],[active,wave,queue,cur,preparedSeed,prepared,idle,seed]);
 useEffect(()=>{if(visible&&cur)prepareTrackWave(cur);},[visible,cur,session,mode,epoch]);
 const [settled,setSettled]=useState<Track|null>(null);
 const selected=tracks.find(t=>key(t)===previewKey)??cur??tracks[0]??seed,selectedPlaying=active&&!!cur&&!!selected&&key(cur)===key(selected);
 useEffect(()=>{const timer=setTimeout(()=>setSettled(selected??null),140);return()=>clearTimeout(timer);},[selected]);
 const background=settled??selected,colors=useCoverColors(background?.artwork,background?.id??mode);
 useEffect(()=>{if(focused&&cur)previewWaveTrack(cur);},[focused,cur]);
 const cancelPreview=useCallback(()=>{const current=currentTrack();if(current)previewWaveTrack(current);},[]);
 const pick=useCallback((track:Track,kind:'pick'|'tap')=>{const state=usePlayer.getState(),current=currentTrack(state);
  if(state.wave){const offset=state.wave.startIndex,index=state.queue.findIndex((t,i)=>i>=offset&&key(t)===key(track));if(index>=0){if(current&&key(current)===key(track)){if(kind==='tap'||!state.playing)player.toggle();}else player.skipTo(index);return true;}return false;}
  void startPersonalWave(track);
 },[]);
 return <View style={{height:compact?(header?610:520):Math.min(large?810:780,Math.max(header?690:610,height*.87)),marginHorizontal:-layout.side,overflow:'hidden',backgroundColor:C.bg}}>
  <WaveArt animate={visible} colors={colors}/><LinearGradient pointerEvents="none" colors={[C.bg,'transparent','transparent',C.bg]} locations={[0,.24,.68,1]} style={{position:'absolute',inset:0}}/>
  {header?<View style={{paddingHorizontal:layout.side,zIndex:1}}>{header}</View>:null}
  <View style={{flex:1,justifyContent:'center',alignItems:'center',paddingBottom:header?22:0,gap:8}}>
   <WaveCoverDeck tracks={tracks} activeIndex={Math.max(0,tracks.findIndex(t=>selected&&key(t)===key(selected)))} compact={compact||narrow} enabled={focused&&visible} contextKey={`${session}:${wave?.kind??'preview'}:${wave?.seed.id??cur?.id??'idle'}`} onSelect={pick} onPreview={previewWaveTrack} onCancel={cancelPreview}/>
   <Press accessibilityRole="button" accessibilityLabel={selectedPlaying?(playing?'Приостановить волну':'Продолжить волну'):'Включить мою волну'} disabled={busy&&!cur} onPress={()=>{haptic();if(selectedPlaying)player.toggle();else if(selected){if(cur)pick(selected,'pick');else void startMyWave(selected);}else router.push('/onboarding');}} style={{minHeight:84,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:narrow?10:14}}>
    <T style={{fontSize:narrow?27:34,fontFamily:F.bold,letterSpacing:-1.4,color:'#fff'}}>{wave?.kind==='track'?'По':'Моя'}</T>
    <View style={{width:narrow?48:56,height:narrow?48:56,borderRadius:30,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'}}>{busy&&!cur?<ActivityIndicator color="#111"/>:<PlayPause playing={selectedPlaying&&playing} size={narrow?26:30} color="#111"/>}</View>
    <T style={{fontSize:narrow?27:34,fontFamily:F.bold,letterSpacing:-1.4,color:'#fff'}}>{wave?.kind==='track'?'треку':'волна'}</T>
   </Press>
   {!large?<Pressable accessibilityRole="button" accessibilityLabel="Настроить волну" onPress={()=>router.push('/wave')} style={{height:42,paddingHorizontal:18,flexDirection:'row',gap:8,alignItems:'center',borderRadius:21,backgroundColor:'rgba(0,0,0,.4)'}}><Icon name="sliders" size={18} color="#fff"/><T style={{fontSize:12,color:'#fff',fontFamily:F.semi}}>Настроить</T></Pressable>:null}
   {error?<T numberOfLines={2} style={{maxWidth:280,marginTop:10,fontSize:12,color:'#fff',textAlign:'center'}}>{error}</T>:null}
  </View>
 </View>;
}
