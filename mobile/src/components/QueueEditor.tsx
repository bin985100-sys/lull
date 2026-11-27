import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { player, usePlayer, type QueueTrack } from '@/player/player';
import { useTheme } from '@/theme/state';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, haptic, T } from '@/ui/kit';
import { closeSheet, openSheet, toast } from '@/ui/overlay';

type Entry = { track: QueueTrack; key: string };
const HEIGHT = 80;

function editPosition(track: QueueTrack, destination: 'first' | 'up' | 'down' | 'last') {
  const s = usePlayer.getState(), from = s.queue.indexOf(track);
  const to = destination === 'first' ? s.index + 1 : destination === 'last' ? s.queue.length - 1 : from + (destination === 'up' ? -1 : 1);
  player.move(from, to);
}
function remove(track: QueueTrack) {
  const s = usePlayer.getState(), index = s.queue.indexOf(track);
  if (index <= s.index) return;
  player.removeAt(index); haptic(); toast('Убрано из очереди', 'minus');
}
function openOrder(track: QueueTrack) {
  const s = usePlayer.getState(), index = s.queue.indexOf(track);
  if (index <= s.index) return;
  openSheet(() => <View style={{ gap: 10 }}>
    <T v="h3" numberOfLines={1} style={{ marginBottom: 8 }}>{track.title}</T>
    <Btn label="Следующим" icon="playNext" kind="flat" borderless disabled={index === s.index + 1} onPress={() => { closeSheet(); editPosition(track, 'first'); }} />
    <Btn label="Поднять" icon="queue" kind="flat" borderless disabled={index === s.index + 1} onPress={() => { closeSheet(); editPosition(track, 'up'); }} />
    <Btn label="Опустить" icon="queue" kind="flat" borderless disabled={index === s.queue.length - 1} onPress={() => { closeSheet(); editPosition(track, 'down'); }} />
    <Btn label="В конец очереди" icon="queue" kind="flat" borderless disabled={index === s.queue.length - 1} onPress={() => { closeSheet(); editPosition(track, 'last'); }} />
    <Btn label="Убрать из очереди" icon="minus" kind="flat" borderless onPress={() => { closeSheet(); remove(track); }} />
  </View>);
}

export function QueueEditor({ entries }: { entries: Entry[] }) {
  const active = useSharedValue(-1), target = useSharedValue(-1), translation = useSharedValue(0);
  const reorder = useCallback((from: number, to: number) => {
    const s = usePlayer.getState(), source = entries[from]?.track, destination = entries[to]?.track;
    if (source && destination) player.move(s.queue.indexOf(source), s.queue.indexOf(destination));
    active.set(-1); target.set(-1); translation.set(0);
  }, [entries, active, target, translation]);
  return <View testID="queue-editor" style={{ height: entries.length * HEIGHT, position: 'relative' }}>
    {entries.map((entry, index) => <QueueItem key={entry.key} track={entry.track} index={index} count={entries.length} active={active} target={target} translation={translation} reorder={reorder} />)}
  </View>;
}

const QueueItem = memo(function QueueItem({ track, index, count, active, target, translation, reorder }: {
  track: QueueTrack; index: number; count: number; active: SharedValue<number>; target: SharedValue<number>; translation: SharedValue<number>; reorder: (from: number, to: number) => void;
}) {
  const { colors: C } = useTheme(), reduced = useReducedMotion();
  const pan = usePanGesture({ minDistance: 6, maxPointers: 1,
    onActivate: () => { 'worklet'; active.set(index); target.set(index); translation.set(0); scheduleOnRN(haptic); },
    onUpdate: e => { 'worklet';
      const offset = Math.max(-index * HEIGHT, Math.min((count - index - 1) * HEIGHT, e.translationY));
      translation.set(offset); target.set(Math.max(0, Math.min(count - 1, Math.round(index + offset / HEIGHT))));
    },
    onDeactivate: e => { 'worklet';
      if (e.canceled) { active.set(-1); target.set(-1); translation.set(0); }
      else scheduleOnRN(reorder, index, target.get());
    },
  });
  const motion = useAnimatedStyle(() => {
    const from = active.get(), to = target.get(), dragging = from === index;
    let position = index;
    if (from >= 0 && from < index && index <= to) position--;
    else if (from >= 0 && to <= index && index < from) position++;
    return {
      zIndex: dragging ? 2 : 0,
      transform: [{ translateY: dragging ? index * HEIGHT + translation.get() : reduced ? position * HEIGHT : withTiming(position * HEIGHT, { duration: 280 }) }, { scale: dragging && !reduced ? 1.025 : 1 }],
      backgroundColor: dragging ? C.s2 : C.bg,
    };
  });
  const play = () => { if (active.get() >= 0) return; const s = usePlayer.getState(); player.skipTo(s.queue.indexOf(track)); };
  return <Animated.View testID={`queue-item-${track.id}`} style={[styles.row, motion]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Слушать ${track.title} из очереди`} onPress={play} style={styles.song}>
      <Cover uri={track.artwork} trackId={track.source === 'yt' ? track.id : undefined} size={52} radius={20} label={track.title} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}><T numberOfLines={1}>{track.title}</T><T v="small" numberOfLines={1}>{track.artist}</T></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Убрать ${track.title} из очереди`} onPress={() => remove(track)} style={styles.action}><Icon name="minus" size={22} color={C.tx2} /></Pressable>
    <GestureDetector gesture={pan} touchAction="none">
      <Animated.View>
        <Pressable testID={`queue-drag-${track.id}`} accessibilityRole="button" accessibilityLabel={`Изменить порядок: ${track.title}`} accessibilityHint="Перетащите вверх или вниз, либо нажмите для выбора позиции"
          onPress={() => { if (active.get() < 0) openOrder(track); }}
          accessibilityActions={[{ name: 'increment', label: 'Опустить' }, { name: 'decrement', label: 'Поднять' }]}
          onAccessibilityAction={e => editPosition(track, e.nativeEvent.actionName === 'increment' ? 'down' : 'up')}
          style={styles.action}>
          <View style={{ gap: 5 }}><View style={[styles.grip, { backgroundColor: C.tx2 }]} /><View style={[styles.grip, { backgroundColor: C.tx2 }]} /></View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  </Animated.View>;
});

const styles = StyleSheet.create({
  row: { position: 'absolute', top: 0, left: 0, right: 0, height: HEIGHT, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 2 },
  song: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  action: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 19, height: 3, borderRadius: 2 },
});
