import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import { AmbientMotion } from './AmbientMotion';
import { useAppearance, useTheme } from '@/theme/state';
import { coverBackdrop } from '@/theme/cover-backdrop';
import { type CoverColors } from '@/theme/cover-colors';
import { useConnectivity } from '@/store/connectivity';

const cache=new Map<string,Promise<{data:string;brightness:number}>>();
/** The artwork itself flows slowly behind the player. All motion stays on the UI thread. */
export function PlayerBackdrop({uri,colors,active,variant='player'}:{uri?:string;colors:CoverColors;active:boolean;variant?:'player'|'mini'|'sheet'}){
 const [texture,setTexture]=useState<{uri:string;data:string;brightness:number}|null>(null),[foreground,setForeground]=useState(AppState.currentState==='active');
 const {dark,colors:C}=useTheme(),motion=useAppearance(s=>s.motion),reduced=useReducedMotion();
 const epoch=useConnectivity(s=>s.epoch);
 useEffect(()=>{if(!uri)return;let live=true,attempt=0,timer:ReturnType<typeof setTimeout>|undefined;const load=()=>{let job=cache.get(uri);if(!job){job=coverBackdrop(uri).catch(e=>{if(cache.get(uri)===job)cache.delete(uri);throw e;});cache.set(uri,job);if(cache.size>20)cache.delete(cache.keys().next().value!);}void job.then(value=>{if(live)setTexture({uri,...value});},()=>{if(live&&attempt++===0)timer=setTimeout(load,1200);});};load();return()=>{live=false;clearTimeout(timer);};},[uri,epoch]);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>sub.remove();},[]);
 const veil=Math.min(.58,Math.max(.14,(texture&&texture.uri===uri?texture.brightness:.3)*.72));
 const source=texture&&texture.uri===uri?{uri:texture.data}:undefined;
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{overflow:'hidden',backgroundColor:colors.deep}]}>
  <LinearGradient colors={[colors.main,colors.deep,colors.accent]} style={StyleSheet.absoluteFill}/>
  <AmbientMotion active={active&&foreground&&motion&&!reduced} cover>{source?<Image source={source} contentFit={variant==='mini'?'fill':'cover'} transition={300} style={[StyleSheet.absoluteFill,{opacity:variant==='mini'?1:.72}]}/>:null}</AmbientMotion>
  {variant==='mini'?<LinearGradient colors={['#ffffff12','#ffffff00']} style={StyleSheet.absoluteFill}/>:null}
  <LinearGradient colors={variant==='mini'?[`rgba(0,0,0,${veil})`,`rgba(0,0,0,${veil})`,`rgba(0,0,0,${veil})`]:variant==='sheet'?['rgba(0,0,0,.38)','rgba(0,0,0,.65)','rgba(0,0,0,.82)']:dark?['rgba(0,0,0,.44)','rgba(0,0,0,.50)','rgba(0,0,0,.72)']:[C.bg+'cc',C.bg+'aa',C.bg+'ee']} start={{x:0,y:0}} end={variant==='mini'?{x:1,y:0}:{x:0,y:1}} style={StyleSheet.absoluteFill}/>
 </View>;
}

