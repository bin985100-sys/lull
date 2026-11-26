import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/state';
import { PLAY_PATH } from './transport-geometry';
/** Rounded geometry stays inside its view box; the two pause capsules unfold gently. */
export function PlayPause({playing,size=26,color,stroke:_stroke}:{playing:boolean;size?:number;color?:string;stroke?:number}){
 const {colors:C}=useTheme(),reduced=useReducedMotion(),t=useSharedValue(playing?1:0),ink=color??C.tx;void _stroke;
 useEffect(()=>{t.set(reduced?(playing?1:0):withTiming(playing?1:0,{duration:620,easing:Easing.bezier(.22,.86,.22,1)}));},[playing,reduced,t]);
 const play=useAnimatedStyle(()=>({opacity:1-t.get(),transform:[{scale:1-t.get()*.18},{translateX:-size*.04*t.get()}]}));
 const left=useAnimatedStyle(()=>({opacity:t.get(),transform:[{translateX:(1-t.get())*size*.13},{scale:.7+t.get()*.3}]}));
 const right=useAnimatedStyle(()=>({opacity:t.get(),transform:[{translateX:-(1-t.get())*size*.13},{scale:.7+t.get()*.3}]}));
 return <View style={{width:size,height:size}} pointerEvents="none">
  <Animated.View style={[{position:'absolute',inset:0},play]}><Svg width={size} height={size} viewBox="0 0 24 24"><Path fill={ink} d={PLAY_PATH}/></Svg></Animated.View>
  <Animated.View style={[{position:'absolute',inset:0},left]}><Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={4.5} y={3.8} width={6} height={16.4} rx={3} fill={ink}/></Svg></Animated.View>
  <Animated.View style={[{position:'absolute',inset:0},right]}><Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={13.5} y={3.8} width={6} height={16.4} rx={3} fill={ink}/></Svg></Animated.View>
 </View>;
}
