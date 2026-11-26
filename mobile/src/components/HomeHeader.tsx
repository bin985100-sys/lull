import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme/state';
import { Cover, IconBtn, T } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { F } from '@/theme/tokens';

export function HomeHeader(){
 const {colors:C}=useTheme(),account=useLibrary(s=>s.account);
 return <View style={{gap:18,marginBottom:24}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Мой профиль и настройки" onPress={()=>router.push('/settings')} style={{width:44,height:44,borderRadius:22,overflow:'hidden',backgroundColor:C.s2,alignItems:'center',justifyContent:'center'}}>{account.avatar?<Cover uri={account.avatar} size={44} radius={22}/>:<Icon name="user" size={24} color={C.sky}/>}</Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Открыть поиск" onPress={()=>router.push('/search')} style={{flex:1,minWidth:0,height:48,borderRadius:24,backgroundColor:C.s2,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:15}}><Icon name="search" size={21} color={C.tx3}/><T numberOfLines={1} style={{flex:1,fontSize:14,color:C.tx3}}>Что послушаем?</T><Icon name="nowBars" size={20} color={C.sky}/></Pressable>
  </View>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{paddingHorizontal:19,paddingVertical:10,borderRadius:22,backgroundColor:C.tx}}><T style={{fontSize:13,fontFamily:F.bold,color:C.inverse}}>Для тебя</T></View><Pressable accessibilityRole="button" onPress={()=>router.push('/discover')} style={{padding:10}}><T style={{fontSize:13,color:C.tx2}}>Открытия</T></Pressable><View style={{flex:1}}/><IconBtn name="clock" size={40} label="История" ghost onPress={()=>router.push('/history')}/></View>
 </View>;
}
