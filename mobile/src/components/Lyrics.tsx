/* Текст песни в плеере: карточка под кнопками (листаешь плеер вниз) и полноэкранный режим.
   Строки подсвечиваются по ходу песни, слова — по своему времени; второй голос в дуэте — справа. */
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { create } from 'zustand';

import type { Track } from '@/api/audius';
import { activeLine, getLyrics, type LLine, type Lyrics } from '@/api/lyrics';
import { player, usePlayer, useProgress } from '@/player/player';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { haptic, T } from '@/ui/kit';

export const useLyricsUi = create<{ open: boolean }>(() => ({ open: false }));
export const openLyrics = () => { haptic(); useLyricsUi.setState({ open: true }); };
export const closeLyrics = () => useLyricsUi.setState({ open: false });

/* ---------- загрузка ---------- */
type State = { status: 'loading' | 'ok' | 'none' | 'error'; data?: Lyrics };
export function useLyrics(t: Track | undefined): State {
  const [st, setSt] = useState<State>({ status: 'loading' });
  useEffect(() => {
    if (!t) return;
    let alive = true;
    setSt({ status: 'loading' });
    getLyrics(t).then(
      (d) => alive && setSt({ status: d.lines || d.plain ? 'ok' : 'none', data: d }),
      () => alive && setSt({ status: 'error' }),
    );
    return () => { alive = false; };
  }, [t?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

/* ---------- плавное время: плеер шлёт позицию раз в 250 мс, между ними досчитываем сами ---------- */
function usePlayhead(fps = 20) {
  const [now, setNow] = useState(() => useProgress.getState().time);
  useEffect(() => {
    let base = useProgress.getState().time, at = Date.now();
    const un = useProgress.subscribe((p) => { base = p.time; at = Date.now(); });
    const id = setInterval(() => {
      const playing = usePlayer.getState().playing;
      setNow(playing ? base + (Date.now() - at) / 1000 : base);
    }, 1000 / fps);
    return () => { un(); clearInterval(id); };
  }, [fps]);
  return now;
}

/* ---------- одна строка ---------- */
const DIM = 'rgba(255,255,255,0.32)';
const PAST = 'rgba(255,255,255,0.55)';
const Line = memo(function Line({ l, state, now, size, onPress, onLayout }: {
  l: LLine; state: 'past' | 'now' | 'next'; now: number; size: number; onPress?: () => void; onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const right = l.side === 'right';
  const base = { fontFamily: F.heavy, fontSize: size, lineHeight: Math.round(size * 1.22), letterSpacing: -0.4, textAlign: right ? 'right' : 'left' } as const;
  const empty = !l.text.trim();
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="button" accessibilityLabel={l.text || 'Проигрыш'}
      style={{ paddingVertical: size * 0.32, alignItems: right ? 'flex-end' : 'flex-start', paddingLeft: right ? 36 : 0, paddingRight: right ? 0 : 36 }}>
      {empty ? (
        <Text style={[base, { color: state === 'now' ? C.tx : DIM }]}>• • •</Text>
      ) : state === 'now' ? (
        <Text style={base}>
          {l.words.map((w, i) => {
            const k = w.e <= now ? 1 : w.t > now ? 0 : (now - w.t) / Math.max(0.05, w.e - w.t);
            const a = 0.38 + 0.62 * Math.min(1, Math.max(0, k));
            return <Text key={i} style={{ color: `rgba(255,255,255,${a.toFixed(3)})` }}>{(w.space ? ' ' : '') + w.text}</Text>;
          })}
        </Text>
      ) : (
        <Text style={[base, { color: state === 'past' ? PAST : DIM }]}>{l.text}</Text>
      )}
      {l.bg ? <Text style={[base, { fontSize: size * 0.62, lineHeight: Math.round(size * 0.8), marginTop: 2, color: state === 'now' ? 'rgba(255,255,255,0.7)' : DIM }]}>{l.bg}</Text> : null}
    </Pressable>
  );
});

const credit = (s: string | null) => (s === 'lrclib' ? 'LRCLIB' : s === 'betterlyrics' ? 'Better Lyrics' : s === 'youtube' ? 'YouTube Music' : '');

/* ---------- карточка под плеером ---------- */
export function LyricsCard({ track }: { track: Track }) {
  const st = useLyrics(track);
  const lines = st.data?.lines;
  return (
    <Pressable onPress={st.status === 'ok' ? openLyrics : undefined} accessibilityRole="button" accessibilityLabel="Открыть текст на весь экран"
      style={{ borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.28)', padding: 22, minHeight: 200 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <T style={{ fontFamily: F.bold, fontSize: 18 }}>Текст</T>
        {st.status === 'ok' ? <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrowUR" size={22} /></View> : null}
      </View>
      {st.status === 'loading' ? <ActivityIndicator color={C.tx2} style={{ marginTop: 30 }} /> : null}
      {st.status === 'none' || st.status === 'error' ? <T v="sub">{st.status === 'none' ? 'Для этой песни текста пока нет' : 'Не получилось загрузить текст'}</T> : null}
      {st.status === 'ok' && lines ? <CardLines lines={lines} /> : null}
      {st.status === 'ok' && !lines && st.data?.plain ? <T style={{ fontFamily: F.bold, fontSize: 20, lineHeight: 28, color: C.tx2 }} numberOfLines={7}>{st.data.plain}</T> : null}
    </Pressable>
  );
}
/* в карточке — окно из нескольких строк вокруг текущей */
function CardLines({ lines }: { lines: LLine[] }) {
  const now = usePlayhead(12);
  const cur = activeLine(lines, now);
  const from = Math.max(0, cur - 1);
  return (
    <View style={{ height: 230, overflow: 'hidden' }}>
      {lines.slice(from, from + 5).map((l, k) => {
        const i = from + k;
        return <Animated.View key={i} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)}>
          <Line l={l} state={i < cur ? 'past' : i === cur ? 'now' : 'next'} now={now} size={22} onPress={openLyrics} />
        </Animated.View>;
      })}
    </View>
  );
}

/* ---------- весь экран ---------- */
export function LyricsFull({ track }: { track: Track }) {
  const st = useLyrics(track);
  const lines = st.data?.lines;
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      {/* плотный фон: размытая обложка под тёмной вуалью — плеер под текстом не просвечивает */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a0a0b', borderRadius: 44, overflow: 'hidden' }]}>
        {track.artworkLarge || track.artwork ? <Image source={{ uri: track.artworkLarge || track.artwork }} blurRadius={60} style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale: 1.4 }] }]} contentFit="cover" /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 }}>
        <Image source={{ uri: track.artwork }} style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: C.s2 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 17 }}>{track.title}</T>
          <T v="small" numberOfLines={1}>{track.artist}</T>
        </View>
        <Pressable onPress={closeLyrics} hitSlop={10} accessibilityRole="button" accessibilityLabel="Закрыть текст" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="down" size={26} />
        </Pressable>
      </View>
      {st.status === 'loading' ? <ActivityIndicator color={C.tx2} style={{ marginTop: 80 }} /> : null}
      {lines ? <FullLines lines={lines} source={st.data?.source ?? null} /> : st.data?.plain ? (
        <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 80 }}>
          <T style={{ fontFamily: F.heavy, fontSize: 26, lineHeight: 34 }}>{st.data.plain}</T>
          <T v="small" style={{ marginTop: 24 }}>Текст без синхронизации · {credit(st.data.source)}</T>
        </ScrollView>
      ) : null}
    </Animated.View>
  );
}

