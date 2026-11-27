import { softExit } from '@/nav';
import { resolveThemeValues , useTheme, themeValues } from '@/theme/state';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useLayout } from './layout';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, type FlatListProps, Platform, Pressable, type PressableProps, type ScrollViewProps, StyleSheet, Text, type TextProps, View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, cubicBezier, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DOCK, EASE, F, R } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { PlayPause } from './PlayPause';
import { Artwork } from './Artwork';
import { usePlayer } from '@/player/player';
import { Surface } from './Surface';
import { SlidingPill, SlidingPillLabel, useSlidingPill } from './SlidingPill';

export const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
/** A short entrance on mount, with no perpetual animation or per-frame JS. */
export function Reveal({children,step=0,style}:{children:ReactNode;step?:number;style?:ViewStyle}) {

  const reduced=useReducedMotion();
  const progress=useSharedValue(reduced ? 1 : 0);
  useEffect(()=>{
    progress.set(reduced ? 1 : withDelay(Math.min(3,Math.max(0,step))*60,withTiming(1,{duration:440})));
    return ()=>cancelAnimation(progress);
  },[reduced,step,progress]);
  const motion=useAnimatedStyle(()=>({opacity:progress.get(),transform:[{translateY:(1-progress.get())*12}]}));
  return <Animated.View style={[{flexShrink:0,minWidth:0},style,motion]}>{children}</Animated.View>;
}

/* ---------- текст ---------- */
type V = 'xl' | 'h1' | 'h2' | 'h3' | 'title' | 'body' | 'sub' | 'small' | 'label';
const TV: Record<V, any> = themeValues((C) => ({
  xl: { fontFamily: F.bold, fontSize: 44, lineHeight: 52, letterSpacing: -1.8 },
  h1: { fontFamily: F.bold, fontSize: 30, lineHeight: 38, letterSpacing: -1.2 },
  h2: { fontFamily: F.bold, fontSize: 21, lineHeight: 28, letterSpacing: -0.65 },
  h3: { fontFamily: F.bold, fontSize: 18, lineHeight: 23 },
  title: { fontFamily: F.semi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: F.medium, fontSize: 15.5, lineHeight: 23, color: C.tx2 },
  sub: { fontFamily: F.semi, fontSize: 15, lineHeight: 20, color: C.tx2 },
  small: { fontFamily: F.semi, fontSize: 13, lineHeight: 17, color: C.tx2 },
  label: { fontFamily: F.semi, fontSize: 12.5, lineHeight: 15, color: C.tx2 },
}));
export function T({ v = 'title', style, ...p }: TextProps & { v?: V }) {
  const {colors:C}=useTheme();
 const TV=resolveThemeValues(TVThemeTable,C);
  const custom = StyleSheet.flatten(style);
  const fontSize = custom?.fontSize ?? TV[v].fontSize;
  // Larger titles must reserve their own line box instead of inheriting the
  // smaller variant's height (especially in wrapped Russian headings).
  const lineHeight = custom?.lineHeight ?? Math.max(TV[v].lineHeight, Math.ceil(fontSize * 1.25));
  return <Text {...p} style={[{ position:'relative',color: C.tx }, TV[v], style, { lineHeight }]} />;
}

