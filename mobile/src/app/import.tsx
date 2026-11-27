import { Toggle as Switch } from '@/ui/Toggle';
import { resolveThemeValues, useTheme } from '@/theme/state';
import { ImportProgress } from '@/components/ImportVisuals';
import { softPush } from '@/nav';
import { FileImport } from '@/components/FileImport';
/* Перенос музыки из Spotify, Apple Music, SoundCloud, Яндекс Музыки, Deezer и YouTube Music по ссылке. */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { runImport, type ImportState } from '@/api/importer';
import { linkYouTube } from '@/api/youtube';
import { TrackRow } from '@/components/TrackRow';
import { useLibrary } from '@/store/library';

import { Icon } from '@/ui/Icon';
import { Btn, s as ks, Screen, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

function Opt({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><T style={{ fontSize: 16 }}>{label}</T>{sub ? <T v="small" style={{ marginTop: 2 }}>{sub}</T> : null}</View>
      <Switch accent="#a5d8d0" value={value} onValueChange={onChange}   accessibilityLabel={label} />
    </View>
  );
}

export default function Import() {
  const {colors:C}=useTheme();
  const ks=resolveThemeValues(ksThemeTable,C);
  const params = useLocalSearchParams<{ url?: string }>();
  const [fileActive,setFileActive]=useState(false);
  const [service,setService]=useState('Spotify');
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
    setErr(null); stop.current?.(); setSt({status:'reading',service,name:'',done:0,total:0,matched:0});
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
    toast(msgs.length ? `Готово: ${msgs.join(', ')}` : 'Ничего не выбрано', 'check',undefined,st.tracks.map(t=>t.artwork).filter((u):u is string=>!!u));
    if (id) router.replace({ pathname: '/my/[id]', params: { id } });
    else if (toLikes) router.replace('/favorites');
    else reset();
  }

  const busy = st && st.status !== 'done';

  return (
    <Screen>
      <TopBar borderless title="Перенос музыки" />

      {!st ? (
        <View style={{ gap: 18, marginTop: 14 }}>
          <FileImport onActiveChange={setFileActive} onServiceChange={setService} google={() => ytLinked ? softPush('/youtube') : !signedIn ? toast('Сначала войди в Lull','info') : void linkYouTube(() => softPush('/youtube')).catch(e=>toast(e.message,'info'))}/>
          {!fileActive?<><T v="sub">Или перенести по публичной ссылке</T>
          <View style={[ks.field,{borderWidth:0,borderRadius:30,backgroundColor:C.bg}]}>
            <Icon name="search" size={22} color={C.tx2} />
            <TextInput value={url} onChangeText={setUrl} onSubmitEditing={() => start()} placeholder="https://open.spotify.com/playlist/…" placeholderTextColor={C.tx3}
              autoCapitalize="none" autoCorrect={false} keyboardType={Platform.OS === 'ios' ? 'url' : 'default'} returnKeyType="go" style={ks.input} accessibilityLabel="Ссылка на плейлист или альбом" />
          </View>
          {err ? <T v="sub" style={{ color: C.danger }}>{err}</T> : null}
          <Btn borderless label="Перенести" icon="download" disabled={!url.trim()} onPress={() => start()} /></>:null}


        </View>
      ) : busy ? (
        <View style={{gap:22,marginTop:20}}><ImportProgress state={st}/><Btn borderless label="Отменить перенос" kind="dark" onPress={reset}/></View>
      ) : (
        <View style={{ gap: 18, marginTop: 14 }}>
          <ImportProgress state={st} hint={st.declared&&st.declared>st.total?`Сервис открыл ${st.total} из ${st.declared} треков.`:undefined}/>
          <View style={{ borderRadius: 26, backgroundColor: C.bg, paddingHorizontal: 18, paddingVertical: 4 }}>
            <Opt label="Сохранить как плейлист" sub={st.name || undefined} value={asPlaylist} onChange={setAsPlaylist} />
            <Opt label="Добавить в любимые треки" value={toLikes} onChange={setToLikes} />
            {st.artists?.length ? <Opt label="Исполнителей — в любимые" sub={st.artists.slice(0, 5).map((a) => a.name).join(', ') + (st.artists.length > 5 ? ` и ещё ${st.artists.length - 5}` : '')} value={artistsOn} onChange={setArtistsOn} /> : null}
          </View>
          <Btn borderless label="Сохранить в Lull" icon="check" disabled={!st.tracks?.length} onPress={save} />

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
          <Btn borderless label="Перенести другую ссылку" kind="dark" small onPress={reset} />
        </View>
      )}
    </Screen>
  );
}

const ksThemeTable=ks;
