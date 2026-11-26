import { SlidingPill, usePillGroup } from '@/ui/SlidingPill';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { WaveHero } from '@/components/WaveHero';
import { useData } from '@/api/useData';
import { MIXES } from '@/api/mixes';
import { useAppearance, useTheme } from '@/theme/state';
import { WAVE_MODES } from '@/reco/engine';
import { startPersonalWave, useWaveSession } from '@/reco/wave-session';
import { currentTrack } from '@/player/player';
import { useTaste } from '@/store/taste';
import { Toggle as Switch } from '@/ui/Toggle';
import { Icon } from '@/ui/Icon';
import { Btn, Screen, Segmented, T, TopBar } from '@/ui/kit';
import { F } from '@/theme/tokens';

export default function Wave(){
 const {colors:C}=useTheme(),reco=useTaste(s=>s.reco),auto=useWaveSession(s=>s.autoContinue),busy=useWaveSession(s=>s.busy);
 const selection=usePillGroup(reco.waveMode);
 const motion=useAppearance(s=>s.motion);
 const fallback=useData('mix:wave-fallback',MIXES.foryou.load);
 return <Screen><TopBar title="Твоя волна" right={<Pressable accessibilityRole="button" accessibilityLabel="Все настройки волны" onPress={()=>router.push('/prefs')} style={{padding:12}}><Icon name="sliders"/></Pressable>}/><View style={{marginTop:20,gap:24}}>
  <WaveHero large fallback={fallback.data?.[0]} candidates={fallback.data}/>
  <View><T v="h2" style={{marginBottom:18}}>Настроение волны</T><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{WAVE_MODES.map(m=>{const on=reco.waveMode===m.id;return <Pressable key={m.id} onLayout={selection.layout(m.id)} accessibilityRole="radio" accessibilityLabel={m.title} accessibilityState={{checked:on}} onPress={()=>{selection.select(m.id);useTaste.getState().setReco('waveMode',m.id);}} style={{paddingHorizontal:16,paddingVertical:12,borderRadius:24,backgroundColor:C.s2}}><T style={{fontSize:12,fontFamily:F.semi,color:on?C.tx:C.tx2}}>{m.title}</T></Pressable>;})}<SlidingPill motion={selection.pill} borderColor={C.tx+'99'}/></View></View>
  <View style={{padding:18,borderRadius:24,backgroundColor:C.s1,gap:16}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1}}><T style={{fontFamily:F.bold}}>Музыка не заканчивается</T><T v="small" style={{marginTop:5}}>Продолжать похожими треками в конце очереди</T></View><Switch value={auto} onValueChange={v=>useWaveSession.setState({autoContinue:v})} accessibilityLabel="Продолжать волной"/></View><Segmented label="Размер подборки" value={String(reco.waveLength) as '25'|'50'|'100'} onChange={v=>useTaste.getState().setReco('waveLength',Number(v) as 25|50|100)} items={[['25','25 треков'],['50','50 треков'],['100','100 треков']]}/></View>
  <View style={{flexDirection:'row',alignItems:'center',gap:12,padding:18,borderRadius:22,backgroundColor:C.s1}}><View style={{flex:1}}><T>Живой фон</T><T v="small" style={{marginTop:5}}>Можно выключить для экономии батареи</T></View><Switch value={motion} onValueChange={v=>useAppearance.setState({motion:v})} accessibilityLabel="Живой фон волны"/></View>
  <Btn label="Применить к текущему треку" icon="waves" disabled={busy} onPress={()=>{const seed=currentTrack()??fallback.data?.[0];if(seed)void startPersonalWave(seed,reco.waveMode);}}/>
  <Btn label="Все настройки рекомендаций" icon="sliders" kind="dark" onPress={()=>router.push('/prefs')}/>
 </View></Screen>;
}
