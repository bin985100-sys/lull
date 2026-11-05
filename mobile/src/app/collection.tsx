import { router } from 'expo-router';
import { resetTo } from '@/nav';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { openArtist, openPlaylist } from '@/components/Cards';
import { CoverArt } from '@/components/ListPage';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, Empty, IconBtn, Press, s, Screen, SectionHead, Segmented, T } from '@/ui/kit';

type Tab = 'pl' | 'saved' | 'ar';

export default function Collection() {
  const lib = useLibrary();
  const [tab, setTab] = useState<Tab>('pl');
  const [q, setQ] = useState('');
  const m = (x: string) => !q.trim() || x.toLowerCase().includes(q.trim().toLowerCase());
  const empty = !lib.playlists.length && !lib.liked.length && !lib.savedPlaylists.length && !lib.favArtists.length;
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10, marginBottom: 18 }}>
      <T v="h1" accessibilityRole="header">Коллекция</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <IconBtn name="download" label="Перенести музыку из другого сервиса" onPress={() => router.push('/import')} />
        <IconBtn name="plus" label="Новый плейлист" onPress={() => router.push('/new-playlist')} />
      </View>
    </View>
  );
  if (empty) return (
    <Screen>{head}
      <Empty icon="stack" title="Здесь пока пусто" text="Сохраняй треки, плейлисты и исполнителей — они появятся здесь.">
        <Btn label="Открыть музыку" icon="arrow" onPress={() => resetTo('/discover')} />
        <Btn label="Перенести музыку" icon="download" kind="dark" onPress={() => router.push('/import')} />
        <Btn label="Создать плейлист" icon="plus" kind="dark" onPress={() => router.push('/new-playlist')} />
      </Empty>
    </Screen>
  );
  const grid = (items: { key: string; title: string; cover: any; onPress: () => void; round?: boolean }[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 18 }}>
      {items.map((it) => (
        <Press key={it.key} onPress={it.onPress} accessibilityRole="button" accessibilityLabel={it.title} outer={{ width: '47%', flexGrow: 1, maxWidth: '50%' }} style={{ gap: 10, alignItems: it.round ? 'center' : 'stretch' }}>
          {it.round ? <Cover uri={it.cover} size="100%" radius={999} /> : it.cover}
          <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 16 }}>{it.title}</T>
        </Press>
      ))}
    </View>
  );
  return (
    <Screen>{head}
      <View style={s.field}>
        <Icon name="search" size={22} color={C.tx2} />
        <TextInput value={q} onChangeText={setQ} placeholder="Найти в коллекции" placeholderTextColor={C.tx3} style={s.input} accessibilityLabel="Найти в коллекции" />
      </View>
      <View style={{ marginTop: 14, marginBottom: 22 }}>
        <Segmented label="Разделы коллекции" value={tab} onChange={setTab} items={[['pl', 'Плейлисты'], ['saved', 'Сохранённое'], ['ar', 'Артисты']]} />
      </View>
      {tab === 'pl' ? (
        <View>
          {!q ? (
            <Pressable onPress={() => router.push('/favorites')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 14, borderRadius: 26, backgroundColor: C.s1, marginBottom: 26 }}>
              <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Icon name="heart" /></View>
              <T style={{ flex: 1, fontFamily: F.bold, fontSize: 18 }}>Любимые треки</T>
              <T v="sub">{lib.liked.length || ''}</T><Icon name="chev" size={22} />
            </Pressable>
          ) : null}
          <SectionHead title="Мои плейлисты" />
          {lib.playlists.length ? grid(lib.playlists.filter((p) => m(p.name)).map((p) => ({
            key: p.id, title: p.name, onPress: () => router.push({ pathname: '/my/[id]', params: { id: p.id } }),
            cover: <CoverArt cover={{ collage: p.tracks.map((t) => t.artwork) }} size="100%" radius={24} />,
          }))) : <Btn label="Создать плейлист" icon="plus" kind="dark" onPress={() => router.push('/new-playlist')} />}
        </View>
      ) : tab === 'saved' ? (
        lib.savedPlaylists.length ? grid(lib.savedPlaylists.filter((p) => m(p.title)).map((p) => ({
          key: p.id, title: p.title, onPress: () => openPlaylist(p), cover: <Cover uri={p.artwork} size="100%" radius={24} />,
        }))) : <Empty icon="disc" title="Нет сохранённых плейлистов" text="Сохраняй плейлисты сердцем на их странице." />
      ) : lib.favArtists.length ? grid(lib.favArtists.filter((a) => m(a.name)).map((a) => ({
        key: a.id, title: a.name, round: true, cover: a.avatar, onPress: () => openArtist(a),
      }))) : <Empty icon="user" title="Нет исполнителей" text="Добавляй исполнителей в коллекцию на их странице." />}
    </Screen>
  );
}
