import { Pressable, View } from 'react-native';
import { useAppearance, useTheme, type ThemeMode } from '@/theme/state';
import { T } from '@/ui/kit';
import { F } from '@/theme/tokens';
export function ThemeChoices(){
 const {colors:C}=useTheme(),mode=useAppearance(s=>s.mode);
 return <View accessibilityRole="radiogroup" accessibilityLabel="Тема приложения" style={{flexDirection:'row',gap:10,paddingVertical:14}}>{([['light','Светлая'],['dark','Тёмная'],['system','Системная']] as [ThemeMode,string][]).map(([value,label])=>{const on=mode===value,bg=value==='light'?'#f3f2ee':'#000000',ink=value==='light'?'#d4d2ce':'#f7f5f1';return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:on}} aria-checked={on} onPress={()=>useAppearance.getState().setMode(value)} style={{flex:1,minWidth:0,alignItems:'center',gap:9}}>
  <View style={{width:'100%',height:92,borderRadius:15,padding:10,backgroundColor:bg,borderWidth:on?2:1,borderColor:on?C.tx:C.line,overflow:'hidden'}}>{value==='system'?<View style={{position:'absolute',top:0,right:0,bottom:0,width:'50%',backgroundColor:'#eeede9'}}/>:null}<View style={{width:18,height:18,borderRadius:9,backgroundColor:ink,marginBottom:10}}/><View style={{height:6,width:'75%',borderRadius:4,backgroundColor:ink,marginBottom:5}}/><View style={{height:6,width:'45%',borderRadius:4,backgroundColor:ink}}/><View style={{position:'absolute',bottom:10,left:10,right:10,height:15,borderRadius:10,backgroundColor:ink}}/></View>
  <T numberOfLines={1} style={{fontSize:11,fontFamily:on?F.bold:F.medium,color:on?C.tx:C.tx3}}>{value==='system'?'Авто':label}</T>
 </Pressable>;})}</View>;
}
