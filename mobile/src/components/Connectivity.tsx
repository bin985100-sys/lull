import { useEffect } from 'react';
import { View } from 'react-native';
import * as Network from 'expo-network';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { preloadLibraryScreens } from '@/nav/preload-library';
import { usePlayer } from '@/player/player';
import { useConnectivity, setConnectivity } from '@/store/connectivity';
import { useLayout } from '@/ui/layout';
import { T } from '@/ui/kit';

export function Connectivity(){
 const offline=useConnectivity(s=>s.offline),safe=useSafeAreaInsets(),layout=useLayout(),path=usePathname(),has=usePlayer(s=>s.index>=0),expanded=usePlayer(s=>s.expanded);
 useEffect(preloadLibraryScreens,[]);
 useEffect(()=>{let live=true,events=0;const subscription=Network.addNetworkStateListener(state=>{events++;if(live)setConnectivity(state);});void Network.getNetworkStateAsync().then(state=>{if(live&&!events)setConnectivity(state);},()=>{});return()=>{live=false;subscription.remove();};},[]);
 if(!offline)return null;
 const welcome=['/','/welcome','/auth','/onboarding'].includes(path);
 return <View testID="offline-badge" pointerEvents="none" accessibilityRole="alert" style={{position:'absolute',zIndex:90,left:expanded?20:layout.rail+layout.side+8,...(welcome?{top:safe.top+12}:{bottom:expanded?safe.bottom+16:Math.max(safe.bottom,16)+4+(layout.rail?72:has?168:84)-6}),flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:12,paddingVertical:7,borderRadius:18,backgroundColor:'#19141f'}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:'#bc9aff'}}/><T style={{fontSize:11,lineHeight:14,color:'#e7d7ff'}}>Нет интернета</T></View>;
}
