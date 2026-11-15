/* Нижняя капсула: навигация → мини-плеер → полный плеер. Это одна поверхность, которая растёт. */
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, {
  cubicBezier, Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { currentTrack, player, usePlayer, useProgress } from '@/player/player';
import { useLibrary } from '@/store/library';
import { C, DOCK, EASE, F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { haptic, T } from '@/ui/kit';
import { PlayPause } from '@/ui/PlayPause';
import { slideIn } from '@/ui/anim';
import { resetTo } from '@/nav';
import { closeLyrics, LyricsCard, LyricsFull, useLyricsUi } from './Lyrics';
import { TintLayer } from './TintLayer';
import { likeWithUndo, openSelectPlaylist } from './TrackRow';
import { SleepButton } from './MusicActions';
import { openWave } from './Wave';

const ease = Easing.bezier(...EASE);
const fmt = (s: number) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

type Tab = 'listen' | 'discover' | 'collection';
export const useTab = create<{ tab: Tab }>(() => ({ tab: 'listen' }));
const ROOT: Record<string, Tab> = { '/listen': 'listen', '/discover': 'discover', '/collection': 'collection', '/downloads':'collection', '/search': 'discover', '/favorites': 'collection', '/history': 'listen', '/settings': 'listen', '/month': 'listen', '/prefs': 'listen', '/youtube': 'listen', '/import': 'collection', '/log': 'listen' };
const HIDDEN = ['/', '/welcome', '/auth', '/onboarding', '/similar', '/new-playlist', '/edit-playlist', '/add-tracks'];

/* ---------- цвет обложки: плавная смена размытого фона ---------- */
function Tint({ uri, strong }: { uri?: string; strong: boolean }) {
  const reduced=useReducedMotion();
  const [layers, setLayers] = useState<{ k: number; uri: string }[]>([]);
  const n = useRef(0);
  useEffect(() => {
    if (!uri) return;
    setLayers((l) => (l[l.length - 1]?.uri === uri ? l : [...l.slice(-1), { k: ++n.current, uri }]));
  }, [uri]);
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: strong ? 0.9 : 0.34 }]} pointerEvents="none">
      {layers.map((l) => (
        <Animated.View key={l.k} entering={reduced ? undefined : FadeIn.duration(900).easing(ease)} exiting={reduced ? undefined : FadeOut.duration(900)} style={StyleSheet.absoluteFill}>
          <TintLayer uri={l.uri} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </Animated.View>
      ))}
    </View>
  );
}

/* ---------- кнопка «следующий / предыдущий» с толчком ---------- */
function SkipBtn({ dir, size = 28, box = 48 }: { dir: 'next' | 'prev'; size?: number; box?: number }) {
  const x = useSharedValue(0), sc = useSharedValue(1);
  const reduced = useReducedMotion();
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { scale: sc.get() }] }));
  const k = dir === 'next' ? 1 : -1;
  return (
    <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel={dir === 'next' ? 'Следующий трек' : 'Предыдущий трек'}
      onPress={() => {
        haptic();
        if (!reduced) {
          x.set(withSequence(withTiming(6 * k, { duration: 110 }), withSpring(0, { damping: 9, stiffness: 260 })));
          sc.set(withSequence(withTiming(0.86, { duration: 110 }), withSpring(1, { damping: 10, stiffness: 260 })));
        }
        if (dir === 'next') player.next(); else player.prev();
      }}
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={a}><Icon name={dir} size={size} /></Animated.View>
    </Pressable>
  );
}

/* ---------- кнопка запуска с упругим нажатием ---------- */
function BigPlay({ playing, loading }: { playing: boolean; loading?: boolean }) {
  const reduced=useReducedMotion();
  const sc = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.get() }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Слушать'}
      onPress={() => { haptic(); if(!reduced) sc.set(withSequence(withTiming(0.9, { duration: 100 }), withSpring(1, { damping: 10, stiffness: 240 }))); player.toggle(); }}>
      <Animated.View style={[{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, a]}>
        {loading ? <ActivityIndicator color="#000" size="large" /> : <PlayPause playing={playing} size={46} color="#000" stroke={1.8} />}
      </Animated.View>
    </Pressable>
  );
}

