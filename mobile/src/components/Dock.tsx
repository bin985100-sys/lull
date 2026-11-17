import { resolveThemeValues , useTheme, themeValues } from '@/theme/state';
import { Glass } from '@/ui/Glass';
import { setChromeCollapsed, setSearchQuery, useChrome } from '@/ui/chrome';
import { GlassTabs } from './GlassTabs';

/* Separate floating navigation, mini-player and search; full player expands from the mini-player. */
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Keyboard, Platform, TextInput, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, {
  cubicBezier, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { currentTrack, player, usePlayer, useProgress } from '@/player/player';
import { useLibrary } from '@/store/library';
import { DOCK, F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { haptic, T } from '@/ui/kit';
import { PlayPause } from '@/ui/PlayPause';
import { slideIn } from '@/ui/anim';
import { resetTo } from '@/nav';
import { useLayout } from '@/ui/layout';
import { closeLyrics, LyricsCard, LyricsFull, useLyricsUi } from './Lyrics';

import { likeWithUndo, openSelectPlaylist, openTrackActions } from './TrackRow';
import { SleepButton } from './MusicActions';
import { openWave } from './Wave';


const fmt = (s: number) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

type Tab = 'listen' | 'discover' | 'collection';
export const useTab = create<{ tab: Tab }>(() => ({ tab: 'listen' }));
const ROOT: Record<string, Tab> = { '/listen': 'listen', '/discover': 'discover', '/collection': 'collection', '/downloads':'collection',  '/favorites': 'collection', '/history': 'listen', '/settings': 'listen', '/month': 'listen', '/prefs': 'listen', '/youtube': 'listen', '/import': 'collection', '/log': 'listen' };
const HIDDEN = ['/', '/welcome', '/auth', '/onboarding', '/similar', '/new-playlist', '/edit-playlist', '/add-tracks'];

/* ---------- цвет обложки: плавная смена размытого фона ---------- */
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
function BigPlay({ playing, loading, size=84 }: { playing: boolean; loading?: boolean; size?: number }) {

  const reduced=useReducedMotion();
  const sc = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.get() }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Слушать'}
      onPress={() => { haptic(); if(!reduced) sc.set(withSequence(withTiming(0.9, { duration: 100 }), withSpring(1, { damping: 10, stiffness: 240 }))); player.toggle(); }}>
      <Animated.View style={[{ width: size, height: size, borderRadius: size/2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, a]}>
        {loading ? <ActivityIndicator color="#000" size="large" /> : <PlayPause playing={playing} size={46} color="#000" stroke={1.8} />}
      </Animated.View>
    </Pressable>
  );
}

/* ---------- прогресс ---------- */
function Seek({ active }: { active: boolean }) {
  const {colors:C}=useTheme();
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
        <View style={{ height: 5, borderRadius: 3, backgroundColor: C.s4 }}>
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
  const {dark,colors:C}=useTheme();
 const st=resolveThemeValues(stThemeTable,C);
  const s = usePlayer();
  const t = currentTrack(s)!;
  const loading = useProgress((x) => s.buffering && x.time < 0.5);
  const liked = useLibrary((x) => x.liked.some((y) => y.id === t.id));
  const reduced = useReducedMotion();
  const { width: ww } = useWindowDimensions();
  const playSize=ww<350 ? 64 : 84;
  const controlSize=Math.max(28,Math.min(56,(Math.min(680,ww-16)-44-playSize)/4));
  const coverSize = Math.max(130, Math.min(ww - 60, ww > 700 ? 480 : 360, h - DOCK.compact - 450));
  const enter=useMemo(()=>reduced?undefined:slideIn(s.lastDir==='next'?60:-60,.9,500),[reduced,s.lastDir]);
  const close = () => player.expand(false);
  const swipe = useTrackSwipe(close);
  const [boxH, setBoxH] = useState(0);
  const sv = useRef<ScrollViewInstance>(null);
  const lyricsOpen = useLyricsUi((x) => x.open);
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
    {!!t.artwork&&<Image pointerEvents="none" source={{uri:t.artwork}} blurRadius={48} transition={reduced?0:300} style={[StyleSheet.absoluteFill,{opacity:dark?.22:.12}]} contentFit="cover"/>}
    <ScrollView ref={sv} showsVerticalScrollIndicator={false} scrollEnabled={!lyricsOpen} contentContainerStyle={{ paddingBottom: 24 }}>
    <View style={{ minHeight: boxH || undefined, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 44 }}>
      <View style={{position:'absolute',top:8,alignSelf:'center',width:34,height:4,borderRadius:4,backgroundColor:C.tx3}}/>
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
        <Pressable onPress={() => { haptic(); player.toggleShuffle(); }} accessibilityRole="button" accessibilityLabel="Перемешивать" accessibilityState={{ selected: s.shuffle }} style={[st.ctl,{width:controlSize}]}><Icon name="shuffle" size={28} color={s.shuffle ? C.tx : C.tx3} /></Pressable>
        <SkipBtn dir="prev" size={28} box={controlSize} />
        <BigPlay playing={s.playing} loading={loading} size={playSize} />
        <SkipBtn dir="next" size={28} box={controlSize} />
        <Pressable onPress={() => { haptic(); player.cycleRepeat(); }} accessibilityRole="button" accessibilityLabel={`Повтор: ${{ off: 'выключен', all: 'все', one: 'трек' }[s.repeat]}`} style={[st.ctl,{width:controlSize}]}>
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
function Mini({compact=false,width=400}:{compact?:boolean;width?:number}) {
  const {colors:C}=useTheme();

  const s = usePlayer();
  const loading = useProgress((x) => s.buffering && x.time < 0.5);
  const t = currentTrack(s)!;
  const reduced = useReducedMotion();
  const enter=useMemo(()=>reduced?undefined:slideIn(s.lastDir==='next'?28:-28,1,420),[reduced,s.lastDir]);
  const swipe = useTrackSwipe();
  return (
    <View style={{height:56,flexDirection:"row",alignItems:"center",paddingLeft:8,paddingRight:4,gap:2}}>
      <Animated.View {...swipe.handlers} style={[{ flex: 1, minWidth: 0,height:56 }, swipe.style]}>
      <Pressable onLongPress={e=>openTrackActions(t,undefined,{x:e.nativeEvent.pageX,y:e.nativeEvent.pageY})} onPress={() => { haptic(); player.expand(true); }} accessibilityRole="button" accessibilityLabel={`Открыть плеер: ${t.title}. Свайп влево — следующий трек, вправо — предыдущий`} style={{ flex: 1, minWidth: 0, height: 56 }}>
        <Animated.View key={t.id} entering={enter} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: compact ? 6 : 10 }}>
          {width>155&&<View style={{ width: compact ? 34 : 40, height: compact ? 34 : 40, borderRadius: 16, overflow: 'hidden', backgroundColor: C.s2, borderWidth:StyleSheet.hairlineWidth,borderColor:C.glassLine }}><Image source={{ uri: t.artwork }} style={StyleSheet.absoluteFill} transition={reduced ? 0 : 240}/></View>}
          <View style={{flex:1,minWidth:0,gap:2}}>
            <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: compact ? 12 : 14 }}>{t.title}</T>
            {width>180&&<View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <T v="small" numberOfLines={1} style={{flex:1,minWidth:0,fontSize:11.5,color:C.tx2}}>{t.artist}</T>
            </View>}
          </View>
        </Animated.View>
      </Pressable>
      </Animated.View>
      <Pressable onPress={() => { haptic(); player.toggle(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={s.playing ? 'Пауза' : 'Слушать'} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color={C.tx} /> : <PlayPause playing={s.playing} size={28} />}
      </Pressable>
      {!compact&&width>245&&<SkipBtn dir="next" box={44}/>}
    </View>
  );
}

