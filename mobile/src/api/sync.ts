/* Синхронизация с аккаунтом: любимые треки, плейлисты, исполнители, история, статистика и настройки.
   Снимок хранится на сервере Lull. Кто новее — тот и прав: при входе на новом телефоне всё возвращается,
   а изменения с этого телефона уходят на сервер через несколько секунд. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { useLibrary } from '@/store/library';
import { useTaste } from '@/store/taste';
import { log } from '@/ui/Crash';
import { LULL_API } from './lull';

const META = 'lull.sync.v1';
const LIB_KEYS = ['onboarded', 'favArtists', 'liked', 'savedPlaylists', 'playlists', 'history', 'recentSearches', 'settings'] as const;
const TASTE_KEYS = ['months', 'artistSkips', 'hiddenTracks', 'hiddenArtists', 'reco'] as const;

let changedAt = 0;
let applying = false;
let started = false;
let pushT: ReturnType<typeof setTimeout> | null = null;

const token = () => useLibrary.getState().account.token;
const saveMeta = () => AsyncStorage.setItem(META, JSON.stringify({ changedAt })).catch(() => {});

function snapshot() {
  const l: any = useLibrary.getState(), t: any = useTaste.getState();
  const lib = Object.fromEntries(LIB_KEYS.map((k) => [k, k === 'history' ? l.history.slice(0, 300) : l[k]]));
  const taste = Object.fromEntries(TASTE_KEYS.map((k) => [k, t[k]]));
  return { lib, taste };
}
function apply(data: any) {
  if (!data) return;
  applying = true;
  try {
    if (data.lib) useLibrary.setState(Object.fromEntries(LIB_KEYS.filter((k) => k in data.lib).map((k) => [k, data.lib[k]])) as any);
    if (data.taste) useTaste.setState(Object.fromEntries(TASTE_KEYS.filter((k) => k in data.taste).map((k) => [k, data.taste[k]])) as any);
  } finally { applying = false; }
}
const hasData = () => { const l = useLibrary.getState(); return l.onboarded || l.liked.length > 0 || l.playlists.length > 0 || l.favArtists.length > 0; };

async function call(body: object) {
  const r = await fetch(`${LULL_API}/api/auth/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token(), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `sync ${r.status}`);
  return j;
}

export async function push() {
  if (!token() || !changedAt) return;
  try { const r = await call({ op: 'put', at: changedAt, data: snapshot() }); log(`синхронизация: отправлено (${r.ok ? 'ok' : 'на сервере новее'})`); if (!r.ok) await pull(); }
  catch (e) { log(`синхронизация: не отправилось — ${(e as Error).message}`); }
}

/* Забрать с сервера; если на телефоне новее — отправить */
export async function pull() {
  if (!token()) return;
  try {
    const r = await call({ op: 'get' });
    if (r.at && r.at > changedAt) { apply(r.data); changedAt = r.at; saveMeta(); log('синхронизация: данные с сервера'); }
    else if ((!r.at && hasData()) || changedAt > (r.at || 0)) { if (!changedAt) { changedAt = Date.now(); saveMeta(); } await push(); }
  } catch (e) { log(`синхронизация: не получилось — ${(e as Error).message}`); }
}

const hydrated = (st: any) => new Promise<void>((res) => { if (st.persist?.hasHydrated?.()) res(); else st.persist?.onFinishHydration?.(() => res()); });

function changed() {
  if (applying) return;
  changedAt = Date.now(); saveMeta();
  if (pushT) clearTimeout(pushT);
  pushT = setTimeout(() => { pushT = null; push(); }, 4000);
}

/* Запуск: ждём, пока данные телефона загрузятся, забираем с сервера и только потом следим за изменениями */
export async function startSync() {
  if (started) return;
  started = true;
  await Promise.all([hydrated(useLibrary), hydrated(useTaste)]);
  try { changedAt = JSON.parse((await AsyncStorage.getItem(META)) || '{}').changedAt || 0; } catch {}
  await pull();
  useLibrary.subscribe((s: any, p: any) => { if (LIB_KEYS.some((k) => s[k] !== p[k])) changed(); });
  useTaste.subscribe((s: any, p: any) => { if (TASTE_KEYS.some((k) => s[k] !== p[k])) changed(); });
  AppState.addEventListener('change', (st) => { if (st === 'active') pull(); else if (pushT) { clearTimeout(pushT); pushT = null; push(); } });
}

/* Выход: сначала отправляем последние изменения, потом очищаем телефон — у следующего аккаунта будет своя библиотека */
export async function signOutSync() {
  if (pushT) { clearTimeout(pushT); pushT = null; }
  await Promise.race([push(), new Promise((r) => setTimeout(r, 5000))]);
  applying = true;
  try {
    useLibrary.setState({ onboarded: false, favArtists: [], liked: [], savedPlaylists: [], playlists: [], history: [], recentSearches: [] } as any);
    useTaste.getState().resetTaste();
  } finally { applying = false; }
  changedAt = 0; saveMeta();
}
