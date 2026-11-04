import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { Track } from '@/api/audius';
import { currentTrack, player, usePlayer } from '@/player/player';
import { C } from '@/theme/tokens';
import { Btn, IconBtn, ListSkeleton, Offline, Screen, Skeleton, T, TopBar } from '@/ui/kit';
import { TrackRow } from './TrackRow';
import { Icon } from '@/ui/Icon';

type Props = {
  title: string;
  sub?: ReactNode;
  cover?: { uri?: string; source?: any; collage?: (string | undefined)[] };
  tracks?: Track[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  right?: ReactNode;
  extraBtn?: ReactNode;
  below?: ReactNode;
  empty?: ReactNode;
  numbered?: boolean;
  sub2?: boolean;
  playlistId?: string;
};

export function CoverArt({ cover, size, radius = 34 }: { cover?: Props['cover']; size: number | '100%'; radius?: number }) {
  const col = (cover?.collage || []).filter(Boolean).slice(0, 3) as string[];
  return (
    <View style={{ width: size, aspectRatio: 1, borderRadius: radius, overflow: 'hidden', backgroundColor: C.s2, alignSelf: 'center' }}>
      {cover?.uri || cover?.source ? <Image source={cover.source ?? { uri: cover.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        : col.length ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <Image source={{ uri: col[0] }} style={{ flex: 1 }} contentFit="cover" />
            {col.length > 1 ? (
              <View style={{ flex: 1, gap: 2 }}>
                <Image source={{ uri: col[1] }} style={{ flex: 1 }} contentFit="cover" />
                {col[2] ? <Image source={{ uri: col[2] }} style={{ flex: 1 }} contentFit="cover" /> : null}
              </View>
            ) : null}
          </View>
        ) : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="note" size={typeof size === 'number' ? size * 0.36 : 56} /></View>}
    </View>
  );
}

export function ListPage(p: Props) {
  const { width } = useWindowDimensions();
  const size = Math.min(270, width * 0.7);
  const tracks = p.tracks || [];
  const playingHere = usePlayer((s) => s.playing && !!currentTrack(s) && tracks.some((t) => t.id === currentTrack(s)!.id));
  const disabled = !tracks.length;
  return (
    <Screen>
      <TopBar right={p.right} />
      <View style={{ marginTop: 4, marginBottom: 18 }}>{p.loading && !p.cover?.uri && !p.cover?.source ? <Skeleton h={size} w={size} r={34} style={{ alignSelf: 'center' }} /> : <CoverArt cover={p.cover} size={size} />}</View>
      <T v="h1" accessibilityRole="header">{p.title}</T>
      {p.sub ? <View style={{ marginTop: 6 }}>{p.sub}</View> : null}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
        <Btn label={playingHere ? 'Пауза' : 'Слушать'} icon="playpause" playing={playingHere} disabled={disabled} style={{ flex: 1 }}
          onPress={() => (playingHere ? player.toggle() : player.play(tracks, undefined, { shuffle: false }))} />
        <IconBtn name="shuffle" label="Перемешать" size={58} iconSize={26} onPress={() => !disabled && player.play(tracks, undefined, { shuffle: true })} style={{ opacity: disabled ? 0.32 : 1 }} />
        {p.extraBtn}
      </View>
      {p.below}
      <View style={{ height: 18 }} />
      {p.error && !tracks.length ? <Offline onRetry={p.onRetry || (() => {})} /> : p.loading && !tracks.length ? <ListSkeleton n={6} /> : !tracks.length ? p.empty : (
        tracks.map((t, i) => <TrackRow key={t.id + i} track={t} list={tracks} num={p.numbered ? i + 1 : undefined} sub={p.sub2} playlistId={p.playlistId} />)
      )}
    </Screen>
  );
}
