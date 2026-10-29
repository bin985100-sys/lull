import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { cloud, sessionProvider } from './client';

export const useGoogleConnection = create<{ connected: boolean | null; error: string }>(() => ({ connected: null, error: '' }));
const messages: Record<string,string> = {
  google_reconnect_required: 'Доступ Google отозван или истёк. Войди через Google ещё раз, чтобы обновить музыку.',
  invalid_google_identity: 'Не удалось подтвердить доступ Google. Войди через Google ещё раз.',
  google_identity_mismatch: 'Этот Google-аккаунт не связан с текущим аккаунтом Lull.',
  youtube_access_denied: 'YouTube не разрешил чтение библиотеки. Проверь разрешение доступа при входе Google.',
  unauthorized: 'Сессия Lull истекла. Войди снова.'
};
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!cloud) throw new Error('Вход ещё не настроен');
  const { data, error } = await cloud.functions.invoke('lull-youtube', { body });
  if (error) {
    let code = '';
    if (error.context instanceof Response) {
      const detail = await error.context.json().catch(() => null);
      code = detail?.error ?? '';
    }
    if (code === 'google_reconnect_required') useGoogleConnection.setState({ connected: false });
    throw new Error(messages[code] ?? 'Подключение YouTube временно недоступно. Попробуй ещё раз.');
  }
  return data as T;
}
export async function saveGoogleConnection(session: Session) {
  if (!session.provider_token || await sessionProvider(session) !== 'google') return false;
  try {
    await invoke({ action: 'connect', accessToken: session.provider_token, refreshToken: session.provider_refresh_token ?? null });
    useGoogleConnection.setState({ connected: true, error: '' });
    return true;
  } catch (e) {
    useGoogleConnection.setState({ connected: false, error: e instanceof Error ? e.message : 'Не удалось подключить YouTube' });
    return false;
  }
}
export async function refreshGoogleStatus() {
  const { connected } = await invoke<{connected:boolean}>({ action: 'status' });
  useGoogleConnection.setState({ connected, error: '' });
  return connected;
}
export async function ensureGoogleConnection(session: Session) {
  if (await refreshGoogleStatus()) return true;
  return saveGoogleConnection(session);
}
export function requestYoutube<T>(resource: string, params: Record<string, string>) {
  return invoke<{items:T[];nextPageToken?:string}>({ action: 'request', resource, params });
}
