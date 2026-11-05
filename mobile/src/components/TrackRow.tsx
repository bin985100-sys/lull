import { router } from 'expo-router';
import { memo, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import type { Track } from '@/api/audius';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';
import { artistKey, useTaste } from '@/store/taste';
import { openWave } from './Wave';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Cover, haptic, T } from '@/ui/kit';
import { closeSheet, openSheet, toast } from '@/ui/overlay';
import { PlayPause } from '@/ui/PlayPause';

type Props = { track: Track; list: Track[]; num?: number; sub?: boolean; right?: 'play' | 'plus' | 'heart' | 'none'; playlistId?: string };

export const TrackRow = memo(function TrackRow({ track, list, num, sub, right = 'play', playlistId }: Props) {
  const isCur = usePlayer((s) => currentTrack(s)?.id === track.id);
  const playing = usePlayer((s) => s.playing && currentTrack(s)?.id === track.id);
  const lit = useSharedValue(0);
  useEffect(() => { if (isCur) lit.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 800 })); }, [isCur, lit]);
  const bg = useAnimatedStyle(() => ({ backgroundColor: `rgba(255,255,255,${lit.value * 0.1})` }));
  const play = () => { haptic(); player.play(list, track.id); };
  const more = () => { haptic(); openTrackActions(track, playlistId); };

  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 66, borderRadius: 16, marginHorizontal: -8, paddingHorizontal: 8 }, bg]}>
      <Pressable onPress={play} onLongPress={more} delayLongPress={420} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 }}
        accessibilityRole="button" accessibilityLabel={`${track.title}, ${track.artist}`} accessibilityHint="Двойное касание — слушать, удержание — меню трека"
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Меню трека' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? more() : play())}>
        {num ? <T v="sub" style={{ width: 24, fontSize: 16 }}>{num}</T> : <Cover uri={track.artwork} size={58} />}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T numberOfLines={1} style={{ color: isCur ? '#fff' : C.tx, fontFamily: isCur ? F.bold : F.semi }}>{track.title}</T>
          {sub ? <T v="small" numberOfLines={1}>{track.artist}</T> : null}
        </View>
      </Pressable>
      {right === 'play' ? (
        <Pressable onPress={play} hitSlop={6} accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : `Слушать ${track.title}`} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <PlayPause playing={playing} size={26} />
        </Pressable>
      ) : right === 'plus' ? (
        <Pressable onPress={() => openSelectPlaylist(track)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Добавить ${track.title} в плейлист`} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={26} />
        </Pressable>
      ) : right === 'heart' ? (
        <Pressable onPress={() => likeWithUndo(track)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Убрать ${track.title} из любимых`} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="heartF" size={24} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
});

export function likeWithUndo(t: Track) {
  const added = useLibrary.getState().toggleLike(t);
  haptic();
  if (added) toast('Добавлено в любимые', 'heartF');
  else toast('Убрано из любимых', 'heart', { label: 'Вернуть', fn: () => useLibrary.getState().toggleLike(t) });
}

function Item({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56 }}>
      <Icon name={icon} size={28} /><T style={{ fontSize: 16.5 }}>{label}</T>
    </Pressable>
  );
}

export function openTrackActions(t: Track, playlistId?: string) {
  openSheet(() => <TrackActions t={t} playlistId={playlistId} />);
}
function TrackActions({ t, playlistId }: { t: Track; playlistId?: string }) {
  const liked = useLibrary((s) => s.liked.some((x) => x.id === t.id));
  const go = (path: any) => { closeSheet(); usePlayer.setState({ expanded: false }); router.push(path); };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <Cover uri={t.artwork} size={56} />
        <View style={{ flex: 1 }}><T v="h3" numberOfLines={1}>{t.title}</T><T v="small" numberOfLines={1}>{t.artist}</T></View>
      </View>
      <Item icon={liked ? 'heartF' : 'heart'} label={liked ? 'Убрать из любимых' : 'В любимые'} onPress={() => { closeSheet(); likeWithUndo(t); }} />
      <Item icon="waves" label="Волна по треку" onPress={() => openWave(t)} />
      <Item icon="plAdd" label="Добавить в плейлист" onPress={() => openSelectPlaylist(t)} />
      <Item icon="playNext" label="Играть следующим" onPress={() => { closeSheet(); player.playNext(t); toast('Заиграет следующим', 'playNext'); }} />
      <Item icon="queue" label="Добавить в очередь" onPress={() => { closeSheet(); player.addToQueue(t); toast('Добавлено в очередь', 'queue'); }} />
      {playlistId ? (
        <Item icon="minus" label="Убрать из плейлиста" onPress={() => {
          closeSheet();
          const pl = useLibrary.getState().playlists.find((p) => p.id === playlistId);
          if (!pl) return;
          const before = pl.tracks;
          useLibrary.getState().setPlaylistTracks(playlistId, before.filter((x) => x.id !== t.id));
          toast('Убрано из плейлиста', 'minus', { label: 'Вернуть', fn: () => useLibrary.getState().setPlaylistTracks(playlistId, before) });
        }} />
      ) : null}
      <Item icon="eraser" label="Не рекомендовать трек" onPress={() => { closeSheet(); useTaste.getState().hideTrack(t); toast('Больше не будем предлагать этот трек', 'check', { label: 'Вернуть', fn: () => useTaste.getState().unhideTrack(t.id) }); }} />
      <Item icon="userMinus" label="Не рекомендовать исполнителя" onPress={() => { closeSheet(); useTaste.getState().hideArtist(t); toast(`${t.artist.split(',')[0]} скрыт из рекомендаций`, 'check', { label: 'Вернуть', fn: () => useTaste.getState().unhideArtist(artistKey(t)) }); }} />
      {t.artistId ? <Item icon="user" label="Перейти к исполнителю" onPress={() => go({ pathname: '/artist/[id]', params: { id: t.artistId, s: t.source === 'yt' ? 'yt' : 'audius' } })} /> : null}
      {t.albumId ? <Item icon="disc" label="Перейти к альбому" onPress={() => go({ pathname: '/playlist/[id]', params: { id: t.albumId, s: 'yt', k: 'album' } })} /> : null}
    </View>
  );
}

export function openSelectPlaylist(t: Track) {
  openSheet(() => <SelectPlaylist t={t} />);
}
function SelectPlaylist({ t }: { t: Track }) {
  const pls = useLibrary((s) => s.playlists);
  return (
    <View style={{ gap: 4 }}>
      <T v="h3" style={{ marginBottom: 6 }}>Добавить в плейлист</T>
      <Item icon="plus" label="Новый плейлист" onPress={() => { closeSheet(); usePlayer.setState({ expanded: false }); router.push({ pathname: '/new-playlist', params: { add: JSON.stringify(t) } }); }} />
      {pls.map((p) => {
        const has = p.tracks.some((x) => x.id === t.id);
        return (
          <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: has }} onPress={() => {
            const added = useLibrary.getState().toggleInPlaylist(p.id, t); haptic();
            toast(added ? `Добавлено в «${p.name}»` : `Убрано из «${p.name}»`, added ? 'check' : 'minus');
          }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 }}>
            <Cover uri={p.tracks[0]?.artwork} size={48} />
            <T numberOfLines={1} style={{ flex: 1 }}>{p.name}</T>
            <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: has ? C.tx : C.s3 }}>
              <Icon name={has ? 'check' : 'plus'} size={20} color={has ? '#000' : C.tx} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
