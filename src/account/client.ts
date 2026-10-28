import { createClient, type Session } from '@supabase/supabase-js';
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

const oauthStorage = storage ?? {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key)
};
async function tokenHash(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function sessionProvider(session: Session): Promise<'google' | 'discord' | null> {
  if (!session.provider_token) return null;
  const saved = await oauthStorage.getItem('lull-account-provider');
  if (saved) {
    try {
      const record = JSON.parse(saved);
      if (record.user === session.user.id && record.hash === await tokenHash(session.provider_token)) return record.provider === 'google' ? 'google' : record.provider === 'discord' ? 'discord' : null;
    } catch { /* An invalid local record never determines token ownership. */ }
  }
  // Older single-provider sessions are unambiguous. For linked accounts the
  // primary app_metadata.provider does not identify the current OAuth token.
  const identities = session.user.identities ?? [];
  return identities.length === 1 && ['google', 'discord'].includes(identities[0].provider) ? identities[0].provider as 'google' | 'discord' : null;
}

let exchange: Promise<void> | undefined;
export function acceptCallback(raw: string): Promise<void> {
  const target = new URL(raw);
  const native = target.protocol === 'lull:' && target.hostname === 'auth' && target.pathname === '/callback';
  const web = target.origin === location.origin && target.pathname === '/auth/callback';
  if (!native && !web) return Promise.reject(new Error('Неверный адрес возврата'));
  if (target.searchParams.has('error')) return Promise.reject(new Error(target.searchParams.get('error_description') || 'Вход отменён'));
  const code = target.searchParams.get('code');
  if (!code || !cloud) return Promise.resolve();
  return exchange ??= cloud.auth.exchangeCodeForSession(code).then(async ({ data, error }) => {
    if (error) throw error;
    const provider = await oauthStorage.getItem('lull-account-oauth-intent');
    if (data.session?.provider_token && (provider === 'google' || provider === 'discord')) {
      await oauthStorage.setItem('lull-account-provider', JSON.stringify({ user: data.session.user.id, hash: await tokenHash(data.session.provider_token), provider }));
    }
    await oauthStorage.removeItem('lull-account-oauth-intent');
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
  if (data.session) {
    const verified = await cloud.auth.getClaims(data.session.access_token);
    if (verified.error || verified.data?.claims.sub !== data.session.user.id) throw new Error('Не удалось подтвердить вход. Войди снова.');
  }
  return data.session;
}

export async function signIn(provider: 'google' | 'discord' = 'google', link = false) {
  if (!cloud) throw new Error('Вход ещё не настроен');
  const external = !!window.api || Capacitor.isNativePlatform();
  const request = {
    provider, options: {
      redirectTo: external ? 'lull://auth/callback' : `${location.origin}/auth/callback`,
      ...(provider === 'google' ? {
        scopes: 'https://www.googleapis.com/auth/youtube.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' }
      } : { scopes: 'identify email' }), skipBrowserRedirect: true
    }
  };
  const { data, error } = link ? await cloud.auth.linkIdentity(request) : await cloud.auth.signInWithOAuth(request);
  if (error) throw error;
  if (!data.url) throw new Error('Не удалось открыть вход');
  await oauthStorage.setItem('lull-account-oauth-intent', provider);
  if (window.api) await window.api.openExternal(data.url);
  else if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url });
  } else location.assign(data.url);
}
