import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, type PressableProps, ScrollView, type ScrollViewProps, StyleSheet, Text, type TextProps, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { cubicBezier, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, DOCK, EASE, F, R } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { PlayPause } from './PlayPause';
import { slideIn } from './anim';
import { usePlayer } from '@/player/player';

export const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

/* ---------- текст ---------- */
type V = 'xl' | 'h1' | 'h2' | 'h3' | 'title' | 'body' | 'sub' | 'small' | 'label';
const TV: Record<V, any> = {
  xl: { fontFamily: F.bold, fontSize: 46, lineHeight: 48, letterSpacing: -1.6 },
  h1: { fontFamily: F.bold, fontSize: 32, lineHeight: 36, letterSpacing: -1 },
  h2: { fontFamily: F.bold, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  h3: { fontFamily: F.bold, fontSize: 18, lineHeight: 23 },
  title: { fontFamily: F.semi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: F.medium, fontSize: 15.5, lineHeight: 23, color: C.tx2 },
  sub: { fontFamily: F.semi, fontSize: 15, lineHeight: 20, color: C.tx2 },
  small: { fontFamily: F.semi, fontSize: 13, lineHeight: 17, color: C.tx2 },
  label: { fontFamily: F.semi, fontSize: 12.5, lineHeight: 15, color: C.tx2 },
};
export function T({ v = 'title', style, ...p }: TextProps & { v?: V }) {
  return <Text {...p} style={[{ color: C.tx }, TV[v], style]} />;
}

/* ---------- нажатие: лёгкое сжатие через CSS-переход, без работы JS на каждом кадре ---------- */
const PRESS_EASE = cubicBezier(EASE[0], EASE[1], EASE[2], EASE[3]);
export function Press({ style, outer, children, scaleTo = 0.96, onPress, ...p }: PressableProps & { style?: any; outer?: any; scaleTo?: number; children?: ReactNode }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      {...p}
      style={outer}
      onPress={onPress}
      onPressIn={(e) => { setDown(true); p.onPressIn?.(e); }}
      onPressOut={(e) => { setDown(false); p.onPressOut?.(e); }}
    >
      <Animated.View style={[style, { transform: [{ scale: down ? scaleTo : 1 }], transitionProperty: 'transform', transitionDuration: down ? 90 : 260, transitionTimingFunction: PRESS_EASE }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function IconBtn({ name, onPress, label, size = 48, iconSize = 24, ghost, style, color }: { name: IconName; onPress?: () => void; label: string; size?: number; iconSize?: number; ghost?: boolean; style?: ViewStyle; color?: string }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={[{ width: size, height: size, borderRadius: size * 0.375, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? 'transparent' : C.s2 }, style]}>
      <Icon name={name} size={iconSize} color={color} />
    </Press>
  );
}

export function Btn({ label, icon, kind = 'white', onPress, disabled, small, style, playing }: { label: string; icon?: IconName | 'playpause'; kind?: 'white' | 'dark' | 'flat'; onPress?: () => void; disabled?: boolean; small?: boolean; style?: ViewStyle; playing?: boolean }) {
  const fg = kind === 'white' ? '#000' : C.tx;
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={[s.btn, { height: small ? 48 : 58, backgroundColor: kind === 'white' ? C.tx : kind === 'dark' ? C.s2 : C.s1, opacity: disabled ? 0.32 : 1 }, style]}>
      <T v="title" style={{ color: fg, fontFamily: F.bold, fontSize: small ? 15.5 : 17, flexShrink: 1 }} numberOfLines={1}>{label}</T>
      {icon === 'playpause' ? <PlayPause playing={!!playing} size={22} color={fg} /> : icon ? <Icon name={icon} size={24} color={fg} /> : null}
    </Press>
  );
}

export function Cover({ uri, size, radius = R.cover, style, source }: { uri?: string; size: number | `${number}%`; radius?: number; style?: any; source?: any }) {
  return (
    <View style={[{ width: size, aspectRatio: 1, borderRadius: radius, overflow: 'hidden', backgroundColor: C.s2 }, style]}>
      {uri || source ? <Image source={source ?? { uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} recyclingKey={uri} /> : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="note" size={typeof size === 'number' ? size * 0.4 : 40} /></View>
      )}
    </View>
  );
}

/* ---------- экран со скроллом: отступ под капсулу ---------- */
/* В браузере стек экранов без анимации переходов — добавляем свою: экран мягко въезжает */
const WEB_ENTER = Platform.OS === 'web' ? slideIn(22, 1, 320) : undefined;
export function Screen({ children, dock = true, scroll = true, style, ...p }: ScrollViewProps & { dock?: boolean; scroll?: boolean; children?: ReactNode }) {
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  /* на планшете колонка контента не шире 720, в горизонтали учитываем вырез сбоку */
  const side = Math.max(20, (width - 720) / 2, ins.left + 12, ins.right + 12);
  const hasTrack = usePlayer((x) => x.index >= 0);
  const pb = dock ? (hasTrack ? DOCK.mini : DOCK.compact) + Math.max(ins.bottom, 14) + 30 : Math.max(ins.bottom, 14) + 24;
  const pad = { paddingTop: Math.max(ins.top, 18) + 14, paddingBottom: pb, paddingHorizontal: side };
  if (!scroll) return <Animated.View entering={WEB_ENTER} style={[{ flex: 1, backgroundColor: C.bg }, pad, style as any]}>{children}</Animated.View>;
  return (
    <Animated.View entering={WEB_ENTER} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView {...p} style={{ flex: 1 }} contentContainerStyle={[pad, style as any]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </Animated.View>
  );
}

export function TopBar({ title, right, onBack, close }: { title?: string; right?: ReactNode; onBack?: () => void; close?: boolean }) {
  return (
    <View style={s.top}>
      <IconBtn name={close ? 'close' : 'back'} label={close ? 'Закрыть' : 'Назад'} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/listen')))} />
      <T v="h2" numberOfLines={1} style={{ flex: 1, fontSize: 21 }} accessibilityRole="header">{title ?? ''}</T>
      {right}
    </View>
  );
}

export function SectionHead({ title, more, onMore }: { title: string; more?: string; onMore?: () => void }) {
  return (
    <View style={s.sec}>
      <T v="h2" accessibilityRole="header">{title}</T>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={10} accessibilityRole="button" accessibilityLabel={more ? `${title}: ${more}` : `${title}: все`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {more ? <T v="sub">{more}</T> : null}<Icon name="chev" size={20} color={C.tx2} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 18, paddingTop: 60, paddingHorizontal: 10 }}>
      <View style={{ width: 120, height: 120, borderRadius: 36, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={64} /></View>
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
  const o = useSharedValue(0.45);
  useEffect(() => { o.value = withRepeat(withTiming(1, { duration: 900 }), -1, true); }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor: C.s2 }, a, style]} />;
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
export const Spinner = () => <ActivityIndicator color={C.tx2} />;

export function Segmented<K extends string>({ items, value, onChange, label }: { items: [K, string][]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <View style={s.seg} accessibilityRole="tablist" accessibilityLabel={label}>
      {items.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => { haptic(); onChange(k); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.segBtn, on && { backgroundColor: C.s4 }]}>
            <T v="small" style={{ color: on ? C.tx : C.tx3, fontFamily: F.bold, fontSize: items.length > 3 ? 12.5 : 14 }} numberOfLines={1}>{l}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 26, paddingRight: 22 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  sec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  seg: { flexDirection: 'row', height: 50, padding: 4, borderRadius: R.pill, backgroundColor: C.s1 },
  segBtn: { flex: 1, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  field: { height: 54, borderRadius: R.pill, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 8 },
  input: { flex: 1, minWidth: 0, height: '100%', color: C.tx, fontFamily: F.semi, fontSize: 16, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null) },
});
