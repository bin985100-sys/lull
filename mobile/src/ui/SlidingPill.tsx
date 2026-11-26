import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useAppearance } from '@/theme/state';
import { F } from '@/theme/tokens';

type Rect={x:number;y:number;width:number;height:number};
const ease=Easing.bezier(.32,0,.22,1);
export function useSlidingPill(){
 const x=useSharedValue(0),y=useSharedValue(0),width=useSharedValue(0),height=useSharedValue(0),stretch=useSharedValue(0),visible=useSharedValue(0),last=useRef<Rect|null>(null),reduced=useReducedMotion(),motion=useAppearance(s=>s.motion);
 const move=useCallback((rect:Rect)=>{
  if(rect.width<=0||rect.height<=0){visible.set(0);return;}
  const prev=last.current;if(prev&&!reduced&&motion&&Object.keys(rect).every(k=>Math.abs(rect[k as keyof Rect]-prev[k as keyof Rect])<.5)){visible.set(1);return;}
  const instant=!prev||reduced||!motion;last.current=rect;
  x.set(instant?rect.x:withTiming(rect.x,{duration:620,easing:ease}));y.set(instant?rect.y:withTiming(rect.y,{duration:620,easing:ease}));
  width.set(instant?rect.width:withTiming(rect.width,{duration:620,easing:ease}));height.set(instant?rect.height:withTiming(rect.height,{duration:620,easing:ease}));visible.set(1);
  stretch.set(instant?0:withSequence(withTiming(1,{duration:170,easing:ease}),withTiming(0,{duration:470,easing:ease})));
 },[x,y,width,height,stretch,visible,reduced,motion]);
 return useMemo(()=>({x,y,width,height,stretch,visible,move}),[x,y,width,height,stretch,visible,move]);
}
export function SlidingPill({motion,backgroundColor='transparent',borderColor,radius=999}:{motion:ReturnType<typeof useSlidingPill>;backgroundColor?:string;borderColor?:string;radius?:number}){
 const {x,y,width,height,stretch,visible}=motion;
 const style=useAnimatedStyle(()=>({opacity:visible.get(),width:width.get(),height:height.get(),transform:[{translateX:x.get()},{translateY:y.get()},{scaleX:1+stretch.get()*.025},{scaleY:1-stretch.get()*.025}]}));
 return <Animated.View testID="selection-pill" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{position:'absolute',left:0,top:0,borderRadius:radius,backgroundColor,borderColor,borderWidth:borderColor?.length?1:0},style]}/>;
}
export function usePillGroup(value:string){
 const pill=useSlidingPill(),[rects,setRects]=useState<Record<string,Rect>>({}),target=rects[value];
 useEffect(()=>{if(target)pill.move(target);},[pill,target]);
 const layout=(key:string)=>(event:LayoutChangeEvent)=>{const {x,y,width,height}=event.nativeEvent.layout;setRects(old=>{const before=old[key];return before&&before.x===x&&before.y===y&&before.width===width&&before.height===height?old:{...old,[key]:{x,y,width,height}};});};
 const select=(key:string)=>{if(rects[key])pill.move(rects[key]);};
 return {pill,layout,select};
}
export function SlidingPillLabel({motion,index,cell,activeColor,inactiveColor,size=14,children}:{motion:ReturnType<typeof useSlidingPill>;index:number;cell:number;activeColor:string;inactiveColor:string;size?:number;children:string}){
 const {x,width}=motion;
 const style=useAnimatedStyle(()=>{const distance=Math.abs(4+(index+.5)*cell-x.get()-width.get()/2),coverage=Math.max(0,Math.min(1,1-distance/Math.max(1,cell*.65)));return {color:interpolateColor(coverage,[0,1],[inactiveColor,activeColor])};});
 return <Animated.Text numberOfLines={1} style={[{fontFamily:F.bold,fontSize:size,lineHeight:20},style]}>{children}</Animated.Text>;
}
