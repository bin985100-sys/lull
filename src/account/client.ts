import { createClient } from '@supabase/supabase-js';
import { Capacitor, registerPlugin } from '@capacitor/core';

export const accountsEnabled = import.meta.env.VITE_ACCOUNTS_ENABLED === 'true';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const secure = window.api?.accountStorage;
const nativeStorage = registerPlugin<{ get(o: { key: string }): Promise<{ value: string | null }>; set(o: { key: string; value: string | null }): Promise<void> }>('AccountStorage');
const storage = secure ? {
  getItem: (k: string) => secure.get(k), setItem: (k: string, v: string) => secure.set(k, v), removeItem: (k: string) => secure.set(k, null)
} : Capacitor.isNativePlatform() ? {
  getItem: async (key: string) => (await nativeStorage.get({ key })).value,
  setItem: (key: string, value: string) => nativeStorage.set({ key, value }),
  removeItem: (key: string) => nativeStorage.set({ key, value: null })
} : undefined;
export const cloud = url && key ? createClient(url, key, {
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) }) },
  auth: {
    flowType: 'pkce', detectSessionInUrl: false, storageKey: 'lull-account',
    storage
  }
}) : null;

let exchange: Promise<void> | undefined;
export function acceptCallback(raw: string): Promise<void> {
  const target = new URL(raw);
  const native = target.protocol === 'lull:' && target.hostname === 'auth' && target.pathname === '/callback';
  const web = target.origin === location.origin && target.pathname === '/auth/callback';
  if (!native && !web) return Promise.reject(new Error('Неверный адрес возврата'));
  if (target.searchParams.has('error')) return Promise.reject(new Error(target.searchParams.get('error_description') || 'Вход отменён'));
  const code = target.searchParams.get('code');
  if (!code || !cloud) return Promise.resolve();
  return exchange ??= cloud.auth.exchangeCodeForSession(code).then(({ error }) => {
    if (error) throw error;
    if (web) history.replaceState(null, '', '/');
  }).finally(() => { exchange = undefined; });
}

export async function initializeAccount(onError: (message: string) => void) {
  if (!cloud) throw new Error('Вход ещё не настроен');
  const receive = (raw: string) => void acceptCallback(raw).catch((e: Error) => onError(e.message));
  window.api?.onAccountCallback?.(receive);
  const pending = await window.api?.accountCallback?.();
  if (pending) await acceptCallback(pending);
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    await App.addListener('appUrlOpen', ({ url }) => {
      receive(url);
      void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => {});
    });
    const launch = await App.getLaunchUrl();
    if (launch) await acceptCallback(launch.url);
  } else if (location.pathname === '/auth/callback') await acceptCallback(location.href);
  const { data, error } = await cloud.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn() {
  if (!cloud) throw new Error('Вход ещё не настроен');
  const external = !!window.api || Capacitor.isNativePlatform();
  const { data, error } = await cloud.auth.signInWithOAuth({
    provider: 'google', options: {
      redirectTo: external ? 'lull://auth/callback' : `${location.origin}/auth/callback`,
      scopes: 'https://www.googleapis.com/auth/youtube.readonly',
      queryParams: { access_type: 'offline', prompt: 'consent' }, skipBrowserRedirect: true
    }
  });
  if (error) throw error;
  if (!data.url) throw new Error('Не удалось открыть вход');
  if (window.api) await window.api.openExternal(data.url);
  else if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url });
  } else location.assign(data.url);
}
