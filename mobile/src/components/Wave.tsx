import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { Track } from '@/api/audius';
import { player, usePlayer } from '@/player/player';
import { buildWave, WAVE_MODES } from '@/reco/engine';
import { useTaste, type WaveMode } from '@/store/taste';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, haptic, Segmented, T } from '@/ui/kit';
import { closeSheet, openSheet, toast } from '@/ui/overlay';

/* Волна по треку: выбор характера волны и длины, сборка из многих источников */
export function openWave(t: Track) { openSheet(() => <WaveSheet seed={t} />); }

export async function launchWave(seed: Track, mode?: WaveMode) {
  const r = useTaste.getState().reco;
  const ac = new AbortController();
  const list = await buildWave(seed, mode ?? r.waveMode, r.waveLength, ac.signal);
  if (list.length < 3) { toast('Не получилось собрать волну — попробуй другой режим', 'info'); return false; }
  player.startWave(list);
  usePlayer.setState({ expanded: false });
  toast(`Волна по «${seed.title}»: ${list.length - 1} треков`, 'waves');
  return true;
}

function WaveSheet({ seed }: { seed: Track }) {
  const reco = useTaste((s) => s.reco);
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Cover uri={seed.artwork} size={56} />
        <View style={{ flex: 1 }}><T v="h3">Волна по треку</T><T v="small" numberOfLines={1}>{seed.title} · {seed.artist}</T></View>
      </View>
      <View style={{ gap: 6 }}>
        {WAVE_MODES.map((m) => {
          const on = reco.waveMode === m.id;
          return (
            <Pressable key={m.id} onPress={() => { haptic(); useTaste.getState().setReco('waveMode', m.id); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: on ? C.s3 : 'transparent' }}>
              <View style={{ flex: 1 }}><T style={{ fontFamily: on ? F.bold : F.semi }}>{m.title}</T><T v="small">{m.text}</T></View>
              {on ? <Icon name="check" size={22} /> : null}
            </Pressable>
          );
        })}
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
