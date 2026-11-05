import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { ArtistRail, openArtist, openPlaylist } from '@/components/Cards';
import { TrackRow } from '@/components/TrackRow';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, Empty, IconBtn, ListSkeleton, Offline, Press, s, Screen, SectionHead, Segmented, T } from '@/ui/kit';

type Filter = 'all' | 'tracks' | 'albums' | 'artists';

export default function Search() {
  /* фокус после анимации входа экрана, иначе браузер его теряет */
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 340); return () => clearTimeout(t); }, []);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [f, setF] = useState<Filter>('all');
  const recent = useLibrary((x) => x.recentSearches);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  /* вкладки ищут отдельно (раньше просто фильтровали общую выдачу — в «Треках» оставалось 3–5 песен) */
  const sf = ({ all: 'all', tracks: 'songs', albums: 'albums', artists: 'artists' } as const)[f];
  const res = useData(debounced ? `lsearch:${sf}:${debounced.toLowerCase()}` : null, (sig) => lull.search(debounced, sig, sf));
  const d = res.data;
  const nothing = d && !d.tracks.length && !d.artists.length && !d.albums.length && !d.playlists.length;
  const show = (k: Filter) => f === 'all' || f === k;
  const collections = d ? [...d.albums, ...(f === 'albums' ? d.playlists : [])] : [];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <IconBtn name="back" label="Назад" onPress={() => router.back()} />
        <View style={[s.field, { flex: 1 }]}>
          <Icon name="search" size={22} color={C.tx2} />
          <TextInput value={q} onChangeText={setQ} ref={inputRef} placeholder="Что послушать?" placeholderTextColor={C.tx3} style={s.input} returnKeyType="search"
            onSubmitEditing={() => q.trim() && useLibrary.getState().pushSearch(q.trim())} accessibilityLabel="Поиск" autoCorrect={false} />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Очистить запрос" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} /></Pressable> : null}
        </View>
      </View>
      <View style={{ marginTop: 16, marginBottom: 20 }}>
        <Segmented label="Фильтр" value={f} onChange={setF} items={[['all', 'Всё'], ['tracks', 'Треки'], ['albums', 'Альбомы'], ['artists', 'Артисты']]} />
      </View>

      {!debounced ? (
        recent.length ? (
          <View>
            <SectionHead title="Недавние" more="Очистить" onMore={() => useLibrary.getState().clearSearches()} />
            {recent.map((r) => (
              <Pressable key={r} onPress={() => setQ(r)} accessibilityRole="button" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
                <T style={{ fontSize: 16.5 }}>{r}</T><Icon name="arrowUR" size={22} color={C.tx2} />
              </Pressable>
            ))}
          </View>
        ) : <T v="body">Ищи треки, альбомы и исполнителей.</T>
      ) : res.error && !d ? <Offline onRetry={res.reload} />
        : res.loading && !d ? <ListSkeleton n={5} />
        : nothing ? (
          <Empty icon="search" title="Ничего не нашли" text={`По запросу «${debounced}» ничего нет. Проверь написание или попробуй другой запрос.`}>
            <Btn label="Очистить запрос" icon="close" kind="dark" onPress={() => setQ('')} />
          </Empty>
        ) : d ? (
          <View style={{ gap: 28 }}>
            {f === 'all' && d.top ? <TopResult top={d.top} tracks={d.tracks} /> : null}
            {show('artists') && d.artists.length && !(f === 'all' && d.top?.kind === 'track') ? (
              <View>{f === 'all' ? <SectionHead title="Артисты" /> : null}<ArtistRail items={d.artists} size={104} /></View>
            ) : null}
            {show('tracks') && d.tracks.length ? (
              <View>
                {f === 'all' ? <SectionHead title="Треки" /> : null}
                {(f === 'all' ? d.tracks.filter((t) => !(d.top?.kind === 'track' && d.top.track.id === t.id)).slice(0, 5) : d.tracks).map((t) => <TrackRow key={t.id} track={t} list={d.tracks} sub noWarm />)}
              </View>
            ) : null}
            {f === 'all' && d.top?.kind === 'track' && d.artists.length ? (
              <View><SectionHead title="Артисты" /><ArtistRail items={d.artists} size={104} /></View>
            ) : null}
            {show('albums') && collections.length ? (
              <View>
                {f === 'all' ? <SectionHead title="Альбомы" /> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 18 }}>
                  {collections.slice(0, f === 'all' ? 4 : 20).map((p) => (
                    <Press key={p.id} onPress={() => openPlaylist(p)} accessibilityRole="button" accessibilityLabel={p.title} outer={{ flexBasis: '47%', flexGrow: 1, maxWidth: '50%' }} style={{ gap: 8 }}>
                      <Cover uri={p.artwork} size="100%" radius={24} />
                      <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 16 }}>{p.title}</T>
                      {p.artist ? <T v="small" numberOfLines={1} style={{ marginTop: -4 }}>{p.artist}</T> : null}
                    </Press>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
    </Screen>
  );
}

/* Лучший результат YouTube Music: то, что человек скорее всего искал — крупно и первым */
type Top = NonNullable<Awaited<ReturnType<typeof lull.search>>['top']>;
function TopResult({ top, tracks }: { top: Top; tracks: import('@/api/audius').Track[] }) {
  if (top.kind === 'track') {
    const list = [top.track, ...tracks.filter((t) => t.id !== top.track.id)];
    return <View><SectionHead title="Лучший результат" /><TrackRow track={top.track} list={list} sub noWarm /></View>;
  }
  const isArtist = top.kind === 'artist';
  const title = isArtist ? top.artist.name : top.album.title;
  const sub = isArtist ? 'Артист' : top.album.artist || 'Альбом';
  const img = isArtist ? top.artist.avatar : top.album.artwork;
  return (
    <View>
      <SectionHead title="Лучший результат" />
      <Press onPress={() => (isArtist ? openArtist(top.artist) : openPlaylist(top.album))} accessibilityRole="button" accessibilityLabel={title}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 14, borderRadius: 28, backgroundColor: C.s2 }}>
        <Cover uri={img} size={88} radius={isArtist ? 44 : 20} />
        <View style={{ flex: 1, gap: 4 }}>
          <T numberOfLines={2} style={{ fontFamily: F.bold, fontSize: 20 }}>{title}</T>
          <T v="small" numberOfLines={1}>{sub}</T>
        </View>
        <Icon name="arrowUR" size={22} color={C.tx2} />
      </Press>
    </View>
  );
}
