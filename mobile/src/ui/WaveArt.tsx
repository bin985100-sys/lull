import { useCallback } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { usePlayer } from '@/player/player';
import { useAppearance } from '@/theme/state';
import { type CoverColors, fallbackColors } from '@/theme/cover-colors';

// Metro resolves these local assets; neither requires a network connection.
const source=require('../../assets/motion/caustics.mp4');
const poster=require('../../assets/motion/caustics.jpg');

function Caustics({inPlayer=false}:{inPlayer?:boolean}){
 const reduced=useReducedMotion(),motion=useAppearance(s=>s.motion),expanded=usePlayer(s=>s.expanded);
 const player=useVideoPlayer(source,p=>{p.muted=true;p.volume=0;p.loop=true;p.audioMixingMode='mixWithOthers';p.staysActiveInBackground=false;p.showNowPlayingNotification=false;p.timeUpdateEventInterval=0;});
 useFocusEffect(useCallback(()=>{
  const sync=()=>{try{if(!reduced&&motion&&(!expanded||inPlayer)&&AppState.currentState!=='background'&&AppState.currentState!=='inactive')player.play();else player.pause();}catch{/* The shared player may already be released during unmount. */}};
  sync();const sub=AppState.addEventListener('change',sync);return()=>{sub.remove();try{player.pause();}catch{/* Released by useVideoPlayer. */}};
 },[player,reduced,motion,expanded,inPlayer]));
 return <View style={StyleSheet.absoluteFill}><Image source={poster} contentFit="cover" style={StyleSheet.absoluteFill}/><VideoView player={player} nativeControls={false} contentFit="cover" surfaceType="textureView" useExoShutter={false} allowsPictureInPicture={false} playsInline style={[StyleSheet.absoluteFill,{width:'100%',height:'100%'}]}/></View>;
}

/** One silent 360p hardware-decoded loop. Cover colours are sampled once per track. */
export function WaveArt({animate=false,tone=0,colors,inPlayer=false}:{animate?:boolean;tone?:number;colors?:CoverColors;inPlayer?:boolean}){
 const palette=colors??fallbackColors('mood'+tone),reduced=useReducedMotion(),motion=useAppearance(s=>s.motion);
 const blend=Platform.OS==='android'&&Number(Platform.Version)<29?undefined:'luminosity';
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{backgroundColor:palette.deep,isolation:'isolate'}]}>
  <Animated.View key={palette.main+palette.accent} entering={reduced?undefined:FadeIn.duration(700)} style={StyleSheet.absoluteFill}><LinearGradient colors={[palette.main,palette.accent,palette.deep]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/></Animated.View>
  <View style={[StyleSheet.absoluteFill,{mixBlendMode:blend,opacity:blend?1:.6}]}>{animate&&!reduced&&motion?<Caustics inPlayer={inPlayer}/>:<Image source={poster} contentFit="cover" style={StyleSheet.absoluteFill}/>}</View>
  <View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(0,0,0,.12)'}]}/>
 </View>;
}
