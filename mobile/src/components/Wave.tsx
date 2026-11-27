import { SlidingPill, usePillGroup } from '@/ui/SlidingPill';
import { WaveArt } from '@/ui/WaveArt';
import { useCoverColors } from '@/theme/useCoverColors';
import { useTheme } from '@/theme/state';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { Track } from '@/api/audius';
import { startPersonalWave, useWaveSession } from '@/reco/wave-session';
import { WAVE_MODES } from '@/reco/engine';
import { useTaste, type WaveMode } from '@/store/taste';
import { F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, haptic, Segmented, T } from '@/ui/kit';
import { closeSheet, openSheet, toast } from '@/ui/overlay';

/* Волна по треку: выбор характера волны и длины, сборка из многих источников */
export function openWave(t: Track) { openSheet(() => <WaveSheet seed={t} />); }

export async function launchWave(seed: Track, mode?: WaveMode) {
  const ok=await startPersonalWave(seed,mode);
  if(!ok&&useWaveSession.getState().error)toast(useWaveSession.getState().error!,'info');
  return ok;
}

function WaveSheet({ seed }: { seed: Track }) {
  const {colors:C}=useTheme();
  const reco = useTaste((s) => s.reco),selection=usePillGroup(reco.waveMode);
  const colors=useCoverColors(seed.artwork,seed.id);
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 14 }}>
      <View style={{height:124,borderRadius:28,overflow:'hidden'}}><WaveArt colors={colors} drift inPlayer/><View style={{flex:1,backgroundColor:'rgba(0,0,0,.45)',padding:20,flexDirection:'row',alignItems:'center',gap:14}}>
        <Cover uri={seed.artwork} size={56} />
        <View style={{ flex: 1 }}><T v="h3" style={{color:'#fff'}}>Волна по треку</T><T numberOfLines={1} style={{fontSize:12,color:'#ddd',marginTop:6}}>{seed.title}</T></View>
      </View></View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {WAVE_MODES.map((m) => {
          const on = reco.waveMode === m.id;
          return (
            <Pressable key={m.id} onLayout={selection.layout(m.id)} onPress={() => { selection.select(m.id);haptic(); useTaste.getState().setReco('waveMode', m.id); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{flexGrow:1,flexBasis:'40%',flexDirection:'row',alignItems:'center',gap:8,padding:16,borderRadius:24,backgroundColor:C.s1}}>
              <View style={{ flex: 1 }}><T style={{fontFamily:F.semi,fontSize:13,color:C.tx}}>{m.title}</T></View>
              {on ? <Icon name="check" size={18} color={C.tx}/> : null}
            </Pressable>
          );
        })}
        <SlidingPill motion={selection.pill} borderColor={C.tx+'99'}/>
      </View>
      <Segmented label="Длина волны" value={String(reco.waveLength) as '25' | '50' | '100'} onChange={(v) => useTaste.getState().setReco('waveLength', Number(v) as 25 | 50 | 100)}
        items={[['25', '25 треков'], ['50', '50 треков'], ['100', '100 треков']]} />
      <Btn label={busy ? 'Собираем волну…' : 'Запустить волну'} icon={busy ? undefined : 'waves'} disabled={busy} onPress={async () => {
        setBusy(true);
        try { if (await launchWave(seed)) closeSheet(); } catch { toast('Нет связи с сервером — волна не собралась', 'wifiOff'); }
        setBusy(false);
      }} />
      {busy ? <ActivityIndicator color={C.tx2} /> : null}
    </View>
  );
}
