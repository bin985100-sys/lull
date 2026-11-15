import { useLocalSearchParams } from 'expo-router';

import { MOODS } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { Sections } from '@/components/Cards';
import { Banner } from '@/components/Banner';
import { Empty, ListSkeleton, Offline, Reveal, Screen, TopBar } from '@/ui/kit';

/* Настроение: плейлисты каталога Lull под выбранное состояние */
export default function MoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = MOODS.find((x) => x.id === id) ?? MOODS[0];
  const { data, loading, error, reload } = useData('mood:' + m.chip, (s) => lull.home(m.chip, s));
  return (
    <Screen>
      <TopBar />
      <Reveal style={{marginTop:10,marginBottom:24}}><Banner source={m.image} label={m.title}/></Reveal>
      {error && !data ? <Offline onRetry={reload} /> : loading && !data ? <ListSkeleton n={5} /> : data?.length ? <Sections sections={data} /> : <Empty icon="note" title="Пока пусто" text="Попробуй позже — подборки обновляются." />}
    </Screen>
  );
}
