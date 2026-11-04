import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ListPage } from '@/components/ListPage';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Empty, IconBtn, s, T } from '@/ui/kit';
import { closeSheet, confirm, openSheet, toast } from '@/ui/overlay';

function EditSheet({ id }: { id: string }) {
  const pl = useLibrary((x) => x.playlists.find((p) => p.id === id));
  const [name, setName] = useState(pl?.name ?? '');
  if (!pl) return null;
  return (
    <View style={{ gap: 14 }}>
      <T v="h3">Плейлист</T>
      <View style={[s.field, { borderRadius: 20 }]}>
        <TextInput value={name} onChangeText={setName} maxLength={40} style={s.input} accessibilityLabel="Название" placeholder="Название" placeholderTextColor={C.tx3} />
      </View>
      <Btn label="Сохранить" icon="check" disabled={!name.trim()} onPress={() => { useLibrary.getState().renamePlaylist(id, name.trim()); closeSheet(); toast('Изменения сохранены', 'check'); }} />
      <Pressable accessibilityRole="button" onPress={() => { closeSheet(); confirm({ icon: 'trash', title: 'Удалить плейлист?', text: `«${pl.name}» пропадёт из коллекции. Сами треки останутся доступны.`, safe: 'Оставить', danger: 'Удалить плейлист', onDanger: () => { router.back(); useLibrary.getState().deletePlaylist(id); toast('Плейлист удалён', 'trash'); } }); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 }}>
        <Icon name="trash" size={26} /><T>Удалить плейлист</T>
      </Pressable>
    </View>
  );
}

export default function MyPlaylist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pl = useLibrary((x) => x.playlists.find((p) => p.id === id));
  if (!pl) return <ListPage title="Плейлист удалён" tracks={[]} empty={<Empty icon="note" title="Плейлист не найден" />} />;
  return (
    <ListPage title={pl.name} cover={{ collage: pl.tracks.map((t) => t.artwork) }} tracks={pl.tracks} sub2 playlistId={pl.id}
      right={<IconBtn name="pencil" label="Изменить плейлист" onPress={() => openSheet(() => <EditSheet id={pl.id} />)} />}
      below={<Btn label="Добавить треки" icon="plus" kind="flat" small style={{ marginTop: 12 }} onPress={() => router.push({ pathname: '/add-tracks', params: { id: pl.id } })} />}
      empty={<View style={{ padding: 24, borderRadius: 26, backgroundColor: C.s1, alignItems: 'center', gap: 6 }}><T v="h3">В плейлисте пока нет треков</T><T v="body">Добавь первые — и можно слушать.</T></View>} />
  );
}
