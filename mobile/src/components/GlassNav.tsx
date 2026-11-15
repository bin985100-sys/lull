import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { DOCK, F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { haptic, T } from '@/ui/kit';
import { GlassLens, type GlassTarget } from './GlassSurface';

export type DockTab = 'listen' | 'discover' | 'collection';
const items: { key: DockTab; icon: IconName; label: string }[] = [
  {key:'listen',icon:'navListen',label:'Слушать'},
  {key:'discover',icon:'navDiscover',label:'Открывать'},
  {key:'collection',icon:'navCollection',label:'Коллекция'},
];
const spring = {damping:21,stiffness:260,mass:0.8};

function GlassTab({ item, selected, onSelect }: { item: typeof items[number]; selected: boolean; onSelect: (key: DockTab) => void }) {
  const reduced = useReducedMotion();
  const press = useSharedValue(1);
  const iconStyle=useAnimatedStyle(()=>({transform:[{scale:press.get()}]}));
  return <Pressable accessibilityRole="tab" accessibilityState={{selected}} aria-selected={selected} accessibilityLabel={item.label}
    onPress={()=>{haptic();onSelect(item.key);}}
    onPressIn={()=>press.set(reduced ? 1 : withTiming(.88,{duration:100}))}
    onPressOut={()=>press.set(reduced ? 1 : withSpring(1,spring))} style={styles.tab}>
    <Animated.View style={iconStyle}><Icon name={item.icon} size={27} color="#aab1c1"/></Animated.View>
    <T v="label" numberOfLines={1} style={{fontSize:11.5,fontFamily:selected ? F.bold : F.semi,color:selected ? '#f4fbff' : '#aab1c1'}}>{item.label}</T>
  </Pressable>;
}

export function GlassNav({ active, onSelect, blurTarget }: { active: DockTab | null; onSelect: (key: DockTab) => void; blurTarget?: GlassTarget }) {
  const [width,setWidth]=useState(0);
  const reduced=useReducedMotion();
  const index=items.findIndex(item=>item.key===active);
  const position=useSharedValue(Math.max(0,index));
  const stretch=useSharedValue(1);
  useEffect(()=>{
    if(index<0)return;
    position.set(reduced ? index : withSpring(index,spring));
    stretch.set(reduced ? 1 : withSpring(1,{...spring,velocity:1.6}));
  },[index,reduced,position,stretch]);
  const unit=Math.max(0,(width-12)/3);
  const lens=useAnimatedStyle(()=>({transform:[{translateX:position.get()*unit},{scaleX:stretch.get()}]}));
  const underLens=useAnimatedStyle(()=>({transform:[{translateX:-position.get()*unit-2}]}));
  return <View accessibilityRole="tablist" accessibilityLabel="Основная навигация" style={styles.nav}
    onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
    {width>0 && active ? <Animated.View pointerEvents="none" style={[styles.lens,{width:Math.max(0,unit-4)},lens]}>
      <GlassLens target={blurTarget}/>
      <LinearGradient colors={['rgba(255,255,255,0.18)','rgba(255,255,255,0.06)','rgba(255,255,255,0.10)']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
      <LinearGradient colors={['transparent','rgba(255,255,255,0.70)','rgba(255,255,255,0.40)','transparent']}
        start={{x:0,y:0}} end={{x:1,y:0}} style={styles.topLight}/>
      <LinearGradient colors={['transparent','rgba(255,255,255,0.16)','rgba(255,255,255,0.24)','transparent']}
        start={{x:0,y:0}} end={{x:1,y:0}} style={styles.bottomLight}/>
    </Animated.View> : null}
    {items.map(item=><GlassTab key={item.key} item={item} selected={item.key===active} onSelect={onSelect}/>)}
    {width>0 && active ? <Animated.View pointerEvents="none" accessible={false} aria-hidden style={[styles.mask,{width:Math.max(0,unit-4)},lens]}>
      <Animated.View style={[{position:'absolute',top:1,width:width-12,height:DOCK.compact-16,flexDirection:'row'},underLens]}>
        {items.map(item=><View key={item.key} style={styles.tab}>
          <Icon name={item.icon} size={27} color="#35baff"/>
          <T v="label" numberOfLines={1} style={{fontSize:11.5,color:'transparent'}}>{item.label}</T>
        </View>)}
      </Animated.View>
    </Animated.View> : null}
  </View>;
}

const styles=StyleSheet.create({
  nav:{position:'absolute',left:0,right:0,bottom:0,height:DOCK.compact,flexDirection:'row',paddingHorizontal:6,paddingVertical:8},
  tab:{flex:1,minWidth:0,minHeight:48,alignItems:'center',justifyContent:'center',gap:5},
  lens:{position:'absolute',left:8,top:7,bottom:7,borderRadius:999,overflow:'hidden',borderWidth:1,borderColor:'rgba(255,255,255,0.24)',backgroundColor:'rgba(255,255,255,0.05)'},
  mask:{position:'absolute',left:8,top:7,bottom:7,borderRadius:999,overflow:'hidden'},
  topLight:{position:'absolute',left:18,right:18,top:0,height:1.5},
  bottomLight:{position:'absolute',left:18,right:18,bottom:0,height:1},
});
