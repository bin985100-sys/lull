import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useAppearance, useTheme, type ThemeMode } from '@/theme/state';
import { Press, T } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { F } from '@/theme/tokens';
export function ThemeChoices(){
 const {colors:C}=useTheme(),mode=useAppearance(s=>s.mode),reduced=useReducedMotion();
 return <View accessibilityRole="radiogroup" accessibilityLabel="Тема приложения" style={{flexDirection:'row',gap:10,paddingVertical:14}}>{([['light','Светлая'],['dark','Тёмная'],['system','Системная']] as [ThemeMode,string][]).map(([value,label])=>{const on=mode===value,bg=value==='light'?'#f3f2ee':'#000000',ink=value==='light'?'#d4d2ce':'#f7f5f1';return <Press key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:on}} aria-checked={on} onPress={()=>useAppearance.getState().setMode(value)} outer={{flex:1,minWidth:0}} style={{alignItems:'center',gap:9}}>
  <View style={{width:'100%',height:96,borderRadius:24,padding:12,backgroundColor:bg,overflow:'hidden'}}>{value==='system'?<View style={{position:'absolute',top:0,right:0,bottom:0,width:'50%',backgroundColor:'#eeede9'}}/>:null}<LinearGradient colors={['#a9caff55','#d9b4ff22','transparent']} style={{position:'absolute',inset:0}}/><View style={{width:18,height:18,borderRadius:9,backgroundColor:ink,marginBottom:10}}/><View style={{height:5,width:'75%',borderRadius:4,backgroundColor:ink,marginBottom:5}}/><View style={{height:5,width:'45%',borderRadius:4,backgroundColor:ink}}/><View style={{position:'absolute',bottom:12,left:12,right:12,height:13,borderRadius:10,backgroundColor:ink}}/><Animated.View style={{position:'absolute',right:8,bottom:8,width:23,height:23,borderRadius:12,backgroundColor:C.tx,alignItems:'center',justifyContent:'center',opacity:on?1:0,transform:[{scale:on?1:.7}],transitionProperty:['transform','opacity'],transitionDuration:reduced?0:420}}><Icon name="check" size={14} color={C.inverse}/></Animated.View></View>
  <T numberOfLines={1} style={{fontSize:11,fontFamily:on?F.bold:F.medium,color:on?C.tx:C.tx3}}>{value==='system'?'Авто':label}</T>
 </Press>;})}</View>;
}
