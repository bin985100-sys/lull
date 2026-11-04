import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MOODS } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { Sections } from '@/components/Cards';
import { C, F } from '@/theme/tokens';
import { Empty, ListSkeleton, Offline, Screen, T, TopBar } from '@/ui/kit';

/* Настроение: плейлисты каталога Lull под выбранное состояние */
export default function MoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = MOODS.find((x) => x.id === id) ?? MOODS[0];
  const { data, loading, error, reload } = useData('mood:' + m.chip, (s) => lull.home(m.chip, s));
  return (
    <Screen>
      <TopBar />
      <View style={{ height: 190, borderRadius: 30, overflow: 'hidden', marginTop: 10, marginBottom: 24, backgroundColor: C.s2 }}>
        <Image source={m.image} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
        <T accessibilityRole="header" style={{ position: 'absolute', left: 22, bottom: 20, fontFamily: F.bold, fontSize: 32 }}>{m.title}</T>
      </View>
      {error && !data ? <Offline onRetry={reload} /> : loading && !data ? <ListSkeleton n={5} /> : data?.length ? <Sections sections={data} /> : <Empty icon="note" title="Пока пусто" text="Попробуй позже — подборки обновляются." />}
    </Screen>
  );
}
