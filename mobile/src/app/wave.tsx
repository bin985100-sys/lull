import { View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { WaveHero } from '@/components/WaveHero';
import { WaveMoodWheel } from '@/components/WaveMoodWheel';
import { useData } from '@/api/useData';
import { getMix } from '@/api/mixes';
import { changeWaveMood, startMyWave, useWaveSession } from '@/reco/wave-session';
import { usePlayer } from '@/player/player';
import { useTaste } from '@/store/taste';
import { Btn, Screen, T, TopBar } from '@/ui/kit';

export default function Wave(){
 const mode=useTaste(s=>s.reco.waveMode),wave=usePlayer(s=>s.wave),expanded=usePlayer(s=>s.expanded),busy=useWaveSession(s=>s.busy),focused=useIsFocused();
 const mix=getMix('foryou'),fallback=useData('mix:'+mix.id,mix.load);
 return <Screen><TopBar borderless title="Твоя волна"/><View style={{marginTop:12,gap:24,paddingBottom:24}}>
  <WaveHero large visible={focused&&!expanded} fallback={fallback.data?.[0]} candidates={fallback.data}/>
  <View><T v="h2" style={{textAlign:'center'}}>Настроение волны</T><WaveMoodWheel value={mode} onChange={changeWaveMood}/></View>
  {wave?.kind==='track'?<Btn label="Сбросить волну" icon="refresh" kind="flat" borderless disabled={busy} onPress={()=>{void startMyWave(fallback.data?.[0]);}}/>:null}
  <Btn label="Все настройки рекомендаций" icon="sliders" kind="flat" borderless onPress={()=>router.push('/prefs')}/>
 </View></Screen>;
}