/* ---------- прогресс ---------- */
function MiniProgress() {
  const { time, duration } = useProgress();
  const p = duration ? Math.min(1, time / duration) : 0;
  return (
    <View style={{ position: 'absolute', left: 22, right: 22, bottom: DOCK.compact + 2, height: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)' }}>
      <View style={{ width: `${p * 100}%`, height: 2, borderRadius: 2, backgroundColor: '#b4eaff' }} />
    </View>
  );
}
function Seek({ active }: { active: boolean }) {
  /* скрытый плеер не перерисовывается от прогресса */
  const time = useProgress((x) => (active ? x.time : 0));
  const duration = useProgress((x) => x.duration);
  const [w, setW] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const val = drag ?? time;
  const p = duration ? Math.min(1, val / duration) : 0;
  const toSec = useCallback((x: number) => Math.max(0, Math.min(duration, (x / w) * duration)),[duration,w]);
  const toSecRef = useRef(toSec);
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores callbacks; refs are read only during touch events.
  const [pan] = useState(()=>PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => setDrag(toSecRef.current(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => setDrag(toSecRef.current(e.nativeEvent.locationX)),
    onPanResponderRelease: (e) => { const s = toSecRef.current(e.nativeEvent.locationX); player.seek(s); setDrag(null); },
    onPanResponderTerminate: () => setDrag(null),
  }));
  useEffect(()=>{toSecRef.current=toSec;},[toSec]);
  return (
    <View style={{ marginTop: 18 }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers} style={{ height: 30, justifyContent: 'center' }}
        accessibilityRole="adjustable" accessibilityLabel="Позиция в треке" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(val), text: `${fmt(val)} из ${fmt(duration)}` }}
        aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(val)} aria-valuetext={`${fmt(val)} из ${fmt(duration)}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => player.seek(Math.max(0, Math.min(duration, time + (e.nativeEvent.actionName === 'increment' ? 10 : -10))))}>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <View style={{ width: `${p * 100}%`, height: 5, borderRadius: 3, backgroundColor: C.tx }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: `${p * 100}%`, marginLeft: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: C.tx, transform: [{ scale: drag != null ? 1.25 : 1 }] }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="small" style={{ fontVariant: ['tabular-nums'] }}>{fmt(val)}</T>
        <T v="small" style={{ fontVariant: ['tabular-nums'] }}>-{fmt(duration - val)}</T>
      </View>
    </View>
  );
}

/* ---------- раскрытый плеер ---------- */
function Full({ h, active }: { h: number; active: boolean }) {
  const s = usePlayer();
  const t = currentTrack(s)!;
  const loading = useProgress((x) => s.buffering && x.time < 0.5);
  const liked = useLibrary((x) => x.liked.some((y) => y.id === t.id));
  const reduced = useReducedMotion();
  const { width: ww } = useWindowDimensions();
  const coverSize = Math.max(130, Math.min(ww - 60, ww > 700 ? 480 : 360, h - DOCK.compact - 450));
  const enter = reduced ? undefined : slideIn(s.lastDir === 'next' ? 60 : -60, 0.9, 500);
  const close = () => player.expand(false);
  const swipe = useTrackSwipe(close);
  const [boxH, setBoxH] = useState(0);
  const sv = useRef<ScrollViewInstance>(null);
  const lyricsOpen = useLyricsUi((x) => x.open);
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
    <ScrollView ref={sv} showsVerticalScrollIndicator={false} scrollEnabled={!lyricsOpen} contentContainerStyle={{ paddingBottom: 24 }}>
    <View style={{ minHeight: boxH || undefined, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 44 }}>
      <View style={{position:'absolute',top:8,alignSelf:'center',width:34,height:4,borderRadius:4,backgroundColor:'rgba(255,255,255,0.28)'}}/>
      <View {...swipe.handlers}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Свернуть плеер" style={{ width: 48, height: 48, justifyContent: 'center' }}><Icon name="down" size={28} /></Pressable>
        <Pressable onPress={() => openSelectPlaylist(t)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Добавить в плейлист" style={{ width: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center' }}><Icon name="plus" size={28} /></Pressable>
      </View>
      <Animated.View style={swipe.style}>
      <Animated.View key={'c' + t.id} entering={enter} style={{ alignSelf: 'center', marginTop: 12, width: coverSize, aspectRatio: 1, borderRadius: 30, overflow: 'hidden', backgroundColor: C.s2 }}>
        <Image source={{ uri: t.artworkLarge || t.artwork }} placeholder={{ uri: t.artwork }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
      </Animated.View>
      </Animated.View>
      </View>
      <Animated.View key={'m' + t.id} entering={enter} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="h1" numberOfLines={2} style={{ fontSize: 26, lineHeight: 34 }}>{t.title}</T>
          <Pressable disabled={!t.artistId} onPress={() => { close(); router.push({ pathname: '/artist/[id]', params: { id: t.artistId, s: t.source === 'yt' ? 'yt' : 'audius' } }); }} accessibilityRole="link">
            <T v="sub" numberOfLines={1} style={{ fontSize: 16, marginTop: 2 }}>{t.artist}</T>
          </Pressable>
        </View>
        <Pressable onPress={() => likeWithUndo(t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={liked ? 'Убрать из любимых' : 'В любимые'} accessibilityState={{ selected: liked }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={liked ? 'heartF' : 'heart'} size={28} />
        </Pressable>
      </Animated.View>
      {s.error && <Pressable accessibilityRole="button" onPress={() => player.toggle()}><T v="sub">{s.error} · Повторить</T></Pressable>}
      <Seek active={active} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <Pressable onPress={() => { haptic(); player.toggleShuffle(); }} accessibilityRole="button" accessibilityLabel="Перемешивать" accessibilityState={{ selected: s.shuffle }} style={st.ctl}><Icon name="shuffle" size={28} color={s.shuffle ? C.tx : C.tx3} /></Pressable>
        <SkipBtn dir="prev" size={32} box={56} />
        <BigPlay playing={s.playing} loading={loading} />
        <SkipBtn dir="next" size={32} box={56} />
        <Pressable onPress={() => { haptic(); player.cycleRepeat(); }} accessibilityRole="button" accessibilityLabel={`Повтор: ${{ off: 'выключен', all: 'все', one: 'трек' }[s.repeat]}`} style={st.ctl}>
          <Icon name={s.repeat === 'one' ? 'repeatOne' : 'repeat'} size={28} color={s.repeat === 'off' ? C.tx3 : C.tx} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap:6, marginTop: 18 }}>
        <Pressable onPress={() => openWave(t)} accessibilityRole="button" style={st.extra}><Icon name="waves" size={24} /><T v="small" numberOfLines={1} style={{ fontSize: 11.5 }}>Волна</T></Pressable>
        <SleepButton />
        <Pressable onPress={() => { close(); router.push('/queue'); }} accessibilityRole="button" style={st.extra}><Icon name="queue" size={24} /><T v="small" numberOfLines={1} style={{ fontSize: 11.5 }}>Очередь</T></Pressable>
      </View>
      {/* подсказка: ниже — текст песни */}
      <Pressable onPress={() => sv.current?.scrollTo({ y: Math.max(0, boxH - 120), animated: true })} accessibilityRole="button" accessibilityLabel="Показать текст песни"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 6, alignItems: 'center', paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.6 }}><T style={{ fontSize: 13, fontFamily: F.semi }}>Текст</T><Icon name="down" size={18} /></View>
      </Pressable>
    </View>
    <View style={{ paddingHorizontal: 16 }}>
      <LyricsCard track={t} />
    </View>
    </ScrollView>
    {lyricsOpen ? <LyricsFull track={t} /> : null}
    </View>
  );
}


/* ---------- свайп по треку: влево — следующий, вправо — предыдущий (как в Spotify и Apple Music) ---------- */
function swipePrev() {
  const s = usePlayer.getState();
  if (s.index > 0) player.skipTo(s.index - 1);
  else player.seek(0);
}
function useTrackSwipe(onDown?: () => void) {
  const reduced=useReducedMotion();
  const tx = useSharedValue(0);
  const mode = useRef<'h' | 'v' | null>(null);
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores callbacks; refs are read only during touch events.
  const [pan] = useState(()=>PanResponder.create({
    /* забираем жест у кнопок, только когда палец явно повёл в сторону (или вниз — свернуть плеер) */
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3) { mode.current = 'h'; return true; }
      if (onDown && g.dy > 14 && g.dy > Math.abs(g.dx) * 1.3) { mode.current = 'v'; return true; }
      return false;
    },
    onPanResponderMove: (_, g) => { if (mode.current === 'h') tx.set(g.dx * 0.75); },
    onPanResponderRelease: (_, g) => {
      if (mode.current === 'h') {
        const go = g.dx < -70 || g.vx < -0.7 ? 'next' : g.dx > 70 || g.vx > 0.7 ? 'prev' : null;
        if (go) { haptic(); tx.set(0); if (go === 'next') player.next(); else swipePrev(); }
        else tx.set(reduced ? 0 : withSpring(0, { damping: 18, stiffness: 220 }));
      } else if (mode.current === 'v' && g.dy > 90) onDown?.();
      mode.current = null;
    },
    onPanResponderTerminate: () => { tx.set(reduced ? 0 : withSpring(0)); mode.current = null; },
    onPanResponderTerminationRequest: () => mode.current !== 'h',
  }));
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }], opacity: 1 - Math.min(0.5, Math.abs(tx.get()) / 400) }));
  return { handlers: pan.panHandlers, style };
}

/* ---------- мини-строка ---------- */
function Mini() {
  const s = usePlayer();
  const loading = useProgress((x) => s.buffering && x.time < 0.5);
  const t = currentTrack(s)!;
  const reduced = useReducedMotion();
  const enter = reduced ? undefined : slideIn(s.lastDir === 'next' ? 28 : -28, 1, 420);
  const swipe = useTrackSwipe();
  return (
    <View style={st.miniRow}>
      <Animated.View {...swipe.handlers} style={[{ flex: 1, minWidth: 0 }, swipe.style]}>
      <Pressable onPress={() => { haptic(); player.expand(true); }} accessibilityRole="button" accessibilityLabel={`Открыть плеер: ${t.title}. Свайп влево — следующий трек, вправо — предыдущий`} style={{ flex: 1, minWidth: 0, height: 60 }}>
        <Animated.View key={t.id} entering={enter} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 50, height: 50, borderRadius: 16, overflow: 'hidden', backgroundColor: C.s2, borderWidth:StyleSheet.hairlineWidth,borderColor:'rgba(255,255,255,0.18)' }}><Image source={{ uri: t.artwork }} style={StyleSheet.absoluteFill} transition={reduced ? 0 : 240}/></View>
          <View style={{flex:1,minWidth:0,gap:2}}>
            <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15 }}>{t.title}</T>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <T v="small" numberOfLines={1} style={{flex:1,minWidth:0,fontSize:11.5,color:'#b3bfd2'}}>{t.artist}</T>
            </View>
          </View>
        </Animated.View>
      </Pressable>
      </Animated.View>
      <Pressable onPress={() => { haptic(); player.toggle(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={s.playing ? 'Пауза' : 'Слушать'} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color={C.tx} /> : <PlayPause playing={s.playing} size={28} />}
      </Pressable>
      <SkipBtn dir="next" />
    </View>
  );
}

/* Плавность через CSS-переходы Reanimated 4: на iPhone в браузере их считает сам браузер,
   на Android/iOS — UI-поток. JS не трогает каждый кадр, поэтому раскрытие не тормозит. */
const TR = { transitionDuration: 560, transitionTimingFunction: cubicBezier(EASE[0], EASE[1], EASE[2], EASE[3]) } as const;

function Nav({active}:{active:Tab | null}) {
  const items:[Tab,IconName,string][]=[['listen','navListen','Слушать'],['discover','navDiscover','Открывать'],['collection','navCollection','Коллекция']];
  return <View accessibilityRole="tablist" accessibilityLabel="Основная навигация" style={st.nav}>
    {items.map(([key,icon,label])=><Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:key===active}} aria-selected={key===active}
      style={st.navBtn} onPress={()=>{haptic();player.expand(false);useTab.setState({tab:key});resetTo(`/${key}` as '/listen');}}>
      <Icon name={icon} size={27} color={key===active ? '#fff' : C.tx2}/>
      <T v="label" numberOfLines={1} style={{color:key===active ? '#fff' : C.tx2}}>{label}</T>
    </Pressable>)}
  </View>;
}

export function Dock() {
  const path = usePathname();
  const ins = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const has = usePlayer((s) => s.index >= 0);
  const expanded = usePlayer((s) => s.expanded);
  const cover = usePlayer((s) => currentTrack(s)?.artwork);
  const tab = useTab((s) => s.tab);
  const reduced = useReducedMotion();
  useEffect(() => { const t = path.startsWith('/my/') ? 'collection' : ROOT[path]; if (t && t !== useTab.getState().tab) useTab.setState({ tab: t }); }, [path]);
  const hidden = HIDDEN.includes(path);

  /* полный плеер монтируется при раскрытии и уходит после анимации сворачивания */
  const [fullMounted, setFullMounted] = useState(false);
  const [fullReady, setFullReady] = useState(false);
  const fullOn=expanded&&fullReady;
  useEffect(() => {
    if (!expanded) {
      closeLyrics();
      const r=requestAnimationFrame(()=>setFullReady(false));
      const timer=setTimeout(()=>setFullMounted(false),reduced ? 0 : 240);
      return ()=>{cancelAnimationFrame(r);clearTimeout(timer);};
    }
    let second=0;
    const first=requestAnimationFrame(()=>{setFullMounted(true);second=requestAnimationFrame(()=>setFullReady(true));});
    return ()=>{cancelAnimationFrame(first);if(second)cancelAnimationFrame(second);};
  }, [expanded,reduced]);

  /* на планшете и в горизонтали капсула не растягивается во всю ширину */
  const maxW = 560;
  const side = width > maxW + 2 * DOCK.side ? (width - maxW) / 2 : DOCK.side;
  const fullSide = width > 760 ? (width - 680) / 2 : 8;
  const bottomGap = Math.max(ins.bottom, 14) - 2;
  const fullH = height - Math.max(ins.top, 18) - 2 - 8;
  const h = !has ? DOCK.compact : expanded ? fullH : DOCK.mini;
  const dur = reduced ? 0 : TR.transitionDuration;

  return (
    <Animated.View
      style={[st.dock, {
        height: h, left: expanded ? fullSide : side, right: expanded ? fullSide : side, bottom: expanded ? 8 : bottomGap, borderRadius: expanded ? 44 : has ? 34 : 44,
        opacity: hidden ? 0 : 1, transform: [{ translateY: hidden ? 160 : 0 }],
        transitionProperty: ['height', 'left', 'right', 'bottom', 'borderRadius', 'opacity', 'transform'], transitionDuration: dur, transitionTimingFunction: TR.transitionTimingFunction,
      }]}
      pointerEvents={hidden ? 'none' : 'box-none'} aria-hidden={hidden} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:C.glass}]}/>
      {has ? <Tint uri={cover} strong={expanded} /> : null}
      {has && (fullMounted||expanded) ? (
        <Animated.View pointerEvents={fullOn ? 'auto' : 'none'} aria-hidden={!fullOn} accessibilityElementsHidden={!fullOn} importantForAccessibility={fullOn ? 'auto' : 'no-hide-descendants'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: DOCK.compact, opacity: fullOn ? 1 : 0, transform: [{ translateY: fullOn ? 0 : 24 }],
          transitionProperty: ['opacity', 'transform'], transitionDuration: reduced ? 0 : fullOn ? 420 : 240, transitionDelay: fullOn && !reduced ? 120 : 0, transitionTimingFunction: TR.transitionTimingFunction }}>
          <Full h={fullH} active={fullOn} />
        </Animated.View>
      ) : null}
      {has ? (
        <Animated.View pointerEvents={expanded ? 'none' : 'box-none'} aria-hidden={expanded} accessibilityElementsHidden={expanded} importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: DOCK.mini, opacity: expanded ? 0 : 1, transform: [{ translateY: expanded ? -20 : 0 }],
          transitionProperty: ['opacity', 'transform'], transitionDuration: reduced ? 0 : 300, transitionDelay: !expanded && !reduced ? 160 : 0, transitionTimingFunction: TR.transitionTimingFunction }}>
          <Mini/><MiniProgress />
        </Animated.View>
      ) : null}
      <Nav active={expanded ? null : tab}/>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  nav:{position:'absolute',left:0,right:0,bottom:0,height:DOCK.compact,flexDirection:'row',paddingHorizontal:6},
  navBtn:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:5},
  dock: { position: 'absolute', overflow: 'hidden', borderWidth:1,borderColor:'rgba(255,255,255,0.16)',backgroundColor:'rgba(0,0,0,0.5)', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 24 },
  miniRow: { position: 'absolute', left: 0, right: 0, bottom: DOCK.compact, height: DOCK.mini-DOCK.compact, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 10 },
  ctl: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  extra: { flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:5,minHeight:62,paddingHorizontal:2 },
});

