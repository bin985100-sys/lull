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
const spring={damping:21,stiffness:185,mass:1.05};
const clamp=(value:number,lo:number,hi:number)=>{'worklet';return Math.max(lo,Math.min(hi,value));};

function Glyph({index,cell,color,small}:{index:number;cell:number;color:string;small:boolean}){
 const item=TABS[index];
 return <View style={{width:cell,height:64,alignItems:'center',justifyContent:'center',gap:4,minWidth:0}}>
  <Icon name={item.icon} size={small?24:26} color={color}/>
  <T numberOfLines={1} style={{fontFamily:F.semi,fontSize:small?9:10.5,lineHeight:14,color,maxWidth:'100%'}}>{item.label}</T>
 </View>;
}
function Strip({cell,color,small}:{cell:number;color:string;small:boolean}){
 return <View style={{width:cell*3+8,height:64,paddingHorizontal:4,flexDirection:'row'}}>{TABS.map((tab,index)=><Glyph key={tab.key} index={index} cell={cell} color={color} small={small}/>)}</View>;
}
function RefractedGlyph({index,cell,focus,pressure,stretch,small}:{index:number;cell:number;focus:SharedValue<number>;pressure:SharedValue<number>;stretch:SharedValue<number>;small:boolean}){
 const {colors:C}=useTheme();
 const motion=useAnimatedStyle(()=>{
  const p=pressure.get(),magnification=1+.18*p,lensWidth=cell-4+stretch.get()+8*p;
  return {transform:[{translateX:lensWidth/2+(index-focus.get())*cell*magnification-cell/2},{translateY:-4+10*p},{scale:magnification}]};
 });
 return <Animated.View style={[{position:'absolute',left:0,top:0,width:cell,height:64},motion]}><Glyph index={index} cell={cell} color={C.sky} small={small}/></Animated.View>;
}

