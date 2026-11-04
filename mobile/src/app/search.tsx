import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { audius } from '@/api/audius';
import { useData } from '@/api/useData';
import { TrackRow } from '@/components/TrackRow';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, Empty, IconBtn, ListSkeleton, Offline, Press, s, Screen, SectionHead, Segmented, T } from '@/ui/kit';

type Filter = 'all' | 'tracks' | 'playlists' | 'artists';

export default function Search() {
  /* фокус после анимации входа экрана, иначе браузер его теряет */
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 340); return () => clearTimeout(t); }, []);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [f, setF] = useState<Filter>('all');
  const recent = useLibrary((x) => x.recentSearches);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const res = useData(debounced ? 'search:' + debounced.toLowerCase() : null, async (sig) => {
    const [tracks, artists, playlists] = await Promise.all([audius.searchTracks(debounced, sig), audius.searchArtists(debounced, sig), audius.searchPlaylists(debounced, sig)]);
    return { tracks, artists, playlists };
  });
  const d = res.data;
  const nothing = d && !d.tracks.length && !d.artists.length && !d.playlists.length;
  const show = (k: Filter) => f === 'all' || f === k;

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
        <Segmented label="Фильтр" value={f} onChange={setF} items={[['all', 'Всё'], ['tracks', 'Треки'], ['playlists', 'Плейлисты'], ['artists', 'Артисты']]} />
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
        ) : <T v="body">Ищи треки, плейлисты и исполнителей Audius.</T>
      ) : res.error && !d ? <Offline onRetry={res.reload} />
        : res.loading && !d ? <ListSkeleton n={5} />
        : nothing ? (
          <Empty icon="search" title="Ничего не нашли" text={`По запросу «${debounced}» ничего нет. Проверь написание или попробуй другой запрос.`}>
            <Btn label="Очистить запрос" icon="close" kind="dark" onPress={() => setQ('')} />
          </Empty>
        ) : d ? (
          <View style={{ gap: 28 }}>
            {show('artists') && d.artists.length ? (
              <View>
                {f === 'all' ? <SectionHead title="Артисты" /> : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
                  {d.artists.map((a) => (
                    <Press key={a.id} onPress={() => router.push({ pathname: '/artist/[id]', params: { id: a.id } })} accessibilityRole="button" accessibilityLabel={a.name} style={{ width: 104, alignItems: 'center', gap: 8 }}>
                      <Cover uri={a.avatar} size={104} radius={52} />
                      <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15 }}>{a.name}</T>
                    </Press>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {show('tracks') && d.tracks.length ? (
              <View>
                {f === 'all' ? <SectionHead title="Треки" /> : null}
                {(f === 'all' ? d.tracks.slice(0, 5) : d.tracks).map((t) => <TrackRow key={t.id} track={t} list={d.tracks} sub />)}
              </View>
            ) : null}
            {show('playlists') && d.playlists.length ? (
              <View>
                {f === 'all' ? <SectionHead title="Плейлисты" /> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 18 }}>
                  {d.playlists.slice(0, f === 'all' ? 4 : 12).map((p) => (
                    <Press key={p.id} onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: p.id } })} accessibilityRole="button" accessibilityLabel={p.title} outer={{ flexBasis: '47%', flexGrow: 1, maxWidth: '50%' }} style={{ gap: 10 }}>
                      <Cover uri={p.artwork} size="100%" radius={24} />
                      <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 16 }}>{p.title}</T>
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
