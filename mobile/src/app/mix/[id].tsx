import { useLocalSearchParams } from 'expo-router';

import { getMix, useMixSeed } from '@/api/mixes';
import { useData } from '@/api/useData';
import { ListPage } from '@/components/ListPage';
import { Empty } from '@/ui/kit';

export default function MixScreen() {
  const { id, n } = useLocalSearchParams<{ id: string; n?: string }>();
  useMixSeed((x) => x.n);
  const mix = getMix(id, n);
  const { data, loading, error, reload } = useData('mix:' + mix.id, mix.load);
  return (
    <ListPage title={mix.title} cover={mix.image ? { source: mix.image, wide: true } : { collage: (data || []).map((t) => t.artwork) }}
      tracks={data} loading={loading} error={!!error} onRetry={reload} sub2
      empty={<Empty icon="note" title="Пока пусто" text="Попробуй позже — подборка обновляется." />} />
  );
}
