import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { MOODS } from '@/api/audius';
import { lull } from '@/api/lull';
import { MIXES } from '@/api/mixes';
import { useData } from '@/api/useData';
import { CardRail } from '@/components/Cards';
import { TrackRow } from '@/components/TrackRow';
import { C } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { ListSkeleton, Offline, Press, Screen, SectionHead, Skeleton, T } from '@/ui/kit';

export default function Discover() {
  const charts = useData('charts', (s) => lull.charts(s));
  const home = useData('home', (s) => lull.home(undefined, s));
  const indie = useData('mix:underground', MIXES.underground.load);
  const trending = charts.data?.find((x) => x.layout === 'tracks');
  const releases = charts.data?.find((x) => x.layout === 'cards' && x.items[0]?.kind === 'album');
  const pls = home.data?.filter((x) => x.layout === 'cards' && x.items[0]?.kind === 'playlist') ?? [];
  const trTracks = trending?.items.filter((c) => c.track).map((c) => c.track!) ?? [];
  return (
    <Screen>
      <T v="h1" style={{ marginTop: 10, marginBottom: 18 }} accessibilityRole="header">Открывать</T>
      <Pressable onPress={() => router.push('/search')} accessibilityRole="search" accessibilityLabel="Поиск: треки, альбомы, исполнители"
        style={{ height: 54, borderRadius: 999, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }}>
        <Icon name="search" size={22} color={C.tx2} /><T style={{ color: C.tx3, fontSize: 16 }}>Треки, альбомы, исполнители</T>
      </Pressable>

      <View style={{ gap: 28, marginTop: 26 }}>
        <View>
          <SectionHead title="Под настроение" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {MOODS.map((m) => (
              <Press key={m.id} scaleTo={0.97} onPress={() => router.push({ pathname: '/mood/[id]', params: { id: m.id } })} accessibilityRole="button" accessibilityLabel={m.title}
                outer={{ flexBasis: '47%', flexGrow: 1 }} style={{ width: '100%', aspectRatio: 1.5, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine }}>
                {/* название уже нарисовано на обложке */}
                <Image source={m.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              </Press>
            ))}
          </View>
        </View>

        <View>
          <SectionHead title="В тренде" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'trending' } })} />
          {charts.error && !charts.data ? <Offline onRetry={charts.reload} /> : charts.loading && !charts.data ? <ListSkeleton n={4} /> : trTracks.slice(0, 5).map((t) => <TrackRow key={t.id} track={t} list={trTracks} sub />)}
        </View>

        {releases ? <View><SectionHead title="Новые альбомы и синглы" /><CardRail items={releases.items} /></View> : charts.loading ? <Skeleton h={190} /> : null}
        {pls.slice(0, 2).map((s) => <View key={s.title}><SectionHead title={s.title} /><CardRail items={s.items} /></View>)}

        <View>
          <SectionHead title="Независимые артисты" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'underground' } })} />
          {indie.loading && !indie.data ? <ListSkeleton n={3} /> : (indie.data || []).slice(0, 4).map((t) => <TrackRow key={t.id} track={t} list={indie.data!} sub />)}
        </View>
      </View>
    </Screen>
  );
}
