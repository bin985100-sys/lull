import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MOODS } from '@/api/audius';
import { lull } from '@/api/lull';
import { getMix, MIXES, useMixSeed } from '@/api/mixes';
import { CardRail, Sections } from '@/components/Cards';
import { artistScores } from '@/reco/engine';
import { useData } from '@/api/useData';
import { Insights } from '@/components/Insights';
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
  const trend = useData('mix:recommended', MIXES.recommended.load);
  useMixSeed((x) => x.n);
  const fy = getMix('foryou');
  const mix = useData('mix:' + fy.id, fy.load);
  const charts = useData('charts', (sg) => lull.charts(sg));
  const home = useData('home', (sg) => lull.home(undefined, sg));
  const indie = useData('mix:underground', MIXES.underground.load);
  const trending = charts.data?.find((x) => x.layout === 'tracks');
  const trTracks = trending?.items.filter((c) => c.track).map((c) => c.track!) ?? [];
  const releases = charts.data?.filter((x) => x.layout === 'cards' && x.items.length) ?? [];
  const shelves = (home.data ?? []).filter((x) => x.layout === 'cards' && x.items.length);
  const recent = Array.from(new Map(history.map((h) => [h.track.id, h.track])).values()).slice(1, 13);

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

        <Insights />

        <Focus onPlayForYou={() => mix.data && player.play(mix.data)} />

        <View>
          <Pressable onPress={() => router.push('/prefs')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
            <T v="h2">Настроить подборку</T><Icon name="sliders" size={30} />
          </Pressable>
          <SectionHead title="Дальше по звучанию" more="Все" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'recommended' } })} />
          {trend.error && !trend.data ? <Offline onRetry={trend.reload} /> : null}
          {trend.loading && !trend.data ? <ListSkeleton n={3} /> : null}
          {(trend.data || []).slice(0, 4).map((t) => <TrackRow key={t.id} track={t} list={trend.data!} sub right="plus" />)}
        </View>

        <ArtistMixes />

        {trTracks.length ? (
          <View>
            <SectionHead title="Сейчас в тренде" more="Все" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'trending' } })} />
            {trTracks.slice(0, 5).map((t, i) => <TrackRow key={t.id} track={t} list={trTracks} num={i + 1} sub />)}
          </View>
        ) : charts.loading ? <ListSkeleton n={3} /> : null}

        {releases.length ? <Sections sections={releases} max={2} /> : null}

        <Moods />

        {shelves.length ? <Sections sections={shelves} max={4} /> : null}

        {indie.data?.length ? (
          <View>
            <SectionHead title="Независимые артисты" more="Все" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'underground' } })} />
            {indie.data.slice(0, 4).map((t) => <TrackRow key={t.id} track={t} list={indie.data!} sub right="plus" />)}
          </View>
        ) : null}

        {recent.length >= 3 ? (
          <View>
            <SectionHead title="Ты недавно слушал" more="История" onMore={() => router.push('/history')} />
            <CardRail items={recent.map((t) => ({ kind: 'track' as const, id: t.id, title: t.title, subtitle: t.artist, image: t.artworkLarge || t.artwork, track: t }))} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/* «Сегодня в фокусе»: листаются «Для тебя» и подборки под время дня; «Для тебя» обновляется кнопкой */
function moodNow() {
  const h = new Date().getHours();
  return h >= 23 || h < 6 ? 'exhale' : h < 11 ? 'motion' : h < 18 ? 'focus' : 'night';
}
function Focus({ onPlayForYou }: { onPlayForYou: () => void }) {
  const [w, setW] = useState(0);
  const [page, setPage] = useState(0);
  const first = moodNow();
  const day = new Date().getDate();
  const others = MOODS.filter((m) => m.id !== first);
  const moods = [MOODS.find((m) => m.id === first)!, others[day % others.length], others[(day + 1) % others.length]];
  const cards = [
    { key: 'foryou', title: 'Для тебя', image: MIXES.foryou.image, open: () => router.push({ pathname: '/mix/[id]', params: { id: 'foryou' } }) },
    ...moods.map((m) => ({ key: m.id, title: m.title, image: m.image, open: () => router.push({ pathname: '/mood/[id]', params: { id: m.id } }) })),
  ];
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <SectionHead title="Сегодня в фокусе" />
      {w ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={w + 12} snapToAlignment="start"
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (w + 12)))} scrollEventThrottle={32}
          style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
          {cards.map((c) => (
            <Press key={c.key} scaleTo={0.98} onPress={c.open} accessibilityRole="button" accessibilityLabel={`Открыть «${c.title}»`}
              style={{ width: w, aspectRatio: 1.5, borderRadius: 30, overflow: 'hidden', backgroundColor: '#000', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine }}>
              <Image source={c.image} style={StyleSheet.absoluteFill} contentFit="cover" />
              {c.key === 'foryou' ? (
                <View style={{ position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={() => { haptic(); useMixSeed.setState((x) => ({ n: x.n + 1 })); }} accessibilityRole="button" accessibilityLabel="Обновить «Для тебя»"
                    style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: 'rgba(28,30,33,0.75)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="refresh" size={24} />
                  </Pressable>
                  <Pressable onPress={onPlayForYou} accessibilityRole="button" accessibilityLabel="Слушать «Для тебя»"
                    style={{ width: 56, height: 48, borderRadius: 18, backgroundColor: 'rgba(28,30,33,0.75)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="play" size={26} />
                  </Pressable>
                </View>
              ) : null}
            </Press>
          ))}
        </ScrollView>
      ) : <View style={{ width: '100%', aspectRatio: 1.5, borderRadius: 30, backgroundColor: C.s1 }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 }}>
        {cards.map((c, i) => <View key={c.key} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? C.tx : C.s4 }} />)}
      </View>
    </View>
  );
}

/* Миксы по любимым исполнителям: их хиты вперемешку с похожими */
function ArtistMixes() {
  const fav = useLibrary((x) => x.favArtists);
  const avatars = new Map(fav.map((a) => [a.id, a.avatar]));
  const list = [...artistScores().filter((a) => a.source !== 'audius').map((a) => ({ id: a.id, name: a.name, avatar: avatars.get(a.id) })), ...fav.filter((a) => a.source !== 'audius').map((a) => ({ id: a.id, name: a.name, avatar: a.avatar }))]
    .filter((a, i, arr) => a.id && arr.findIndex((b) => b.id === a.id) === i).slice(0, 10);
  if (list.length < 2) return null;
  return (
    <View>
      <SectionHead title="Миксы исполнителей" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
        {list.map((a) => (
          <Press key={a.id} onPress={() => router.push({ pathname: '/mix/[id]', params: { id: `artist:${a.id}`, n: a.name } })} accessibilityRole="button" accessibilityLabel={`Микс: ${a.name}`} style={{ width: 132, gap: 8 }}>
            <View><Cover uri={a.avatar} size={132} radius={28} />
              <View style={{ position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' }}><T v="label" style={{ color: C.tx, fontFamily: F.bold }}>Микс</T></View>
            </View>
            <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15 }}>{a.name}</T>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}

/* Подборки под настроение */
function Moods() {
  return (
    <View>
      <SectionHead title="Под настроение" more="Все" onMore={() => router.push('/discover')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {MOODS.map((m) => (
          <Press key={m.id} scaleTo={0.97} onPress={() => router.push({ pathname: '/mood/[id]', params: { id: m.id } })} accessibilityRole="button" accessibilityLabel={m.title}
            style={{ width: 228, aspectRatio: 1.5, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine }}>
            <Image source={m.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}
