import { useTheme } from '@/theme/state';
import { Image } from 'expo-image';
import { memo, useEffect, useId } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Artist } from '@/api/audius';
import { EASE } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { haptic, T } from '@/ui/kit';

const ease = Easing.bezier(...EASE);

export const ArtistPick = memo(function ArtistPick({ a, on, onPress, size, dark=false }: { a: Artist; on: boolean; onPress: () => void; size: number;dark?:boolean }) {
  const {colors:base}=useTheme();
  const C=dark?{...base,tx:'#fff',inverse:'#000',s2:'#111'}:base;
  const reduced=useReducedMotion();
  const glowId=useId().replace(/[^\w-]/g,''),radius=50-400/Math.max(16,size);
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.set(reduced ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: on?640:440, easing: ease })); }, [on, v,reduced]);
  const img = useAnimatedStyle(() => ({ transform: [{ scale: 1 - v.get() * 0.025 }] }));
  const ring = useAnimatedStyle(() => ({ opacity: v.get() }));
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: v.get() }] }));
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={a.name} style={{ width: size, alignItems: 'center', gap: 8 }}>
      <View style={{ width: size, height: size }}>
        <Animated.View style={[{ position: 'absolute', inset: 4, borderRadius: size, overflow: 'hidden', backgroundColor: C.s2 }, img]}>
          {a.avatar ? <Image source={{ uri: a.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
        </Animated.View>
        {/* Small vector gradients soften only the rim, never the portrait or screen. */}
        <Animated.View testID={on?'artist-selected-halo':'artist-unselected-halo'} pointerEvents="none" accessibilityElementsHidden style={[StyleSheet.absoluteFill,img,ring]}>
          <Svg width={size} height={size} viewBox="0 0 100 100"><Defs><RadialGradient id={glowId} cx={50} cy={50} rx={radius} ry={radius} gradientUnits="userSpaceOnUse"><Stop offset=".72" stopColor="#fff" stopOpacity={0}/><Stop offset=".86" stopColor="#fff" stopOpacity={.025}/><Stop offset=".94" stopColor="#fff" stopOpacity={.11}/><Stop offset=".985" stopColor="#fff" stopOpacity={.3}/><Stop offset="1" stopColor="#fff" stopOpacity={.55}/></RadialGradient></Defs>
            <Circle cx={50} cy={50} r={radius} fill={`url(#${glowId})`}/>
            <Circle cx={50} cy={50} r={radius} fill="none" stroke="#fff" strokeWidth={7} opacity={.018}/><Circle cx={50} cy={50} r={radius} fill="none" stroke="#fff" strokeWidth={4} opacity={.035}/><Circle cx={50} cy={50} r={radius} fill="none" stroke="#fff" strokeWidth={2} opacity={.09}/><Circle cx={50} cy={50} r={radius} fill="none" stroke="#fff" strokeWidth={.65} opacity={.8}/>
          </Svg>
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', right: '3%', bottom: '3%', width: size * 0.22, height: size * 0.22, maxWidth: 28, maxHeight: 28, borderRadius: 20, backgroundColor: C.tx, alignItems: 'center', justifyContent: 'center' }, badge]}>
          <Icon name="check" size={Math.min(18,size * 0.14)} color={C.inverse} />
        </Animated.View>
      </View>
      <T numberOfLines={1} style={{ fontSize: 15, textAlign: 'center',color:C.tx }}>{a.name}</T>
    </Pressable>
  );
});
