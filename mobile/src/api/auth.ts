/* Вход через Telegram-бота или Google: открываем ссылку, ждём подтверждения на сервере Lull. */
import * as WebBrowser from 'expo-web-browser';
import { AppState, Linking, Platform } from 'react-native';
import { create } from 'zustand';

import { useLibrary } from '@/store/library';
import { LULL_API } from './lull';

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

export async function checkNow() {
  const w = useAuthWait.getState().wait;
  if (!w) return;
  try {
    const r = await fetch(`${LULL_API}/api/auth/poll?nonce=${encodeURIComponent(w.nonce)}`).then((x) => x.json());
    if (r.status === 'ok') {
      stop();
      useLibrary.getState().setAccount({ provider: w.provider === 'telegram' ? 'Telegram' : 'Google', name: r.user.name, avatar: r.user.avatar, token: r.token, userId: r.user.id });
      const f = onDone; onDone = null; f?.();
    } else if (r.status === 'expired') {
      stop();
      useAuthWait.setState({ error: 'Время на вход вышло. Попробуй ещё раз.' });
    }
  } catch { /* сеть мигнула — спросим ещё раз */ }
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  useAuthWait.setState({ wait: null });
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
  onDone = () => { WebBrowser.dismissBrowser?.(); done(); };
  if (timer) clearInterval(timer);
  timer = setInterval(checkNow, 1500);
  await openAuthUrl(url, provider);
}

/* Вернулись в приложение — сразу проверяем, не дожидаясь таймера */
AppState.addEventListener('change', (s) => { if (s === 'active') checkNow(); });
if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNow(); });

export async function logoutServer() {
  const token = useLibrary.getState().account.token;
  if (token) post('logout', { token }).catch(() => {});
}
