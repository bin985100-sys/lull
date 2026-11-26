import { resolveThemeValues , useTheme, themeValues } from '@/theme/state';
import { Surface } from '@/ui/Surface';
import { PlayerBackdrop } from '@/ui/PlayerBackdrop';
import { WaveArt } from '@/ui/WaveArt';
import { BottomNav, type NavKey } from './BottomNav';
import { LinearGradient } from 'expo-linear-gradient';
import { useCoverColors } from '@/theme/useCoverColors';
import { useTaste } from '@/store/taste';

/* Separate floating navigation, mini-player and search; full player expands from the mini-player. */
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, {
  cubicBezier, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { currentTrack, player, usePlayer, useProgress } from '@/player/player';
import { useLibrary } from '@/store/library';
import { DOCK, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
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
  const {colors:C}=useTheme();

  const reduced=useReducedMotion();
  const sc = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.get() }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Слушать'}
      onPress={() => { haptic(); if(!reduced) sc.set(withSequence(withTiming(0.9, { duration: 100 }), withSpring(1, { damping: 10, stiffness: 240 }))); player.toggle(); }}>
      <Animated.View style={[{ width: size, height: size, borderRadius: size/2, backgroundColor: C.tx, alignItems: 'center', justifyContent: 'center' }, a]}>
        {loading ? <ActivityIndicator color={C.inverse} size="large" /> : <PlayPause playing={playing} size={46} color={C.inverse} stroke={1.8} />}
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
          <View style={{ width: `${p * 100}%`, height: 5, borderRadius: 3, backgroundColor: C.sky }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: `${p * 100}%`, marginLeft: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: C.tx, transform: [{ scale: drag != null ? 1.25 : 1 }] }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="small" style={{ fontVariant: ['tabular-nums'],color:C.tx,opacity:.8 }}>{fmt(val)}</T>
        <T v="small" style={{ fontVariant: ['tabular-nums'],color:C.tx,opacity:.8 }}>-{fmt(duration - val)}</T>
      </View>
    </View>
  );
}

