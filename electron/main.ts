import { healProxy, installRelayCertCheck, relayHealth, xfetch } from './relay';
import { preparePlayback, playbackMeta } from './playback';
import { ensureYtDlp } from './ytdlp';
import { diagnose } from './diagnose';
import { logDir, startFileLog } from './log';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC } from '../shared/api';
import type { SearchFilter, Track } from '../shared/types';
import { configureDiscord, discordStatus, setDiscordActivity } from './discord';
import { ACCOUNTS_ENABLED, DISCORD_CLIENT_ID } from '../shared/config';
import { dirSize, download, downloadsDir, listDownloads, removeDownload } from './downloads';
import { lyrics } from './lyrics';
import { accountState, login, logout, restoreAuth, selectChannel } from './auth';
import { importPlaylist } from './importer';
import { configureOverlay, pushOverlay, restoreOverlay } from './overlay';
import { clearHotkeys, setHotkeys } from './hotkeys';
import type { OverlayOptions, OverlayState } from '../shared/types';
import { clearImageCache, handleMediaScheme, registerMediaScheme } from './protocol';
import { flushStore, storeGet, storeSet } from './store';
import * as ytApi from './yt';
import { receiveAccountUrl, registerAccountIpc } from './account';

const here = path.dirname(fileURLToPath(import.meta.url));

// Приложение переименовано из Player в Lull — библиотека и настройки остаются в старой папке, если она есть
{
  const requestedData = app.commandLine.getSwitchValue('user-data-dir');
  const old = path.join(app.getPath('appData'), 'Player');
  const cur = path.join(app.getPath('appData'), 'Lull');
  if (requestedData && path.isAbsolute(requestedData)) app.setPath('userData', requestedData);
  else if (fs.existsSync(old) && !fs.existsSync(cur)) app.setPath('userData', old);
  else app.setPath('userData', cur);
  app.setName('Lull');
}
const devUrl = process.env.VITE_DEV_SERVER_URL;

registerMediaScheme();

// Одна копия приложения. В режиме разработки новая копия (со свежим кодом) вытесняет старую,
// иначе можно незаметно продолжать тестировать старую версию, оставшуюся в фоне.
let hasLock = app.requestSingleInstanceLock();
if (!hasLock && !process.env.VITE_DEV_SERVER_URL) app.quit();

let win: BrowserWindow | null = null;

function createWindow() {
  const bounds = storeGet<{ width: number; height: number; x?: number; y?: number; maximized?: boolean }>('window');
  win = new BrowserWindow({
    width: bounds?.width ?? 1360,
    height: bounds?.height ?? 860,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#0B0B0E',
    title: 'Lull',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  if (bounds?.maximized) win.maximize();

  win.once('ready-to-show', () => win?.show());
  // Закрыли главное окно — закрываем и оверлей
  win.on('closed', () => {
    for (const w of BrowserWindow.getAllWindows()) w.close();
    win = null;
  });
  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    storeSet('window', { ...win.getNormalBounds(), maximized: win.isMaximized() });
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('maximize', () => win?.webContents.send(IPC.winMaximized, true));
  win.on('unmaximize', () => win?.webContents.send(IPC.winMaximized, false));

  // Внешние ссылки открываем в браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Диагностика: ошибки интерфейса — в терминал, F12 / Ctrl+Shift+I — инструменты разработчика
  const wc = win.webContents;
  wc.on('console-message', (e) => {
    const { level, message, sourceId, lineNumber } = e as unknown as { level: string | number; message: string; sourceId: string; lineNumber: number };
    if (level === 'error' || level === 3 || level === 'warning' || level === 2) console.log(`[renderer ${level}] ${message} (${sourceId}:${lineNumber})`);
  });
  wc.on('did-fail-load', (_e, code, desc, url) => console.log(`[load failed] ${code} ${desc} ${url}`));
  wc.on('render-process-gone', (_e, d) => console.log(`[renderer gone] ${d.reason}`));
  wc.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) wc.toggleDevTools();
  });

  loadApp(win, '');
}

