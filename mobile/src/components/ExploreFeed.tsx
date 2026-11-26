import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme/state';
import { useData } from '@/api/useData';
import { lull } from '@/api/lull';
import { Screen, T, SectionHead, ListSkeleton, Offline, Btn } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { MoodTiles } from './HomeFeed';
import { TrackRow } from './TrackRow';
import { CardRail } from './Cards';

export default function ExploreFeed(){
 const {colors:C}=useTheme(),charts=useData('charts',s=>lull.charts(s)),home=useData('home',s=>lull.home(undefined,s));
 const chart=charts.data?.find(s=>s.layout==='tracks'),tracks=chart?.items.flatMap(c=>c.track?[c.track]:[])??[];
 const shelves=[...charts.data??[],...home.data??[]].filter(s=>s.layout==='cards').slice(0,5);
 return <Screen><T style={{fontSize:11,letterSpacing:2,color:C.sky,marginTop:10}}>СЛЕДУЮЩЕЕ ОТКРЫТИЕ</T><T v="xl" style={{fontSize:37,marginTop:8}}>Новый звук.</T><T v="body" style={{marginTop:8,marginBottom:24}}>Выйди за границы привычного.</T>
  <Pressable accessibilityRole="button" accessibilityLabel="Открыть поиск" onPress={()=>router.push('/search')} style={{padding:17,borderRadius:22,backgroundColor:C.s1,flexDirection:'row',alignItems:'center',gap:12,marginBottom:30}}><Icon name="search" color={C.sky}/><T style={{fontSize:14,color:C.tx2}}>Трек, артист или альбом</T></Pressable>
  <View style={{gap:30}}><MoodTiles/><View><SectionHead title={chart?.title??'Сейчас слушают'} more="Всё" onMore={()=>router.push({pathname:'/mix/[id]',params:{id:'trending'}})}/>{charts.error?<Offline onRetry={charts.reload}/>:charts.loading?<ListSkeleton n={4}/>:tracks.slice(0,5).map(t=><TrackRow key={t.id} track={t} list={tracks} sub/>)}</View>{shelves.map((s,i)=><View key={s.title+i}><SectionHead title={s.title}/><CardRail items={s.items}/></View>)}<Btn label="Независимый звук" icon="sparkle" kind="dark" onPress={()=>router.push({pathname:'/mix/[id]',params:{id:'underground'}})}/></View>
 </Screen>;
}
