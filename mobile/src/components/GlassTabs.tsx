import { useEffect, useRef } from 'react';
import { Platform, Pressable, type PressableProps, StyleSheet, View } from 'react-native';
import { GestureDetector, useHoverGesture, usePanGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { F } from '@/theme/tokens';
import { useTheme } from '@/theme/state';
import { Glass } from '@/ui/Glass';
import { Icon, type IconName } from '@/ui/Icon';
import { T } from '@/ui/kit';

export type TabKey='listen'|'discover'|'collection';
export const TABS:{key:TabKey;icon:IconName;label:string}[]=[
  {key:'listen',icon:'navListen',label:'Слушать'},
  {key:'discover',icon:'navDiscover',label:'Открывать'},
  {key:'collection',icon:'navCollection',label:'Коллекция'},
];
const spring={damping:19,stiffness:280,mass:.65};
const clamp=(value:number,lo:number,hi:number)=>{'worklet';return Math.max(lo,Math.min(hi,value));};

function TabContent({index,focus,pressure,small}:{index:number;focus:SharedValue<number>;pressure:SharedValue<number>;small:boolean}){
  const {colors:C}=useTheme();
  const active=useAnimatedStyle(()=>({opacity:clamp(1-Math.abs(focus.get()-index)*1.4,0,1)}));
  const inactive=useAnimatedStyle(()=>({opacity:1-clamp(1-Math.abs(focus.get()-index)*1.4,0,1)}));
  const magnify=useAnimatedStyle(()=>({transform:[{scale:1+.12*pressure.get()*clamp(1-Math.abs(focus.get()-index),0,1)}]}));
  const item=TABS[index];
  const content=(color:string)=><View style={{alignItems:'center',justifyContent:'center',gap:4,height:60,minWidth:0}}>
    <Icon name={item.icon} size={small ? 24 : 26} color={color}/>
    <T numberOfLines={1} style={{fontFamily:F.semi,fontSize:small ? 9 : 10.5,lineHeight:14,color,maxWidth:'100%'}}>{item.label}</T>
  </View>;
  return <Animated.View pointerEvents="none" style={[{width:'100%',height:60},magnify]}>
    <Animated.View style={[StyleSheet.absoluteFill,inactive]}>{content(C.tx2)}</Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill,active]}>{content(C.sky)}</Animated.View>
  </Animated.View>;
}

