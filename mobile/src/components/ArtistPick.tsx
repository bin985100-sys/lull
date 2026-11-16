import { useTheme } from '@/theme/state';
import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Artist } from '@/api/audius';
import { EASE } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { haptic, T } from '@/ui/kit';

const ease = Easing.bezier(...EASE);

export const ArtistPick = memo(function ArtistPick({ a, on, onPress, size }: { a: Artist; on: boolean; onPress: () => void; size: number }) {
  const {colors:C}=useTheme();
  const reduced=useReducedMotion();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.set(reduced ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 280, easing: ease })); }, [on, v,reduced]);
  const img = useAnimatedStyle(() => ({ transform: [{ scale: 1 - v.get() * 0.06 }] }));
  const ring = useAnimatedStyle(() => ({ opacity: v.get() }));
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: v.get() }] }));
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={a.name} style={{ width: size, alignItems: 'center', gap: 8 }}>
      <View style={{ width: size, height: size }}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 3, borderColor: C.tx }, ring]} />
        <Animated.View style={[{ position: 'absolute', inset: 4, borderRadius: size, overflow: 'hidden', backgroundColor: C.s2 }, img]}>
          {a.avatar ? <Image source={{ uri: a.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', right: '3%', bottom: '3%', width: size * 0.3, height: size * 0.3, maxWidth: 40, maxHeight: 40, borderRadius: 20, backgroundColor: C.tx, alignItems: 'center', justifyContent: 'center' }, badge]}>
          <Icon name="check" size={size * 0.18} color={C.inverse} />
        </Animated.View>
      </View>
      <T numberOfLines={1} style={{ fontSize: 15, textAlign: 'center' }}>{a.name}</T>
    </Pressable>
  );
});
