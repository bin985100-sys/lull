import { type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { type Track } from '@/api/audius';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';
import { startPersonalWave, useWaveSession } from '@/reco/wave-session';
import { useTaste } from '@/store/taste';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { WaveArt } from '@/ui/WaveArt';
import { haptic, Press, T } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { useCoverColors } from '@/theme/useCoverColors';
import { PlayPause } from '@/ui/PlayPause';

/** An open landscape, rather than another card in the feed. */
export function WaveHero({fallback,large=false,header,visible=true}:{fallback?:Track;large?:boolean;header?:ReactNode;visible?:boolean}){
 const layout=useLayout(),narrow=layout.content<320,{height}=useWindowDimensions(),{colors:C}=useTheme();
 const cur=usePlayer(currentTrack),history=useLibrary(s=>s.history),liked=useLibrary(s=>s.liked);
 const playing=usePlayer(s=>s.playing),active=useWaveSession(s=>s.active)&&!!cur;
 const seed=cur??history[0]?.track??liked[0]??fallback;
 const busy=useWaveSession(s=>s.busy),error=useWaveSession(s=>s.error),mode=useTaste(s=>s.reco.waveMode);
 const colors=useCoverColors(seed?.artwork,seed?.id??mode);
 return <View style={{height:Math.min(large?660:640,Math.max(header?460:390,height*(header?.76:.62))),marginHorizontal:-layout.side,overflow:'hidden',backgroundColor:C.bg}}>
  <WaveArt animate={visible} colors={colors}/>
  <LinearGradient pointerEvents="none" colors={[C.bg,'transparent','transparent',C.bg]} locations={[0,.26,.57,1]} style={{position:'absolute',inset:0}}/>
  {header?<View style={{paddingHorizontal:layout.side,zIndex:1}}>{header}</View>:null}
  <View style={{flex:1,justifyContent:'center',alignItems:'center',paddingBottom:header?30:0}}>
   <Press accessibilityRole="button" accessibilityLabel={active?(playing?'Приостановить волну':'Продолжить волну'):'Включить мою волну'} disabled={busy&&!cur} onPress={()=>{haptic();if(active)player.toggle();else if(seed)void startPersonalWave(seed);else router.push('/onboarding');}} style={{minHeight:112,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:narrow?10:16}}>
    <T style={{fontSize:narrow?30:42,fontFamily:F.bold,letterSpacing:-1.8,color:'#fff'}}>Моя</T>
    <View style={{width:narrow?52:66,height:narrow?52:66,borderRadius:40,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'}}>{busy&&!cur?<ActivityIndicator color="#111"/>:<PlayPause playing={active&&playing} size={narrow?25:32} color="#111"/>}</View>
    <T style={{fontSize:narrow?30:42,fontFamily:F.bold,letterSpacing:-1.8,color:'#fff'}}>волна</T>
   </Press>
   <Pressable accessibilityRole="button" accessibilityLabel="Настроить волну" onPress={()=>router.push(large?'/prefs':'/wave')} style={{height:44,paddingHorizontal:18,flexDirection:'row',gap:8,alignItems:'center',borderRadius:22,backgroundColor:'rgba(0,0,0,.28)'}}><Icon name="sliders" size={17} color="#fff"/><T style={{fontSize:12,color:'#fff',fontFamily:F.semi}}>Настроить</T></Pressable>
   {error?<T numberOfLines={2} style={{maxWidth:280,marginTop:16,fontSize:12,color:'#fff',textAlign:'center'}}>{error}</T>:null}
  </View>
 </View>;
}
