import { useEffect } from 'react';
import { View } from 'react-native';
import { ListSkeleton, Offline, ScreenList, T, TopBar } from '@/ui/kit';
import { TrackRow } from '@/components/TrackRow';
import { loadDownloads, useDownloads } from '@/player/downloads';

export default function Downloads() {
  const tracks=useDownloads(s=>s.tracks),loading=useDownloads(s=>s.loading),error=useDownloads(s=>s.error);
  useEffect(()=>{void loadDownloads();},[]);
  return <ScreenList testID="downloads-list" data={tracks} keyExtractor={t=>(t.source||'audius')+':'+t.id}
    ListHeaderComponent={<View><TopBar/><T v="h1" style={{marginBottom:20}}>Скачанная музыка</T></View>}
    ListEmptyComponent={loading?<ListSkeleton n={5}/>:error?<Offline onRetry={()=>{void loadDownloads();}}/>:<T v="sub">Выбери «Скачать» в меню трека или плейлиста.</T>}
    renderItem={({item})=><TrackRow track={item} list={tracks} sub noWarm/>}
    initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} updateCellsBatchingPeriod={40}/>
}
