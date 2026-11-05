import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MOODS } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { Sections } from '@/components/Cards';
import { C } from '@/theme/tokens';
import { Empty, ListSkeleton, Offline, Screen, TopBar } from '@/ui/kit';

/* Настроение: плейлисты каталога Lull под выбранное состояние */
export default function MoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = MOODS.find((x) => x.id === id) ?? MOODS[0];
  const { data, loading, error, reload } = useData('mood:' + m.chip, (s) => lull.home(m.chip, s));
  return (
    <Screen>
      <TopBar />
      <View style={{ width: '100%', aspectRatio: 1.5, borderRadius: 30, overflow: 'hidden', marginTop: 10, marginBottom: 24, backgroundColor: '#000', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine }}
        accessibilityRole="header" accessibilityLabel={m.title}>
        <Image source={m.image} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
      {error && !data ? <Offline onRetry={reload} /> : loading && !data ? <ListSkeleton n={5} /> : data?.length ? <Sections sections={data} /> : <Empty icon="note" title="Пока пусто" text="Попробуй позже — подборки обновляются." />}
    </Screen>
  );
}
