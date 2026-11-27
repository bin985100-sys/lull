import { useMemo } from 'react';
import { View } from 'react-native';
import { resetTo } from '@/nav';
import { player, usePlayer, type QueueTrack } from '@/player/player';
import { QueueEditor } from '@/components/QueueEditor';
import { PlayPause } from '@/ui/PlayPause';
import { Btn, Cover, Empty, Press, Screen, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

const rowIds = new WeakMap<QueueTrack, number>();
let rowSerial = 0;
function rowKey(track: QueueTrack) {
  let id = rowIds.get(track);
  if (!id) { id = ++rowSerial; rowIds.set(track, id); }
  return id;
}

export default function Queue() {
  const queue = usePlayer(s => s.queue), index = usePlayer(s => s.index), playing = usePlayer(s => s.playing);
  const entries = useMemo(() => {
    const occurrences = new Map<number, number>();
    return queue.map(track => {
      const id = rowKey(track);
      const occurrence = occurrences.get(id) || 0; occurrences.set(id, occurrence + 1);
      return { track, key: `${id}-${occurrence}` };
    });
  }, [queue]);
  const cur = queue[index], upcoming = entries.slice(index + 1);
  if (!cur) return (
    <Screen><TopBar title="Очередь" />
      <Empty icon="queue" title="Очередь пуста" text="Добавь трек через меню или свайпом вправо."><Btn label="Открыть музыку" icon="arrow" onPress={() => resetTo('/discover')} /></Empty>
    </Screen>
  );
  return (
    <Screen>
      <TopBar title="Очередь" right={upcoming.length ? <Btn label="Очистить" kind="flat" borderless small onPress={() => { player.clearUpcoming(); toast('Очередь очищена', 'queue'); }} /> : undefined} />
      <T v="h3" style={{ marginTop: 24, marginBottom: 14 }}>Сейчас играет</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76 }}>
        <Cover uri={cur.artwork} trackId={cur.source === 'yt' ? cur.id : undefined} size={60} radius={22} label={cur.title} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><T numberOfLines={1}>{cur.title}</T><T v="small" numberOfLines={1}>{cur.artist}</T></View>
        <Press accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Продолжить'} onPress={() => player.toggle()} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><PlayPause playing={playing} size={29} /></Press>
      </View>
      <T v="h3" style={{ marginTop: 30, marginBottom: 12 }}>Дальше</T>
      {upcoming.length ? <QueueEditor entries={upcoming} /> : <T v="body">Очередь пуста</T>}
    </Screen>
  );
}
