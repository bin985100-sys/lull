import { useTheme } from '@/theme/state';
import { Image } from 'expo-image';
import { type ReactNode, useEffect, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { useLayout } from '@/ui/layout';

import type { Track } from '@/api/audius';
import { warm } from '@/api/lull';
import { currentTrack, player, usePlayer } from '@/player/player';

import { Btn, IconBtn, ListSkeleton, Offline, Screen, Skeleton, T, TopBar } from '@/ui/kit';
import { OfflineSaveButton } from './MusicActions';
import { TrackRow } from './TrackRow';
import { Icon,type IconName } from '@/ui/Icon';
import { Banner } from './Banner';
import { AssembledCover } from './AssembledCover';
import { CatalogIconButton, CatalogTopBar, CoverPlayButton, trackCountLabel } from './CatalogControls';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  title: string;
  sub?: ReactNode;
  cover?: { uri?: string; source?: any; collage?: (string | undefined)[]; wide?: boolean;icon?:IconName;accent?:string };
  tracks?: Track[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  right?: ReactNode;
  extraBtn?: ReactNode;
  below?: ReactNode;
  empty?: ReactNode;
  numbered?: boolean;
  sub2?: boolean;
  playlistId?: string;
  immersive?:boolean;
};
const EMPTY_TRACKS:Track[]=[];

export function CoverArt({ cover, size, radius = 22,assemble=false }: { cover?: Props['cover']; size: number | '100%'; radius?: number;assemble?:boolean }) {
  const {colors:C}=useTheme();
  const col = (cover?.collage || []).filter(Boolean) as string[];
  return (
    <View style={{ width: size, aspectRatio: 1, borderRadius: radius, overflow: 'hidden', backgroundColor: C.s2, alignSelf: 'center' }}>
      {cover?.icon ? <View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:(cover.accent || C.rose)+'22'}]}><Icon name={cover.icon} color={cover.accent} size={typeof size==='number' ? size*.42 : 80}/></View> : cover?.uri || cover?.source ? <Image source={cover.source ?? { uri: cover.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        : col.length ? (
          <AssembledCover uris={col} animate={assemble}/>
        ) : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="note" size={typeof size === 'number' ? size * 0.36 : 56} /></View>}
    </View>
  );
}

export function ListPage(p: Props) {
 return p.immersive?<ImmersiveListPage {...p}/>:<StandardListPage {...p}/>;
}
function StandardListPage(p:Props){
  const {colors:C}=useTheme();

  const layout=useLayout();
  const size = Math.min(270, layout.content * 0.7);
  const wide=layout.content>=680;
  const tracks = p.tracks ?? EMPTY_TRACKS;
  useEffect(() => { if (tracks.length) warm(tracks.slice(0, 2)); }, [tracks]);
  const playingHere = usePlayer((s) => s.playing && !!currentTrack(s) && tracks.some((t) => t.id === currentTrack(s)!.id));
  const disabled = !tracks.length;
  const header=(<View>
      <TopBar right={p.right} />
      <View style={{flexDirection:wide ? 'row' : 'column',alignItems:wide ? 'center' : 'stretch',gap:wide ? 28 : 0,backgroundColor:C.s1,padding:20,borderRadius:34,marginTop:16}}>
      <View style={{ marginTop: 4, marginBottom: 18, width:wide ? 270 : undefined }}>{p.cover?.wide ? (
        <Banner source={p.cover.source} label={p.title}/>
      ) : p.loading && !p.cover?.uri && !p.cover?.source ? <Skeleton h={size} w={size} r={34} style={{ alignSelf: 'center' }} /> : <CoverArt cover={p.cover} size={size} />}</View>
      <View style={{flex:wide ? 1 : undefined,minWidth:0}}>
      <T v="small" style={{color:C.sky,letterSpacing:1.6,marginBottom:8}}>ТВОЯ МУЗЫКА</T><T v="h1" accessibilityRole="header">{p.title}</T>
      {p.sub ? <View style={{ marginTop: 6 }}>{p.sub}</View> : null}<T v="small" style={{marginTop:8}}>{tracks.length} треков</T>
      <View style={{ flexDirection: 'row', flexWrap:'wrap', gap: 12, marginTop: 18 }}>
        <Btn label={playingHere ? 'Пауза' : 'Слушать'} icon="playpause" playing={playingHere} disabled={disabled} style={{ flex: 1,minWidth:layout.content<340?'100%':undefined }}
          onPress={() => (playingHere ? player.toggle() : player.play(tracks, undefined, { shuffle: false }))} />
        <IconBtn name="shuffle" label="Перемешать" size={58} iconSize={26} onPress={() => !disabled && player.play(tracks, undefined, { shuffle: true })} style={{ opacity: disabled ? 0.32 : 1 }} />
        {p.extraBtn}
      </View>
      {Platform.OS !== 'web' && tracks.length > 0 && <OfflineSaveButton tracks={tracks}/>}
      </View>
      </View>
      {p.below}
      <View style={{ height: 18 }} />
</View>);
  return <Screen scroll={false}><FlatList
    style={{flex:1}} data={tracks} keyExtractor={(t,i)=>t.id+':'+i}
    ListHeaderComponent={header}
    ListEmptyComponent={p.error?<Offline onRetry={p.onRetry||(()=>{})}/>:p.loading?<ListSkeleton n={6}/>:<View>{p.empty}</View>}
    renderItem={({item:t,index:i})=><TrackRow track={t} list={tracks} num={p.numbered?i+1:undefined} sub={p.sub2} playlistId={p.playlistId}/>}
    initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} updateCellsBatchingPeriod={50}
    showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    ListFooterComponent={<View style={{height:16}}/>}
  /></Screen>;
}

