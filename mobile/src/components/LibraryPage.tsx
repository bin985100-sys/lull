import { useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme/state';
import { useLayout } from '@/ui/layout';
import { F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { WaveArt } from '@/ui/WaveArt';
import { Btn, Cover, Empty, IconBtn, Press, Screen, SectionHead, Segmented, T } from '@/ui/kit';
import { CoverArt } from './ListPage';
import { openArtist, openPlaylist } from './Cards';

const trackCount=(n:number)=>`${n} ${n%100>=11&&n%100<=14?'треков':n%10===1?'трек':n%10>=2&&n%10<=4?'трека':'треков'}`;
const WARM_WAVE={main:'#ffc894',accent:'#ef5949',deep:'#26170d',light:'#ffe4c6'};

export default function LibraryPage(){
 const {colors:C}=useTheme(),layout=useLayout(),lib=useLibrary(),focused=useIsFocused();
 const [tab,setTab]=useState<'pl'|'saved'|'ar'>('pl'),[query,setQuery]=useState('');
 const matches=(name:string)=>name.toLowerCase().includes(query.trim().toLowerCase());
 const entries=tab==='pl'?lib.playlists.filter(p=>matches(p.name)).map(p=>({key:p.id,title:p.name,sub:trackCount(p.tracks.length),cover:<CoverArt size="100%" radius={28} cover={{collage:p.tracks.map(t=>t.artwork)}}/>,open:()=>router.push({pathname:'/my/[id]',params:{id:p.id}})})):tab==='saved'?lib.savedPlaylists.filter(p=>matches(p.title)).map(p=>({key:p.id,title:p.title,sub:p.artist,cover:<Cover uri={p.artwork} size="100%" radius={28}/>,open:()=>openPlaylist(p)})):lib.favArtists.filter(a=>matches(a.name)).map(a=>({key:a.id,title:a.name,sub:'Исполнитель',cover:<Cover uri={a.avatar} label={a.name} size="100%" radius={999}/>,open:()=>openArtist(a)}));
 return <Screen><View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:6,marginBottom:24}}><View style={{flex:1,minWidth:0}}><T v="h1" numberOfLines={1} style={{marginTop:0,fontSize:layout.content<300?23:32}} accessibilityRole="header">Коллекция</T></View><IconBtn name="download" size={42} label="Перенести музыку" onPress={()=>router.push('/import')}/><IconBtn name="plus" size={42} label="Новый плейлист" onPress={()=>router.push('/new-playlist')}/></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:24}} contentContainerStyle={{gap:12,paddingRight:4}}>
   <Press onPress={()=>router.push('/wave')} accessibilityRole="button" accessibilityLabel="Моя волна" style={{width:148,height:226,borderRadius:74,overflow:'hidden',justifyContent:'center',alignItems:'center',backgroundColor:WARM_WAVE.deep}}><WaveArt animate={focused} colors={WARM_WAVE}/><LinearGradient pointerEvents="none" colors={['#ffd1a9a0','#ed453d44','#140e05cc']} style={{position:'absolute',inset:0}}/><T style={{fontFamily:F.bold,fontSize:18,color:'#fff',textAlign:'center'}}>Моя волна</T></Press>
   <Press outer={{width:148}} onPress={()=>router.push('/favorites')} accessibilityRole="button" accessibilityLabel="Любимые треки" style={{height:226,borderRadius:32,overflow:'hidden',backgroundColor:C.s1,borderWidth:.8,borderColor:C.line,padding:18,justifyContent:'space-between'}}><View pointerEvents="none" style={{position:'absolute',inset:0,opacity:.28}}><WaveArt tone={0}/></View><Icon name="heartF" size={30} color="#ff8295"/><View><T style={{fontFamily:F.bold,fontSize:15,color:'#fff'}}>Любимое</T><T style={{fontSize:10,color:'#dba7b9',marginTop:5}}>{trackCount(lib.liked.length)}</T></View></Press>
   <Press outer={{width:148}} onPress={()=>router.push(Platform.OS==='web'?'/import':'/downloads')} accessibilityRole="button" accessibilityLabel={Platform.OS==='web'?'Перенести музыку из файла':'Скачанная музыка'} style={{height:226,borderRadius:32,overflow:'hidden',backgroundColor:C.s1,borderWidth:.8,borderColor:C.line,padding:18,justifyContent:'space-between'}}><Icon name="download" size={30} color={C.tx}/><View><T style={{fontFamily:F.bold,fontSize:15,color:'#fff'}}>{Platform.OS==='web'?'Перенос':'Без интернета'}</T></View></Press>
  </ScrollView>
  <View style={{height:52,borderRadius:26,backgroundColor:C.s1,borderWidth:.8,borderColor:C.line,paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:10,marginBottom:14}}><Icon name="search" size={20} color={C.tx3}/><TextInput value={query} onChangeText={setQuery} placeholder="Найти в своей музыке" placeholderTextColor={C.tx3} accessibilityLabel="Найти в коллекции" style={{flex:1,minWidth:0,color:C.tx,fontFamily:F.medium,fontSize:14,borderWidth:0,outlineWidth:0}}/></View>
  <Segmented label="Разделы коллекции" value={tab} onChange={setTab} items={[['pl','Плейлисты'],['saved','Сохранено'],['ar','Артисты']]}/>
  <View style={{marginTop:26}}><SectionHead title={tab==='pl'?'Мои плейлисты':tab==='ar'?'Мои исполнители':'Сохранённое'}/>{entries.length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:12,rowGap:22}}>{entries.map(e=><Press key={e.key} onPress={e.open} accessibilityRole="button" accessibilityLabel={e.title} outer={{width:layout.card}} style={{gap:8}}>{e.cover}<T numberOfLines={2} style={{fontFamily:F.semi,fontSize:14}}>{e.title}</T><T v="small" numberOfLines={1}>{e.sub}</T></Press>)}</View>:<Empty icon={query?'search':'note'} title={query?'Пока не нашли':'Здесь начинается твоя музыка'} text={query?'Попробуй другое название.':'Сохраняй любимое и собирай плейлисты под свой ритм.'}>{tab==='pl'?<Btn label="Создать плейлист" icon="plus" onPress={()=>router.push('/new-playlist')}/>:<Btn label="Найти музыку" icon="search" onPress={()=>router.push('/search')}/>}</Empty>}</View>
 </Screen>;
}