/** Загрузить интерфейс в окно; hash выбирает экран (например, #/overlay). */
function loadApp(w: BrowserWindow, hash: string) {
  if (devUrl) void w.loadURL(devUrl + hash);
  else void w.loadFile(path.join(here, '../dist/index.html'), { hash: hash.replace(/^#/, '') });
}

function registerIpc() {
  const handle = (ch: string, fn: (...args: any[]) => unknown) => ipcMain.handle(ch, (_e, ...args) => fn(...args));

  handle(IPC.home, (chip?: string) => ytApi.home(chip));
  handle(IPC.homeChips, () => ytApi.homeChips());
  handle(IPC.charts, () => ytApi.charts());
  handle(IPC.search, (q: string, f?: SearchFilter) => ytApi.search(q, f));
  handle(IPC.suggest, (q: string) => ytApi.suggest(q));
  handle(IPC.suggestRich, (q: string) => ytApi.suggestRich(q));
  handle(IPC.album, (id: string) => ytApi.album(id));
  handle(IPC.playlist, (id: string) => ytApi.playlist(id));
  handle(IPC.artist, (id: string) => ytApi.artist(id));
  handle(IPC.upNext, (id: string) => ytApi.upNext(id));
  handle(IPC.lyrics, (t: Track) => lyrics(t));
  handle(IPC.prepareStream, async (id: string, prefetch?: boolean, hint?: { title: string; artist: string }) => {
    if (hint) ytApi.rememberHint(id, hint);
    // Заготовка заранее не удалась — это не ошибка для пользователя, не засоряем журнал
    const s = prefetch
      ? await preparePlayback(id, true).catch(() => null)
      : await preparePlayback(id);
    if (!s) return null;
    return playbackMeta(id, s);
  });
  handle(IPC.visitorData, () => ytApi.getVisitorData());
  handle(IPC.setPoToken, (token: string, visitor: string) => ytApi.setPoToken(token, visitor));
  handle(IPC.relayHealth, (raw?: string) => relayHealth(raw));
  handle(IPC.netFetch, async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
    // Только адреса Google, нужные для BotGuard
    if (!/^https:\/\/([a-z0-9-]+\.)*(google|googleapis|youtube|gstatic)\.com\//.test(url)) throw new Error('Адрес не разрешён');
    const r = await xfetch(url, { method: init.method ?? 'GET', headers: init.headers, body: init.body });
    return { status: r.status, text: await r.text() };
  });

  handle(IPC.storeGet, (key: string) => storeGet(key));
  handle(IPC.storeSet, (key: string, value: unknown) => storeSet(key, value));

  ipcMain.handle(IPC.download, (e, t: Track) => download(t, e.sender));
  handle(IPC.removeDownload, (id: string) => removeDownload(id));
  handle(IPC.listDownloads, () => listDownloads());

  ipcMain.on(IPC.winMinimize, () => win?.minimize());
  ipcMain.on(IPC.winMaximize, () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on(IPC.winClose, () => win?.close());

  handle(IPC.discordActivity, (p) => setDiscordActivity(p));
  handle(IPC.discordConfigure, (on: boolean, id: string) => configureDiscord(on, id || DISCORD_CLIENT_ID));
  handle(IPC.openExternal, (url: string) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : undefined));
  handle(IPC.cacheInfo, async () => ({
    bytes: (await session.defaultSession.getCacheSize()) + (await dirSize(path.join(app.getPath('userData'), 'yt-cache'))),
    downloadsBytes: await dirSize(downloadsDir())
  }));
  handle(IPC.clearCache, async () => {
    await session.defaultSession.clearCache();
    clearImageCache();
  });
  handle(IPC.appVersion, () => app.getVersion());
  handle(IPC.diagnose, (t: Track) => diagnose(t));
  handle(IPC.openLogs, () => shell.openPath(logDir()).then(() => undefined));

  handle(IPC.ytLogin, () => ACCOUNTS_ENABLED ? Promise.reject(new Error('Вход доступен через аккаунт Lull')) : login(win ?? undefined));
  handle(IPC.ytLogout, () => logout());
  handle(IPC.ytAccount, () => accountState());
  handle(IPC.ytSelectChannel, (id: string | null) => selectChannel(id));
  handle(IPC.ytLibrary, () => ACCOUNTS_ENABLED ? { playlists: [], liked: [] } : ytApi.accountLibrary());
  handle(IPC.discordStatus, () => discordStatus());
  ipcMain.handle(IPC.importPlaylist, (e, url: string) => importPlaylist(url, e.sender));
  handle(IPC.overlayConfigure, (o: OverlayOptions) => configureOverlay(o, path.join(here, 'preload.cjs'), loadApp));
  ipcMain.on(IPC.overlayPush, (_e, s: OverlayState) => pushOverlay(s));
  handle(IPC.setHotkeys, (m) => setHotkeys(m, () => win));
}

app.on('open-url', (e, url) => { e.preventDefault(); receiveAccountUrl(url, win?.webContents); });
for (const arg of process.argv) if (arg.startsWith('lull://auth/')) receiveAccountUrl(arg);
app.on('second-instance', (_event, argv) => {
  for (const arg of argv) if (arg.startsWith('lull://auth/')) receiveAccountUrl(arg, win?.webContents);
  if (devUrl) {
    console.log('[app] запущена новая копия в режиме разработки — закрываюсь');
    app.exit(0);
    return;
  }
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  // Сертификат сервера Lull проверяем по отпечатку из строки подключения
  installRelayCertCheck();
  relayHealth().then((h) => console.log(`[relay] ${h.ok ? `на связи за ${h.ms} мс · ${h.detail}` : `не отвечает: ${h.detail}`}`));
  // Выключенный VPN с оставленным системным прокси не должен ломать плеер
  await healProxy();
  setInterval(() => void healProxy(), 60_000);
  // Ждём, пока старая копия закроется и отдаст блокировку
  for (let i = 0; !hasLock && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    hasLock = app.requestSingleInstanceLock();
  }
  startFileLog();
  // Spotify убран — стираем сохранённый вход, если он был
  if (storeGet('spotifyAuth')) storeSet('spotifyAuth', null);
  // yt-dlp готовим заранее, чтобы первый «трудный» трек не ждал скачивания
  setTimeout(() => void ensureYtDlp(), 4000);
  handleMediaScheme();
  registerIpc();
  registerAccountIpc(() => win?.webContents);
  if (app.isPackaged) app.setAsDefaultProtocolClient('lull');
  createWindow();
  const s = storeGet<{ discordRpc?: boolean; discordClientId?: string }>('settings');
  const discordId = s?.discordClientId || DISCORD_CLIENT_ID;
  if (s?.discordRpc && discordId) void configureDiscord(true, discordId);
  // Восстанавливаем вход в YouTube и прогреваем сессию
  if (ACCOUNTS_ENABLED) void ytApi.yt().catch(() => {});
  else void restoreAuth().finally(() => void ytApi.yt().catch(() => {}));
  restoreOverlay(path.join(here, 'preload.cjs'), loadApp);
});

app.on('before-quit', () => flushStore());
app.on('will-quit', () => clearHotkeys());
app.on('window-all-closed', () => {
  flushStore();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
