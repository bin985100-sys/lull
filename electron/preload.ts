import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type Api } from '../shared/api';


/**
 * Обложки YouTube Music приходят в нужном размере прямо в ссылке (=w226-h226…).
 * Маленькие (в том числе уже сохранённые в библиотеке) поднимаем до 544 — иначе
 * на большой обложке плеера они размыты. Больше 544 не трогаем.
 */
function sharpThumb(src: string): string {
  if (!/googleusercontent\.com|ggpht\.com/.test(src)) return src;
  const m = src.match(/=w(\d+)-h(\d+)/);
  if (m && Number(m[1]) >= 544) return src;
  if (m) return src.replace(/=w\d+-h\d+[^&?#]*/, '=w544-h544-l90-rj');
  if (/=s(\d+)/.test(src)) return src.replace(/=s(\d+)([^&?#]*)/, (all, n) => (Number(n) >= 544 ? all : '=s544'));
  return src;
}

const invoke = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args);
const on = <T>(ch: string, cb: (v: T) => void) => {
  const fn = (_e: unknown, v: T) => cb(v);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

const api: Api = {
  accountStorage: { get: (key) => invoke(IPC.accountStorageGet, key), set: (key, value) => invoke(IPC.accountStorageSet, key, value) },
  accountCallback: () => invoke(IPC.accountCallback),
  onAccountCallback: (cb) => on(IPC.accountCallbackEvent, cb),
  platform: process.platform,
  home: (chip) => invoke(IPC.home, chip),
  homeChips: () => invoke(IPC.homeChips),
  charts: () => invoke(IPC.charts),
  search: (q, f) => invoke(IPC.search, q, f),
  suggest: (q) => invoke(IPC.suggest, q),
  suggestRich: (q) => invoke(IPC.suggestRich, q),
  diagnose: (t) => invoke(IPC.diagnose, t),
  openLogs: () => invoke(IPC.openLogs),
  album: (id) => invoke(IPC.album, id),
  playlist: (id) => invoke(IPC.playlist, id),
  artist: (id) => invoke(IPC.artist, id),
  upNext: (id) => invoke(IPC.upNext, id),
  lyrics: (t) => invoke(IPC.lyrics, t),
  streamUrl: (id) => `media://stream/${encodeURIComponent(id)}`,
  imageUrl: (src) => `media://img/?u=${encodeURIComponent(sharpThumb(src))}`,
  prepareStream: (id, prefetch, hint) => invoke(IPC.prepareStream, id, prefetch, hint),
  relayHealth: (raw) => invoke(IPC.relayHealth, raw),
  storeGet: (k) => invoke(IPC.storeGet, k),
  storeSet: (k, v) => invoke(IPC.storeSet, k, v),
  download: (t) => invoke(IPC.download, t),
  removeDownload: (id) => invoke(IPC.removeDownload, id),
  listDownloads: () => invoke(IPC.listDownloads),
  onDownloadProgress: (cb) => on(IPC.downloadProgress, cb),
  windowMinimize: () => ipcRenderer.send(IPC.winMinimize),
  windowToggleMaximize: () => ipcRenderer.send(IPC.winMaximize),
  windowClose: () => ipcRenderer.send(IPC.winClose),
  onMaximizedChange: (cb) => on(IPC.winMaximized, cb),
  visitorData: () => invoke(IPC.visitorData),
  setPoToken: (t, v) => invoke(IPC.setPoToken, t, v),
  netFetch: (url, init) => invoke(IPC.netFetch, url, init),
  discordActivity: (p) => invoke(IPC.discordActivity, p),
  discordConfigure: (on, id) => invoke(IPC.discordConfigure, on, id),
  openExternal: (url) => invoke(IPC.openExternal, url),
  cacheInfo: () => invoke(IPC.cacheInfo),
  clearCache: () => invoke(IPC.clearCache),
  appVersion: () => invoke(IPC.appVersion),
  ytLogin: () => invoke(IPC.ytLogin),
  ytLogout: () => invoke(IPC.ytLogout),
  discordStatus: () => invoke(IPC.discordStatus),
  ytAccount: () => invoke(IPC.ytAccount),
  ytSelectChannel: (id) => invoke(IPC.ytSelectChannel, id),
  ytLibrary: () => invoke(IPC.ytLibrary),
  importPlaylist: (url) => invoke(IPC.importPlaylist, url),
  onImportProgress: (cb) => on(IPC.importProgress, cb),
  overlayConfigure: (o) => invoke(IPC.overlayConfigure, o),
  overlayPush: (s) => ipcRenderer.send(IPC.overlayPush, s),
  onOverlayState: (cb) => on(IPC.overlayState, cb),
  onOverlayOptions: (cb) => on(IPC.overlayOptions, cb),
  setHotkeys: (m) => invoke(IPC.setHotkeys, m),
  onHotkey: (cb) => on(IPC.hotkey, cb)
};

contextBridge.exposeInMainWorld('api', api);
