import { resolveThemeValues, useTheme } from '@/theme/state';
import { LinearGradient } from 'expo-linear-gradient';
import { resetTo } from '@/nav';

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Artist } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { ArtistPick } from '@/components/ArtistPick';
import { ArtistDiscoveryScene } from '@/components/ArtistDiscoveryScene';
import { useLibrary } from '@/store/library';

import { Icon } from '@/ui/Icon';
import { haptic, Offline, Press, s as ks, Skeleton, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

export default function Onboarding() {
  const {colors:base}=useTheme(),safe=useSafeAreaInsets();
  const C={...base,bg:'#000',s1:'#000',s2:'#101010',tx:'#fff',tx2:'#ffffff99',tx3:'#ffffff66',inverse:'#000'};
  const ks=resolveThemeValues(ksThemeTable,C);
  const { data, loading, error, reload } = useData('popularArtists', (s) => lull.popularArtists(s));
  const [picked, setPicked] = useState<Artist[]>([]);
  const [choosing,setChoosing]=useState(false);
  /* ширину колонки считаем от реальной ширины сетки — иначе третья колонка не помещалась */
  const [gridW, setGridW] = useState(0);
  const columns=Math.max(2,Math.min(6,Math.floor(gridW/112)));
  const size = gridW ? Math.floor((gridW - 12 * (columns-1)) / columns) : 0;
  const [q, setQ] = useState('');
  const searchText=q.trim();
  const [debounced,setDebounced]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(searchText),280);return()=>clearTimeout(timer);},[searchText]);
  const {data:searchResult,loading:searching,error:searchError,reload:retrySearch}=useData(choosing&&debounced.length>=2 ? `onboarding:artists:${debounced}` : null,signal=>lull.search(debounced,signal,'artists'));
  const found=searchText.length>=2 ? (searchResult?.query===searchText?searchResult.artists.filter(a=>a.avatar).slice(0,18):[]) : null;
  const MAX = 30;
  const finish=(skip=false)=>{
    const lib=useLibrary.getState();
    if(!skip)lib.setFavArtists(picked);
    lib.setOnboarded(true);
    resetTo('/listen');
  };
  const toggle = (a: Artist) => {
    if (picked.some((x) => x.id === a.id)) setPicked(picked.filter((x) => x.id !== a.id));
    else if (picked.length >= MAX) toast(`Можно выбрать до ${MAX} — сними кого-нибудь`, 'info');
    else setPicked([...picked, a]);
  };
  const list = found ?? data ?? [];
  return (
    <ArtistDiscoveryScene artists={data??[]} choosing={choosing} onChoose={()=>setChoosing(true)} onSkip={()=>finish(true)}>
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:safe.top+24,paddingHorizontal:Math.max(20,safe.left+12,safe.right+12),paddingBottom:190,maxWidth:900,width:'100%',alignSelf:'center'}}>
        <View style={{ height: 8 }} />
        <T v="h1" style={{ marginTop: 10, marginBottom: 8,color:'#fff' }} accessibilityRole="header">Твои исполнители</T>
        <T v="sub" style={{ marginBottom: 18,color:'#ffffff99' }}>Выбирай тех, кто тебе близок.</T>
        <View style={[ks.field, { marginBottom: 14 }]}>
          <Icon name="search" size={22} color={C.tx2} />
          <TextInput value={q} onChangeText={setQ} placeholder="Найти исполнителя" placeholderTextColor={C.tx3} autoCorrect={false} returnKeyType="search" style={ks.input} accessibilityLabel="Найти исполнителя" />
          {searching ? <ActivityIndicator color={C.tx2} style={{ marginRight: 10 }} /> : q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Очистить поиск" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} color={C.tx2} /></Pressable>
          ) : null}
        </View>
        {picked.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {picked.map((a) => (
              <Pressable key={a.id} onPress={() => { haptic(); toggle(a); }} accessibilityRole="button" accessibilityLabel={`Убрать ${a.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,maxWidth:'100%', paddingLeft: 14, paddingRight: 10, borderRadius: 18, backgroundColor: C.tx }}>
                <T v="small" style={{ color: C.inverse, fontFamily: 'Manrope_700Bold',flexShrink:1 }} numberOfLines={1}>{a.name}</T><Icon name="close" size={16} color={C.inverse} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {found && !found.length && !searching && debounced===searchText && !searchError ? <T v="sub" style={{ marginBottom: 12 }}>Никого не нашли. Попробуй написать иначе.</T> : null}
        {searchError?<Offline onRetry={retrySearch}/>:null}
        {found ? <T v="label" style={{ marginBottom: 12 }}>Результаты поиска</T> : null}
        {error && !data ? <Offline onRetry={reload} /> : null}
        <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 18 }}>
          {size && loading && !data ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} h={size} w={size} r={size / 2} />) : null}
          {size ? list.map((a) => <ArtistPick key={a.id} a={a} size={size} dark on={picked.some((x) => x.id === a.id)} onPress={() => toggle(a)} />) : null}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Math.max(20,safe.left+12,safe.right+12), paddingTop: 30, paddingBottom: Math.max(14,safe.bottom), gap: 8 }}>
        <LinearGradient colors={['transparent', '#000', '#000']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {picked.length?<T v="sub" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">Выбрано: {picked.length}</T>:null}
        <Press accessibilityRole="button" accessibilityLabel="Начать слушать" onPress={()=>finish()} style={{minHeight:58,alignItems:'center',justifyContent:'center',borderRadius:40,backgroundColor:'#fff'}}><T style={{color:'#000',fontFamily:'Manrope_700Bold',fontSize:17}}>Начать слушать</T></Press>
        <Pressable onPress={()=>finish(true)} accessibilityRole="button" accessibilityLabel="Пропустить выбор артистов" style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><T style={{color:'#ffffff99'}}>Пропустить</T></Pressable>
      </View>
    </View>
    </ArtistDiscoveryScene>
  );
}

const ksThemeTable=ks;
