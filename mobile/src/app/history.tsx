import { resetTo } from '@/nav';
import { View } from 'react-native';

import { TrackRow } from '@/components/TrackRow';
import { useLibrary } from '@/store/library';
import { Btn, Empty, IconBtn, Screen, T, TopBar } from '@/ui/kit';
import { confirm, toast } from '@/ui/overlay';

export default function History() {
  const h = useLibrary((s) => s.history);
  const save = useLibrary((s) => s.settings.saveHistory);
  if (!h.length) return (
    <Screen><TopBar title="История" />
      <Empty icon="clock" title="История пуста" text={save ? 'Здесь появится то, что ты слушал.' : 'Сохранение истории выключено в настройках.'}>
        <Btn label="Открыть музыку" icon="arrow" onPress={() => resetTo('/discover')} />
      </Empty>
    </Screen>
  );
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const groups: Record<string, typeof h> = { Сегодня: [], Вчера: [], Раньше: [] };
  const seen = new Set<string>();
  for (const it of h) {
    const g = it.at >= +today ? 'Сегодня' : it.at >= +today - 864e5 ? 'Вчера' : 'Раньше';
    const k = g + it.track.id; if (seen.has(k)) continue; seen.add(k); groups[g].push(it);
  }
  return (
    <Screen>
      <TopBar title="История" right={<IconBtn name="eraser" label="Очистить историю" onPress={() => confirm({ icon: 'eraser', title: 'Очистить историю?', text: 'Любимые треки и плейлисты останутся.', safe: 'Отмена', danger: 'Очистить историю', onDanger: () => { useLibrary.getState().clearHistory(); toast('История очищена', 'check'); } })} />} />
      {Object.entries(groups).filter(([, v]) => v.length).map(([g, v]) => (
        <View key={g}>
          <T v="h2" style={{ marginTop: 22, marginBottom: 10 }}>{g}</T>
          {v.map((it) => <TrackRow key={g + it.track.id} track={it.track} list={v.map((x) => x.track)} sub />)}
        </View>
      ))}
    </Screen>
  );
}
