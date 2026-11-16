import { useTheme } from '@/theme/state';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { audius, type Artist, type Track } from '@/api/audius';
import { lull, warm, type Section } from '@/api/lull';
import { useData } from '@/api/useData';
import { ArtistRail, Sections } from '@/components/Cards';
import { TrackRow } from '@/components/TrackRow';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';

import { Btn,Cover, IconBtn, ListSkeleton, Offline, Screen, SectionHead, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

type Page = { artist: Artist; monthly?: string; top: Track[]; sections: Section[]; similar: Artist[] };
const EMPTY_TRACKS:Track[]=[];

async function loadAudius(id: string, s: AbortSignal): Promise<Page> {
  const [artist, top, similar] = await Promise.all([audius.artist(id, s), audius.artistTracks(id, s), audius.related(id, s).catch(() => [] as Artist[])]);
  return { artist, top, sections: [], similar };
}

export default function ArtistScreen() {
  const {colors:C}=useTheme();
  const { id, s: src } = useLocalSearchParams<{ id: string; s?: string }>();
  const isAudius = src === 'audius';
  const ins = useSafeAreaInsets();
  const { data, loading, error, reload } = useData(`artistpage:${src}:${id}`, (sig) => (isAudius ? loadAudius(id, sig) : lull.artist(id, sig)));
  const fol = useLibrary((x) => x.favArtists.some((a) => a.id === id));
  const tracks = data?.top ?? EMPTY_TRACKS;
  useEffect(() => { if (tracks.length) warm(tracks.slice(0, 2)); }, [tracks]);
  const playingHere = usePlayer((x) => x.playing && !!currentTrack(x) && tracks.some((t) => t.id === currentTrack(x)!.id));
  const art = data?.artist;
  return (
    <Screen style={{ paddingTop: 0 }}>
      <View style={{ height: 400, marginHorizontal: -20, backgroundColor: C.s1 }}>
        <Cover uri={art?.cover || art?.avatar} fallbackUri={art?.avatar} label={art?.name} size="100%" radius={0} style={{height:'100%',aspectRatio:undefined}}/>
        {/* плавное затемнение к низу, чтобы имя читалось, а обложка не резалась полосой */}
        <LinearGradient colors={['rgba(0,0,0,.12)', 'transparent', 'transparent', C.bg+'dd', C.bg]} locations={[0, 0.22, 0.5, 0.8, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={{ position: 'absolute', top: Math.max(ins.top, 18) + 14, left: 20 }}>
          <IconBtn name="back" label="Назад" onPress={() => router.back()} />
        </View>
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 14, gap: 4 }}>
          <T v="h1" numberOfLines={2} style={{ fontSize: 40, lineHeight: 44 }} accessibilityRole="header">{art?.name ?? ' '}</T>
          {data?.monthly ? <T v="sub">{data.monthly}</T> : null}
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
          {error && !data ? <Offline onRetry={reload} /> : loading && !data ? <ListSkeleton n={5} /> : tracks.slice(0, 10).map((t) => <TrackRow key={t.id} track={t} list={tracks} />)}
        </View>
        {data?.sections.length ? <Sections sections={data.sections} /> : null}
        {data?.similar.length ? <View><SectionHead title="Похожие" /><ArtistRail items={data.similar} /></View> : null}
      </View>
    </Screen>
  );
}
