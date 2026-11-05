import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { resetTo } from '@/nav';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Artist } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { ArtistPick } from '@/components/ArtistPick';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Btn, Offline, Screen, Skeleton, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

export default function Onboarding() {
  const { data, loading, error, reload } = useData('popularArtists', (s) => lull.popularArtists(s));
  const [picked, setPicked] = useState<Artist[]>([]);
  /* ширину колонки считаем от реальной ширины сетки — иначе третья колонка не помещалась */
  const [gridW, setGridW] = useState(0);
  const size = gridW ? Math.floor((gridW - 12 * 2) / 3) : 0;
  const toggle = (a: Artist) => {
    if (picked.some((x) => x.id === a.id)) setPicked(picked.filter((x) => x.id !== a.id));
    else if (picked.length >= 5) toast('Можно выбрать ровно пять — сними одного', 'info');
    else setPicked([...picked, a]);
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen dock={false} style={{ paddingBottom: 170 }}>
        <TopBar onBack={() => (router.canGoBack() ? router.back() : resetTo('/welcome'))} />
        <T v="h1" style={{ marginTop: 10, marginBottom: 8 }} accessibilityRole="header">Выбери пять исполнителей</T>
        <T v="sub" style={{ marginBottom: 22 }}>С них начнём подборки.</T>
        {error && !data ? <Offline onRetry={reload} /> : null}
        <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 18 }}>
          {size && loading && !data ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} h={size} w={size} r={size / 2} />) : null}
          {size ? (data || []).map((a) => <ArtistPick key={a.id} a={a} size={size} on={picked.some((x) => x.id === a.id)} onPress={() => toggle(a)} />) : null}
        </View>
      </Screen>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24, gap: 10 }}>
        <LinearGradient colors={['rgba(0,0,0,0)', '#000', '#000']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <T v="sub" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{picked.length} из 5</T>
        <Btn label="Дальше" icon="arrow" disabled={picked.length !== 5} onPress={() => {
          useLibrary.getState().setFavArtists(picked);
          router.push('/similar');
        }} />
      </View>
    </View>
  );
}
