import { useEffect, useRef } from 'react';
import { PixelRatio, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useAppearance, useTheme } from '@/theme/state';
import { NavGlyph } from './NavGlyph';

type Name='listen'|'wave'|'search'|'collection';
function LibraryTile({index,size,cycle,selected,color,muted}:{index:number;size:number;cycle:SharedValue<number>;selected:SharedValue<number>;color:string;muted:string}){
 const style=useAnimatedStyle(()=>{const p=cycle.get(),angle=(-135+index*90+p*90)*Math.PI/180;return {transform:[{translateX:size*.5+Math.cos(angle)*size*.32-size*.15},{translateY:size*.5+Math.sin(angle)*size*.32-size*.15}]};});
 const fill=useAnimatedStyle(()=>({opacity:Math.max(selected.get(),Math.sin((cycle.get()%1)*Math.PI))}));
 return <Animated.View style={[{position:'absolute',left:0,top:0,width:size*.3,height:size*.3},style]}><Svg width="100%" height="100%" viewBox="0 0 10 10"><Rect x={1} y={1} width={8} height={8} rx={2} fill="none" stroke={muted} strokeWidth={1.6}/></Svg><Animated.View style={[{position:'absolute',inset:0},fill]}><Svg width="100%" height="100%" viewBox="0 0 10 10"><Rect x={.3} y={.3} width={9.4} height={9.4} rx={2.4} fill={color}/></Svg></Animated.View></Animated.View>;
}
function WaveLine({color,filled,index,cycle,size}:{color:string;filled:boolean;index:number;cycle:SharedValue<number>;size:number}){
 const base=[11,22,28,19,12][index],unit=size/32;
 const style=useAnimatedStyle(()=>{const p=cycle.get()%1,t=Math.max(0,Math.min(1,(p-index*.08)/.6)),crest=Math.sin(t*Math.PI)**2,h=base+(base>23?-9:7)*crest;return {opacity:.72+.28*crest,transform:[{scaleY:h/base}]};});
 return <Animated.View style={[{position:'absolute',left:(2+index*5.7)*unit,top:(32-base)/2*unit,width:(filled?4:3.2)*unit,height:base*unit,borderRadius:2*unit,backgroundColor:color},style]}/>;
}
function WaveGlyph({color,filled,size,cycle}:{color:string;filled:boolean;size:number;cycle:SharedValue<number>}){
 return <View style={{width:size,height:size}}>{[0,1,2,3,4].map(i=><WaveLine key={i} index={i} color={color} filled={filled} cycle={cycle} size={size}/>)}</View>;
}
function HomeGlyph({color,filled,size,cycle}:{color:string;filled:boolean;size:number;cycle:SharedValue<number>}){
 const roofHeight=PixelRatio.roundToNearestPixel(size*.47);
 const roof=useAnimatedStyle(()=>{const p=cycle.get()%1,open=Math.sin(p*Math.PI)**2;return {transform:[{translateY:-size*.085*open},{rotate:`${-10*open}deg`}]};});
 return <View style={{width:size,height:size}}>
  {/* Both clipped pieces use the original asset, preserving its exact resting silhouette. */}
  <View style={{position:'absolute',left:0,right:0,top:roofHeight,bottom:0,overflow:'hidden'}}><View style={{position:'absolute',left:0,top:-roofHeight,width:size,height:size}}><NavGlyph name="listen" filled={filled} color={color} size={size}/></View></View>
  <Animated.View testID="nav-home-roof" style={[{position:'absolute',left:0,top:0,width:size,height:roofHeight,overflow:'hidden'},roof]}><View style={{position:'absolute',left:0,top:0,width:size,height:size}}><NavGlyph name="listen" filled={filled} color={color} size={size}/></View></Animated.View>
 </View>;
}
function SearchGlyph({color,filled,size}:{color:string;filled:boolean;size:number}){
 return <Svg width={size} height={size} viewBox="0 0 32 32"><Circle cx={13.5} cy={13.5} r={9} fill={filled?color:'none'} stroke={color} strokeWidth={2.8}/><Path d="M21 21L28 28" stroke={color} strokeWidth={3.4} strokeLinecap="round"/></Svg>;
}
export function AnimatedNavIcon({name,active,pulse=0,size=32}:{name:Name;active:boolean;pulse?:number;size?:number}){
 const {colors:C}=useTheme(),reduced=useReducedMotion(),motion=useAppearance(s=>s.motion),cycle=useSharedValue(0),selected=useSharedValue(active?1:0),turns=useRef(0),previous=useRef({active,pulse}),lastTap=useRef(0);
 useEffect(()=>{
  const tap=pulse!==previous.current.pulse,activated=active&&!previous.current.active,now=Date.now();
  if(reduced||!motion){cancelAnimation(cycle);cycle.set(Math.ceil(cycle.get()));turns.current=Math.ceil(cycle.get());selected.set(active?1:0);}
  else{selected.set(withTiming(active?1:0,{duration:320}));if(tap||activated&&now-lastTap.current>900){if(tap)lastTap.current=now;cycle.set(withTiming(++turns.current,{duration:name==='wave'?1050:name==='search'?860:720,easing:name==='wave'?Easing.linear:name==='collection'?Easing.bezier(.2,.72,.2,1):Easing.bezier(.3,.05,.2,1)}));}}
  previous.current={active,pulse};
 },[active,pulse,reduced,motion,name,cycle,selected]);
 useEffect(()=>()=>{cancelAnimation(cycle);cancelAnimation(selected);},[cycle,selected]);
 const style=useAnimatedStyle(()=>({transform:name==='search'?[{perspective:size*7},{rotateY:`${-cycle.get()*360}deg`}]:[{translateY:0}]}));
 const white=useAnimatedStyle(()=>({opacity:Math.max(selected.get(),Math.sin((cycle.get()%1)*Math.PI))}));
 const gray=useAnimatedStyle(()=>({opacity:1-Math.max(selected.get(),Math.sin((cycle.get()%1)*Math.PI))}));
 return <View testID={`nav-icon-${name}`} style={{width:size,height:size}} pointerEvents="none" accessibilityElementsHidden>
  {name==='collection'?Array.from({length:4},(_,i)=><LibraryTile key={i} index={i} size={size} cycle={cycle} selected={selected} color={C.tx} muted={C.tx3}/>):<Animated.View testID={`nav-motion-${name}`} style={[{width:size,height:size},style]}>
   <Animated.View style={[{position:'absolute',inset:0},gray]}>{name==='wave'?<WaveGlyph color={C.tx3} size={size} filled={false} cycle={cycle}/>:name==='search'?<SearchGlyph color={C.tx3} size={size} filled={false}/>:<HomeGlyph filled={false} color={C.tx3} size={size} cycle={cycle}/>}</Animated.View>
   <Animated.View style={[{position:'absolute',inset:0},white]}>{name==='wave'?<WaveGlyph color={C.tx} size={size} filled cycle={cycle}/>:name==='search'?<SearchGlyph color={C.tx} size={size} filled/>:<HomeGlyph filled color={C.tx} size={size} cycle={cycle}/>}</Animated.View>
  </Animated.View>}
 </View>;
}
