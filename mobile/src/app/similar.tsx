import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { audius, type Artist } from '@/api/audius';
import { useData } from '@/api/useData';
import { ArtistPick } from '@/components/ArtistPick';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Btn, Screen, Skeleton, T, TopBar } from '@/ui/kit';

export default function Similar() {
  const favs = useLibrary((s) => s.favArtists);
  const key = 'related:' + favs.map((a) => a.id).join(',');
  const { data, loading } = useData(key, async (s) => {
    const lists = await Promise.all(favs.slice(0, 5).map((a) => audius.related(a.id, s).catch(() => [] as Artist[])));
    const seen = new Set(favs.map((a) => a.id));
    const out: Artist[] = [];
    for (let i = 0; out.length < 6 && i < 10; i++) for (const l of lists) { const a = l[i]; if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); } }
    return out.slice(0, 6);
  });
  const [picked, setPicked] = useState<string[]>([]);
  const { width } = useWindowDimensions();
  const size = Math.min(150, (Math.min(width, 560) - 40 - 48) / 2);
  const finish = (skip?: boolean) => {
    const lib = useLibrary.getState();
    if (!skip && data) lib.setFavArtists([...lib.favArtists, ...data.filter((a) => picked.includes(a.id))]);
    lib.setOnboarded(true);
    router.replace('/listen');
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen dock={false} style={{ paddingBottom: 170 }}>
        <TopBar />
        <T v="h1" style={{ marginTop: 10, marginBottom: 8 }} accessibilityRole="header">Похожие исполнители</T>
        <T v="sub" style={{ marginBottom: 24 }}>Можно добавить ещё — или сразу слушать.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24, rowGap: 20 }}>
          {loading && !data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={size} w={size} r={size / 2} />) : null}
          {(data || []).map((a) => <ArtistPick key={a.id} a={a} size={size} on={picked.includes(a.id)} onPress={() => setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))} />)}
        </View>
      </Screen>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 18, gap: 6 }}>
        <LinearGradient colors={['rgba(0,0,0,0)', '#000', '#000']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Btn label="Начать слушать" icon="play" onPress={() => finish()} />
        <Pressable onPress={() => finish(true)} style={{ alignSelf: 'center', padding: 12 }} accessibilityRole="button"><T v="sub">Пропустить</T></Pressable>
      </View>
    </View>
  );
}
