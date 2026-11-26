import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '@/theme/state';
import { NavGlyph } from '@/ui/NavGlyph';
import { T, haptic } from '@/ui/kit';
import { SlidingPill, useSlidingPill } from '@/ui/SlidingPill';
import { F } from '@/theme/tokens';

export const NAV_ITEMS=[{key:'listen',label:'Главная',icon:'navListen'},{key:'wave',label:'Волна',icon:'waves'},{key:'search',label:'Поиск',icon:'search'},{key:'collection',label:'Моё',icon:'navCollection'}] as const;
export type NavKey=typeof NAV_ITEMS[number]['key'];
export function BottomNav({active,onSelect}:{active:NavKey;onSelect:(tab:NavKey)=>void}){
 const {colors:C}=useTheme(),reduced=useReducedMotion();
 const [width,setWidth]=useState(0),pill=useSlidingPill(),cell=Math.max(0,(width-16)/4);
 useEffect(()=>pill.move({x:8+Math.max(0,NAV_ITEMS.findIndex(i=>i.key===active))*cell,y:8,width:cell,height:68}),[active,cell,pill]);
 const targets=useRef<(React.ComponentRef<typeof Pressable>|null)[]>([]);
 return <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist" accessibilityLabel="Основная навигация" style={{height:84,flexDirection:'row',borderRadius:42,backgroundColor:C.s1,borderWidth:.8,borderColor:C.line,paddingHorizontal:7}}>
  <SlidingPill motion={pill} borderColor={C.line}/>
  {NAV_ITEMS.map((item,index)=>{const on=active===item.key;return <Pressable key={item.key} ref={node=>{targets.current[index]=node;}} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:on}} aria-selected={on} onPress={()=>{haptic();pill.move({x:8+index*cell,y:8,width:cell,height:68});onSelect(item.key);}} {...(Platform.OS==='web'?{tabIndex:on?0:-1,onKeyDown:(event:unknown)=>{const e=event as {key?:string;nativeEvent?:{key?:string};preventDefault():void},key=e.key??e.nativeEvent?.key;if(!['ArrowLeft','ArrowRight','Home','End'].includes(key??''))return;e.preventDefault();const next=key==='Home'?0:key==='End'?3:(index+(key==='ArrowRight'?1:3))%4;pill.move({x:8+next*cell,y:8,width:cell,height:68});onSelect(NAV_ITEMS[next].key);targets.current[next]?.focus();}}:{})} style={{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:6}}>
   <Animated.View style={{width:32,height:32,transform:[{translateY:on?-2:0},{scale:on?1.04:1}],transitionProperty:'transform',transitionDuration:reduced?0:420}}><Animated.View style={{position:'absolute',opacity:on?0:1,transitionProperty:'opacity',transitionDuration:reduced?0:320}}><NavGlyph name={item.key} filled={false} size={32} color={C.tx3}/></Animated.View><Animated.View style={{position:'absolute',opacity:on?1:0,transitionProperty:'opacity',transitionDuration:reduced?0:320}}><NavGlyph name={item.key} filled size={32} color={C.tx}/></Animated.View></Animated.View>
   <T numberOfLines={1} style={{fontFamily:on?F.bold:F.medium,fontSize:11,lineHeight:14,color:on?C.tx:C.tx3}}>{item.label}</T>
  </Pressable>;})}
 </View>;
}
