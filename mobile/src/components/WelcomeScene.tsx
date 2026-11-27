import { type ReactNode, useState } from 'react';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { LiveBrandMark } from '@/ui/LiveBrandMark';
import { ICON_XML } from '@/ui/icon-xml';
import { Press, T } from '@/ui/kit';
import { F } from '@/theme/tokens';
import type { Provider } from '@/api/auth';

const ART_W=941,ART_H=1672,CROP_H=1120;
const GOOGLE_WHITE=ICON_XML.google.replace(/#[\da-f]{6}/gi,'#fff');

export function WelcomeScene({children,pending=false}:{children:ReactNode;pending?:boolean}){
 const {width,height,fontScale}=useWindowDimensions(),safe=useSafeAreaInsets(),focused=useIsFocused(),[controlsHeight,setControlsHeight]=useState(pending?260:104);
 const sideways=width>height*1.3&&height<600,bottom=Math.max(safe.bottom+24,height*.075),top=safe.top+8;
 const controlsWidth=sideways?Math.min(440,width*.44-safe.right-16):Math.min(440,width-safe.left-safe.right-32,width*(pending||fontScale>1.15?.86:width<350?.78:.65));
 const artWidth=Math.max(0,Math.min(620,sideways?width*.5-safe.left-16:width-safe.left-safe.right,(sideways?height-top-safe.bottom-8:height-top-bottom-controlsHeight-28)*ART_W/CROP_H));
 const artHeight=artWidth*CROP_H/ART_W,artLeft=sideways?safe.left+Math.max(0,(width*.5-safe.left-artWidth)/2):(width-artWidth)/2,artTop=sideways?Math.max(top,(height-artHeight)/2):Math.max(0,safe.top+8-artWidth*145/ART_W);
 const markSize=artWidth*.30;
 return <View testID="welcome-scene" style={{flex:1,backgroundColor:'#000'}}>
  {focused?<StatusBar style="light"/>:null}
  <View testID="welcome-artwork" pointerEvents="none" style={{position:'absolute',left:artLeft,top:artTop,width:artWidth,height:artHeight,overflow:'hidden'}}>
   <Image source={require('../../assets/onboarding/music-glass-reference.png')} draggable={false} accessibilityElementsHidden contentFit="fill" transition={250} style={{position:'absolute',left:0,top:0,width:artWidth,height:artWidth*ART_H/ART_W}}/>
   <View accessible accessibilityRole="image" accessibilityLabel="Логотип Lull" style={{position:'absolute',left:(artWidth-markSize)/2,top:artWidth*584/ART_W-markSize/2,width:markSize,height:markSize}}><LiveBrandMark size={markSize} active={focused}/></View>
  </View>
  <View testID="welcome-actions" onLayout={e=>{const next=e.nativeEvent.layout.height;setControlsHeight(old=>Math.abs(old-next)>1?next:old);}} style={{position:'absolute',width:controlsWidth,left:sideways?width*.54:(width-controlsWidth)/2,...(sideways?{top:Math.max(top,(height-controlsHeight)/2)}:{bottom}),gap:pending?12:0}}>{children}</View>
 </View>;
}
export function WelcomeProviderButton({provider,busy,disabled,onPress}:{provider:Provider;busy?:boolean;disabled?:boolean;onPress:()=>void}){
 const {width,height}=useWindowDimensions(),size=Math.max(14,Math.min(24,(width>height*1.3&&height<600?440:width)*.0468)),iconSize=Math.max(23,Math.min(34,width*.064));
 return <Press accessibilityRole="button" accessibilityLabel={`Продолжить с ${provider==='google'?'Google':'Telegram'}`} accessibilityState={{busy:!!busy,disabled:!!disabled}} disabled={disabled} onPress={onPress} scaleTo={.975} style={{minHeight:52,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:Math.max(14,Math.min(28,width*.054)),opacity:(disabled&&!busy)? .55:1}}>
  <View style={{width:iconSize,height:iconSize,alignItems:'center',justifyContent:'center'}}>{busy?<ActivityIndicator color="#fff"/>:<SvgXml xml={provider==='google'?GOOGLE_WHITE:ICON_XML.telegram} width={iconSize} height={iconSize} color="#fff"/>}</View>
  <T style={{flex:1,minWidth:0,fontFamily:F.medium,fontSize:size,lineHeight:size*1.3,letterSpacing:-.35,color:'#fff'}}>{`Продолжить с ${provider==='google'?'Google':'Telegram'}`}</T>
 </Press>;
}
