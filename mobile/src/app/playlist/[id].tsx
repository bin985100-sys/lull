import { useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';

import { audius, type Playlist, type Track } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { openArtist } from '@/components/Cards';
import { ListPage } from '@/components/ListPage';
import { useLibrary } from '@/store/library';
import { IconBtn, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

/* Альбом или плейлист каталога (Lull или Audius): слушать и сохранять, не редактируется */
export default function CatalogPlaylist() {
  const { id, s: src, k } = useLocalSearchParams<{ id: string; s?: string; k?: string }>();
  const isAudius = src === 'audius';
  const kind = k === 'album' ? 'album' : 'playlist';
  const { data, loading, error, reload } = useData<{ meta: Playlist; tracks: Track[]; year?: string }>(`coll:${src}:${kind}:${id}`, async (sig) => {
    if (!isAudius) return lull.collection(kind, id, sig);
    const [meta, tracks] = await Promise.all([audius.playlist(id, sig), audius.playlistTracks(id, sig)]);
    return { meta, tracks };
  });
  const saved = useLibrary((x) => x.savedPlaylists.some((p) => p.id === id));
  const p = data?.meta;
  const artistId = p?.artistId || (kind === 'album' ? data?.tracks[0]?.artistId : '');
  const sub = p ? [p.artist, data?.year].filter(Boolean).join(' · ') : '';
  return (
    <ListPage title={p?.title ?? ' '} cover={{ uri: p?.artwork, collage: (data?.tracks || []).map((t) => t.artwork) }}
      sub={sub ? <Pressable disabled={!artistId} onPress={() => artistId && openArtist({ id: artistId, source: isAudius ? 'audius' : 'yt' })} accessibilityRole={artistId ? 'link' : undefined}><T v="sub">{sub}</T></Pressable> : null}
      tracks={data?.tracks} loading={loading} error={!!error} onRetry={reload} sub2={kind !== 'album'} numbered={kind === 'album'}
      extraBtn={p ? <IconBtn name={saved ? 'heartF' : 'heart'} size={58} iconSize={26} label={saved ? 'Убрать из коллекции' : 'Сохранить в коллекцию'}
        onPress={() => { useLibrary.getState().toggleSavedPlaylist({ ...p, id }); toast(saved ? 'Убрано из коллекции' : kind === 'album' ? 'Альбом в коллекции' : 'Плейлист в коллекции', saved ? 'heart' : 'heartF'); }} /> : null} />
  );
}
