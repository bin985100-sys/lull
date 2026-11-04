import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { Track } from '@/api/audius';
import { lull } from '@/api/lull';
import { useData } from '@/api/useData';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, ListSkeleton, s, Screen, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'трек' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'трека' : 'треков');

export default function AddTracks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pl = useLibrary((x) => x.playlists.find((p) => p.id === id));
  const liked = useLibrary((x) => x.liked);
  const hist = useLibrary((x) => x.history);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sel, setSel] = useState<Track[]>([]);
  const busy = useRef(false);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const res = useData(dq ? 'lsearch:t:' + dq.toLowerCase() : null, (sig) => lull.search(dq, sig).then((r) => r.tracks));
  const base = useMemo(() => {
    const seen = new Set<string>(); const out: Track[] = [];
    for (const t of [...liked, ...hist.map((h) => h.track)]) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    return out;
  }, [liked, hist]);
  const list = dq ? res.data || [] : base;
  if (!pl) return null;
  const inPl = new Set(pl.tracks.map((t) => t.id));
  const n = sel.length;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen dock={false} style={{ paddingBottom: 120 }}>
        <TopBar close title="Добавить треки" />
        <View style={[s.field, { marginTop: 14, marginBottom: 16 }]}>
          <Icon name="search" size={22} color={C.tx2} />
          <TextInput value={q} onChangeText={setQ} placeholder="Найти трек" placeholderTextColor={C.tx3} style={s.input} accessibilityLabel="Найти трек" />
        </View>
        {!dq ? <T v="sub" style={{ marginBottom: 8 }}>{base.length ? 'Любимое и недавнее' : 'Найди треки поиском'}</T> : null}
        {dq && res.loading && !res.data ? <ListSkeleton n={6} /> : null}
        {list.map((t) => {
          const already = inPl.has(t.id), on = already || sel.some((x) => x.id === t.id);
          return (
            <Pressable key={t.id} disabled={already} onPress={() => setSel((x) => (x.some((y) => y.id === t.id) ? x.filter((y) => y.id !== t.id) : [...x, t]))}
              accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: already }} accessibilityLabel={t.title}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 66, borderRadius: 16, marginHorizontal: -8, paddingHorizontal: 8, backgroundColor: on && !already ? C.s1 : 'transparent' }}>
              <Cover uri={t.artwork} size={58} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T numberOfLines={1}>{t.title}</T>
                <T v="small" numberOfLines={1}>{already ? 'Уже в плейлисте' : t.artist}</T>
              </View>
              <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.tx : C.s2, opacity: already ? 0.45 : 1 }}>
                <Icon name={on ? 'check' : 'plus'} size={22} color={on ? '#000' : C.tx} />
              </View>
            </Pressable>
          );
        })}
      </Screen>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 24 }}>
        <LinearGradient colors={['rgba(0,0,0,0)', '#000', '#000']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Btn label={n ? `Добавить ${n} ${plural(n)}` : 'Выбери треки'} icon="check" disabled={!n} onPress={() => {
          if (busy.current) return; busy.current = true;
          useLibrary.getState().setPlaylistTracks(pl.id, [...pl.tracks, ...sel.filter((t) => !inPl.has(t.id))]);
          router.back(); toast(`Добавлено: ${n} ${plural(n)}`, 'check');
        }} />
      </View>
    </View>
  );
}
