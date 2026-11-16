import { BlurTargetView, BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, type ComponentRef, type ReactNode, type RefObject, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/state';

const nativeGlass=Platform.OS==='ios'&&isLiquidGlassAvailable()&&isGlassEffectAPIAvailable();
const Target=createContext<RefObject<ComponentRef<typeof View>|null>|null>(null);
const ReducedTransparency=createContext(false);

/** One shared Android capture target; chrome is rendered after dynamic content. */
export function GlassScene({children,overlay}:{children:ReactNode;overlay:ReactNode}){
  const ref=useRef<ComponentRef<typeof View>|null>(null);
  const [reduced,setReduced]=useState(()=>Platform.OS==='web'&&typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-transparency: reduce)').matches);
  useEffect(()=>{
    if(Platform.OS==='web'){const media=window.matchMedia('(prefers-reduced-transparency: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);}
    if(Platform.OS!=='ios')return;
    let live=true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value=>{if(live)setReduced(value);}).catch(()=>{});
    const sub=AccessibilityInfo.addEventListener('reduceTransparencyChanged',setReduced);
    return ()=>{live=false;sub.remove();};
  },[]);
  return <Target.Provider value={ref}><ReducedTransparency.Provider value={reduced}>
    <View style={{flex:1}}><BlurTargetView ref={ref} style={{flex:1}}>{children}</BlurTargetView>{overlay}</View>
  </ReducedTransparency.Provider></Target.Provider>;
}

type Props=ViewProps&{children?:ReactNode;radius?:number;interactive?:boolean;variant?:'regular'|'clear';blur?:boolean;style?:ViewStyle|ViewStyle[]};
/** Expensive live blur belongs to navigation/menus; ordinary controls use material only. */
export function Glass({children,radius=28,interactive=false,variant='regular',blur=true,style,...props}:Props){
  const {dark,colors:C}=useTheme();
  const target=useContext(Target),reduced=useContext(ReducedTransparency);
  const canBlur=Platform.OS!=='android'||Number(Platform.Version)>=31;
  const opaque=reduced||!canBlur;
  const surface:ViewStyle={borderRadius:radius,overflow:'hidden',borderWidth:StyleSheet.hairlineWidth,borderColor:C.glassLine,
    boxShadow:[{offsetX:0,offsetY:6,blurRadius:20,color:C.shadow}],backgroundColor:opaque ? C.s1 : 'transparent'};
  const sheen=<LinearGradient pointerEvents="none" colors={dark ? ['rgba(255,255,255,.16)','rgba(255,255,255,.01)','rgba(255,255,255,.06)'] : ['rgba(255,255,255,.68)','rgba(255,255,255,.03)','rgba(255,255,255,.3)']}
    start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>;
  if(nativeGlass&&!reduced)return <GlassView {...props} style={[surface,style]} isInteractive={interactive} glassEffectStyle={variant} colorScheme={dark ? 'dark' : 'light'}>{children}</GlassView>;
  return <View {...props} style={[surface,style]}>
    {blur&&!opaque ? <BlurView pointerEvents="none" blurTarget={target??undefined} blurMethod={target ? 'dimezisBlurViewSdk31Plus' : 'none'} tint={dark ? 'dark' : 'light'} intensity={38} style={StyleSheet.absoluteFill}/> : null}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:opaque ? C.s1 : C.glass,opacity:opaque ? 1 : variant==='clear' ? .18 : blur ? .72 : 1}]}/>
    {!reduced&&sheen}{children}
  </View>;
}