function FullLines({ lines, source }: { lines: LLine[]; source: string | null }) {
  const now = usePlayhead(24);
  const cur = activeLine(lines, now);
  const sv = useRef<ScrollViewInstance>(null);
  const ys = useRef<number[]>([]);
  const [viewH, setViewH] = useState(600);
  const userAt = useRef(0);
  /* за текущей строкой едем сами; если человек листает руками — ждём 4 секунды */
  useEffect(() => {
    if (Date.now() - userAt.current < 4000) return;
    const y = ys.current[Math.max(0, cur)];
    if (y != null) sv.current?.scrollTo({ y: Math.max(0, y - viewH * 0.3), animated: true });
  }, [cur, viewH]);
  const pad = useMemo(() => ({ paddingHorizontal: 22, paddingTop: 24, paddingBottom: viewH * 0.6 }), [viewH]);
  return (
    <ScrollView ref={sv} onLayout={(e) => setViewH(e.nativeEvent.layout.height)} onScrollBeginDrag={() => { userAt.current = Date.now(); }} onMomentumScrollEnd={() => { userAt.current = Date.now(); }}
      showsVerticalScrollIndicator={false} contentContainerStyle={pad}>
      {lines.map((l, i) => (
        <Line key={i} l={l} state={i < cur ? 'past' : i === cur ? 'now' : 'next'} now={i === cur ? now : 0} size={30}
          onLayout={(e) => { ys.current[i] = e.nativeEvent.layout.y; }}
          onPress={() => { haptic(); userAt.current = 0; player.seek(Math.max(0, l.t - 0.05)); }} />
      ))}
      {credit(source) ? <T v="small" style={{ marginTop: 28 }}>Текст: {credit(source)}</T> : null}
    </ScrollView>
  );
}
