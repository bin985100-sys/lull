import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useLayout } from '@/ui/layout';
import { useData } from '@/api/useData';
import { getMix, MIXES, useMixSeed } from '@/api/mixes';
import { lull } from '@/api/lull';
import { useLibrary } from '@/store/library';
import { F } from '@/theme/tokens';
import { ListSkeleton, Offline, Press, Screen, SectionHead, T } from '@/ui/kit';
import { ArtistRail, CardRail, Sections } from './Cards';
import { HomeHeader } from './HomeHeader';
import { WaveHero } from './WaveHero';
import { WaveArt } from '@/ui/WaveArt';
import { TrackRow } from './TrackRow';
import { Insights } from './Insights';

export default function HomeFeed(){
 const layout=useLayout(),[waveVisible,setWaveVisible]=useState(true);
 const history=useLibrary(s=>s.history),liked=useLibrary(s=>s.liked);
 const artists=useLibrary(s=>s.favArtists);
 useMixSeed(s=>s.n);const mix=getMix('foryou');
 const personal=useData('mix:'+mix.id,mix.load),next=useData('mix:recommended:'+(history[0]?.track.id??'new'),MIXES.recommended.load);
 const charts=useData('charts',s=>lull.charts(s)),home=useData('home',s=>lull.home(undefined,s));
 const favorites=liked.length?liked.slice(0,12):personal.data?.slice(0,8)??[];
 const releases=charts.data?.filter(s=>s.layout==='cards'&&s.items.length)??[];
 const shelves=home.data?.filter(s=>s.layout==='cards'&&s.items.length)??[];
 return <Screen scrollEventThrottle={160} onScroll={e=>setWaveVisible(e.nativeEvent.contentOffset.y<640)}>
  <View style={{gap:28}}>
   <WaveHero fallback={personal.data?.[0]} header={<HomeHeader/>} visible={waveVisible}/>
   <View><SectionHead title={liked.length?'Твои любимые':'Попадание в твой ритм'} more={liked.length?'Все':'Обновить'} onMore={()=>liked.length?router.push('/favorites'):useMixSeed.setState(s=>({n:s.n+1}))}/>
    {favorites.length?<CardRail items={favorites.map(t=>({kind:'album',id:t.id,title:t.title,subtitle:t.artist,image:t.artwork,track:t}))}/>:personal.error?<Offline onRetry={personal.reload}/>:<ListSkeleton n={2}/>}</View>
   <MoodTiles/>
   {artists.length?<View><SectionHead title="Те, кого ты любишь"/><ArtistRail items={artists.slice(0,10)}/></View>:null}
   {next.data?.length?<View><SectionHead title="Следом за твоим вкусом" more="Все" onMore={()=>router.push({pathname:'/mix/[id]',params:{id:'recommended'}})}/>{next.data.slice(0,4).map(t=><TrackRow key={t.id} track={t} list={next.data!} sub right="plus"/>)}</View>:null}
   <Sections sections={releases} max={2}/><Sections sections={shelves} max={2}/>
   {history.length>2?<View><SectionHead title="Хочется повторить" more="История" onMore={()=>router.push('/history')}/><CardRail items={Array.from(new Map(history.map(h=>[h.track.id,h.track])).values()).slice(0,10).map(t=>({kind:'track',id:t.id,title:t.title,subtitle:t.artist,image:t.artwork,track:t}))}/></View>:null}
   {layout.content>0?<Insights/>:null}
  </View>
 </Screen>;
}

export function MoodTiles(){
 const items=[{id:'focus',title:'В потоке',sub:'Сосредоточиться',tone:1},{id:'exhale',title:'Выдохнуть',sub:'Выдохнуть',tone:2},{id:'night',title:'После заката',sub:'Твой ночной саунд',tone:0}];
 return <View><SectionHead title="Музыка твоего момента" more="Всё" onMore={()=>router.push('/discover')}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12}}>{items.map((m,i)=><Press key={m.id} accessibilityRole="button" accessibilityLabel={m.sub} onPress={()=>router.push({pathname:'/mood/[id]',params:{id:m.id}})} style={{width:160,height:206,borderRadius:i===0?80:24,overflow:'hidden',backgroundColor:'#281933'}}><WaveArt tone={m.tone}/><View style={{flex:1,padding:18,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.2)'}}><T numberOfLines={2} style={{fontFamily:F.bold,fontSize:18,color:'#fff'}}>{m.title}</T></View></Press>)}</ScrollView></View>;
}
