import { useTheme } from '@/theme/state';
import { router, usePathname } from 'expo-router';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { switchTab } from '@/nav';
import { Icon, Logo } from '@/ui/Icon';
import { T } from '@/ui/kit';
import { F } from '@/theme/tokens';
import { useLayout } from '@/ui/layout';
import { player } from '@/player/player';
import { NavGlyph } from '@/ui/NavGlyph';
import { NAV_ITEMS } from './BottomNav';

export function SideRail(){
 const {colors:C}=useTheme(),layout=useLayout(),path=usePathname(),ins=useSafeAreaInsets();
 if(!layout.rail||['/','/welcome','/auth','/onboarding'].includes(path))return null;
 return <View style={{position:'absolute',left:0,top:0,bottom:0,width:layout.rail,paddingTop:Math.max(32,ins.top+16),paddingHorizontal:16,borderRightWidth:1,borderColor:C.line,backgroundColor:C.bg,gap:8}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:10,marginBottom:42}}><Logo size={38}/><View><T v="h2">Lull</T><T style={{fontSize:8,letterSpacing:2,color:C.tx3}}>ТВОЙ РИТМ</T></View></View>
  <View accessibilityRole="tablist" accessibilityLabel="Основная навигация" style={{gap:7}}>{NAV_ITEMS.map(item=>{const selected=path===`/${item.key}`||item.key==='collection'&&(path.startsWith('/my/')||['/favorites','/downloads','/import'].includes(path));return <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}} aria-selected={selected} onPress={()=>{player.expand(false);switchTab(`/${item.key}` as '/listen'|'/wave'|'/search'|'/collection');}} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:52,padding:12,borderRadius:15,backgroundColor:selected?C.s1:'transparent'}}><NavGlyph name={item.key} filled={selected} color={selected?C.tx:C.tx3}/><T style={{fontSize:13,fontFamily:selected?F.bold:F.medium,color:selected?C.tx:C.tx2}}>{item.label}</T></Pressable>;})}</View>
  <View style={{height:1,backgroundColor:C.line,marginVertical:18}}/>
  <Pressable accessibilityRole="button" onPress={()=>router.push('/discover')} style={{flexDirection:'row',gap:12,padding:12,alignItems:'center'}}><Icon name="navDiscover" size={22} color={C.violet}/><T style={{fontSize:13}}>Открытия</T></Pressable>
  <Pressable accessibilityRole="button" onPress={()=>router.push('/favorites')} style={{flexDirection:'row',gap:12,padding:12,alignItems:'center'}}><Icon name="heart" size={22}/><T style={{fontSize:13}}>Любимое</T></Pressable>
  <View style={{flex:1}}/><Pressable accessibilityRole="button" onPress={()=>router.push('/settings')} style={{flexDirection:'row',gap:12,padding:12,marginBottom:24,alignItems:'center'}}><Icon name="gear" size={22} color={C.tx3}/><T style={{fontSize:13,color:C.tx2}}>Настройки</T></Pressable>
 </View>;
}