/* Плавность через CSS-переходы Reanimated 4: на iPhone в браузере их считает сам браузер,
   на Android/iOS — UI-поток. JS не трогает каждый кадр, поэтому раскрытие не тормозит. */
/** Floating chrome shares one capture target; only the lens animates per frame. */
function SearchField(){
 const {colors:C}=useTheme();
 const query=useChrome(s=>s.query),focusRequest=useChrome(s=>s.focusRequest);
 const ref=useRef<React.ComponentRef<typeof TextInput>>(null);
 useEffect(()=>{const frame=requestAnimationFrame(()=>ref.current?.focus());return()=>cancelAnimationFrame(frame);},[focusRequest]);
 return <Glass radius={30} style={{height:60,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:8}}>
  <Icon name="search" color={C.tx2} size={22}/>
  <TextInput ref={ref} value={query} onChangeText={setSearchQuery} placeholder="Что послушать?" placeholderTextColor={C.tx3} underlineColorAndroid="transparent" selectionColor={C.sky} cursorColor={C.sky} accessibilityLabel="Поиск" autoCorrect={false} returnKeyType="search" onSubmitEditing={()=>query.trim()&&useLibrary.getState().pushSearch(query.trim())} style={{flex:1,minWidth:0,color:C.tx,fontFamily:F.medium,fontSize:16,borderWidth:0,padding:0,backgroundColor:'transparent',outlineWidth:0}}/>
  {!!query&&<Pressable accessibilityRole="button" accessibilityLabel="Очистить запрос" onPress={()=>setSearchQuery('')} style={{width:32,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="close" size={18}/></Pressable>}
 </Glass>;
}
function ChromeButton({icon,label,onPress}:{icon:IconName;label:string;onPress:()=>void}){
 return <Glass radius={30} style={{width:60,height:60}}><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{flex:1,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={25}/></Pressable></Glass>;
}
export function Dock(){
 const {colors:C}=useTheme();
 const layout=useLayout(),path=usePathname(),ins=useSafeAreaInsets();
 const {height}=useWindowDimensions();
 const has=usePlayer(s=>s.index>=0),expanded=usePlayer(s=>s.expanded),tab=useTab(s=>s.tab);
 const collapsed=useChrome(s=>s.collapsed);
 const reduced=useReducedMotion();
 const search=path==='/search'&&!layout.rail;
 const [keyboard,setKeyboard]=useState(0),[keyboardShown,setKeyboardShown]=useState(false);
 useEffect(()=>{
  if(Platform.OS==='web'){
   const viewport=window.visualViewport;
   const update=()=>{const inset=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;setKeyboard(inset);setKeyboardShown(inset>80||(document.activeElement?.tagName==='INPUT'&&window.matchMedia('(pointer:coarse)').matches));};
   viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('focusin',update);window.addEventListener('focusout',update);
   return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('focusin',update);window.removeEventListener('focusout',update);};
  }
  const show=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillChangeFrame':'keyboardDidShow',e=>{if(Platform.OS==='ios')Keyboard.scheduleLayoutAnimation(e);setKeyboardShown(e.endCoordinates.screenY<Dimensions.get('screen').height-80);setKeyboard(Math.max(0,Dimensions.get('window').height-e.endCoordinates.screenY));});
  const hide=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillHide':'keyboardDidHide',()=>{setKeyboardShown(false);setKeyboard(0);});return()=>{show.remove();hide.remove();};
 },[]);
 useEffect(()=>{setChromeCollapsed(false);const t=path.startsWith('/my/')?'collection':ROOT[path];if(t&&t!==useTab.getState().tab)useTab.setState({tab:t});},[path]);
 const hidden=HIDDEN.includes(path)||!!layout.rail&&!has;
 const compact=collapsed&&has&&!search&&!layout.rail;
 const width=Math.min(560,layout.available-2*DOCK.side);
 const side=Math.max(DOCK.side,(layout.available-width)/2);
 const miniWidth=compact?width-136:width;
 const bottom=Math.max(ins.bottom,14)-2+keyboard;
 const miniBottom=layout.rail||compact?0:70;
 const [mounted,setMounted]=useState(false),[ready,setReady]=useState(false);
 const fullOn=expanded&&ready;
 useEffect(()=>{if(!expanded)closeLyrics();},[expanded]);
 useEffect(()=>{let next=0;if(expanded){const id=requestAnimationFrame(()=>{setMounted(true);next=requestAnimationFrame(()=>setReady(true));});return()=>{cancelAnimationFrame(id);cancelAnimationFrame(next);};}const frame=requestAnimationFrame(()=>setReady(false));const id=setTimeout(()=>setMounted(false),reduced?0:600);return()=>{cancelAnimationFrame(frame);clearTimeout(id);};},[expanded,reduced]);
 const fullSide=Math.max(ins.left+4,ins.right+4,layout.available>760?(layout.available-680)/2:8);
 const fullH=height-Math.max(ins.top,18)-16;
 const motion={transitionDuration:reduced?0:560,transitionTimingFunction:cubicBezier(.18,.76,.2,1)} as const;
 const select=(next:Tab)=>{haptic();player.expand(false);useTab.setState({tab:next});resetTo(`/${next}` as '/listen');};
 return <>
  {mounted&&<Animated.View pointerEvents={expanded?'auto':'none'} style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(0,0,0,.24)',opacity:fullOn?1:0,transitionProperty:'opacity',...motion}]}><Pressable accessibilityLabel="Закрыть полный плеер" onPress={()=>player.expand(false)} style={{flex:1}}/></Animated.View>}
  <View pointerEvents={hidden||expanded?'none':'box-none'} aria-hidden={hidden||expanded} accessibilityElementsHidden={hidden||expanded} importantForAccessibility={hidden||expanded?'no-hide-descendants':'auto'} style={{position:'absolute',left:layout.rail+side,width,bottom,height:has?126:60,opacity:hidden||expanded?0:1}}>
   {has&&(!search||!keyboardShown)&&<Animated.View style={{position:'absolute',width:miniWidth,left:compact?68:0,bottom:miniBottom,transitionProperty:['width','left','bottom'],...motion}}>
    <Glass radius={28}><Mini compact={compact} width={miniWidth}/></Glass>
   </Animated.View>}
   {!layout.rail&&<View style={{position:'absolute',left:0,right:0,bottom:0,height:60,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}>
    {search?<><ChromeButton icon="back" label="Закрыть поиск" onPress={()=>{Keyboard.dismiss();resetTo(`/${tab}` as '/listen');}}/><Animated.View entering={reduced?undefined:FadeIn.duration(220)} style={{flex:1,minWidth:0}}><SearchField/></Animated.View></>:<>
     <Animated.View pointerEvents={compact?'none':'auto'} aria-hidden={compact} accessibilityElementsHidden={compact} style={{position:'absolute',left:0,bottom:0,opacity:compact?0:1,transform:[{scale:compact?.55:1},{translateX:compact?-30:0}],transformOrigin:'left bottom',transitionProperty:['opacity','transform'],...motion}}><GlassTabs active={tab} width={width-70} onSelect={select}/></Animated.View>
     <Animated.View pointerEvents={compact?'auto':'none'} aria-hidden={!compact} accessibilityElementsHidden={!compact} style={{position:'absolute',left:0,bottom:0,opacity:compact?1:0,transform:[{scale:compact?1:.55}],transitionProperty:['opacity','transform'],...motion}}><ChromeButton icon={tab==='listen'?'navListen':tab==='discover'?'navDiscover':'navCollection'} label="Развернуть навигацию" onPress={()=>setChromeCollapsed(false)}/></Animated.View>
     <View style={{marginLeft:'auto'}}><ChromeButton icon="search" label="Открыть поиск" onPress={()=>{setChromeCollapsed(false);router.push('/search');}}/></View>
    </>}
   </View>}
  </View>
  {has&&mounted&&<Animated.View pointerEvents={expanded?'auto':'none'} aria-hidden={!expanded} accessibilityViewIsModal={expanded} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded?'auto':'no-hide-descendants'} style={{position:'absolute',left:layout.rail+(fullOn?fullSide:side),right:fullOn?fullSide:side,bottom:fullOn?8:bottom+miniBottom,height:fullOn?fullH:56,borderRadius:fullOn?38:28,opacity:fullOn?1:0,overflow:'hidden',transitionProperty:['left','right','height','bottom','opacity','borderRadius'],...motion}}>
   <Glass radius={38} blur={false} style={{flex:1,backgroundColor:C.bg}}><Animated.View style={{flex:1,opacity:fullOn?1:0,transform:[{translateY:fullOn?0:18}],transitionProperty:['opacity','transform'],transitionDuration:reduced?0:360,transitionDelay:fullOn&&!reduced?110:0}}><Full h={fullH} active={fullOn}/></Animated.View></Glass>
  </Animated.View>}
 </>;
}

const st = themeValues((C) => (StyleSheet.create({
  ctl: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  extra: { flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:5,minHeight:62,paddingHorizontal:2 },
})));


const stThemeTable=st;
