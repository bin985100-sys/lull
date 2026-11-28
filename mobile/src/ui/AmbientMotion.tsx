import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { ambientGeometry } from './ambient-geometry';

export type AmbientProps={children:ReactNode;active:boolean;duration?:number;mirror?:boolean;cover?:boolean};
/** Native decorative motion bypasses Fabric commits. Non-interaction loops let
 * VirtualizedList fill its render window while the background is moving. */
export function AmbientMotion({children,active,duration=14000,mirror=false,cover=false}:AmbientProps){
 const [phase]=useState(()=>new Animated.Value(0));
 const [bounds,setBounds]=useState({width:1,height:1});
 useEffect(()=>{
  if(!active)return;
  const loop=Animated.loop(Animated.sequence([
   Animated.timing(phase,{toValue:1,duration,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
   Animated.timing(phase,{toValue:0,duration,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
  ]));loop.start();return()=>loop.stop();
 },[active,duration,phase]);
 const transform=useMemo(()=>{const g=ambientGeometry(bounds.width,bounds.height,cover);return [
  {translateX:phase.interpolate({inputRange:[0,1],outputRange:[-g.x,g.x]})},
  {translateY:phase.interpolate({inputRange:[0,1],outputRange:[g.y,-g.y]})},
  {rotate:phase.interpolate({inputRange:[0,1],outputRange:[`${-g.angle}deg`,`${g.angle}deg`]})},
  {scaleX:(mirror?-1:1)*g.scale},{scaleY:g.scale},
 ];},[phase,mirror,cover,bounds.width,bounds.height]);
 return <Animated.View onLayout={e=>{const {width,height}=e.nativeEvent.layout;setBounds(old=>old.width===width&&old.height===height?old:{width,height});}} renderToHardwareTextureAndroid={active} pointerEvents="none" style={[StyleSheet.absoluteFill,{transform}]}>{children}</Animated.View>;
}
