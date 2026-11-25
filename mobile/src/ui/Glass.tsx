import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/state';

const nativeGlass=Platform.OS==='ios'&&isLiquidGlassAvailable()&&isGlassEffectAPIAvailable();
const ReducedTransparency=createContext(false);

/** Android uses a painted material: never capture the entire catalog for chrome. */
export function GlassScene({children,overlay}:{children:ReactNode;overlay:ReactNode}){
  const [reduced,setReduced]=useState(()=>Platform.OS==='web'&&typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-transparency: reduce)').matches);
  useEffect(()=>{
    if(Platform.OS==='web'){const media=window.matchMedia('(prefers-reduced-transparency: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);}
    if(Platform.OS!=='ios')return;
    let live=true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value=>{if(live)setReduced(value);}).catch(()=>{});
    const sub=AccessibilityInfo.addEventListener('reduceTransparencyChanged',setReduced);
    return ()=>{live=false;sub.remove();};
  },[]);
  return <ReducedTransparency.Provider value={reduced}>
    <View style={{flex:1}}><View style={{flex:1}}>{children}</View>{overlay}</View>
  </ReducedTransparency.Provider>;
}

type Props=ViewProps&{children?:ReactNode;radius?:number;interactive?:boolean;variant?:'regular'|'clear';blur?:boolean;style?:ViewStyle|ViewStyle[]};
/** Expensive live blur belongs to navigation/menus; ordinary controls use material only. */
export function Glass({children,radius=28,interactive=false,variant='regular',blur=true,style,...props}:Props){
  const {dark,colors:C}=useTheme();
  const reduced=useContext(ReducedTransparency);
  // Even RenderNode capture can stall a large image-heavy screen. Android keeps
  // the lens animation and material without any live backdrop or blurred shadow.
  const canBlur=Platform.OS!=='android';
  const opaque=reduced||!canBlur;
  const surface:ViewStyle={zIndex:0,borderRadius:radius,overflow:'hidden',borderWidth:StyleSheet.hairlineWidth,borderColor:C.glassLine,
    boxShadow:canBlur ? [{offsetX:0,offsetY:6,blurRadius:20,color:C.shadow}] : undefined,backgroundColor:opaque ? C.s1 : 'transparent'};
  const sheen=<LinearGradient pointerEvents="none" colors={dark ? ['rgba(255,255,255,.16)','rgba(255,255,255,.01)','rgba(255,255,255,.06)'] : ['rgba(255,255,255,.28)','rgba(255,255,255,.03)','rgba(255,255,255,.12)']}
    start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>;
  if(nativeGlass&&!reduced)return <GlassView {...props} style={[surface,style]} isInteractive={interactive} glassEffectStyle={variant} colorScheme={dark ? 'dark' : 'light'}>{children}</GlassView>;
  return <View {...props} style={[surface,style]}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill,{zIndex:-1}]}>
    {blur&&!opaque ? <BlurView pointerEvents="none" tint={dark ? 'dark' : 'light'} intensity={38} style={StyleSheet.absoluteFill}/> : null}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:opaque ? C.s1 : C.glass,opacity:opaque ? 1 : variant==='clear' ? .18 : blur ? .72 : 1}]}/>
    {!reduced&&sheen}</View>{children}
  </View>;
}
