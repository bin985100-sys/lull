import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import type { Artist, Playlist } from '@/api/audius';
import type { Card, Section } from '@/api/lull';
import { player } from '@/player/player';
import { F } from '@/theme/tokens';
import { Cover, Press, SectionHead, T } from '@/ui/kit';
import { TrackRow } from './TrackRow';

export const openArtist = (a: { id: string; source?: string }) => router.push({ pathname: '/artist/[id]', params: { id: a.id, s: a.source === 'audius' ? 'audius' : 'yt' } });
export const openPlaylist = (p: Pick<Playlist, 'id' | 'source' | 'kind'>) =>
  router.push({ pathname: '/playlist/[id]', params: { id: p.id, s: p.source === 'audius' ? 'audius' : 'yt', k: p.kind ?? 'playlist' } });

export function openCard(c: Card) {
  if (c.kind === 'artist') openArtist({ id: c.id, source: 'yt' });
  else if (c.kind === 'track' && c.track) player.play([c.track], c.track.id);
  else openPlaylist({ id: c.id, source: 'yt', kind: c.kind === 'album' ? 'album' : 'playlist' });
}

export function CardItem({ c, w = 150 }: { c: Card; w?: number }) {
  const round = c.kind === 'artist';
  const wide = c.kind === 'track';
  return (
    <Press onPress={() => openCard(c)} accessibilityRole="button" accessibilityLabel={c.title} style={{ width: wide ? w * 1.4 : w, gap: 8, alignItems: round ? 'center' : 'stretch' }}>
      {wide ? (
        <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 20, overflow: 'hidden' }}><Cover uri={c.image} size="100%" radius={0} style={{ aspectRatio: 16 / 9 }} /></View>
      ) : <Cover uri={c.image} size={w} radius={round ? w / 2 : 24} />}
      <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15.5, textAlign: round ? 'center' : 'left' }}>{c.title}</T>
      {c.subtitle && !round ? <T v="small" numberOfLines={1} style={{ marginTop: -4 }}>{c.subtitle}</T> : null}
    </Press>
  );
}

export function CardRail({ items }: { items: Card[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
      {items.map((c) => <CardItem key={c.kind + c.id} c={c} />)}
    </ScrollView>
  );
}

export function ArtistRail({ items, size = 112 }: { items: Artist[]; size?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
      {items.map((a) => (
        <Press key={a.id} onPress={() => openArtist(a)} accessibilityRole="button" accessibilityLabel={a.name} style={{ width: size, alignItems: 'center', gap: 8 }}>
          <Cover uri={a.avatar} size={size} radius={size / 2} />
          <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15 }}>{a.name}</T>
        </Press>
      ))}
    </ScrollView>
  );
}

export function Sections({ sections, max = 10 }: { sections: Section[]; max?: number }) {
  return (
    <View style={{ gap: 28 }}>
      {sections.filter((s) => s.items.length).slice(0, max).map((s) => {
        const tracks = s.items.filter((c) => c.track).map((c) => c.track!);
        return (
          <View key={s.title}>
            <SectionHead title={s.title} />
            {s.layout === 'tracks' && tracks.length ? tracks.slice(0, 6).map((t) => <TrackRow key={t.id} track={t} list={tracks} sub />) : <CardRail items={s.items} />}
          </View>
        );
      })}
    </View>
  );
}
