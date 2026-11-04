import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { audius, MOODS } from '@/api/audius';
import { MIXES } from '@/api/mixes';
import { useData } from '@/api/useData';
import { TrackRow } from '@/components/TrackRow';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Cover, ListSkeleton, Offline, Press, Screen, SectionHead, T } from '@/ui/kit';

export default function Discover() {
  const fresh = useData('mix:underground', MIXES.underground.load);
  const pls = useData('trendingPlaylists', (s) => audius.trendingPlaylists(s));
  return (
    <Screen>
      <T v="h1" style={{ marginTop: 10, marginBottom: 18 }} accessibilityRole="header">Открывать</T>
      <Pressable onPress={() => router.push('/search')} accessibilityRole="search" accessibilityLabel="Поиск: треки, плейлисты, исполнители"
        style={{ height: 54, borderRadius: 999, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }}>
        <Icon name="search" size={22} color={C.tx2} /><T style={{ color: C.tx3, fontSize: 16 }}>Треки, плейлисты, исполнители</T>
      </Pressable>

      <View style={{ gap: 28, marginTop: 26 }}>
        <View>
          <SectionHead title="Под настроение" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {MOODS.map((m) => (
              <Press key={m.id} scaleTo={0.97} onPress={() => router.push({ pathname: '/mix/[id]', params: { id: m.id } })} accessibilityRole="button" accessibilityLabel={m.title}
                style={{ width: '100%', flexBasis: '47%', flexGrow: 1, aspectRatio: 1.2, borderRadius: 24, overflow: 'hidden', backgroundColor: C.s2 }}>
                <Image source={m.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
                <T style={{ position: 'absolute', left: 16, right: 12, bottom: 14, fontFamily: F.bold, fontSize: 16.5 }}>{m.title}</T>
              </Press>
            ))}
          </View>
        </View>

        <View>
          <SectionHead title="Новые находки" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'underground' } })} />
          {fresh.error && !fresh.data ? <Offline onRetry={fresh.reload} /> : null}
          {fresh.loading && !fresh.data ? <ListSkeleton n={4} /> : null}
          {(fresh.data || []).slice(0, 4).map((t) => <TrackRow key={t.id} track={t} list={fresh.data!} sub />)}
        </View>

        {pls.data?.length ? (
          <View>
            <SectionHead title="Плейлисты недели" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
              {pls.data.slice(0, 12).map((p) => (
                <Press key={p.id} onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: p.id } })} accessibilityRole="button" accessibilityLabel={p.title} style={{ width: 150, gap: 10 }}>
                  <Cover uri={p.artwork} size={150} radius={24} />
                  <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 16 }}>{p.title}</T>
                </Press>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
