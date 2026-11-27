import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

export type AmbientProps={children:ReactNode;active:boolean;duration?:number;mirror?:boolean;cover?:boolean};
/** Native decorative motion bypasses Fabric commits. Non-interaction loops let
 * VirtualizedList fill its render window while the background is moving. */
export function AmbientMotion({children,active,duration=14000,mirror=false,cover=false}:AmbientProps){
 const [phase]=useState(()=>new Animated.Value(0));
 useEffect(()=>{
  if(!active)return;
  const loop=Animated.loop(Animated.sequence([
   Animated.timing(phase,{toValue:1,duration,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
   Animated.timing(phase,{toValue:0,duration,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
  ]));loop.start();return()=>loop.stop();
 },[active,duration,phase]);
 const transform=useMemo(()=>[
  {translateX:phase.interpolate({inputRange:[0,1],outputRange:cover?[-12,12]:[-10,10]})},
  {translateY:phase.interpolate({inputRange:[0,1],outputRange:[8,-8]})},
  {rotate:phase.interpolate({inputRange:[0,1],outputRange:['-3deg','3deg']})},
  {scaleX:(mirror?-1:1)*(cover?1.18:1.22)},{scaleY:cover?1.18:1.22},
 ],[phase,mirror,cover]);
 return <Animated.View renderToHardwareTextureAndroid={active} pointerEvents="none" style={[StyleSheet.absoluteFill,{transform}]}>{children}</Animated.View>;
}
