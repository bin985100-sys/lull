/* Синхронизация с аккаунтом: любимые треки, плейлисты, исполнители, история, статистика и настройки.
   Снимок хранится на сервере Lull.

   Правила (из них и тесты в scripts/sync.test.mjs):
   1. При входе сервер — главный. Есть данные на сервере → берём их, нет → это новый аккаунт: чистый лист и выбор артистов.
   2. Данные на телефоне помечены владельцем (userId). Вошёл другой человек — чужое стираем до загрузки.
   3. Пока библиотека аккаунта не загрузилась хотя бы раз, на сервер ничего не отправляем —
      иначе пустой телефон мог перезаписать чужую или свою же библиотеку.
   4. После загрузки: кто новее — тот и прав, изменения уходят на сервер через несколько секунд. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { useLibrary } from '@/store/library';
import { useTaste } from '@/store/taste';
import { log } from '@/ui/Crash';
import { LULL_API } from './lull';

const META = 'lull.sync.v1';
const LIB_KEYS = ['onboarded', 'favArtists', 'liked', 'savedPlaylists', 'playlists', 'history', 'recentSearches', 'settings'] as const;
const TASTE_KEYS = ['months', 'artistSkips', 'hiddenTracks', 'hiddenArtists', 'reco'] as const;

/* changedAt — когда менялись данные на телефоне; owner — чьи это данные; confirmed — библиотека owner уже загружена с сервера */
let changedAt = 0;
let owner: string | undefined;
let confirmed = false;
let metaLoaded = false;
let applying = false;
let started = false;
let pushT: ReturnType<typeof setTimeout> | null = null;

const token = () => useLibrary.getState().account.token;
const uid = () => useLibrary.getState().account.userId;
const saveMeta = () => AsyncStorage.setItem(META, JSON.stringify({ changedAt, owner, confirmed })).catch(() => {});
async function loadMeta() {
  if (metaLoaded) return;
  metaLoaded = true;
  try { const m = JSON.parse((await AsyncStorage.getItem(META)) || '{}'); changedAt = m.changedAt || 0; owner = m.owner; confirmed = !!m.confirmed; } catch {}
}

function snapshot() {
  const l: any = useLibrary.getState(), t: any = useTaste.getState();
  const lib = Object.fromEntries(LIB_KEYS.map((k) => [k, k === 'history' ? l.history.slice(0, 300) : l[k]]));
  const taste = Object.fromEntries(TASTE_KEYS.map((k) => [k, t[k]]));
  return { lib, taste };
}
function quietly(f: () => void) { applying = true; try { f(); } finally { applying = false; } }
function apply(data: any) {
  if (!data) return;
  quietly(() => {
    if (data.lib) useLibrary.setState(Object.fromEntries(LIB_KEYS.filter((k) => k in data.lib).map((k) => [k, data.lib[k]])) as any);
    if (data.taste) useTaste.setState(Object.fromEntries(TASTE_KEYS.filter((k) => k in data.taste).map((k) => [k, data.taste[k]])) as any);
  });
}
/* чистый лист: как у только что установленного приложения (настройки звука оставляем — это про телефон) */
function resetLocal() {
  quietly(() => {
    useLibrary.setState({ onboarded: false, favArtists: [], liked: [], savedPlaylists: [], playlists: [], history: [], recentSearches: [] } as any);
    useTaste.getState().resetTaste();
  });
  changedAt = 0;
}
const hasData = () => { const l = useLibrary.getState(); return l.onboarded || l.liked.length > 0 || l.playlists.length > 0 || l.favArtists.length > 0; };

