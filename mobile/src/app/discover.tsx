import { useTheme } from '@/theme/state';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { MOODS } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { CardRail } from '@/components/Cards';
import { Banner } from '@/components/Banner';
import { TrackRow } from '@/components/TrackRow';

import { Icon } from '@/ui/Icon';
import { Btn, ListSkeleton, Offline, Press, Screen, SectionHead, Skeleton, T } from '@/ui/kit';

export default function Discover() {
  const {colors:C}=useTheme();
  const charts = useData('charts', (s) => lull.charts(s));
  const home = useData('home', (s) => lull.home(undefined, s));
  const trending = charts.data?.find((x) => x.layout === 'tracks');
  const releases = charts.data?.find((x) => x.layout === 'cards' && x.items[0]?.kind === 'album');
  const pls = home.data?.filter((x) => x.layout === 'cards' && x.items[0]?.kind === 'playlist') ?? [];
  const trTracks = trending?.items.filter((c) => c.track).map((c) => c.track!) ?? [];
  return (
    <Screen>
      <T v="h1" style={{ marginTop: 10, marginBottom: 18 }} accessibilityRole="header">Открывать</T>
      <Pressable onPress={() => router.push('/search')} accessibilityRole="search" accessibilityLabel="Поиск: треки, альбомы, исполнители"
        style={{ minHeight: 54,paddingVertical:12, borderRadius: 28, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }}>
        <Icon name="search" size={22} color={C.tx2} /><T numberOfLines={2} style={{flex:1,minWidth:0, color: C.tx2, fontSize: 16 }}>Треки, альбомы, исполнители</T>
      </Pressable>

      <View style={{ gap: 28, marginTop: 26 }}>
        <View>
          <SectionHead title="Под настроение" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {MOODS.map((m) => (
              <Press key={m.id} scaleTo={0.97} onPress={() => router.push({ pathname: '/mood/[id]', params: { id: m.id } })} accessibilityRole="button" accessibilityLabel={m.title}
                outer={{width:'100%'}} style={{ width: '100%' }}>
                {/* название уже нарисовано на обложке */}
                <Banner source={m.image}/>
              </Press>
            ))}
          </View>
        </View>

        <View>
          <SectionHead title={trending?.title || 'Популярное в России'} onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'trending' } })} />
          {trending?.subtitle ? <T v="small" style={{marginBottom:12}}>{trending.subtitle}</T> : null}
          {charts.error && !charts.data ? <Offline onRetry={charts.reload} /> : charts.loading && !charts.data ? <ListSkeleton n={4} /> : trTracks.slice(0, 5).map((t) => <TrackRow key={t.id} track={t} list={trTracks} sub />)}
        </View>

        {releases ? <View><SectionHead title="Новые альбомы и синглы" /><CardRail items={releases.items} /></View> : charts.loading ? <Skeleton h={190} /> : null}
        {pls.slice(0, 2).map((s) => <View key={s.title}><SectionHead title={s.title} /><CardRail items={s.items} /></View>)}

        <View>
          <SectionHead title="Независимые артисты" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'underground' } })} />
          <Btn label="Открыть независимую музыку" kind="dark" onPress={()=>router.push({pathname:'/mix/[id]',params:{id:'underground'}})}/>
        </View>
      </View>
    </Screen>
  );
}
