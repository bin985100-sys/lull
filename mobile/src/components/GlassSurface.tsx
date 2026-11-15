import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentRef, RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

const nativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
export type GlassTarget = RefObject<ComponentRef<typeof View> | null>;

/** One background capture for Android; native Liquid Glass where iOS supports it. */
export function GlassSurface({ target, expanded }: { target?: GlassTarget; expanded: boolean }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {nativeGlass
      ? <GlassView colorScheme="dark" glassEffectStyle="regular" tintColor="rgba(24,29,43,0.22)" style={StyleSheet.absoluteFill}/>
      : <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={expanded ? 72 : 60}
          tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill}/>}
    <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.65)']}
      start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
    <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.20)', 'transparent']}
      start={{x:0,y:0}} end={{x:1,y:0}} style={{position:'absolute',left:24,right:24,top:0,height:1}}/>
  </View>;
}

export function GlassLens({ target }: { target?: GlassTarget }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {nativeGlass
      ? <GlassView colorScheme="dark" glassEffectStyle="clear" tintColor="rgba(255,255,255,0.03)" style={StyleSheet.absoluteFill}/>
      : <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={35} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill}/>}
  </View>;
}