/** The lens previews the destination during a drag. Navigation commits once on release. */
export function GlassTabs({active,width,onSelect,enabled=true}:{active:TabKey;width:number;onSelect:(key:TabKey)=>void;enabled?:boolean}){
  const {dark,colors:C}=useTheme();
  const reduced=useReducedMotion();
  const selected=Math.max(0,TABS.findIndex(t=>t.key===active));
  const focus=useSharedValue(selected),pressure=useSharedValue(0),stretch=useSharedValue(0),lift=useSharedValue(0),dragging=useSharedValue(false);
  const cell=Math.max(1,(width-8)/3);
  const preventTap=useRef(false);
  const resetGuard=()=>{preventTap.current=false;};
  const markDrag=()=>{preventTap.current=true;};
  const commit=(index:number,canceled=false)=>{
    preventTap.current=true;
    if(!canceled)onSelect(TABS[Math.max(0,Math.min(2,index))].key);

  };
  useEffect(()=>{if(dragging.get())return;focus.set(reduced ? selected : withSpring(selected,spring));},[focus,selected,reduced,dragging]);
  const pan=usePanGesture({
    enabled,minDistance:3,maxPointers:1,cancelsJSResponder:true,
    onBegin:()=>scheduleOnRN(resetGuard),
    onActivate:e=>{
      dragging.set(true);pressure.set(reduced ? 0 : withTiming(1,{duration:160}));
      focus.set(clamp((e.x-4)/cell-.5,-.16,2.16));scheduleOnRN(markDrag);
    },
    onUpdate:e=>{
      const raw=(e.x-4)/cell-.5;
      focus.set(raw<0 ? Math.max(-.2,raw*.18) : raw>2 ? Math.min(2.2,2+(raw-2)*.18) : raw);
      stretch.set(reduced ? 0 : withTiming(Math.min(14,Math.abs(e.velocityX)*.009),{duration:140}));
      lift.set(reduced ? 0 : clamp((e.y-32)*.14,-4,4));
    },
    onDeactivate:e=>{
      const next=e.canceled ? selected : Math.round(clamp((e.x-4)/cell-.5,0,2));
      focus.set(reduced ? next : withSpring(next,spring));pressure.set(withTiming(0,{duration:300}));
      stretch.set(withSpring(0,spring));lift.set(withSpring(0,spring));dragging.set(false);
      scheduleOnRN(commit,next,e.canceled);
    },
    onFinalize:e=>{dragging.set(false);pressure.set(withTiming(0,{duration:300}));if(e.canceled)focus.set(reduced ? selected : withSpring(selected,spring));},
  });
  const hover=useHoverGesture({enabled:enabled&&Platform.OS==='web',
    onUpdate:e=>{if(!dragging.get()){focus.set(clamp((e.x-4)/cell-.5,0,2));pressure.set(reduced ? 0 : withTiming(.42,{duration:220}));}},
    onDeactivate:()=>{if(!dragging.get()){focus.set(reduced ? selected : withSpring(selected,spring));pressure.set(withTiming(0,{duration:300}));}},
  });
  const gesture=useSimultaneousGestures(pan,hover);
  const lens=useAnimatedStyle(()=>({backgroundColor:dark?'rgba(255,255,255,.065)':`rgba(42,52,68,${(.10-.06*pressure.get()).toFixed(3)})`,width:cell-4+stretch.get()+8*pressure.get(),height:56+20*pressure.get(),transform:[{translateX:6+focus.get()*cell-stretch.get()/2-4*pressure.get()},{translateY:4-10*pressure.get()+lift.get()}]}));
  const leftMask=useAnimatedStyle(()=>({width:clamp(6+focus.get()*cell-stretch.get()/2-4*pressure.get(),0,width)}));
  const rightMask=useAnimatedStyle(()=>{const edge=6+focus.get()*cell+cell-4+stretch.get()/2+4*pressure.get();return {left:clamp(edge,0,width),width:Math.max(0,width-edge)};});
  const rightStrip=useAnimatedStyle(()=>({transform:[{translateX:-(6+focus.get()*cell+cell-4+stretch.get()/2+4*pressure.get())}]}));
  return <GestureDetector gesture={gesture} touchAction="none">
    <View accessibilityRole="tablist" accessibilityLabel="Основная навигация" style={{width,height:64}}>
      <Glass pointerEvents="none" radius={32} style={StyleSheet.absoluteFill}/>
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
       <Animated.View style={[{position:'absolute',left:0,top:0,height:64,overflow:'hidden'},leftMask]}><Strip cell={cell} color={C.tx2} small={width<240}/></Animated.View>
       <Animated.View style={[{position:'absolute',top:0,height:64,overflow:'hidden'},rightMask]}><Animated.View style={rightStrip}><Strip cell={cell} color={C.tx2} small={width<240}/></Animated.View></Animated.View>
       <Animated.View style={[{position:'absolute',left:0,top:0,borderRadius:38,overflow:'hidden',borderWidth:StyleSheet.hairlineWidth,borderColor:dark?'rgba(255,255,255,.42)':'rgba(255,255,255,.95)',boxShadow:Platform.OS==='android' ? undefined : [{offsetX:0,offsetY:3,blurRadius:10,color:C.shadow}]},lens]}>
        <Glass variant="clear" blur={false} radius={38} style={StyleSheet.absoluteFill}/>
        {TABS.map((tab,index)=><RefractedGlyph key={tab.key} index={index} cell={cell} focus={focus} pressure={pressure} stretch={stretch} small={width<240}/>)}
        <View style={{position:'absolute',top:1,left:'22%',right:'22%',height:1,borderRadius:1,backgroundColor:dark?'rgba(255,255,255,.4)':'rgba(255,255,255,.9)'}}/>
        <View style={{position:'absolute',bottom:1,left:'22%',right:'22%',height:1,borderRadius:1,backgroundColor:dark?'rgba(255,255,255,.1)':'rgba(255,255,255,.45)'}}/>
       </Animated.View>
      </View>
      <View style={{flexDirection:'row',paddingHorizontal:4}}>
        {TABS.map((tab,index)=><Pressable key={tab.key} disabled={!enabled} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected:active===tab.key}} aria-selected={active===tab.key}
          {...(Platform.OS==='web' ? {tabIndex:active===tab.key ? 0 : -1,onKeyDown:(event:Parameters<NonNullable<PressableProps['onKeyDown']>>[0])=>{const key=(event as unknown as {key?:string}).key??(event.nativeEvent as {key?:string}).key;if(key==='ArrowRight'||key==='ArrowLeft'){event.preventDefault();onSelect(TABS[(selected+(key==='ArrowRight' ? 1 : 2))%3].key);}}} : {})}
          onPressIn={event=>{const input=event.nativeEvent as unknown as {type?:string;key?:string};if(Platform.OS==='web'&&/(?:up|end)$/.test(input.type??''))return;if(Platform.OS!=='web'||input.key)preventTap.current=false;if(!preventTap.current){focus.set(reduced ? index : withTiming(index,{duration:220}));pressure.set(reduced ? 0 : withTiming(1,{duration:160}));}}}
          onPressOut={()=>{if(!dragging.get())pressure.set(withTiming(0,{duration:300}));}}
          onFocus={resetGuard} onPress={()=>{if(preventTap.current){preventTap.current=false;return;}onSelect(tab.key);}}
          style={{width:cell,height:64,alignItems:'center',justifyContent:'center',minWidth:0}}>

        </Pressable>)}
      </View>
    </View>
  </GestureDetector>;
}
