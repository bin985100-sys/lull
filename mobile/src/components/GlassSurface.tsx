import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentRef, RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

const nativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
export type GlassTarget = RefObject<ComponentRef<typeof View> | null>;

/** One background capture for Android; native Liquid Glass where iOS supports it. */
export function GlassSurface({ target, expanded }: { target?: GlassTarget; expanded: boolean }) {
  if (!expanded) return <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#000'}]}/>;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {nativeGlass
      ? <GlassView colorScheme="dark" glassEffectStyle="regular" tintColor="rgba(24,29,43,0.22)" style={StyleSheet.absoluteFill}/>
      : <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={expanded ? 72 : 60}
          tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill}/>}
    <LinearGradient colors={['rgba(79,91,119,0.28)', 'rgba(21,25,37,0.60)', 'rgba(17,22,33,0.70)']}
      start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
    <LinearGradient colors={['rgba(255,255,255,0.40)', 'rgba(137,195,255,0.10)', 'rgba(211,169,255,0.22)', 'transparent']}
      start={{x:0,y:0}} end={{x:1,y:0}} style={{position:'absolute',left:24,right:24,top:0,height:1}}/>
  </View>;
}

export function GlassLens({ target }: { target?: GlassTarget }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {nativeGlass
      ? <GlassView colorScheme="dark" glassEffectStyle="clear" tintColor="rgba(79,127,173,0.12)" style={StyleSheet.absoluteFill}/>
      : <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={35} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill}/>}
  </View>;
}