/* ---------- раскрытый плеер ---------- */
function Full({ h, active }: { h: number; active: boolean }) {
  const {colors:C}=useTheme();
  const safe=useSafeAreaInsets();
 const st=resolveThemeValues(stThemeTable,C);
  const s = usePlayer();
  const t = currentTrack(s)!;
  const palette=useCoverColors(t.artwork,t.id),mode=useTaste(s=>s.reco.waveMode);
  const loading = useProgress((x) => s.buffering && x.time < 0.5);
  const liked = useLibrary((x) => x.liked.some((y) => y.id === t.id));
  const reduced = useReducedMotion();
  const { width: ww } = useWindowDimensions();
  const playSize=ww<350 ? 64 : 84;
  const controlSize=Math.max(28,Math.min(56,(Math.min(680,ww-16)-44-playSize)/4));
  const coverSize = Math.max(130, Math.min(ww - 60, ww > 700 ? 480 : 360, h - safe.top - safe.bottom - DOCK.compact - 465));
  const enter=useMemo(()=>reduced?undefined:slideIn(s.lastDir==='next'?60:-60,.9,500),[reduced,s.lastDir]);
  const close = () => player.expand(false);
  const swipe = useTrackSwipe(close);
  const [boxH, setBoxH] = useState(0);
  const sv = useRef<ScrollViewInstance>(null);
  const lyricsOpen = useLyricsUi((x) => x.open);
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
    <PlayerBackdrop uri={t.artwork} colors={palette} active={active}/>
    <ScrollView ref={sv} showsVerticalScrollIndicator={false} scrollEnabled={!lyricsOpen} contentContainerStyle={{paddingBottom:24,alignItems:'center'}}>
    <View style={{ minHeight:boxH||undefined,width:'100%',maxWidth:680,paddingHorizontal:22+Math.max(safe.left,safe.right),paddingTop:Math.max(18,safe.top+8),paddingBottom:Math.max(44,safe.bottom+24) }}>
      <View style={{position:'absolute',top:8,alignSelf:'center',width:34,height:4,borderRadius:4,backgroundColor:C.tx3}}/>
      <View {...swipe.handlers}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Свернуть плеер" style={{ width: 48, height: 48, justifyContent: 'center' }}><Icon name="down" size={28} /></Pressable>
        <Pressable onPress={() => openSelectPlaylist(t)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Добавить в плейлист" style={{ width: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center' }}><Icon name="plus" size={24} /></Pressable>
      </View>
      <Animated.View style={swipe.style}>
      <Animated.View key={'c' + t.id} entering={enter} style={{alignSelf:'center',marginTop:8,width:coverSize,height:coverSize}}><View style={{width:coverSize,height:coverSize,borderRadius:22,overflow:'hidden',backgroundColor:C.s2}}><Image source={{uri:t.artworkLarge||t.artwork}} style={StyleSheet.absoluteFill} contentFit="cover" transition={reduced?0:280}/></View></Animated.View>
      </Animated.View>
      </View>
      <Animated.View key={'m' + t.id} entering={enter} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}>
        <Pressable onPress={() => likeWithUndo(t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={liked ? 'Убрать из любимых' : 'В любимые'} accessibilityState={{ selected: liked }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={liked ? 'heartF' : 'heart'} size={28} color={liked?C.rose:C.tx2}/>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="h1" numberOfLines={2} style={{ fontSize: 23, lineHeight: 31, textAlign:'center' }}>{t.title}</T>
          <Pressable disabled={!t.artistId} onPress={() => { close(); router.push({ pathname: '/artist/[id]', params: { id: t.artistId, s: t.source === 'yt' ? 'yt' : 'audius' } }); }} accessibilityRole="link">
            <T v="sub" numberOfLines={1} style={{ fontSize: 14, marginTop: 5,textAlign:'center',color:C.tx,opacity:.8 }}>{t.artist}</T>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Меню текущего трека" onPress={()=>openTrackActions(t)} style={{width:48,height:48,alignItems:'center',justifyContent:'center'}}><Icon name="more" size={25}/></Pressable>
      </Animated.View>
      {s.error && <Pressable accessibilityRole="button" onPress={() => player.toggle()}><T v="sub">{s.error} · Повторить</T></Pressable>}
      <Seek active={active} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <Pressable onPress={() => { haptic(); player.toggleShuffle(); }} accessibilityRole="button" accessibilityLabel="Перемешивать" accessibilityState={{ selected: s.shuffle }} style={[st.ctl,{width:controlSize}]}><Icon name="shuffle" size={28} color={s.shuffle ? C.sky : C.tx3} /></Pressable>
        <SkipBtn dir="prev" size={28} box={controlSize} />
        <BigPlay playing={s.playing} loading={loading} size={playSize} />
        <SkipBtn dir="next" size={28} box={controlSize} />
        <Pressable onPress={() => { haptic(); player.cycleRepeat(); }} accessibilityRole="button" accessibilityLabel={`Повтор: ${{ off: 'выключен', all: 'все', one: 'трек' }[s.repeat]}`} style={[st.ctl,{width:controlSize}]}>
          <Icon name={s.repeat === 'one' ? 'repeatOne' : 'repeat'} size={28} color={s.repeat === 'off' ? C.tx3 : C.sky} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap:6, marginTop: 18 }}>

        <SleepButton />
        <Pressable onPress={() => { close(); router.push('/queue'); }} accessibilityRole="button" style={st.extra}><Icon name="queue" size={24} /><T v="small" numberOfLines={1} style={{ fontSize: 11.5 }}>Очередь</T></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Волна по текущему треку" onPress={()=>openWave(t)} style={{height:56,borderRadius:28,overflow:'hidden',marginTop:14}}><WaveArt colors={palette} animate={active} inPlayer/><View style={{flex:1,backgroundColor:'rgba(0,0,0,.50)',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10}}><T style={{fontSize:14,color:'#fff',fontFamily:F.bold}}>Волна</T><View style={{width:24,height:24,borderRadius:12,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'}}><Icon name="play" size={12} color="#111"/></View><T style={{fontSize:14,color:'#fff'}}>{{sound:'По треку',artist:'По артисту',discover:'Открытия',favorite:'Любимое',calm:'Спокойнее',energy:'Бодрее'}[mode]}</T></View></Pressable>
      {/* подсказка: ниже — текст песни */}
      <Pressable onPress={() => sv.current?.scrollTo({ y: Math.max(0, boxH - 120), animated: true })} accessibilityRole="button" accessibilityLabel="Показать текст песни"
        style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(6,safe.bottom+4), alignItems: 'center', paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.6 }}><T style={{ fontSize: 13, fontFamily: F.semi }}>Текст</T><Icon name="down" size={18} /></View>
      </Pressable>
    </View>
    <View style={{paddingHorizontal:16,width:'100%',maxWidth:680}}>
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
  const palette=useCoverColors(t.artwork,t.id);
  const reduced = useReducedMotion();
  const enter=useMemo(()=>reduced?undefined:slideIn(s.lastDir==='next'?28:-28,1,420),[reduced,s.lastDir]);
  const swipe = useTrackSwipe();
  return (
    <View style={{height:56,overflow:'hidden',borderRadius:20,flexDirection:"row",alignItems:"center",paddingLeft:8,paddingRight:4,gap:2}}>
      <Animated.View key={palette.deep} entering={reduced?undefined:slideIn(0,1,650)} pointerEvents="none" style={StyleSheet.absoluteFill}><LinearGradient colors={[palette.deep,C.s1,palette.deep]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/></Animated.View>
      <Animated.View {...swipe.handlers} style={[{ flex: 1, minWidth: 0,height:56 }, swipe.style]}>
      <Pressable onLongPress={e=>openTrackActions(t,undefined,{x:e.nativeEvent.pageX,y:e.nativeEvent.pageY})} onPress={() => { haptic(); player.expand(true); }} accessibilityRole="button" accessibilityLabel={`Открыть плеер: ${t.title}. Свайп влево — следующий трек, вправо — предыдущий`} style={{ flex: 1, minWidth: 0, height: 56 }}>
        <Animated.View key={t.id} entering={enter} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: compact ? 6 : 10 }}>
          {width>155&&<View style={{ width: compact ? 34 : 40, height: compact ? 34 : 40, borderRadius: 12, overflow: 'hidden', backgroundColor: C.s2, borderWidth:StyleSheet.hairlineWidth,borderColor:C.glassLine }}><Image source={{ uri: t.artwork }} style={StyleSheet.absoluteFill} transition={reduced ? 0 : 240}/></View>}
          <View style={{flex:1,minWidth:0,gap:2}}>
            <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: compact ? 12 : 14 }}>{t.title}</T>
            {width>180&&<View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <T v="small" numberOfLines={1} style={{flex:1,minWidth:0,fontSize:11.5,color:C.tx2}}>{t.artist}</T>
            </View>}
          </View>
        </Animated.View>
      </Pressable>
      </Animated.View>
      <Pressable onPress={() => { haptic(); player.toggle(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={s.playing ? 'Пауза' : 'Слушать'} style={{ width: compact?44:48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color={C.tx} /> : <PlayPause playing={s.playing} size={28} />}
      </Pressable>
      {!compact&&width>245&&<SkipBtn dir="next" box={44}/>}
    </View>
  );
}

/* Плавность через CSS-переходы Reanimated 4: на iPhone в браузере их считает сам браузер,
   на Android/iOS — UI-поток. JS не трогает каждый кадр, поэтому раскрытие не тормозит. */
/** Floating chrome shares one capture target; only the lens animates per frame. */
export function Dock(){
 const {colors:C}=useTheme(),layout=useLayout(),path=usePathname(),ins=useSafeAreaInsets();
 const {height}=useWindowDimensions();
 const has=usePlayer(s=>s.index>=0),expanded=usePlayer(s=>s.expanded),reduced=useReducedMotion();
 const [keyboardShown,setKeyboardShown]=useState(false);
 useEffect(()=>{
  if(Platform.OS==='web'){
   const update=()=>setKeyboardShown(!!window.visualViewport&&window.innerHeight-window.visualViewport.height>100);
   window.visualViewport?.addEventListener('resize',update);return()=>window.visualViewport?.removeEventListener('resize',update);
  }
  const a=Keyboard.addListener('keyboardDidShow',()=>setKeyboardShown(true)),b=Keyboard.addListener('keyboardDidHide',()=>setKeyboardShown(false));return()=>{a.remove();b.remove();};
 },[]);
 const hidden=HIDDEN.includes(path)||!!layout.rail&&!has||keyboardShown;
 const active:NavKey=path==='/search'?'search':path==='/wave'?'wave':path.startsWith('/my/')||['/collection','/favorites','/downloads','/import'].includes(path)?'collection':'listen';
 const width=Math.min(500,layout.available-(layout.available<320?24:40)),side=Math.max(DOCK.side,(layout.available-width)/2);
 const bottom=Math.max(ins.bottom,16)+4,miniBottom=layout.rail?0:78;
 const [mounted,setMounted]=useState(false),[ready,setReady]=useState(false);
 const fullOn=expanded&&ready;
 useEffect(()=>{if(!expanded)closeLyrics();},[expanded]);
 useEffect(()=>{let next=0;if(expanded){const frame=requestAnimationFrame(()=>{setMounted(true);next=requestAnimationFrame(()=>setReady(true));});return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(next);};}const frame=requestAnimationFrame(()=>setReady(false));const timer=setTimeout(()=>setMounted(false),reduced?0:420);return()=>{cancelAnimationFrame(frame);clearTimeout(timer);};},[expanded,reduced]);
 const fullH=height;
 const motion={transitionDuration:reduced?0:420,transitionTimingFunction:cubicBezier(.2,.75,.2,1)} as const;
 return <>
  {mounted&&<Animated.View pointerEvents={expanded?'auto':'none'} style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(0,0,0,.65)',opacity:fullOn?1:0,transitionProperty:'opacity',...motion}]}><Pressable accessibilityRole="button" accessibilityLabel="Закрыть полный плеер" onPress={()=>player.expand(false)} style={{flex:1}}/></Animated.View>}
  <View pointerEvents={hidden||expanded?'none':'box-none'} aria-hidden={hidden||expanded} accessibilityElementsHidden={hidden||expanded} importantForAccessibility={hidden||expanded?'no-hide-descendants':'auto'} style={{position:'absolute',left:layout.rail+side,width,bottom,height:has?146:72,opacity:hidden||expanded?0:1}}>
   {has&&<View style={{position:'absolute',left:0,right:0,bottom:miniBottom,borderRadius:20,overflow:'hidden',backgroundColor:C.s2,borderWidth:1,borderColor:C.line}}><Mini width={width}/></View>}
   {!layout.rail&&<View style={{position:'absolute',left:0,right:0,bottom:0}}><BottomNav active={active} onSelect={tab=>{player.expand(false);resetTo(`/${tab}` as '/listen'|'/wave'|'/search'|'/collection');}}/></View>}
  </View>
  {has&&mounted&&<Animated.View pointerEvents={expanded?'auto':'none'} aria-hidden={!expanded} accessibilityViewIsModal={expanded} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded?'auto':'no-hide-descendants'} style={{position:'absolute',left:fullOn?0:layout.rail+side,right:fullOn?0:side,bottom:fullOn?0:bottom+miniBottom,height:fullOn?fullH:56,borderRadius:fullOn?0:20,opacity:fullOn?1:0,overflow:'hidden',transitionProperty:['left','right','height','bottom','opacity','borderRadius'],...motion}}>
   <Surface radius={0} style={{flex:1,backgroundColor:C.bg,borderWidth:0}}><Animated.View style={{flex:1,opacity:fullOn?1:0,transform:[{translateY:fullOn?0:18}],transitionProperty:['opacity','transform'],transitionDuration:reduced?0:300}}><Full h={fullH} active={fullOn}/></Animated.View></Surface>
  </Animated.View>}
 </>;
}

const st = themeValues((C) => (StyleSheet.create({
  ctl: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  extra: { flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:5,minHeight:62,paddingHorizontal:2,paddingVertical:8,borderRadius:18,backgroundColor:C.s1 },
})));


const stThemeTable=st;
