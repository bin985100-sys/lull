import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';

import { audius } from '@/api/audius';
import { useData } from '@/api/useData';
import { ListPage } from '@/components/ListPage';
import { useLibrary } from '@/store/library';
import { IconBtn, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

/* Плейлист из каталога Audius: только слушать и сохранять, не редактируется */
export default function AudiusPlaylist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meta = useData('pl:' + id, (s) => audius.playlist(id, s));
  const tr = useData('plt:' + id, (s) => audius.playlistTracks(id, s));
  const saved = useLibrary((s) => s.savedPlaylists.some((p) => p.id === id));
  const p = meta.data;
  return (
    <ListPage title={p?.title ?? ' '} cover={{ uri: p?.artwork, collage: (tr.data || []).map((t) => t.artwork) }}
      sub={p ? <Pressable onPress={() => router.push({ pathname: '/artist/[id]', params: { id: p.artistId } })} accessibilityRole="link"><T v="sub">{p.artist}</T></Pressable> : null}
      tracks={tr.data} loading={tr.loading || meta.loading} error={!!tr.error} onRetry={tr.reload} sub2
      extraBtn={p ? <IconBtn name={saved ? 'heartF' : 'heart'} size={58} iconSize={26} label={saved ? 'Убрать из коллекции' : 'Сохранить в коллекцию'}
        onPress={() => { useLibrary.getState().toggleSavedPlaylist(p); toast(saved ? 'Убрано из коллекции' : 'Плейлист в коллекции', saved ? 'heart' : 'heartF'); }} /> : null} />
  );
}
