import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/state';
/** Rounded geometry stays inside its view box; the two pause capsules unfold gently. */
export function PlayPause({playing,size=26,color,stroke:_stroke}:{playing:boolean;size?:number;color?:string;stroke?:number}){
 const {colors:C}=useTheme(),reduced=useReducedMotion(),t=useSharedValue(playing?1:0),ink=color??C.tx;void _stroke;
 useEffect(()=>{t.set(reduced?(playing?1:0):withTiming(playing?1:0,{duration:560,easing:Easing.bezier(.22,.8,.2,1)}));},[playing,reduced,t]);
 const play=useAnimatedStyle(()=>({opacity:1-t.get(),transform:[{scale:1-t.get()*.35},{rotate:`${t.get()*18}deg`}]}));
 const left=useAnimatedStyle(()=>({opacity:t.get(),transform:[{translateX:(1-t.get())*size*.13},{scale:.7+t.get()*.3}]}));
 const right=useAnimatedStyle(()=>({opacity:t.get(),transform:[{translateX:-(1-t.get())*size*.13},{scale:.7+t.get()*.3}]}));
 return <View style={{width:size,height:size}} pointerEvents="none">
  <Animated.View style={[{position:'absolute',inset:0},play]}><Svg width={size} height={size} viewBox="0 0 24 24"><Path fill={ink} d="M7.2 3.5C5.8 2.7 4.5 3.5 4.5 5.1v13.8c0 1.6 1.3 2.4 2.7 1.6l12-6.9c1.4-.8 1.4-2.4 0-3.2Z"/></Svg></Animated.View>
  <Animated.View style={[{position:'absolute',inset:0},left]}><Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={4.7} y={3.5} width={5.7} height={17} rx={2.85} fill={ink}/></Svg></Animated.View>
  <Animated.View style={[{position:'absolute',inset:0},right]}><Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={13.6} y={3.5} width={5.7} height={17} rx={2.85} fill={ink}/></Svg></Animated.View>
 </View>;
}
