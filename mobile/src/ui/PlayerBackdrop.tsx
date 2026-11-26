import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useAppearance, useTheme } from '@/theme/state';
import { coverBackdrop } from '@/theme/cover-backdrop';
import { type CoverColors } from '@/theme/cover-colors';

const cache=new Map<string,Promise<string>>();
/** The artwork itself flows slowly behind the player. All motion stays on the UI thread. */
export function PlayerBackdrop({uri,colors,active}:{uri?:string;colors:CoverColors;active:boolean}){
 const [texture,setTexture]=useState<{uri:string;data:string}|null>(null),[foreground,setForeground]=useState(AppState.currentState==='active');
 const {dark,colors:C}=useTheme(),motion=useAppearance(s=>s.motion),reduced=useReducedMotion(),phase=useSharedValue(0);
 useEffect(()=>{if(!uri)return;let live=true;let job=cache.get(uri);if(!job){job=coverBackdrop(uri).catch(e=>{cache.delete(uri);throw e;});cache.set(uri,job);if(cache.size>20)cache.delete(cache.keys().next().value!);}void job.then(data=>{if(live)setTexture({uri,data});},()=>{});return()=>{live=false;};},[uri]);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>sub.remove();},[]);
 useEffect(()=>{cancelAnimation(phase);if(active&&foreground&&motion&&!reduced)phase.set(withRepeat(withTiming(1,{duration:12500,easing:Easing.inOut(Easing.sin)}),-1,true));return()=>cancelAnimation(phase);},[active,foreground,motion,reduced,phase]);
 const a=useAnimatedStyle(()=>({transform:[{translateX:-35+phase.get()*70},{translateY:20-phase.get()*40},{rotate:`${-12+phase.get()*24}deg`},{scale:1.45+phase.get()*.15}]}));
 const b=useAnimatedStyle(()=>({transform:[{translateX:35-phase.get()*70},{translateY:-30+phase.get()*60},{rotate:`${18-phase.get()*36}deg`},{scale:1.7-phase.get()*.15}]}));
 const source=texture&&texture.uri===uri?{uri:texture.data}:undefined;
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{overflow:'hidden',backgroundColor:colors.deep}]}>
  <LinearGradient colors={[colors.main,colors.deep,colors.accent]} style={StyleSheet.absoluteFill}/>
  <Animated.View style={[StyleSheet.absoluteFill,a]}>{source?<Image source={source} contentFit="cover" blurRadius={18} transition={900} style={[StyleSheet.absoluteFill,{opacity:.72}]}/>:null}</Animated.View>
  <Animated.View style={[StyleSheet.absoluteFill,b]}><Image source={require('../../assets/motion/caustics.jpg')} contentFit="cover" style={[StyleSheet.absoluteFill,{opacity:.18,mixBlendMode:'screen'}]}/></Animated.View>
  <LinearGradient colors={dark?['rgba(0,0,0,.44)','rgba(0,0,0,.50)','rgba(0,0,0,.72)']:[C.bg+'cc',C.bg+'aa',C.bg+'ee']} style={StyleSheet.absoluteFill}/>
 </View>;
}

