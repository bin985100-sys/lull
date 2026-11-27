import { useRef, useState } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/state';
import { AnimatedNavIcon } from '@/ui/AnimatedNavIcon';
import { T, haptic } from '@/ui/kit';
import { F } from '@/theme/tokens';

export const NAV_ITEMS=[{key:'listen',label:'Главная',icon:'navListen'},{key:'wave',label:'Волна',icon:'waves'},{key:'search',label:'Поиск',icon:'search'},{key:'collection',label:'Моё',icon:'navCollection'}] as const;
export type NavKey=typeof NAV_ITEMS[number]['key'];
export function BottomNav({active,onSelect}:{active:NavKey;onSelect:(tab:NavKey)=>void}){
 const {colors:C}=useTheme(),[pulses,setPulses]=useState<Partial<Record<NavKey,number>>>({});
 const choose=(tab:NavKey)=>{haptic();setPulses(p=>({...p,[tab]:(p[tab]??0)+1}));onSelect(tab);};
 const targets=useRef<(React.ComponentRef<typeof Pressable>|null)[]>([]);
 return <View testID="bottom-navigation" accessibilityRole="tablist" accessibilityLabel="Основная навигация" style={{height:84,flexDirection:'row',paddingHorizontal:7}}>
  {NAV_ITEMS.map((item,index)=>{const on=active===item.key;return <Pressable key={item.key} ref={node=>{targets.current[index]=node;}} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:on}} aria-selected={on} onPress={()=>choose(item.key)} {...(Platform.OS==='web'?{tabIndex:on?0:-1,onKeyDown:(event:unknown)=>{const e=event as {key?:string;nativeEvent?:{key?:string};preventDefault():void},key=e.key??e.nativeEvent?.key;if(!['ArrowLeft','ArrowRight','Home','End'].includes(key??''))return;e.preventDefault();const next=key==='Home'?0:key==='End'?3:(index+(key==='ArrowRight'?1:3))%4;choose(NAV_ITEMS[next].key);targets.current[next]?.focus();}}:{})} style={[{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:6},Platform.OS==='web'?{outlineStyle:'none'} as unknown as ViewStyle:null]}>
   <AnimatedNavIcon name={item.key} active={on} pulse={pulses[item.key]??0}/>
   <T numberOfLines={1} style={{fontFamily:on?F.bold:F.medium,fontSize:11,lineHeight:14,color:on?C.tx:C.tx3}}>{item.label}</T>
  </Pressable>;})}
 </View>;
}
