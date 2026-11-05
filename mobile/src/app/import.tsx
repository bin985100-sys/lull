/* Перенос музыки из Spotify, Apple Music, SoundCloud, Яндекс Музыки, Deezer и YouTube Music по ссылке. */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Switch, TextInput, View } from 'react-native';

import { runImport, SERVICES, type ImportState } from '@/api/importer';
import { linkYouTube } from '@/api/youtube';
import { TrackRow } from '@/components/TrackRow';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, haptic, s as ks, Screen, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

function Opt({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><T style={{ fontSize: 16 }}>{label}</T>{sub ? <T v="small" style={{ marginTop: 2 }}>{sub}</T> : null}</View>
      <Switch value={value} onValueChange={(v) => { haptic(); onChange(v); }} trackColor={{ true: C.tx, false: C.s4 }} thumbColor={value ? '#000' : '#8a8f96'} accessibilityLabel={label} />
    </View>
  );
}

export default function Import() {
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(params.url ?? '');
  const [st, setSt] = useState<ImportState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [asPlaylist, setAsPlaylist] = useState(true);
  const [toLikes, setToLikes] = useState(false);
  const [artistsOn, setArtistsOn] = useState(true);
  const [showMissing, setShowMissing] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const ytLinked = useLibrary((x) => !!x.account.youtube);
  const signedIn = useLibrary((x) => !!x.account.token);

  useEffect(() => () => stop.current?.(), []);
  useEffect(() => { if (params.url) start(params.url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function start(u = url) {
    if (!u.trim()) return;
    setErr(null); setSt(null); stop.current?.();
    stop.current = runImport(u, setSt, (e) => { setErr(e.message); setSt(null); });
  }
  const reset = () => { stop.current?.(); setSt(null); setErr(null); setUrl(''); };

  function save() {
    if (!st?.tracks?.length) return;
    const lib = useLibrary.getState();
    let id: string | null = null;
    const msgs: string[] = [];
    if (asPlaylist) { id = lib.createPlaylist(st.name || `Из ${st.service}`, st.tracks); msgs.push('плейлист создан'); }
    if (toLikes) { const n = lib.addLikes(st.tracks); msgs.push(`в любимых +${n}`); }
    if (artistsOn && st.artists?.length) {
      const n = lib.addArtists(st.artists.map((a) => ({ id: a.id, name: a.name, handle: '', followers: 0, source: 'yt' as const })));
      if (n) msgs.push(`исполнителей +${n}`);
    }
    toast(msgs.length ? `Готово: ${msgs.join(', ')}` : 'Ничего не выбрано', 'check');
    if (id) router.replace({ pathname: '/my/[id]', params: { id } });
    else if (toLikes) router.replace('/favorites');
    else reset();
  }

  const busy = st && st.status !== 'done';
  const pct = st && st.total ? st.done / st.total : 0;

  return (
    <Screen>
      <TopBar title="Перенос музыки" />

      {!st ? (
        <View style={{ gap: 18, marginTop: 14 }}>
          <T v="body">Вставь ссылку на плейлист или альбом. Lull прочитает список и найдёт эти треки у себя — со всей музыкой можно работать как с обычным плейлистом.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SERVICES.map((n) => <View key={n} style={{ paddingHorizontal: 14, height: 34, borderRadius: 99, backgroundColor: C.s1, justifyContent: 'center' }}><T v="small" style={{ color: C.tx, fontFamily: F.semi }}>{n}</T></View>)}
          </View>
          <View style={ks.field}>
            <Icon name="search" size={22} color={C.tx2} />
            <TextInput value={url} onChangeText={setUrl} onSubmitEditing={() => start()} placeholder="https://open.spotify.com/playlist/…" placeholderTextColor={C.tx3}
              autoCapitalize="none" autoCorrect={false} keyboardType={Platform.OS === 'ios' ? 'url' : 'default'} returnKeyType="go" style={ks.input} accessibilityLabel="Ссылка на плейлист или альбом" />
          </View>
          {err ? <T v="sub" style={{ color: C.danger }}>{err}</T> : null}
          <Btn label="Перенести" icon="download" disabled={!url.trim()} onPress={() => start()} />

          <View style={{ gap: 8, padding: 18, borderRadius: 24, backgroundColor: C.s1, marginTop: 6 }}>
            <T style={{ fontFamily: F.bold }}>Где взять ссылку</T>
            <T v="small">В приложении сервиса открой плейлист или альбом → «Поделиться» → «Скопировать ссылку». Плейлист должен быть открыт для всех.</T>
            <T v="small">Любимые треки Spotify и Apple Music по ссылке не открываются: на компьютере выдели их все (Ctrl+A), добавь в новый плейлист и вставь ссылку на него.</T>
          </View>

          <Pressable onPress={() => (ytLinked ? router.push('/youtube') : !signedIn ? toast('Сначала войди в Lull', 'info') : linkYouTube(() => router.push('/youtube')).catch((e) => toast(e.message, 'info')))}
            accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, backgroundColor: C.s1 }}>
            <Icon name="google" size={28} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: F.bold }}>Вся библиотека YouTube Music</T>
              <T v="small">Лайки и все плейлисты разом — через аккаунт Google</T>
            </View>
            <Icon name="chev" size={22} />
          </Pressable>
        </View>
      ) : busy ? (
        <View style={{ gap: 18, marginTop: 40, alignItems: 'flex-start' }}>
          <T v="sub">{st.service}{st.name ? ` · ${st.name}` : ''}</T>
          <T v="xl">{st.status === 'reading' ? 'Читаем список…' : `Нашли ${st.matched} из ${st.total}`}</T>
          <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 9, backgroundColor: C.s2, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: C.tx, borderRadius: 9 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ActivityIndicator color={C.tx2} /><T v="small">Ищем каждый трек в каталоге Lull. Обычно это меньше минуты.</T></View>
          <Btn label="Отменить" kind="dark" small onPress={reset} />
        </View>
      ) : (
        <View style={{ gap: 18, marginTop: 14 }}>
          <View style={{ gap: 4 }}>
            <T v="sub">{st.service}</T>
            <T v="h1" numberOfLines={2}>{st.name || 'Без названия'}</T>
            <T v="body">Найдено {st.matched} из {st.total}{st.declared && st.declared > st.total ? ` · сервис открыл только первые ${st.total} из ${st.declared}` : ''}</T>
          </View>

          <View style={{ borderRadius: 26, backgroundColor: C.s1, paddingHorizontal: 18, paddingVertical: 4 }}>
            <Opt label="Сохранить как плейлист" sub={st.name || undefined} value={asPlaylist} onChange={setAsPlaylist} />
            <Opt label="Добавить в любимые треки" value={toLikes} onChange={setToLikes} />
            {st.artists?.length ? <Opt label="Исполнителей — в любимые" sub={st.artists.slice(0, 5).map((a) => a.name).join(', ') + (st.artists.length > 5 ? ` и ещё ${st.artists.length - 5}` : '')} value={artistsOn} onChange={setArtistsOn} /> : null}
          </View>
          <Btn label="Сохранить в Lull" icon="check" disabled={!st.tracks?.length} onPress={save} />

          {st.missing?.length ? (
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => setShowMissing((v) => !v)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
                <T v="sub">Не нашли: {st.missing.length}</T><View style={{ transform: [{ rotate: showMissing ? '180deg' : '0deg' }] }}><Icon name="down" size={20} color={C.tx2} /></View>
              </Pressable>
              {showMissing ? st.missing.slice(0, 100).map((m, i) => <T key={i} v="small">{m}</T>) : null}
            </View>
          ) : null}

          <View style={{ gap: 6 }}>
            {st.tracks?.slice(0, 40).map((t, i) => <TrackRow key={t.id} track={t} list={st.tracks!} num={i + 1} />)}
          </View>
          <Btn label="Перенести другую ссылку" kind="dark" small onPress={reset} />
        </View>
      )}
    </Screen>
  );
}
