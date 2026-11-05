/* Вход через Telegram-бота или Google: открываем ссылку, ждём подтверждения на сервере Lull. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Linking, Platform } from 'react-native';
import { create } from 'zustand';

import { useLibrary } from '@/store/library';
import { LULL_API } from './lull';
import { finishLogin } from './session';

export type Provider = 'telegram' | 'google';
type Wait = { provider: Provider; nonce: string; url: string } | null;
export const useAuthWait = create<{ wait: Wait; error: string | null }>(() => ({ wait: null, error: null }));

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${LULL_API}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {
    throw new Error('Нет связи с сервером Lull');
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Сервер ответил ${r.status}`);
  return j as T;
}

let timer: ReturnType<typeof setInterval> | null = null;
let onDone: (() => void) | null = null;

/* Незавершённый вход храним на устройстве: Android может выгрузить приложение, пока человек в Telegram или в браузере */
const KEY = 'lull.authWait';
const saveWait = (w: Wait) => (w ? AsyncStorage.setItem(KEY, JSON.stringify({ ...w, at: Date.now() })) : AsyncStorage.removeItem(KEY)).catch(() => {});
export async function restoreWait() {
  if (useAuthWait.getState().wait) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const w = raw && JSON.parse(raw);
    if (w?.nonce && Date.now() - (w.at || 0) < 10 * 60e3) useAuthWait.setState({ wait: { provider: w.provider, nonce: w.nonce, url: w.url } });
  } catch {}
}

let inflight: Promise<void> | null = null;
/* Одна проверка за раз: параллельные опросы раньше давали «время вышло» сразу после успешного входа */
export function checkNow(nonce?: string, provider?: Provider): Promise<void> {
  if (!inflight) inflight = doCheck(nonce, provider).finally(() => { inflight = null; });
  return inflight;
}
async function doCheck(nonceArg?: string, providerArg?: Provider) {
  await restoreWait();
  const w = useAuthWait.getState().wait;
  const nonce = nonceArg || w?.nonce;
  if (!nonce) return;
  const provider = providerArg || w?.provider || 'telegram';
  try {
    const r = await fetch(`${LULL_API}/api/auth/poll?nonce=${encodeURIComponent(nonce)}`).then((x) => x.json());
    if (r.status === 'ok' && r.token) {
      stop();
      const prov = r.user?.provider === 'google' || provider === 'google' ? 'Google' : 'Telegram';
      useLibrary.getState().setAccount({ provider: prov, name: r.user.name, avatar: r.user.avatar, token: r.token, userId: r.user.id, youtube: r.user.youtube?.name ?? null });
      const f = onDone; onDone = null;
      /* приложение перезапускалось и экран входа уже не ждёт — переходим сами */
      if (f) f(); else finishLogin();
    } else if (r.status === 'expired' && !useLibrary.getState().account.token && w?.nonce === nonce) {
      stop();
      useAuthWait.setState({ error: 'Время на вход вышло. Попробуй ещё раз.' });
    }
  } catch { /* сеть мигнула — спросим ещё раз */ }
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  useAuthWait.setState({ wait: null });
  saveWait(null);
}
export const cancelLogin = stop;

export async function openAuthUrl(url: string, provider: Provider) {
  if (Platform.OS === 'web') { window.open(url, '_blank'); return; }
  /* Telegram — в приложении Telegram; Google — в системном браузере (во встроенных окнах Google вход запрещает) */
  if (provider === 'telegram') await Linking.openURL(url);
  else await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }).catch(() => Linking.openURL(url));
}

export async function login(provider: Provider, done: () => void) {
  useAuthWait.setState({ error: null });
  const { nonce, url } = await post<{ nonce: string; url: string }>('start', { provider });
  useAuthWait.setState({ wait: { provider, nonce, url } });
  saveWait({ provider, nonce, url });
  onDone = () => { WebBrowser.dismissBrowser?.(); done(); };
  if (timer) clearInterval(timer);
  timer = setInterval(() => { checkNow(); }, 1500);
  await openAuthUrl(url, provider);
}

/* Вернулись в приложение — сразу проверяем, не дожидаясь таймера */
AppState.addEventListener('change', (s) => { if (s === 'active') checkNow(); });
/* приложение запустили заново, а вход ещё ждёт подтверждения — продолжаем опрос */
restoreWait().then(() => { if (useAuthWait.getState().wait && !timer) timer = setInterval(() => { checkNow(); }, 1500); });
if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNow(); });

export async function logoutServer() {
  const token = useLibrary.getState().account.token;
  if (token) post('logout', { token }).catch(() => {});
}

/* Удалить аккаунт на сервере: профиль, библиотеку и доступ к YouTube Music */
export async function deleteAccountServer() {
  const token = useLibrary.getState().account.token;
  if (token) await post('delete', { token });
}
