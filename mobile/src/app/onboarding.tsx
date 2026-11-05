import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { type Artist } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { ArtistPick } from '@/components/ArtistPick';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, haptic, Offline, s as ks, Screen, Skeleton, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

export default function Onboarding() {
  const { data, loading, error, reload } = useData('popularArtists', (s) => lull.popularArtists(s));
  const [picked, setPicked] = useState<Artist[]>([]);
  /* ширину колонки считаем от реальной ширины сетки — иначе третья колонка не помещалась */
  const [gridW, setGridW] = useState(0);
  const size = gridW ? Math.floor((gridW - 12 * 2) / 3) : 0;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Artist[] | null>(null);
  const [searching, setSearching] = useState(false);
  /* поиск исполнителей в каталоге: ждём паузу в наборе, старый запрос отменяем */
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setFound(null); setSearching(false); return; }
    const ac = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      lull.search(text, ac.signal).then((r) => { setFound(r.artists.filter((a) => a.avatar).slice(0, 18)); setSearching(false); }, () => { if (!ac.signal.aborted) { setFound([]); setSearching(false); } });
    }, 350);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q]);
  const MIN = 5, MAX = 10;
  const toggle = (a: Artist) => {
    if (picked.some((x) => x.id === a.id)) setPicked(picked.filter((x) => x.id !== a.id));
    else if (picked.length >= MAX) toast(`Можно выбрать до ${MAX} — сними кого-нибудь`, 'info');
    else setPicked([...picked, a]);
  };
  const list = found ?? data ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen dock={false} style={{ paddingBottom: 170 }}>
        <View style={{ height: 8 }} />
        <T v="h1" style={{ marginTop: 10, marginBottom: 8 }} accessibilityRole="header">Кого ты слушаешь?</T>
        <T v="sub" style={{ marginBottom: 18 }}>Выбери хотя бы пять исполнителей — с них начнём подборки. Нет нужного? Найди через поиск.</T>
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 14, paddingRight: 10, borderRadius: 18, backgroundColor: C.tx }}>
                <T v="small" style={{ color: '#000', fontFamily: 'Montserrat_700Bold' }} numberOfLines={1}>{a.name}</T><Icon name="close" size={16} color="#000" />
              </Pressable>
            ))}
          </View>
        ) : null}
        {found && !found.length && !searching ? <T v="sub" style={{ marginBottom: 12 }}>Никого не нашли. Попробуй написать иначе.</T> : null}
        {found ? <T v="label" style={{ marginBottom: 12 }}>Результаты поиска</T> : null}
        {error && !data ? <Offline onRetry={reload} /> : null}
        <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 18 }}>
          {size && loading && !data ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} h={size} w={size} r={size / 2} />) : null}
          {size ? list.map((a) => <ArtistPick key={a.id} a={a} size={size} on={picked.some((x) => x.id === a.id)} onPress={() => toggle(a)} />) : null}
        </View>
      </Screen>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24, gap: 10 }}>
        <LinearGradient colors={['rgba(0,0,0,0)', '#000', '#000']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <T v="sub" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{picked.length < MIN ? `Выбрано ${picked.length} из ${MIN}` : `Выбрано ${picked.length}`}</T>
        <Btn label="Дальше" icon="arrow" disabled={picked.length < MIN} onPress={() => {
          useLibrary.getState().setFavArtists(picked);
          router.push('/similar');
        }} />
      </View>
    </View>
  );
}
