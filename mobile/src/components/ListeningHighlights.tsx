import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { artistPhoto } from '@/api/lull';
import type { Track } from '@/api/audius';
import { useLibrary } from '@/store/library';
import { type ArtistStat, fmtListen, monthIn, monthStats, useTaste } from '@/store/taste';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { Cover, Press, SectionHead, T } from '@/ui/kit';
import { useLayout } from '@/ui/layout';
import { openArtist } from './Cards';
import { player, usePlayer } from '@/player/player';
import { TrackRow } from './TrackRow';
import { ArtworkGlow } from '@/ui/ArtworkGlow';

const ArtistCard=memo(function ArtistCard({artist,rank,track,width,active}:{artist:ArtistStat;rank:number;track?:Track;width:number;active:boolean}){
 const saved=useLibrary(s=>s.favArtists.find(a=>a.id===artist.id&&a.source===artist.source));
 const portrait=saved?.avatar??(artist.source==='yt'?artistPhoto(artist.id):undefined);
 return <View style={{width,marginVertical:40}}><ArtworkGlow uri={active?portrait??track?.artwork:track?.artwork} style={{left:-64,right:-64,top:-64,bottom:-64}} opacity={.7}/><Press accessibilityRole="button" accessibilityLabel={`${rank}. ${artist.name}, ${fmtListen(artist.secs)}`} onPress={()=>artist.id?openArtist(artist):track&&player.play([track],track.id)} style={{height:width*1.3,borderRadius:36,overflow:'hidden',backgroundColor:'#000'}}>
  <Cover uri={active?portrait:undefined} fallbackUri={track?.artwork} label={artist.name} size="100%" radius={36} style={{position:'absolute',inset:0,height:'100%',aspectRatio:undefined}}/>
  <LinearGradient colors={['rgba(0,0,0,.12)','rgba(0,0,0,0)','rgba(0,0,0,.9)']} locations={[0,.45,1]} style={StyleSheet.absoluteFill}/>
  <T style={{position:'absolute',top:16,left:20,color:'#fff',fontFamily:F.bold,fontSize:42,lineHeight:48}}>{rank}</T>
  <View style={{position:'absolute',bottom:22,left:20,right:20,gap:6}}><T numberOfLines={2} style={{color:'#fff',fontFamily:F.bold,fontSize:22,lineHeight:27}}>{artist.name}</T><T style={{fontSize:13,color:'#eee'}}>{fmtListen(artist.secs)}</T></View>
 </Press></View>;
});
function Habit({title,value,art}:{title:string;value:string;art?:string;seed:string}){
 const {colors:C}=useTheme();
 return <View style={{width:178,marginVertical:36}}><Press accessibilityRole="button" accessibilityLabel={`${title}: ${value}`} onPress={()=>router.push('/month')} style={{height:158,padding:20,borderRadius:32,borderWidth:.8,borderColor:C.line,backgroundColor:C.bg,justifyContent:'space-between',gap:12}}><ArtworkGlow uri={art} style={{right:-36,top:-36,width:144,height:144}} opacity={.4}/><View style={{flexDirection:'row',gap:8,alignItems:'flex-start'}}><T numberOfLines={3} style={{flex:1,color:C.tx2,fontSize:12,lineHeight:16}}>{title}</T><Cover uri={art} size={32} radius={16}/></View><T numberOfLines={2} style={{fontFamily:F.bold,fontSize:24,lineHeight:29}}>{value}</T></Press></View>;
}
export function ListeningHighlights({active,ready}:{active:boolean;ready:boolean}){
 useTaste(s=>s.months);const expanded=usePlayer(s=>s.expanded),layout=useLayout(),{colors:C}=useTheme();
 const stats=monthStats();
 if(!stats||stats.secs<60||!ready)return null;
 const top=stats.tracks[0]?.track,days=Object.keys(stats.days).length,plays=stats.tracks.reduce((n,t)=>n+t.plays,0),best=Object.entries(stats.days).sort((a,b)=>b[1]-a[1])[0],now=new Date();
 const width=Math.max(180,Math.min(268,layout.content*.72)),tracks=stats.tracks.slice(0,4).map(t=>t.track),visible=active&&!expanded;
 const bestDate=best?new Date(best[0]+'T12:00:00'):undefined,bestLabel=bestDate?`${bestDate.getDate()} ${bestDate.toLocaleDateString('ru-RU',{month:'short'})}`:'';
 return <View style={{gap:28}}>
  <View style={{paddingTop:24,paddingBottom:12}}><ArtworkGlow uri={top?.artwork} style={{right:-66,top:-42,width:180,height:180}} opacity={.45}/><Press accessibilityRole="button" accessibilityLabel={`Твои итоги: ${fmtListen(stats.secs)} в ${monthIn(now)}`} onPress={()=>router.push('/month')} style={{gap:10}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><T style={{fontSize:13,color:C.tx2}}>Твой {now.toLocaleDateString('ru-RU',{month:'long'})}</T><Cover uri={top?.artwork} size={48} radius={18}/></View><T style={{fontSize:Math.min(40,layout.content/8),lineHeight:Math.min(48,layout.content/6.7),fontFamily:F.bold}}>{fmtListen(stats.secs)}{ '\n'}с любимой музыкой</T></Press></View>
  {stats.artists.length?<View><SectionHead title="Твои главные голоса" more="Все" onMore={()=>router.push('/month')}/><ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={width+16} decelerationRate="fast" style={{marginHorizontal:-20,marginTop:-12}} contentContainerStyle={{paddingHorizontal:20,gap:16}}>{stats.artists.slice(0,8).map((artist,i)=><ArtistCard key={artist.key} artist={artist} rank={i+1} track={stats.tracks.find(t=>t.track.artistId===artist.id&&t.track.source===artist.source)?.track} width={width} active={visible}/>)}</ScrollView></View>:null}
  <View><SectionHead title="На повторе" more="Все" onMore={()=>router.push('/month')}/>{tracks.map(t=><TrackRow key={t.id} track={t} list={tracks} sub glow/>)}</View>
  <View><SectionHead title="Твой музыкальный ритм"/><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal:-20,marginTop:-8}} contentContainerStyle={{paddingHorizontal:20,gap:14}}><Habit title="Дней с музыкой" value={String(days)} art={top?.artwork} seed="days"/><Habit title="В среднем за день" value={fmtListen(stats.secs/Math.max(1,days))} art={tracks[1]?.artwork??top?.artwork} seed="average"/>{best?<Habit title={`Самый музыкальный день · ${bestLabel}`} value={fmtListen(best[1])} art={tracks[2]?.artwork??top?.artwork} seed="best"/>:null}{plays>0?<Habit title="Запусков треков" value={String(plays)} art={tracks[3]?.artwork??top?.artwork} seed="plays"/>:null}</ScrollView></View>
 </View>;
}
