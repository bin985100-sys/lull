import { useEffect, useId, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppearance } from '@/theme/state';
import { WaveArt } from './WaveArt';
import { BRAND_INNER, BRAND_LINK_CUTOUT, BRAND_OUTER } from './brand-geometry';

// The same local, silent caustics loop as My Wave, never a remote video.
const PALETTES=[
 {deep:'#10282b',main:'#27a797',accent:'#7897d5',light:'#b7ded9'},
 {deep:'#291a35',main:'#9c548d',accent:'#6d8ac4',light:'#dfb5d9'},
 {deep:'#302516',main:'#c28a49',accent:'#a89a62',light:'#ead4ae'},
 {deep:'#182333',main:'#476cae',accent:'#62b1ae',light:'#bdd6ea'},
];
export function LiveBrandMark({size,active}:{size:number;active:boolean}){
 const id=useId().replace(/[^\w-]/g,''),reduced=useReducedMotion(),motion=useAppearance(s=>s.motion);
 const [foreground,setForeground]=useState(AppState.currentState==='active'),[palette,setPalette]=useState(0);
 const live=active&&foreground&&motion&&!reduced;
 const pad=1440/Math.max(1,size);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>sub.remove();},[]);
 useEffect(()=>{if(!live)return;const timer=setInterval(()=>setPalette(p=>(p+1)%PALETTES.length),8500);return()=>clearInterval(timer);},[live]);
 return <View testID="live-brand-mark" style={{width:size,height:size,overflow:'hidden',backgroundColor:'#000'}} accessible={false}>
  <View style={[StyleSheet.absoluteFill,{margin:.5}]}><WaveArt animate={live} colors={PALETTES[palette]} colorDuration={2400}/></View>
  {/* Paint black past the video edges: a fractional-size SVG must not expose a seam. */}
  <Svg width={size+4} height={size+4} viewBox={`${190-pad} ${150-pad} ${720+pad*2} ${720+pad*2}`} style={{position:'absolute',left:-2,top:-2}}>
   <Defs><Mask id={id+'-outside'} x={100} y={60} width={900} height={900} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" maskType="luminance">
    <Rect x={100} y={60} width={900} height={900} fill="#fff"/>
    {BRAND_OUTER.map((r,i)=><Rect key={'outer'+i} {...r} fill="#000"/>)}
    {BRAND_INNER.map((r,i)=><Rect key={'inner'+i} {...r} fill="#fff"/>)}
    <Path d={BRAND_LINK_CUTOUT} fill="#fff"/>
   </Mask></Defs>
   <Rect x={100} y={60} width={900} height={900} fill="#000" mask={`url(#${id}-outside)`}/>
  </Svg>
 </View>;
}