/* ---------- нажатие: лёгкое сжатие через CSS-переход, без работы JS на каждом кадре ---------- */
const PRESS_EASE = cubicBezier(EASE[0], EASE[1], EASE[2], EASE[3]);
export function Press({ style, outer, children, scaleTo = 0.98, onPress, ...p }: PressableProps & { style?: any; outer?: any; scaleTo?: number; children?: ReactNode }) {

  const [down, setDown] = useState(false);
  const reduced=useReducedMotion();
  const visual={...StyleSheet.flatten(style)};
  const flow:ViewStyle={};
  // The press target owns its position in the parent. A flex child inside an
  // unsized press target can collapse the row while still painting its contents.
  for(const key of ['flex','flexGrow','flexShrink','flexBasis','alignSelf','margin','marginTop','marginBottom','marginLeft','marginRight','marginHorizontal','marginVertical'] as const){
    if(visual[key]!==undefined){(flow as any)[key]=visual[key];delete visual[key];}
  }
  return (
    <Pressable
      {...p}
      style={[{flexShrink:0},flow,outer]}
      onPress={onPress}
      onPressIn={(e) => { setDown(true); p.onPressIn?.(e); }}
      onPressOut={(e) => { setDown(false); p.onPressOut?.(e); }}
    >
      <Animated.View style={[visual, { transform: [{ scale: down && !reduced ? scaleTo : 1 }], transitionProperty: 'transform', transitionDuration: reduced ? 0 : down ? 170 : 460, transitionTimingFunction: PRESS_EASE }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function IconBtn({ name, onPress, label, size = 48, iconSize = 24, ghost, style, color }: { name: IconName; onPress?: () => void; label: string; size?: number; iconSize?: number; ghost?: boolean; style?: ViewStyle; color?: string }) {

  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={[{ width: size, height: size, borderRadius: size/2, alignItems: 'center', justifyContent: 'center' }, style]}>
      {!ghost&&<Surface pointerEvents="none" radius={size/2} style={StyleSheet.absoluteFill}/>}
      <Icon name={name} size={iconSize} color={color} />
    </Press>
  );
}

export function Btn({ label, icon, kind = 'white', onPress, disabled, small, style, playing,borderless=false }: { label: string; icon?: IconName | 'playpause'; kind?: 'white' | 'dark' | 'flat'; onPress?: () => void; disabled?: boolean; small?: boolean; style?: ViewStyle; playing?: boolean;borderless?:boolean }) {
  const {colors:C}=useTheme();
 const s=resolveThemeValues(sThemeTable,C);
  const fg = kind === 'white' ? C.onAccent : C.tx;
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={[s.btn, { minHeight: small ? 48 : 58,paddingVertical:12, backgroundColor: kind === 'white' ? C.sky : borderless ? C.bg : kind === 'dark' ? C.s2 : C.s1, opacity: disabled ? 0.32 : 1 }, style]}>
      {kind!=='white'&&!borderless&&<Surface pointerEvents="none" radius={999} style={StyleSheet.absoluteFill}/>}
      <T v="title" style={{ color: fg, fontFamily: F.bold, fontSize: small ? 15.5 : 17, flexShrink: 1 }} numberOfLines={2}>{label}</T>
      {icon === 'playpause' ? <PlayPause playing={!!playing} size={22} color={fg} /> : icon ? <Icon name={icon} size={24} color={kind==='white' ? fg : undefined} /> : null}
    </Press>
  );
}

export function Cover({ uri, size, radius = R.cover, style, source, label,fallbackUri,trackId }: { uri?: string; size: number | `${number}%`; radius?: number; style?: any; source?: any;label?:string;fallbackUri?:string;trackId?:string }) {
  const {colors:C}=useTheme();
  const reduced=useReducedMotion();
  const initial=label ? Array.from(label.trim())[0]?.toUpperCase() : undefined;
  return (
    <View style={[{ width: size, aspectRatio: 1, borderRadius: radius, overflow: 'hidden', backgroundColor: C.s2 }, style]}>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center',backgroundColor:C.s2 }]}>{initial ? <T style={{color:C.sky,fontSize:typeof size==='number' ? Math.max(20,size*.32) : 38}}>{initial}</T> : <Icon name="note" size={typeof size === 'number' ? size * 0.4 : 40} color={C.tx3}/>}</View>
      {source?<Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={reduced?0:180}/>:<Artwork uri={uri} fallbackUri={fallbackUri} trackId={trackId} style={StyleSheet.absoluteFill} contentFit="cover" transition={reduced?0:180}/>}
    </View>
  );
}

/* ---------- экран со скроллом: отступ под капсулу ---------- */
/* В браузере стек экранов без анимации переходов — добавляем свою: экран мягко въезжает */
export function Screen({ children, dock = true, scroll = true, style, ...p }: ScrollViewProps & { dock?: boolean; scroll?: boolean; children?: ReactNode }) {
  const {colors:C}=useTheme();
  const ins = useSafeAreaInsets();
  const layout=useLayout();
  const side = Math.max(layout.side, ins.left + 12, ins.right + 12);
  const hasTrack = usePlayer((x) => x.index >= 0);
  const pb = dock ? (hasTrack ? DOCK.mini : DOCK.compact) + Math.max(ins.bottom, 14) + 30 : Math.max(ins.bottom, 14) + 24;
  const pad = { paddingTop: Math.max(ins.top, 18) + 14, paddingBottom: pb, paddingHorizontal: side };
  if (!scroll) return <Animated.View style={[{ flex: 1, backgroundColor: C.bg }, pad, style as any]}>{children}</Animated.View>;
  return (
    <Animated.View style={{ flex: 1, backgroundColor: C.bg }}>

      <Animated.ScrollView {...p} style={{ flex: 1 }} contentContainerStyle={[pad, style as any]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </Animated.ScrollView>
    </Animated.View>
  );
}

/** Windowed feed with the same safe-area and dock spacing as Screen. */
export function ScreenList<Item>({contentContainerStyle,style,...props}:FlatListProps<Item>){
 const {colors:C}=useTheme(),ins=useSafeAreaInsets(),layout=useLayout();
 const hasTrack=usePlayer(s=>s.index>=0),side=Math.max(layout.side,ins.left+12,ins.right+12);
 return <FlatList {...props} style={[{flex:1,backgroundColor:C.bg},style]} contentContainerStyle={[{paddingTop:Math.max(ins.top,18)+14,paddingBottom:(hasTrack?DOCK.mini:DOCK.compact)+Math.max(ins.bottom,14)+30,paddingHorizontal:side},contentContainerStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"/>;
}

export function TopBar({ title, right, onBack, close, borderless=false }: { title?: string; right?: ReactNode; onBack?: () => void; close?: boolean;borderless?:boolean }) {
  const {colors:C}=useTheme();
 const s=resolveThemeValues(sThemeTable,C);
  return (
    <View style={s.top}>
      <IconBtn ghost={borderless} name={close ? 'close' : 'back'} label={close ? 'Закрыть' : 'Назад'} onPress={()=>softExit(onBack??(()=>router.canGoBack()?router.back():router.replace('/listen')))} />
      <T v="h2" numberOfLines={1} style={{ flex: 1, fontSize: 21 }} accessibilityRole="header">{title ?? ''}</T>
      {right}
    </View>
  );
}

export function SectionHead({ title, more, onMore }: { title: string; more?: string; onMore?: () => void }) {
  const {colors:C}=useTheme();
 const s=resolveThemeValues(sThemeTable,C);
  return (
    <View style={s.sec}>
      <T v="h2" accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>{title}</T>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={10} accessibilityRole="button" accessibilityLabel={more ? `${title}: ${more}` : `${title}: все`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {more ? <T v="sub">{more}</T> : null}<Icon name="chev" size={20} color={C.tx2} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  const {colors:C}=useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 18, paddingTop: 60, paddingHorizontal: 10 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.s1,borderWidth:1,borderColor:C.line,alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={40} /></View>
      <View style={{ gap: 8, alignItems: 'center' }}>
        <T v="h2" style={{ fontSize: 25, textAlign: 'center' }}>{title}</T>
        {text ? <T v="body" style={{ textAlign: 'center' }}>{text}</T> : null}
      </View>
      <View style={{ width: '100%', maxWidth: 340, gap: 12 }}>{children}</View>
    </View>
  );
}

export function Offline({ onRetry }: { onRetry: () => void }) {

  return (
    <Empty icon="wifiOff" title="Нет подключения" text="Проверь интернет. Любимое и твои плейлисты остаются на месте.">
      <Btn label="Повторить" icon="refresh" onPress={onRetry} />
    </Empty>
  );
}

export function Skeleton({ h, w = '100%', r = 18, style }: { h: number; w?: number | `${number}%`; r?: number; style?: any }) {
  const {colors:C}=useTheme();
  const reduced=useReducedMotion();
  const o = useSharedValue(0.45);
  useEffect(() => { o.set(reduced ? .65 : withRepeat(withTiming(1, { duration: 900 }), -1, true));return ()=>cancelAnimation(o); }, [o,reduced]);
  const a = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor:C.line }, a, style]} />;
}
export function ListSkeleton({ n = 4 }: { n?: number }) {

  return (
    <View style={{ gap: 14 }} accessibilityLabel="Загрузка">
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}><Skeleton h={58} w={58} r={12} /><Skeleton h={16} w="55%" /></View>
      ))}
    </View>
  );
}
export const Spinner = () => { const {colors:C}=useTheme(); return (<ActivityIndicator color={C.tx2} />); };

