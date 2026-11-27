import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { usePlayer } from '@/player/player';
import { MotionScope } from '@/ui/MotionScope';
import { useData } from '@/api/useData';
import { getMix, MIXES, useMixSeed } from '@/api/mixes';
import { lull } from '@/api/lull';
import { useLibrary } from '@/store/library';
import { F } from '@/theme/tokens';
import { ListSkeleton, Offline, Press, ScreenList, SectionHead, T } from '@/ui/kit';
import { ArtistRail, CardRail, Sections } from './Cards';
import { HomeHeader } from './HomeHeader';
import { WaveHero } from './WaveHero';
import { WaveArt } from '@/ui/WaveArt';
import { TrackRow } from './TrackRow';
import { ListeningHighlights } from './ListeningHighlights';

type FeedBlock={key:string;node:ReactNode};
const viewConfig={itemVisiblePercentThreshold:1};
const gap=()=> <View style={{height:28}}/>;
export default function HomeFeed(){
 const focused=useIsFocused(),expanded=usePlayer(s=>s.expanded);
 const [visible,setVisible]=useState<Set<string>>(()=>new Set(['wave'])),[scrolling,setScrolling]=useState(false);
 const onViewable=useCallback(({viewableItems}:{viewableItems:{item:FeedBlock}[]})=>{const keys=new Set(viewableItems.map(v=>v.item.key));setVisible(old=>old.size===keys.size&&[...keys].every(k=>old.has(k))?old:keys);},[]);
 const history=useLibrary(s=>s.history),liked=useLibrary(s=>s.liked),artists=useLibrary(s=>s.favArtists);
 useMixSeed(s=>s.n);const mix=getMix('foryou');
 const personal=useData('mix:'+mix.id,mix.load),next=useData('mix:recommended:'+(history[0]?.track.id??'new'),MIXES.recommended.load);
 const charts=useData('charts',s=>lull.charts(s)),home=useData('home',s=>lull.home(undefined,s));
 const blocks=useMemo(()=>{
  const favorites=liked.length?liked.slice(0,12):personal.data?.slice(0,8)??[];
  const rows:FeedBlock[]=[{key:'wave',node:<WaveHero fallback={personal.data?.[0]} candidates={personal.data} header={<HomeHeader/>}/>},
   {key:'favorites',node:<View><SectionHead title={liked.length?'Твои любимые':'Попадание в твой ритм'} more={liked.length?'Все':'Обновить'} onMore={()=>liked.length?router.push('/favorites'):useMixSeed.setState(s=>({n:s.n+1}))}/>{favorites.length?<CardRail items={favorites.map(t=>({kind:'album',id:t.id,title:t.title,subtitle:t.artist,image:t.artwork,track:t}))}/>:personal.error?<Offline onRetry={personal.reload}/>:<ListSkeleton n={2}/>}</View>},
   {key:'moods',node:<MoodTiles/>}];
  if(artists.length)rows.push({key:'artists',node:<View><SectionHead title="Те, кого ты любишь"/><ArtistRail items={artists.slice(0,10)}/></View>});
  if(next.data?.length)rows.push({key:'next',node:<View><SectionHead title="Следом за твоим вкусом" more="Все" onMore={()=>router.push({pathname:'/mix/[id]',params:{id:'recommended'}})}/>{next.data.slice(0,4).map(t=><TrackRow key={t.id} track={t} list={next.data!} sub right="plus"/>)}</View>});
  for(const [kind,sections] of [['releases',charts.data],['shelves',home.data]] as const){
   for(const [i,section] of (sections??[]).filter(s=>s.layout==='cards'&&s.items.length).slice(0,2).entries())rows.push({key:kind+i,node:<Sections sections={[{...section,items:section.items.slice(0,12)}]}/>});
  }
  if(history.length>2)rows.push({key:'history',node:<View><SectionHead title="Хочется повторить" more="История" onMore={()=>router.push('/history')}/><CardRail items={Array.from(new Map(history.map(h=>[h.track.id,h.track])).values()).slice(0,10).map(t=>({kind:'track',id:t.id,title:t.title,subtitle:t.artist,image:t.artwork,track:t}))}/></View>});
  rows.push({key:'highlights',node:<ListeningHighlights active ready/>});
  return rows;
 },[liked,artists,history,personal.data,personal.error,personal.reload,next.data,charts.data,home.data]);
 return <ScreenList testID="home-feed" data={blocks} keyExtractor={item=>item.key} initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} updateCellsBatchingPeriod={32} removeClippedSubviews={false}
  viewabilityConfig={viewConfig} onViewableItemsChanged={onViewable} ItemSeparatorComponent={gap}
  onScrollBeginDrag={()=>setScrolling(true)} onScrollEndDrag={()=>setScrolling(false)} onMomentumScrollBegin={()=>setScrolling(true)} onMomentumScrollEnd={()=>setScrolling(false)}
  renderItem={({item})=><MotionScope active={focused&&!expanded&&!scrolling&&visible.has(item.key)}><View testID={'home-block-'+item.key}>{item.node}</View></MotionScope>}/>;
}

export function MoodTiles(){
 const items=[{id:'focus',title:'В потоке',sub:'Сосредоточиться',tone:1},{id:'exhale',title:'Выдохнуть',sub:'Выдохнуть',tone:2},{id:'night',title:'После заката',sub:'Твой ночной саунд',tone:0}];
 return <View><SectionHead title="Музыка твоего момента" more="Всё" onMore={()=>router.push('/discover')}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12}}>{items.map((m,i)=><Press key={m.id} accessibilityRole="button" accessibilityLabel={m.sub} onPress={()=>router.push({pathname:'/mood/[id]',params:{id:m.id}})} style={{width:160,height:206,borderRadius:i===0?80:24,overflow:'hidden',backgroundColor:'#281933'}}><WaveArt tone={m.tone} drift/><View style={{flex:1,padding:18,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.2)'}}><T numberOfLines={2} style={{fontFamily:F.bold,fontSize:18,color:'#fff'}}>{m.title}</T></View></Press>)}</ScrollView></View>;
}
