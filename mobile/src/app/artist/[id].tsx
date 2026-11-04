import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { audius } from '@/api/audius';
import { useData } from '@/api/useData';
import { TrackRow } from '@/components/TrackRow';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Btn, Cover, IconBtn, ListSkeleton, Offline, Press, Screen, SectionHead, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ins = useSafeAreaInsets();
  const a = useData('artist:' + id, (s) => audius.artist(id, s));
  const tr = useData('artistTracks:' + id, (s) => audius.artistTracks(id, s));
  const rel = useData('related1:' + id, (s) => audius.related(id, s));
  const fol = useLibrary((s) => s.favArtists.some((x) => x.id === id));
  const tracks = tr.data || [];
  const playingHere = usePlayer((s) => s.playing && !!currentTrack(s) && currentTrack(s)!.artistId === id);
  const art = a.data;
  return (
    <Screen style={{ paddingTop: 0 }}>
      <View style={{ height: 400, marginHorizontal: -20, backgroundColor: C.s1 }}>
        {art?.cover || art?.avatar ? <Image source={{ uri: art.cover || art.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <View style={{ position: 'absolute', top: Math.max(ins.top, 18) + 14, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
          <IconBtn name="back" label="Назад" onPress={() => router.back()} style={{ backgroundColor: 'rgba(20,21,23,0.6)' }} />
        </View>
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
          {art?.avatar ? <Cover uri={art.avatar} size={64} radius={32} /> : null}
          <T v="h1" numberOfLines={2} style={{ flex: 1, fontSize: 40, lineHeight: 44 }} accessibilityRole="header">{art?.name ?? ' '}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
        <Btn label={playingHere ? 'Пауза' : 'Слушать'} icon="playpause" playing={playingHere} disabled={!tracks.length} style={{ flex: 1 }} onPress={() => (playingHere ? player.toggle() : player.play(tracks, undefined, { shuffle: false }))} />
        <IconBtn name="shuffle" label="Перемешать" size={58} iconSize={26} onPress={() => tracks.length && player.play(tracks, undefined, { shuffle: true })} />
        {art ? <IconBtn name={fol ? 'check' : 'plus'} size={58} iconSize={26} label={fol ? 'Убрать из коллекции' : 'Добавить в коллекцию'} style={fol ? { backgroundColor: C.s4 } : undefined}
          onPress={() => { useLibrary.getState().toggleArtist(art); toast(fol ? 'Убрано из коллекции' : 'Исполнитель в коллекции', fol ? 'userMinus' : 'check'); }} /> : null}
      </View>
      <View style={{ gap: 28, marginTop: 28 }}>
        <View>
          <SectionHead title="Популярное" />
          {tr.error && !tr.data ? <Offline onRetry={tr.reload} /> : tr.loading && !tr.data ? <ListSkeleton n={5} /> : tracks.slice(0, 10).map((t) => <TrackRow key={t.id} track={t} list={tracks} />)}
        </View>
        {rel.data?.length ? (
          <View>
            <SectionHead title="Похожие" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
              {rel.data.map((r) => (
                <Press key={r.id} onPress={() => router.push({ pathname: '/artist/[id]', params: { id: r.id } })} accessibilityRole="button" accessibilityLabel={r.name} style={{ width: 112, alignItems: 'center', gap: 8 }}>
                  <Cover uri={r.avatar} size={112} radius={56} />
                  <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15 }}>{r.name}</T>
                </Press>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
