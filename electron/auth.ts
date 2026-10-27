import { BrowserWindow, safeStorage, session } from 'electron';
import { storeGet, storeSet } from './store';
import { accountChannels, isAuthBroken, setAuth } from './yt';
import { resetYtDlpCookies } from './ytdlp';

/**
 * Вход в YouTube Music: обычное окно входа Google в отдельной сессии.
 * После входа берём cookies youtube.com и храним их зашифрованными системным
 * хранилищем ключей (safeStorage). Без шифрования не сохраняем вообще.
 */
const PARTITION = 'persist:youtube-auth';
const KEY = 'ytAuth';

interface Saved {
  enc: string;
  pageId?: string;
  /** cookie — вход через окно Google; oauth — старый вход по QR-коду (YouTube Music его не принимает) */
  kind?: 'cookie' | 'oauth';
}

const encrypt = (text: string) => safeStorage.encryptString(text).toString('base64');
const decrypt = (enc: string) => safeStorage.decryptString(Buffer.from(enc, 'base64'));

/** Применить сохранённый вход любого вида. */
async function apply(saved: Saved, pageId = saved.pageId) {
  const data = decrypt(saved.enc);
  await setAuth(data, pageId);
}



async function cookieHeader(): Promise<string | null> {
  const ses = session.fromPartition(PARTITION);
  const list = await ses.cookies.get({ domain: '.youtube.com' });
  if (!list.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID')) return null;
  return list.map((c) => `${c.name}=${c.value}`).join('; ');
}

function save(cookie: string, pageId?: string) {
  resetYtDlpCookies();
  if (!safeStorage.isEncryptionAvailable()) return;
  storeSet(KEY, { enc: encrypt(cookie), pageId, kind: 'cookie' } satisfies Saved);
}

/** При запуске: восстановить вход, если он был. */
export async function restoreAuth() {
  const saved = storeGet<Saved>(KEY);
  if (!saved?.enc || !safeStorage.isEncryptionAvailable()) return;
  // Вход по QR-коду YouTube Music отклоняет (ошибка 400 на всё) — забываем его
  if (saved.kind === 'oauth') {
    console.warn('[auth] старый вход по QR-коду удалён — войди через окно Google');
    storeSet(KEY, null);
    return;
  }
  try {
    await apply(saved);
  } catch {
    storeSet(KEY, null);
  }
}

export function login(parent?: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent,
      modal: !!parent,
      title: 'Вход в YouTube Music',
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true }
    });
    let done = false;
    const check = async () => {
      const cookie = await cookieHeader();
      if (!cookie || done) return;
      done = true;
      save(cookie);
      await setAuth(cookie);
      win.close();
      resolve(true);
    };
    win.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith('https://music.youtube.com')) void check();
    });
    win.on('closed', () => !done && resolve(false));
    void win.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F');
  });
}

export async function logout() {
  resetYtDlpCookies();
  await session.fromPartition(PARTITION).clearStorageData();
  storeSet(KEY, null);
  await setAuth(undefined);
}

export async function selectChannel(pageId: string | null) {
  const saved = storeGet<Saved>(KEY);
  if (!saved?.enc) return;
  storeSet(KEY, { ...saved, pageId: pageId ?? undefined });
  await setAuth(decrypt(saved.enc), pageId ?? undefined);
}

export async function accountState() {
  const saved = storeGet<Saved>(KEY);
  if (!saved?.enc) return { signedIn: false, channels: [] as Awaited<ReturnType<typeof accountChannels>> };
  try {
    const channels = await accountChannels();
    // Сохранённый канал больше не существует — сбрасываем выбор
    if (saved.pageId && !channels.some((c) => c.pageId === saved.pageId)) await selectChannel(null);
    return { signedIn: true, channels, broken: isAuthBroken(), method: saved.kind ?? 'cookie' };
  } catch {
    return { signedIn: true, channels: [], broken: isAuthBroken(), method: saved.kind ?? 'cookie' };
  }
}
