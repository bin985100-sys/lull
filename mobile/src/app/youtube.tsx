/* Перенос из YouTube Music: лайки → «Любимые треки», плейлисты → свои плейлисты Lull. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { unlinkYouTube, ytLibrary, ytPlaylist, type YtPlaylist } from '@/api/youtube';
import type { Track } from '@/api/audius';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Btn, Cover, Empty, Press, Screen, T, TopBar } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { confirm, toast } from '@/ui/overlay';
import { router } from 'expo-router';

type Lib = { account: string; liked: Track[]; playlists: YtPlaylist[] };

export default function YouTube() {
  const [lib, setLib] = useState<Lib | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, 'run' | 'done'>>({});
  const account = useLibrary((s) => s.account.youtube);

  const load = () => { setErr(null); setLib(null); ytLibrary().then(setLib, (e) => setErr(e.message)); };
  useEffect(load, []);

  const mark = (id: string, v: 'run' | 'done') => setBusy((b) => ({ ...b, [id]: v }));

  const importLikes = () => {
    if (!lib) return;
    const n = useLibrary.getState().addLikes(lib.liked);
    mark('liked', 'done');
    toast(n ? `Добавлено в любимые: ${n}` : 'Все лайки уже в любимых', 'heartF');
  };

  async function importList(p: YtPlaylist, quiet = false) {
    mark(p.id, 'run');
    try {
      const tracks = await ytPlaylist(p.id);
      const st = useLibrary.getState();
      const same = st.playlists.find((x) => x.name === p.title);
      if (same) st.setPlaylistTracks(same.id, [...same.tracks, ...tracks.filter((t) => !same.tracks.some((x) => x.id === t.id))]);
      else st.createPlaylist(p.title, tracks);
      mark(p.id, 'done');
      if (!quiet) toast(`«${p.title}» в твоих плейлистах`, 'check');
    } catch (e) {
      setBusy((b) => { const c = { ...b }; delete c[p.id]; return c; });
      toast((e as Error).message, 'info');
    }
  }
  async function importAll() {
    if (!lib) return;
    importLikes();
    for (const p of lib.playlists) if (busy[p.id] !== 'done') await importList(p, true);
    toast('Всё перенесено из YouTube Music', 'check');
  }

  return (
    <Screen>
      <TopBar title="YouTube Music" />
      <T v="sub" style={{ marginTop: 6 }}>{account ? `Аккаунт: ${account}` : 'Аккаунт Google'}</T>
      {err ? (
        <Empty icon="info" title="Не получилось" text={err}>
          <Btn label="Повторить" icon="refresh" onPress={load} />
        </Empty>
      ) : !lib ? (
        <View style={{ paddingTop: 80, alignItems: 'center', gap: 14 }}><ActivityIndicator color={C.tx2} /><T v="sub">Загружаем лайки и плейлисты…</T></View>
      ) : (
        <View style={{ gap: 12, marginTop: 18 }}>
          <Btn label="Перенести всё" icon="download" onPress={importAll} />
          <Item title="Понравившаяся музыка" sub={`${lib.liked.length} треков → «Любимые треки»`} art={lib.liked[0]?.artwork} state={busy.liked} onPress={importLikes} />
          {lib.playlists.map((p) => (
            <Item key={p.id} title={p.title} sub={`${p.count} треков`} art={p.thumb} state={busy[p.id]} onPress={() => importList(p)} />
          ))}
          {!lib.playlists.length ? <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>Своих плейлистов в YouTube нет</T> : null}
          <Press onPress={() => confirm({ icon: 'linkOff', title: 'Отключить YouTube Music?', text: 'Перенесённые треки и плейлисты останутся в Lull.', safe: 'Оставить', danger: 'Отключить', onDanger: () => { unlinkYouTube().catch(() => {}); router.back(); } })}
            style={{ alignSelf: 'center', paddingVertical: 18 }}>
            <T v="sub">Отключить аккаунт</T>
          </Press>
        </View>
      )}
    </Screen>
  );
}

function Item({ title, sub, art, state, onPress }: { title: string; sub: string; art?: string; state?: 'run' | 'done'; onPress: () => void }) {
  return (
    <Press onPress={state ? undefined : onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 22, backgroundColor: C.s1 }}>
      <Cover uri={art} size={56} radius={14} />
      <View style={{ flex: 1 }}>
        <T numberOfLines={1} style={{ fontFamily: F.bold }}>{title}</T>
        <T v="small" numberOfLines={1}>{sub}</T>
      </View>
      <View style={{ width: 44, alignItems: 'center' }}>
        {state === 'run' ? <ActivityIndicator color={C.tx2} /> : <Icon name={state === 'done' ? 'check' : 'download'} size={24} color={state === 'done' ? C.tx : C.tx2} />}
      </View>
    </Press>
  );
}
