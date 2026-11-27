import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useLayout } from '@/ui/layout';
import { CatalogIconButton, CoverPlayButton } from '@/components/CatalogControls';
import { softBack } from '@/nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { audius, type Artist, type Track } from '@/api/audius';
import { lull, warm, type Section } from '@/api/lull';
import { useData } from '@/api/useData';
import { ArtistRail, Sections } from '@/components/Cards';
import { TrackRow } from '@/components/TrackRow';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';

import { ListSkeleton, Offline, Screen, SectionHead, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

type Page = { artist: Artist; monthly?: string; top: Track[]; sections: Section[]; similar: Artist[] };
const EMPTY_TRACKS:Track[]=[];

function PortraitBackdrop({uri,fallback,width,height}:{uri?:string;fallback?:string;width:number;height:number}){
 const [failed,setFailed]=useState<string[]>([]),effective=[uri,fallback].find((u):u is string=>!!u&&!failed.includes(u));
 return <View testID="artist-portrait-backdrop" pointerEvents="none" style={StyleSheet.absoluteFill}>
  {effective?<Image source={{uri:effective}} contentFit="cover" onError={()=>setFailed(old=>[...old.slice(-1),effective])} style={{width,height}} transition={180}/>:null}
  <LinearGradient colors={['#00000020','#00000000','#00000042','#000000c9','#000']} locations={[0,.35,.58,.8,1]} style={StyleSheet.absoluteFill}/>
 </View>;
}

async function loadAudius(id: string, s: AbortSignal): Promise<Page> {
  const [artist, top, similar] = await Promise.all([audius.artist(id, s), audius.artistTracks(id, s), audius.related(id, s).catch(() => [] as Artist[])]);
  return { artist, top, sections: [], similar };
}

export default function ArtistScreen() {
  const {height}=useWindowDimensions(),layout=useLayout(),reduced=useReducedMotion(),[visible,setVisible]=useState(true);
  const heroHeight=Math.max(380,Math.min(680,height*.59));
  const { id, s: src } = useLocalSearchParams<{ id: string; s?: string }>();
  const isAudius = src === 'audius';
  const ins = useSafeAreaInsets();
  const { data, loading, error, reload } = useData(`artistpage:${src}:${id}`, (sig) => (isAudius ? loadAudius(id, sig) : lull.artist(id, sig)));
  const fol = useLibrary((x) => x.favArtists.some((a) => a.id === id));
  const tracks = data?.top ?? EMPTY_TRACKS;
  useEffect(() => { if (tracks.length) warm(tracks.slice(0, 2)); }, [tracks]);
  const playingHere = usePlayer((x) => x.playing && !!currentTrack(x) && tracks.some((t) => t.id === currentTrack(x)!.id));
  const art = data?.artist;
  return (
    <Screen style={{ paddingTop: 0,backgroundColor:'#000' }} onScroll={e=>{const next=e.nativeEvent.contentOffset.y<heroHeight+100;setVisible(old=>old===next?old:next);}} scrollEventThrottle={80}>
      <View testID="artist-hero" style={{ height:heroHeight, marginHorizontal:-layout.side, backgroundColor:'#000' }}>
        <PortraitBackdrop uri={art?.cover} fallback={art?.avatar} width={layout.available} height={heroHeight}/>
        <View style={{ position: 'absolute', top:ins.top+12,left:Math.max(ins.left+8,12) }}>
          <CatalogIconButton name="back" label="Назад" onPress={softBack}/>
        </View>
        <Animated.View entering={reduced?undefined:FadeInDown.duration(850)} style={{ position: 'absolute', left:layout.side,right:layout.side,bottom:20,gap:10 }}>
          <T numberOfLines={3} style={{ fontFamily:'Manrope_800ExtraBold',fontSize:layout.available<350?30:38,lineHeight:layout.available<350?36:46,letterSpacing:-1,color:'#fff' }} accessibilityRole="header">{art?.name ?? ' '}</T>
          {data?.monthly ? <T style={{fontSize:14,color:'#ffffff99'}}>{data.monthly}</T> : null}
        </Animated.View>
      </View>
      <View style={{ flexDirection: 'row',alignItems:'center', gap:8, marginTop:16 }}>
        <CoverPlayButton artwork={art?.avatar} seed={art?.name??id} playing={playingHere} disabled={!tracks.length} visible={visible} onPress={() => (playingHere ? player.toggle() : player.play(tracks, undefined, { shuffle: false }))}/>
        <CatalogIconButton name="shuffle" label="Перемешать" disabled={!tracks.length} onPress={() => tracks.length && player.play(tracks, undefined, { shuffle: true })}/>
        {art ? <CatalogIconButton name={fol ? 'check' : 'plus'} label={fol ? 'Убрать из коллекции' : 'Добавить в коллекцию'}
          onPress={() => { useLibrary.getState().toggleArtist(art); toast(fol ? 'Убрано из коллекции' : 'Исполнитель в коллекции', fol ? 'userMinus' : 'check'); }} /> : null}
      </View>
      <View style={{ gap: 28, marginTop: 28 }}>
        <View>
          <SectionHead title="Популярное" />
          {error && !data ? <Offline onRetry={reload} /> : loading && !data ? <ListSkeleton n={5} /> : tracks.slice(0, 10).map((t) => <TrackRow key={t.id} track={t} list={tracks} />)}
        </View>
        {data?.sections.length ? <Sections sections={data.sections} /> : null}
        {data?.similar.length ? <View><SectionHead title="Похожие" /><ArtistRail items={data.similar} /></View> : null}
      </View>
    </Screen>
  );
}