async function call(body: object) {
  const r = await fetch(`${LULL_API}/api/auth/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token(), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `sync ${r.status}`);
  return j;
}

export async function push() {
  if (!token() || !changedAt || !confirmed || owner !== uid()) return;
  try { const r = await call({ op: 'put', at: changedAt, data: snapshot() }); log(`синхронизация: отправлено (${r.ok ? 'ok' : 'на сервере новее'})`); if (!r.ok) await pull(); }
  catch (e) { log(`синхронизация: не отправилось — ${(e as Error).message}`); }
}

/* Первая загрузка библиотеки аккаунта на этом телефоне. 'ok' — загрузили (или это новый аккаунт), 'error' — нет связи */
let loginFlight: Promise<'ok' | 'error'> | null = null;
export function loadAccount(): Promise<'ok' | 'error'> {
  if (!loginFlight) loginFlight = doLoadAccount().finally(() => { loginFlight = null; });
  return loginFlight;
}
async function doLoadAccount(): Promise<'ok' | 'error'> {
  await loadMeta();
  const me = uid();
  if (!token() || !me) return 'error';
  /* данные на телефоне без владельца — со старой версии без синхронизации, считаем их своими */
  const mine = owner === me || (owner === undefined && hasData());
  if (!mine) { log(`синхронизация: на телефоне чужие данные (${owner ?? 'нет'}), очищаю`); resetLocal(); }
  if (owner !== me) { owner = me; confirmed = false; saveMeta(); }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await call({ op: 'get' });
      if (r.at > 0 && !(mine && confirmed && changedAt > r.at)) {
        apply(r.data); changedAt = r.at;
        log('синхронизация: библиотека аккаунта загружена');
      } else if (!r.at && !mine) {
        resetLocal(); log('синхронизация: новый аккаунт');
      }
      confirmed = true; saveMeta();
      /* на телефоне своё и новее (или на сервере пусто, а у нас уже есть) — отправляем */
      if (mine && hasData() && changedAt === 0) changedAt = Date.now();
      if (mine && changedAt > (r.at || 0)) await push();
      return 'ok';
    } catch (e) {
      log(`синхронизация: загрузка не удалась (${attempt + 1}/3) — ${(e as Error).message}`);
      await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
    }
  }
  return 'error';
}

/* Обычная сверка (запуск, возврат в приложение) */
export async function pull() {
  if (!token()) return;
  await loadMeta();
  if (!confirmed || owner !== uid()) { await loadAccount(); return; }
  try {
    const r = await call({ op: 'get' });
    if (r.at && r.at > changedAt) { apply(r.data); changedAt = r.at; saveMeta(); log('синхронизация: данные с сервера'); }
    else if (changedAt > (r.at || 0)) await push();
  } catch (e) { log(`синхронизация: не получилось — ${(e as Error).message}`); }
}

const hydrated = (st: any) => new Promise<void>((res) => { if (st.persist?.hasHydrated?.()) res(); else st.persist?.onFinishHydration?.(() => res()); });

function changed() {
  if (applying) return;
  changedAt = Date.now(); saveMeta();
  if (pushT) clearTimeout(pushT);
  pushT = setTimeout(() => { pushT = null; push(); }, 4000);
}

/* Запуск: ждём, пока данные телефона загрузятся, сверяемся с сервером и только потом следим за изменениями */
export async function startSync() {
  if (started) return;
  started = true;
  await Promise.all([hydrated(useLibrary), hydrated(useTaste)]);
  await loadMeta();
  useLibrary.subscribe((s: any, p: any) => { if (LIB_KEYS.some((k) => s[k] !== p[k])) changed(); });
  useTaste.subscribe((s: any, p: any) => { if (TASTE_KEYS.some((k) => s[k] !== p[k])) changed(); });
  AppState.addEventListener('change', (st) => { if (st === 'active') pull(); else if (pushT) { clearTimeout(pushT); pushT = null; push(); } });
  await pull();
}

/* Выход: сначала отправляем последние изменения, потом очищаем телефон — у следующего аккаунта будет своя библиотека */
export async function signOutSync() {
  if (pushT) { clearTimeout(pushT); pushT = null; }
  await Promise.race([push(), new Promise((r) => setTimeout(r, 5000))]);
  resetLocal();
  owner = undefined; confirmed = false; saveMeta();
}

/* для тестов */
export const _syncState = () => ({ changedAt, owner, confirmed });
export function _resetForTests() { changedAt = 0; owner = undefined; confirmed = false; metaLoaded = false; started = false; loginFlight = null; if (pushT) clearTimeout(pushT); pushT = null; }
