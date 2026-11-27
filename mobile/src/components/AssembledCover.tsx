import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useAppearance } from '@/theme/state';

type TileRect={x:number;y:number;w:number;h:number};
const ease=Easing.bezier(.22,.75,.18,1);
function Tile({uri,rect,index,animate}:{uri:string;rect:TileRect;index:number;animate:boolean}){
 const reduced=useReducedMotion(),motion=useAppearance(s=>s.motion),still=reduced||!motion||!animate;
 const x=useSharedValue(rect.x),y=useSharedValue(rect.y),w=useSharedValue(rect.w),h=useSharedValue(rect.h),arrival=useSharedValue(still?1:0);
 useEffect(()=>{const timing={duration:850,easing:ease};x.set(still?rect.x:withTiming(rect.x,timing));y.set(still?rect.y:withTiming(rect.y,timing));w.set(still?rect.w:withTiming(rect.w,timing));h.set(still?rect.h:withTiming(rect.h,timing));arrival.set(still?1:withDelay(index*105,withTiming(1,{duration:1000,easing:ease})));return()=>{[x,y,w,h,arrival].forEach(cancelAnimation);};},[rect.x,rect.y,rect.w,rect.h,index,still,x,y,w,h,arrival]);
 const style=useAnimatedStyle(()=>({left:`${x.get()*100}%`,top:`${y.get()*100}%`,width:`${w.get()*100}%`,height:`${h.get()*100}%`,opacity:arrival.get(),transform:[{translateX:(1-arrival.get())*(index%2?24:-24)},{translateY:(1-arrival.get())*36},{scale:.92+.08*arrival.get()},{rotate:`${(1-arrival.get())*(index%2?5:-5)}deg`}]}));
 return <Animated.View testID="assembled-cover-tile" style={[{position:'absolute',overflow:'hidden'},style]}><Image source={{uri}} contentFit="cover" transition={180} style={StyleSheet.absoluteFill}/></Animated.View>;
}
export function AssembledCover({uris,animate=false}:{uris:string[];animate?:boolean}){
 const unique=[...new Set(uris)].slice(0,4),n=unique.length;
 const rects:TileRect[]=n===1?[{x:0,y:0,w:1,h:1}]:n===2?[{x:0,y:0,w:.5,h:1},{x:.5,y:0,w:.5,h:1}]:n===3?[{x:0,y:0,w:.5,h:1},{x:.5,y:0,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}]:[{x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}];
 return <View testID="assembled-cover" style={[StyleSheet.absoluteFill,{overflow:'hidden',backgroundColor:'#000'}]}>{unique.map((uri,i)=><Tile key={uri} uri={uri} rect={rects[i]} index={i} animate={animate}/>)}</View>;
}
