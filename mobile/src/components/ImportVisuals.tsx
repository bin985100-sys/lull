import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, FadeInDown, ZoomIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { useAppearance, useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { T } from '@/ui/kit';
import { LiveBrandMark } from '@/ui/LiveBrandMark';
import logos from '@/ui/music-logos.json';

export const IMPORT_TINTS:Record<string,string>={'Spotify':'#7be5a2','Apple Music':'#f5a4b5','YouTube Music':'#e8a4a9','SoundCloud':'#efbc91','Deezer':'#b8a4eb','Яндекс Музыка':'#edcf83'};
export function ServiceMark({service,size=32}:{service:string;size?:number}){
 const key=Object.keys(logos).find(k=>k.toLowerCase()===service.toLowerCase()) as keyof typeof logos|undefined;
 return key?<SvgXml xml={logos[key]} width={size} height={size}/>:<Icon name="note" size={size} color="#fff"/>;
}
export function ImportIntro(){
 const focused=useIsFocused(),{colors:C}=useTheme();
 return <View style={{minHeight:144,flexDirection:'row',alignItems:'center',gap:20,paddingVertical:18}}><LiveBrandMark size={72} active={focused}/><View style={{flex:1,minWidth:0,gap:8}}><T style={{fontSize:24,lineHeight:31,fontFamily:F.bold,color:C.tx}}>Музыка остаётся твоей</T><T style={{fontSize:12,lineHeight:19,color:C.tx3}}>Собери любимые альбомы и плейлисты в Lull.</T></View></View>;
}
function Token({index,width,clock,uri}:{index:number;width:number;clock:SharedValue<number>;uri?:string}){
 const style=useAnimatedStyle(()=>{const p=(clock.get()+index/3)%1,wave=Math.sin(p*Math.PI);return {opacity:wave*.92,transform:[{translateX:54+Math.max(0,width-132)*p},{translateY:48-wave*12},{scale:.7+wave*.3},{rotate:`${(p-.5)*14}deg`}]};});
 return <Animated.View testID="import-flow-token" pointerEvents="none" style={[{position:'absolute',left:0,top:0,width:24,height:24,borderRadius:12,overflow:'hidden',backgroundColor:'#111'},style]}>{uri?<Image source={{uri}} contentFit="cover" style={StyleSheet.absoluteFill}/>:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Icon name="note" size={15} color="#fff"/></View>}</Animated.View>;
}
export type ImportVisualState={status:'reading'|'matching'|'done'|'error';service:string;name:string;done:number;total:number;matched:number;tracks?:{artwork?:string}[]};
export function ImportProgress({state,file=false,title,hint}:{state:ImportVisualState;file?:boolean;title?:string;hint?:string}){
 const {colors:C}=useTheme(),focused=useIsFocused(),reduced=useReducedMotion(),motion=useAppearance(s=>s.motion),[foreground,setForeground]=useState(AppState.currentState==='active'),[width,setWidth]=useState(320);
 const busy=state.status==='reading'||state.status==='matching',[settled,setSettled]=useState(false),flow=busy||state.status==='done'&&!settled,live=flow&&focused&&foreground&&!reduced&&motion,tint=IMPORT_TINTS[state.service]??'#a8c8eb';
 useEffect(()=>{if(busy)return;const timer=setTimeout(()=>setSettled(true),reduced?0:900);return()=>clearTimeout(timer);},[busy,reduced]);
 const clock=useSharedValue(0),progress=useSharedValue(0),ratio=state.total?Math.max(0,Math.min(1,state.done/state.total)):0;
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>sub.remove();},[]);
 useEffect(()=>{cancelAnimation(clock);if(live)clock.set(withRepeat(withTiming(clock.get()+1,{duration:2400,easing:Easing.linear}),-1,false));return()=>cancelAnimation(clock);},[live,clock]);
 useEffect(()=>{progress.set(reduced?ratio:withTiming(ratio,{duration:650,easing:Easing.bezier(.22,.8,.2,1)}));},[ratio,reduced,progress]);
 const bar=useAnimatedStyle(()=>state.total?{width:`${progress.get()*100}%`,transform:[{translateX:0}]}:{width:'24%',transform:[{translateX:Math.max(0,width*.76)*(clock.get()%1)}]});
 const artworks=[...new Set((state.tracks??[]).map(t=>t.artwork).filter((u):u is string=>!!u))].slice(0,6);
 const label=title??(state.status==='reading'?'Знакомимся с коллекцией':state.status==='matching'?'Находим твою музыку':state.status==='error'?'Перенос остановлен':file?'Музыка в коллекции':state.matched?'Готово к сохранению':'Совпадений пока нет');
 return <View testID="import-progress" onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{gap:20,paddingVertical:14}} accessibilityLiveRegion="polite">
  <View style={{height:140,justifyContent:'center'}}><LinearGradient pointerEvents="none" colors={[tint+'00',tint+'16',tint+'00']} start={{x:0,y:.5}} end={{x:1,y:.5}} style={{position:'absolute',left:0,right:0,top:30,height:80,borderRadius:40}}/>
   <View style={{position:'absolute',left:6,top:34,width:58,height:58,borderRadius:22,backgroundColor:C.bg,alignItems:'center',justifyContent:'center'}}><ServiceMark service={state.service} size={35}/></View>
   {flow?[0,1,2].map(i=><Token key={i} index={i} width={width} clock={clock} uri={artworks.length?artworks[i%artworks.length]:undefined}/>):null}
   <View style={{position:'absolute',right:6,top:30}}><LiveBrandMark size={66} active={live}/>{state.status==='done'?<Animated.View entering={reduced?undefined:ZoomIn.duration(600)} style={{position:'absolute',right:-2,bottom:-2,width:24,height:24,borderRadius:12,backgroundColor:'#a6e6c2',alignItems:'center',justifyContent:'center'}}><Icon name="check" size={15} color="#10241a"/></Animated.View>:null}</View>
  </View>
  <View style={{gap:9}}><T style={{color:tint,fontSize:12,fontFamily:F.semi}}>{state.service}{state.name?` · ${state.name}`:''}</T><Animated.View key={state.status} entering={reduced?undefined:FadeInDown.duration(550)}><T accessibilityRole="header" style={{fontSize:28,lineHeight:35,fontFamily:F.bold,color:C.tx,letterSpacing:-.7}}>{label}</T></Animated.View>
   {state.total>0?<T testID="import-real-count" style={{fontSize:16,color:C.tx2}}>{state.status==='done'&&file?'Добавлено':'Найдено'} {state.matched} из {state.total}</T>:null}
  </View>
  <View accessibilityRole="progressbar" accessibilityLabel="Прогресс переноса" accessibilityValue={state.total?{min:0,max:state.total,now:Math.min(state.done,state.total)}:{text:'Читаем коллекцию'}} style={{height:5,borderRadius:4,overflow:'hidden',backgroundColor:tint+'18'}}><Animated.View style={[{height:'100%',borderRadius:4,backgroundColor:tint},bar]}/></View>
  {hint?<T style={{fontSize:12,lineHeight:19,color:C.tx3}}>{hint}</T>:busy?<T style={{fontSize:12,lineHeight:19,color:C.tx3}}>{state.status==='reading'?'Читаем названия треков и исполнителей.':`Проверено ${state.done} из ${state.total}. Обложки появятся по мере нахождения треков.`}</T>:null}
  {!busy&&artworks.length?<View style={{flexDirection:'row',paddingLeft:2,paddingVertical:4}}>{artworks.slice(0,5).map((uri,i)=><Image key={uri} source={{uri}} contentFit="cover" style={{width:40,height:40,borderRadius:20,marginLeft:i?-10:0}}/>)}</View>:null}
 </View>;
}
