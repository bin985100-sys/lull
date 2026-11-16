import { router } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { MOODS } from '@/api/audius';
import { lull } from '@/api/lull';
import { getMix, MIXES, useMixSeed } from '@/api/mixes';
import { CardRail, Sections } from '@/components/Cards';
import { Banner } from '@/components/Banner';
import { artistScores } from '@/reco/engine';
import { useData } from '@/api/useData';
import { Insights } from '@/components/Insights';
import { TrackRow } from '@/components/TrackRow';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Cover, haptic, IconBtn, ListSkeleton, Offline, Press, Reveal, Screen, SectionHead, T } from '@/ui/kit';
import { PlayPause } from '@/ui/PlayPause';

function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Хороший вечер';
}

export default function Listen() {
  const history = useLibrary((s) => s.history);
  const cur = usePlayer((s) => currentTrack(s));
  const playing = usePlayer((s) => s.playing);
  const last = cur ?? history[0]?.track;
  const recommendationSeed=history[0]?.track.artistId || history[0]?.track.id || 'new';
  const trend = useData('mix:recommended:'+recommendationSeed, MIXES.recommended.load);
  useMixSeed((x) => x.n);
  const fy = getMix('foryou');
  const mix = useData('mix:' + fy.id, fy.load);
  const charts = useData('charts', (sg) => lull.charts(sg));
  const home = useData('home', (sg) => lull.home(undefined, sg));
  const trending = charts.data?.find((x) => x.layout === 'tracks');
  const trTracks = trending?.items.filter((c) => c.track).map((c) => c.track!) ?? [];
  const releases = charts.data?.filter((x) => x.layout === 'cards' && x.items.length) ?? [];
  const shelves = (home.data ?? []).filter((x) => x.layout === 'cards' && x.items.length);
  const recent = Array.from(new Map(history.map((h) => [h.track.id, h.track])).values()).slice(1, 13);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10, marginBottom: 18, gap: 12 }}>
        <T v="h1" style={{ fontSize: 27, flex: 1 }} accessibilityRole="header" numberOfLines={2}>{greet()}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconBtn name="clock" label="История" onPress={() => router.push('/history')} />
          <IconBtn name="gear" label="Настройки" onPress={() => router.push('/settings')} />
        </View>
      </View>

      <View style={{ gap: 28 }}>
        {last ? (
          <View>
            <SectionHead title="Продолжить" />
            <Pressable onPress={() => { haptic(); player.play(cur ? usePlayer.getState().queue : [last], last.id); }} accessibilityRole="button" accessibilityLabel={`Продолжить: ${last.title}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 18, padding: 12, paddingRight: 14, borderRadius: 26, backgroundColor: C.s1 }}>
              <Cover uri={last.artwork} size={88} radius={18} />
              <T numberOfLines={2} style={{ flex: 1, fontFamily: F.bold, fontSize: 19 }}>{last.title}</T>
              <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><PlayPause playing={!!cur && cur.id === last.id && playing} size={30} /></View>
            </Pressable>
          </View>
        ) : null}

        <Reveal step={1}><Focus loading={mix.loading} canPlay={!!mix.data?.length} onPlayForYou={() => mix.data && player.play(mix.data)} /></Reveal>

        <View>
          <Pressable onPress={() => router.push('/prefs')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
            <T v="h2">Настроить подборку</T><Icon name="sliders" size={30} />
          </Pressable>
          <SectionHead title="Дальше по звучанию" more="Все" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'recommended' } })} />
          {trend.error && !trend.data ? <Offline onRetry={trend.reload} /> : null}
          {trend.loading && !trend.data ? <ListSkeleton n={3} /> : null}
          {(trend.data || []).slice(0, 4).map((t) => <TrackRow key={t.id} track={t} list={trend.data!} sub right="plus" />)}
        </View>

        <ArtistMixes />

        {trTracks.length ? (
          <View>
            <SectionHead title={trending?.title || 'Популярное в России'} more="Все" onMore={() => router.push({ pathname: '/mix/[id]', params: { id: 'trending' } })} />
            {trending?.subtitle ? <T v="small" style={{marginBottom:12}}>{trending.subtitle}</T> : null}
            {trTracks.slice(0, 5).map(t => <TrackRow key={t.id} track={t} list={trTracks} sub />)}
          </View>
        ) : charts.loading ? <ListSkeleton n={3} /> : null}

        {releases.length ? <Sections sections={releases} max={2} /> : null}

        <Moods />

        {shelves.length ? <Sections sections={shelves} max={4} /> : null}

        {recent.length >= 3 ? (
          <View>
            <SectionHead title="Ты недавно слушал" more="История" onMore={() => router.push('/history')} />
            <CardRail items={recent.map((t) => ({ kind: 'track' as const, id: t.id, title: t.title, subtitle: t.artist, image: t.artworkLarge || t.artwork, track: t }))} />
          </View>
        ) : null}
        <Insights />
      </View>
    </Screen>
  );
}

/* «Сегодня в фокусе»: листаются «Для тебя» и подборки под время дня; «Для тебя» обновляется кнопкой */
function moodNow() {
  const h = new Date().getHours();
  return h < 11 || h >= 23 ? 'exhale' : h < 18 ? 'focus' : 'night';
}
function Focus({ onPlayForYou,loading,canPlay }: { onPlayForYou: () => void;loading:boolean;canPlay:boolean }) {
  const [w, setW] = useState(0);
  const [page, setPage] = useState(0);
  const rail=useRef<ComponentRef<typeof ScrollView>>(null);
  const reduced=useReducedMotion();
  const rotation=useSharedValue(0);
  const spin=useAnimatedStyle(()=>({transform:[{rotate:rotation.get()+'deg'}]}));
  const first = moodNow();
  const day = new Date().getDate();
  const others = MOODS.filter((m) => m.id !== first);
  const moods = [MOODS.find((m) => m.id === first)!, others[day % others.length], others[(day + 1) % others.length]];
  const cards = [
    { key: 'foryou', title: 'Для тебя', image: MIXES.foryou.image, open: () => router.push({ pathname: '/mix/[id]', params: { id: 'foryou' } }) },
    ...moods.map((m) => ({ key: m.id, title: m.title, image: m.image, open: () => router.push({ pathname: '/mood/[id]', params: { id: m.id } }) })),
  ];
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{width:'100%',maxWidth:720}}>
      <SectionHead title="Сегодня в фокусе" />
      {w ? (
        <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={w + 12} snapToAlignment="start"
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (w + 12)))} scrollEventThrottle={32}
          style={{height:w*9/16+60,flexGrow:0}} contentContainerStyle={{ gap: 12 }}>
          {cards.map((c) => (
            <View key={c.key} style={{width:w,gap:12}}>
              <Press scaleTo={0.985} onPress={c.open} accessibilityRole="button" accessibilityLabel={`Открыть «${c.title}»`}>
                <Banner source={c.image}/>
              </Press>
              <View style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:48,paddingHorizontal:2}}>
                <T v="small" numberOfLines={2} style={{flex:1,minWidth:0}}>{c.key==='foryou' ? 'Твой персональный микс' : c.title}</T>
                {c.key==='foryou' ? <>
                  <Press onPress={()=>{haptic();if(!reduced)rotation.set(withTiming(rotation.get()+360,{duration:420}));useMixSeed.setState(x=>({n:x.n+1}));}} accessibilityRole="button" accessibilityLabel="Обновить «Для тебя»"
                    style={{width:48,height:48,borderRadius:24,backgroundColor:C.s2,alignItems:'center',justifyContent:'center'}}>
                    <Animated.View style={spin}><Icon name="refresh" size={22}/></Animated.View>
                  </Press>
                  <Press onPress={onPlayForYou} disabled={loading || !canPlay} accessibilityRole="button" accessibilityLabel="Слушать «Для тебя»" accessibilityState={{disabled:loading || !canPlay,busy:loading}}
                    style={{width:56,height:48,borderRadius:24,backgroundColor:C.tx,alignItems:'center',justifyContent:'center',opacity:canPlay || loading ? 1 : .45}}>
                    {loading ? <ActivityIndicator color={C.bg}/> : <Icon name="play" size={24} color={C.bg}/>}
                  </Press>
                </> : <IconBtn name="arrowUR" label={`Открыть подборку «${c.title}»`} onPress={c.open}/>}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : <View style={{ width: '100%', aspectRatio: 16/9, borderRadius: 24, backgroundColor: C.s1 }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 4 }}>
        {cards.map((c, i) => <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`Показать «${c.title}»`} aria-pressed={i===page}
          onPress={()=>rail.current?.scrollTo({x:i*(w+12),animated:!reduced})} style={{width:30,height:28,alignItems:'center',justifyContent:'center'}}>
          <Animated.View style={{width:i===page ? 18 : 6,height:6,borderRadius:3,backgroundColor:i===page ? C.tx : C.s4,transitionProperty:['width','backgroundColor'],transitionDuration:reduced ? 0 : 220}}/>
        </Pressable>)}
      </View>
    </View>
  );
}

/* Миксы по любимым исполнителям: их хиты вперемешку с похожими */
function ArtistMixes() {
  const fav = useLibrary((x) => x.favArtists);
  const avatars = new Map(fav.map((a) => [a.id, a.avatar]));
  const list = [...artistScores().filter((a) => a.source !== 'audius').map((a) => ({ id: a.id, name: a.name, avatar: avatars.get(a.id) })), ...fav.filter((a) => a.source !== 'audius').map((a) => ({ id: a.id, name: a.name, avatar: a.avatar }))]
    .filter((a, i, arr) => a.id && arr.findIndex((b) => b.id === a.id) === i).slice(0, 10);
  if (list.length < 2) return null;
  return (
    <View>
      <SectionHead title="Миксы исполнителей" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
        {list.map((a) => (
          <Press key={a.id} onPress={() => router.push({ pathname: '/mix/[id]', params: { id: `artist:${a.id}`, n: a.name } })} accessibilityRole="button" accessibilityLabel={`Микс: ${a.name}`} style={{ width: 132, gap: 8 }}>
            <View><Cover uri={a.avatar} label={a.name} size={132} radius={28} />
              <View style={{ position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' }}><T v="label" style={{ color: C.tx, fontFamily: F.bold }}>Микс</T></View>
            </View>
            <T numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15 }}>{a.name}</T>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}

/* Подборки под настроение */
function Moods() {
  return (
    <View>
      <SectionHead title="Под настроение" more="Все" onMore={() => router.push('/discover')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {MOODS.map((m) => (
          <Press key={m.id} scaleTo={0.97} onPress={() => router.push({ pathname: '/mood/[id]', params: { id: m.id } })} accessibilityRole="button" accessibilityLabel={m.title}
            style={{ width: 268 }}>
            <Banner source={m.image}/>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}
