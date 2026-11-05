import { LinearGradient } from 'expo-linear-gradient';
import { resetTo } from '@/nav';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { audius, type Artist } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { ArtistPick } from '@/components/ArtistPick';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Btn, Screen, Skeleton, T, TopBar } from '@/ui/kit';

export default function Similar() {
  const favs = useLibrary((s) => s.favArtists);
  const key = 'related:' + favs.map((a) => a.id).join(',');
  const { data, loading } = useData(key, async (s) => {
    const lists = await Promise.all(favs.slice(0, 5).map((a) => (a.source === 'audius' ? audius.related(a.id, s) : lull.artist(a.id, s).then((p) => p.similar)).catch(() => [] as Artist[])));
    const seen = new Set(favs.map((a) => a.id));
    const out: Artist[] = [];
    for (let i = 0; out.length < 6 && i < 10; i++) for (const l of lists) { const a = l[i]; if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); } }
    return out.slice(0, 6);
  });
  const [picked, setPicked] = useState<string[]>([]);
  /* ширину колонки считаем от реальной ширины сетки — иначе третья колонка не помещалась */
  const [gridW, setGridW] = useState(0);
  const size = gridW ? Math.floor((gridW - 24 * 1) / 2) : 0;
  const finish = (skip?: boolean) => {
    const lib = useLibrary.getState();
    if (!skip && data) lib.setFavArtists([...lib.favArtists, ...data.filter((a) => picked.includes(a.id))]);
    lib.setOnboarded(true);
    resetTo('/listen');
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen dock={false} style={{ paddingBottom: 170 }}>
        <TopBar />
        <T v="h1" style={{ marginTop: 10, marginBottom: 8 }} accessibilityRole="header">Похожие исполнители</T>
        <T v="sub" style={{ marginBottom: 24 }}>Можно добавить ещё — или сразу слушать.</T>
        <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 20 }}>
          {size && loading && !data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={size} w={size} r={size / 2} />) : null}
          {size ? (data || []).map((a) => <ArtistPick key={a.id} a={a} size={size} on={picked.includes(a.id)} onPress={() => setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))} />) : null}
        </View>
      </Screen>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 18, gap: 6 }}>
        <LinearGradient colors={['rgba(0,0,0,0)', '#000', '#000']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Btn label="Начать слушать" icon="play" onPress={() => finish()} />
        <Pressable onPress={() => finish(true)} style={{ alignSelf: 'center', padding: 12 }} accessibilityRole="button"><T v="sub">Пропустить</T></Pressable>
      </View>
    </View>
  );
}