export function Segmented<K extends string>({ items, value, onChange, label, borderless=false }: { items: [K, string][]; value: K; onChange: (k: K) => void; label: string;borderless?:boolean }) {
  const {colors:C}=useTheme();
 const s=resolveThemeValues(sThemeTable,C);
  const pill=useSlidingPill();
  const [width,setWidth]=useState(0);
  const cell=Math.max(0,(width-8)/items.length),selected=Math.max(0,items.findIndex(([k])=>k===value));
  useEffect(()=>pill.move({x:4+selected*cell,y:4,width:cell,height:42}),[pill,selected,cell]);
  return (
    <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={[s.seg,borderless?{borderWidth:0,backgroundColor:C.bg}:null]} accessibilityRole="tablist" accessibilityLabel={label}>
      {!borderless?<Surface pointerEvents="none" radius={999} style={StyleSheet.absoluteFill}/>:null}
      <SlidingPill motion={pill} backgroundColor={C.tx}/>
      {items.map(([k, l],index) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => { haptic(); onChange(k); }} accessibilityRole="tab" accessibilityState={{ selected: on }} aria-selected={on} style={s.segBtn}>
            <SlidingPillLabel motion={pill} index={index} cell={cell} activeColor={C.inverse} inactiveColor={C.tx2} size={items.length>3?12.5:14}>{l}</SlidingPillLabel>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = themeValues((C) => (StyleSheet.create({
  btn: { borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 26, paddingRight: 22 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  sec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',gap:12, marginBottom: 12 },
  seg: { flexDirection: 'row', height: 50, padding: 4, borderRadius: R.pill, backgroundColor: C.s2,borderWidth:.8,borderColor:C.line },
  segBtn: { flex: 1, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  field: { height:56,borderRadius:28,backgroundColor:C.s2,borderWidth:.8,borderColor:C.line, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 8 },
  input: { flex: 1, minWidth: 0, height: '100%', color: C.tx, fontFamily: F.semi, fontSize: 16, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null) },
})));

const TVThemeTable=TV;
const sThemeTable=s;