function ImmersiveListPage(p:Props){
 const layout=useLayout(),ins=useSafeAreaInsets(),reduced=useReducedMotion(),[visible,setVisible]=useState(true);
 const tracks=p.tracks??EMPTY_TRACKS,wide=layout.content>=680,size=wide?Math.min(480,layout.content*.46):Math.max(0,layout.available-16);
 const artwork=p.cover?.uri??p.cover?.collage?.find(Boolean);
 useEffect(()=>{if(tracks.length)warm(tracks.slice(0,2));},[tracks]);
 const playingHere=usePlayer(s=>s.playing&&!!currentTrack(s)&&tracks.some(t=>t.id===currentTrack(s)!.id));
 const header=<View testID="catalog-header" style={{paddingBottom:22}}>
  <View style={{marginHorizontal:wide?0:-layout.side+8,flexDirection:wide?'row':'column',gap:wide?36:0,marginTop:wide?12:8}}>
   <Animated.View testID="catalog-cover" entering={reduced?undefined:FadeInDown.duration(820)} style={{width:size,alignSelf:wide?'flex-start':'center',borderRadius:40,overflow:'hidden'}}>
    {p.loading&&!artwork?<Skeleton h={size} w={size} r={40}/>:<CoverArt cover={p.cover} size={size} radius={40} assemble={!!p.playlistId}/>}
    {!wide?<><LinearGradient pointerEvents="none" colors={['#00000055','#00000000']} style={{position:'absolute',left:0,right:0,top:0,height:120}}/><View style={{position:'absolute',left:Math.max(4,ins.left),right:Math.max(4,ins.right),top:ins.top+4}}><CatalogTopBar right={p.right}/></View></>:null}
   </Animated.View>
   <View style={{flex:wide?1:undefined,minWidth:0,paddingHorizontal:wide?0:12,paddingTop:wide?0:24}}>
    {wide?<CatalogTopBar right={p.right}/>:null}
    <Animated.View entering={reduced?undefined:FadeInDown.duration(760).delay(100)} style={{gap:10,marginTop:wide?24:0}}>
     <T accessibilityRole="header" style={{fontFamily:'Manrope_800ExtraBold',fontSize:layout.available<350?28:34,lineHeight:layout.available<350?34:42,letterSpacing:-1,color:'#fff'}}>{p.title}</T>
     {p.sub?<View>{p.sub}</View>:null}
     <T style={{fontSize:13,color:'#ffffff88'}}>{p.loading?' ':trackCountLabel(tracks.length)}</T>
    </Animated.View>
    <View style={{flexDirection:'row',gap:8,alignItems:'center',marginTop:24}}>
     <CoverPlayButton artwork={artwork} seed={p.title} playing={playingHere} disabled={!tracks.length} visible={visible} onPress={()=>playingHere?player.toggle():player.play(tracks,undefined,{shuffle:false})}/>
     <CatalogIconButton name="shuffle" label="Перемешать" disabled={!tracks.length} onPress={()=>tracks.length&&player.play(tracks,undefined,{shuffle:true})}/>
     {p.extraBtn}
    </View>
    {Platform.OS!=='web'&&tracks.length>0?<OfflineSaveButton tracks={tracks} plain/>:null}
   </View>
  </View>
  <View style={{marginTop:20}}>{p.below}</View>
 </View>;
 return <Screen scroll={false} style={{paddingTop:0,paddingHorizontal:0,backgroundColor:'#000'}}><FlatList testID="catalog-track-list" style={{flex:1,backgroundColor:'#000'}} contentContainerStyle={{paddingHorizontal:layout.side}} data={tracks} keyExtractor={(t,i)=>t.id+':'+i} ListHeaderComponent={header}
  onScroll={e=>{const next=e.nativeEvent.contentOffset.y<size+220;setVisible(old=>old===next?old:next);}} scrollEventThrottle={80}
  ListEmptyComponent={p.error?<Offline onRetry={p.onRetry||(()=>{})}/>:p.loading?<ListSkeleton n={6}/>:<View>{p.empty}</View>}
  renderItem={({item:t,index:i})=><TrackRow track={t} list={tracks} num={p.numbered?i+1:undefined} sub={p.sub2} playlistId={p.playlistId}/>}
  initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} updateCellsBatchingPeriod={50} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" ListFooterComponent={<View style={{height:24}}/>}/></Screen>;
}
