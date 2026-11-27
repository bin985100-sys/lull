import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { AmbientMotion } from './AmbientMotion';
import { useMotionVisible } from './MotionScope';
import { usePlayer } from '@/player/player';
import { useAppearance } from '@/theme/state';
import { type CoverColors } from '@/theme/cover-colors';
import { moodColors } from '@/theme/liquid-texture';

const mask=require('../../assets/motion/caustics-hd-mask.png');
/** Lossless 720x1280 alpha artwork, recoloured once per cover. One native-driven layer: no Fabric frame commits, video decoder, live blur or screen capture. */
export function WaveArt({animate=false,drift=false,tone=0,colors,inPlayer=false,colorDuration=400}:{animate?:boolean;drift?:boolean;tone?:number;colors?:CoverColors;inPlayer?:boolean;colorDuration?:number}){
 const palette=colors??moodColors(tone),reduced=useReducedMotion(),motion=useAppearance(s=>s.motion),expanded=usePlayer(s=>s.expanded),focused=useIsFocused();
 const visible=useMotionVisible(),[foreground,setForeground]=useState(AppState.currentState==='active');
 const active=visible&&(animate||drift)&&motion&&!reduced&&focused&&foreground&&(!expanded||inPlayer);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>sub.remove();},[]);
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{backgroundColor:palette.deep,overflow:'hidden'}]}>
  <LinearGradient colors={[palette.main,palette.accent,palette.deep]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
  <AmbientMotion active={active} duration={14000+(Math.abs(tone)%4)*1700} mirror={!!(Math.abs(tone)%2)}><Image source={mask} tintColor={palette.light} contentFit="cover" transition={reduced?0:colorDuration} style={[StyleSheet.absoluteFill,{opacity:.64}]}/></AmbientMotion>
 </View>;
}
