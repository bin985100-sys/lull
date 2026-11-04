import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIXES } from '@/api/mixes';
import { useData } from '@/api/useData';
import { TrackRow } from '@/components/TrackRow';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Cover, haptic, IconBtn, ListSkeleton, Offline, Press, Screen, SectionHead, T } from '@/ui/kit';
import { PlayPause } from '@/ui/PlayPause';

function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Хороший вечер';
}

export default function Listen() {
  const history = useLibrary((s) => s.history);
  const cur = usePlayer((s) => currentTrack(s));
  const playing = usePlayer((s) => s.playing);
  const last = cur ?? history[0]?.track;
  const trend = useData('mix:trending', MIXES.trending.load);
  const mix = useData('mix:foryou', MIXES.foryou.load);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10, marginBottom: 18, gap: 12 }}>
        <T v="h1" style={{ fontSize: 27, flex: 1 }} accessibilityRole="header" numberOfLines={2}>{greet()}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconBtn name="clock" label="История" onPress={() => router.push('/history')} />
          <IconBtn name="gear" label="Настройки" onPress={() => router.push('/settings')} />
        </View>
      </View>

      <View style={{ gap: 28 }}>
        {last ? (
          <View>
            <SectionHead title="Продолжить" />
            <Pressable onPress={() => { haptic(); player.play(cur ? usePlayer.getState().queue : [last], last.id); }} accessibilityRole="button" accessibilityLabel={`Продолжить: ${last.title}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 18, padding: 12, paddingRight: 14, borderRadius: 26, backgroundColor: C.s1 }}>
              <Cover uri={last.artwork} size={88} radius={18} />
              <T numberOfLines={2} style={{ flex: 1, fontFamily: F.bold, fontSize: 19 }}>{last.title}</T>
              <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><PlayPause playing={!!cur && cur.id === last.id && playing} size={30} /></View>
            </Pressable>
          </View>
        ) : null}

        <View>
          <SectionHead title="Сегодня в фокусе" />
          <Press scaleTo={0.98} onPress={() => router.push({ pathname: '/mix/[id]', params: { id: 'foryou' } })} accessibilityRole="button" accessibilityLabel="Открыть подборку «Для тебя»"
            style={{ height: 252, borderRadius: 30, overflow: 'hidden', backgroundColor: C.s2 }}>
            <Image source={MIXES.foryou.image} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.22)' }]} />
            <T style={{ position: 'absolute', left: 22, bottom: 22, right: 92, fontFamily: F.bold, fontSize: 27, lineHeight: 31 }}>Для тебя</T>
            <Pressable onPress={() => mix.data && player.play(mix.data)} accessibilityRole="button" accessibilityLabel="Слушать «Для тебя»"
              style={{ position: 'absolute', right: 16, bottom: 16, width: 56, height: 48, borderRadius: 18, backgroundColor: 'rgba(28,30,33,0.75)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="play" size={26} />
            </Pressable>
          </Press>
        </View>

        <View>
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
            <T v="h2">Настроить подборку</T><Icon name="sliders" size={30} />
          </Pressable>
          <SectionHead title="Дальше по звучанию" more="Все" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'trending' } })} />
          {trend.error && !trend.data ? <Offline onRetry={trend.reload} /> : null}
          {trend.loading && !trend.data ? <ListSkeleton n={3} /> : null}
          {(trend.data || []).slice(0, 4).map((t) => <TrackRow key={t.id} track={t} list={trend.data!} sub right="plus" />)}
        </View>
      </View>
    </Screen>
  );
}
