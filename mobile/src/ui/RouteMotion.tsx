import { type ReactNode, useEffect, useRef } from 'react';
import { useIsFocused } from 'expo-router';
import { Platform } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { routeExit } from './route-motion-state';
export function routeScreenLayout({children,route}:{children:ReactNode;route?:{name:string}}){return <RouteMotion routeName={route?.name??''}>{children}</RouteMotion>;}
function RouteMotion({children,routeName}:{children:ReactNode;routeName:string}){
 const focused=useIsFocused(),customArrival=routeName==='onboarding',soft=['collection','wave','playlist/[id]','my/[id]','settings','prefs','import'].includes(routeName),reduced=useReducedMotion(),progress=useSharedValue(0),direction=useSharedValue(1),seen=useRef(false);
 useEffect(()=>{if(Platform.OS!=='web')return;if(focused){direction.set(seen.current?-1:1);seen.current=true;progress.set(reduced?1:withTiming(1,{duration:soft?460:360,easing:Easing.bezier(.22,.8,.2,1)}));}else progress.set(reduced?0:withTiming(0,{duration:soft?420:320}));},[focused,reduced,soft,progress,direction]);
 useEffect(()=>{
  if(Platform.OS!=='web'||!focused)return;
  let timer:ReturnType<typeof setTimeout>|undefined,pending:(()=>void)|undefined;
  const run=(action:()=>void)=>{if(reduced){action();return;}pending=action;if(timer)return;direction.set(soft?-1:1);const duration=soft?360:260;progress.set(withTiming(0,{duration,easing:Easing.bezier(.4,0,.2,1)}));timer=setTimeout(()=>{timer=undefined;const next=pending;pending=undefined;next?.();},duration);};
  const cancel=()=>{if(!timer&&!pending)return;if(timer)clearTimeout(timer);timer=undefined;pending=undefined;progress.set(reduced?1:withTiming(1,{duration:240,easing:Easing.bezier(.22,.8,.2,1)}));};
  routeExit.run=run;routeExit.cancel=cancel;return()=>{if(routeExit.run===run)routeExit.run=null;if(routeExit.cancel===cancel)routeExit.cancel=null;if(timer)clearTimeout(timer);};
 },[focused,reduced,soft,progress,direction]);
 const style=useAnimatedStyle(()=>({opacity:reduced||customArrival?1:(soft?.70:.74)+(soft?.30:.26)*progress.get(),transform:[{translateX:reduced||customArrival||soft?0:(1-progress.get())*18*direction.get()},{translateY:reduced||customArrival||!soft?0:(1-progress.get())*22*direction.get()}]}));
 return <Animated.View testID="route-motion" aria-hidden={!focused} accessibilityElementsHidden={!focused} importantForAccessibility={focused?'auto':'no-hide-descendants'} pointerEvents={focused?'auto':'none'} style={[{flex:1},Platform.OS==='web'?style:undefined]}>{children}</Animated.View>;
}
