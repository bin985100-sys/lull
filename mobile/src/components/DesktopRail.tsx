import { Glass } from '@/ui/Glass';
import { useTheme } from '@/theme/state';
import { usePathname } from 'expo-router';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resetTo } from '@/nav';

import { Icon, Logo, type IconName } from '@/ui/Icon';
import { T } from '@/ui/kit';
import { useLayout } from '@/ui/layout';
import { player } from '@/player/player';

const links: {path:'/listen'|'/discover'|'/collection';label:string;icon:IconName}[] = [
  {path:'/listen',label:'Слушать',icon:'navListen'},
  {path:'/discover',label:'Открывать',icon:'navDiscover'},
  {path:'/collection',label:'Коллекция',icon:'navCollection'},
];
export function DesktopRail() {
  const {colors:C}=useTheme();
  const layout=useLayout();
  const path=usePathname();
  const ins=useSafeAreaInsets();
  if (!layout.rail || ['/', '/welcome','/auth','/onboarding'].includes(path)) return null;
  return <View style={{position:'absolute',left:0,top:0,bottom:0,width:layout.rail,paddingTop:Math.max(32,ins.top+16),paddingHorizontal:16,borderRightWidth:1,borderColor:C.glassLine,backgroundColor:'transparent',gap:10}}>
    <Glass pointerEvents="none" radius={0} blur={false} style={{position:'absolute',left:0,right:0,top:0,bottom:0}}/>
    <View style={{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:10,marginBottom:32}}><Logo size={32}/><T v="h2">Lull</T></View>
    {links.map(item=>{const selected=path===item.path || item.path==='/collection' && (path.startsWith('/my/') || ['/favorites','/downloads','/import'].includes(path)) || item.path==='/discover' && path==='/search';return <Pressable key={item.path} accessibilityRole="tab" accessibilityState={{selected}} aria-selected={selected} onPress={()=>{player.expand(false);resetTo(item.path);}} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:54,padding:12,borderRadius:18,backgroundColor:selected ? C.s2 : 'transparent'}}>
      <Icon name={item.icon} size={24} color={selected ? C.sky : C.tx3}/><T style={{fontSize:14,color:selected ? C.sky : C.tx2}}>{item.label}</T>
    </Pressable>;})}
  </View>;
}
