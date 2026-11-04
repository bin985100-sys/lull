import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { TrackRow } from '@/components/TrackRow';
import { currentTrack, player, usePlayer } from '@/player/player';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, Empty, Screen, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

export default function Queue() {
  const s = usePlayer();
  const cur = currentTrack(s);
  const up = s.queue.slice(s.index + 1);
  if (!cur) return (
    <Screen><TopBar title="Очередь" />
      <Empty icon="queue" title="Очередь пуста" text="Добавь трек через меню — он заиграет следующим."><Btn label="Открыть музыку" icon="arrow" onPress={() => router.navigate('/discover')} /></Empty>
    </Screen>
  );
  return (
    <Screen>
      <TopBar title="Очередь" right={up.length ? <Btn label="Очистить" kind="dark" small style={{ paddingLeft: 16, paddingRight: 16 }} onPress={() => { player.clearUpcoming(); toast('Очередь очищена', 'queue'); }} /> : undefined} />
      <T v="h3" style={{ marginTop: 18, marginBottom: 8 }}>Сейчас</T>
      <TrackRow track={cur} list={[cur]} sub />
      <T v="h3" style={{ marginTop: 24, marginBottom: 8 }}>Дальше</T>
      {!up.length ? <T v="body">Больше ничего не запланировано.</T> : up.map((t, i) => {
        const idx = s.index + 1 + i;
        return (
          <View key={t.id + idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 66 }}>
            <View style={{ gap: 2 }}>
              <Pressable disabled={i === 0} onPress={() => player.move(idx, idx - 1)} accessibilityLabel={`Поднять ${t.title}`} hitSlop={4} style={{ opacity: i === 0 ? 0.25 : 1, transform: [{ rotate: '90deg' }], width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={20} /></Pressable>
            </View>
            <Pressable onPress={() => player.skipTo(idx)} accessibilityRole="button" accessibilityLabel={`Слушать ${t.title}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Cover uri={t.artwork} size={54} />
              <View style={{ flex: 1, minWidth: 0 }}><T numberOfLines={1}>{t.title}</T><T v="small" numberOfLines={1}>{t.artist}</T></View>
            </Pressable>
            <Pressable onPress={() => { player.removeAt(idx); toast('Убрано из очереди', 'minus'); }} accessibilityLabel={`Убрать ${t.title} из очереди`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" /></Pressable>
          </View>
        );
      })}
    </Screen>
  );
}