/** The lens previews the destination during a drag. Navigation commits once on release. */
export function GlassTabs({active,width,onSelect,enabled=true}:{active:TabKey;width:number;onSelect:(key:TabKey)=>void;enabled?:boolean}){
  const {dark}=useTheme();
  const reduced=useReducedMotion();
  const selected=Math.max(0,TABS.findIndex(t=>t.key===active));
  const focus=useSharedValue(selected),pressure=useSharedValue(0),stretch=useSharedValue(0),lift=useSharedValue(0),dragging=useSharedValue(false);
  const cell=Math.max(1,(width-8)/3);
  const preventTap=useRef(false);
  const markDrag=()=>{preventTap.current=true;};
  const commit=(index:number,canceled=false)=>{
    preventTap.current=true;
    if(!canceled)onSelect(TABS[Math.max(0,Math.min(2,index))].key);
    setTimeout(()=>{preventTap.current=false;},120);
  };
  useEffect(()=>{focus.set(reduced ? selected : withSpring(selected,spring));},[focus,selected,reduced]);
  const pan=usePanGesture({
    enabled,minDistance:3,maxPointers:1,cancelsJSResponder:true,
    onActivate:e=>{
      dragging.set(true);pressure.set(reduced ? 0 : withTiming(1,{duration:90}));
      focus.set(clamp((e.x-4)/cell-.5,-.16,2.16));scheduleOnRN(markDrag);
    },
    onUpdate:e=>{
      const raw=(e.x-4)/cell-.5;
      focus.set(raw<0 ? Math.max(-.2,raw*.18) : raw>2 ? Math.min(2.2,2+(raw-2)*.18) : raw);
      stretch.set(reduced ? 0 : Math.min(14,Math.abs(e.velocityX)*.009));
      lift.set(reduced ? 0 : clamp((e.y-32)*.14,-4,4));
    },
    onDeactivate:e=>{
      const next=e.canceled ? selected : Math.round(clamp(focus.get(),0,2));
      focus.set(reduced ? next : withSpring(next,spring));pressure.set(withTiming(0,{duration:180}));
      stretch.set(withSpring(0,spring));lift.set(withSpring(0,spring));dragging.set(false);
      scheduleOnRN(commit,next,e.canceled);
    },
    onFinalize:e=>{dragging.set(false);pressure.set(withTiming(0,{duration:180}));if(e.canceled)focus.set(reduced ? selected : withSpring(selected,spring));},
  });
  const hover=useHoverGesture({enabled:enabled&&Platform.OS==='web',
    onUpdate:e=>{if(!dragging.get()){focus.set(clamp((e.x-4)/cell-.5,0,2));pressure.set(reduced ? 0 : withTiming(.42,{duration:120}));}},
    onDeactivate:()=>{if(!dragging.get()){focus.set(reduced ? selected : withSpring(selected,spring));pressure.set(withTiming(0,{duration:180}));}},
  });
  const gesture=useSimultaneousGestures(pan,hover);
  const lens=useAnimatedStyle(()=>({width:cell-4+stretch.get(),transform:[{translateX:4+focus.get()*cell-stretch.get()/2},{translateY:lift.get()},{scale:1+.075*pressure.get()}]}));
  return <GestureDetector gesture={gesture} touchAction="none">
    <View accessibilityRole="tablist" accessibilityLabel="Основная навигация" style={{width,height:64}}>
      <Glass pointerEvents="none" radius={32} style={StyleSheet.absoluteFill}/>
      <Animated.View pointerEvents="none" style={[{position:'absolute',left:0,top:4,bottom:4,borderRadius:28,borderWidth:StyleSheet.hairlineWidth,
        borderColor:dark ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.98)',backgroundColor:dark ? 'rgba(255,255,255,.1)' : 'rgba(24,35,56,.055)',
        boxShadow:[{offsetX:0,offsetY:2,blurRadius:8,color:dark ? 'rgba(0,0,0,.16)' : 'rgba(25,43,72,.09)'}]},lens]}><Glass variant="clear" blur={false} radius={28} style={StyleSheet.absoluteFill}/></Animated.View>
      <View style={{flexDirection:'row',paddingHorizontal:4}}>
        {TABS.map((tab,index)=><Pressable key={tab.key} disabled={!enabled} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected:active===tab.key}} aria-selected={active===tab.key}
          {...(Platform.OS==='web' ? {tabIndex:active===tab.key ? 0 : -1,onKeyDown:(event:Parameters<NonNullable<PressableProps['onKeyDown']>>[0])=>{const key=(event as unknown as {key?:string}).key??(event.nativeEvent as {key?:string}).key;if(key==='ArrowRight'||key==='ArrowLeft'){event.preventDefault();onSelect(TABS[(selected+(key==='ArrowRight' ? 1 : 2))%3].key);}}} : {})}
          onPressIn={()=>{if(!dragging.get())preventTap.current=false;if(!preventTap.current){focus.set(reduced ? index : withTiming(index,{duration:120}));pressure.set(reduced ? 0 : withTiming(1,{duration:90}));}}}
          onPressOut={()=>{if(!dragging.get())pressure.set(withTiming(0,{duration:180}));}}
          onPress={()=>{if(!preventTap.current)onSelect(tab.key);}}
          style={{width:cell,height:64,alignItems:'center',justifyContent:'center',minWidth:0}}>
          <TabContent index={index} focus={focus} pressure={pressure} small={width<240}/>
        </Pressable>)}
      </View>
    </View>
  </GestureDetector>;
}
