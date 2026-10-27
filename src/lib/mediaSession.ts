/**
 * Экран блокировки, шторка уведомлений, наушники, медиаклавиши.
 * Android-приложение (Capacitor) — нативный MediaSession с фоновой службой (звук не обрывается в фоне),
 * остальное — стандартный navigator.mediaSession.
 */
type Handler = (d: { seekTime?: number | null }) => void;
interface Meta { title: string; artist: string; album: string; artwork: string | undefined }

const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
const native = !!cap?.isNativePlatform?.();
// Keep the module namespace: Capacitor proxies expose a synthetic `then`
// method, so resolving a Promise with the plugin itself never settles.
const plugin = native ? import('@jofr/capacitor-media-session').catch(() => null) : Promise.resolve(null);
const web = 'mediaSession' in navigator ? navigator.mediaSession : null;

export function setMeta(m: Meta) {
  const artwork = m.artwork ? [{ src: m.artwork, sizes: '512x512', type: 'image/jpeg' }] : [];
  void plugin.then((p) => p?.MediaSession.setMetadata({ title: m.title, artist: m.artist, album: m.album, artwork })).catch(() => {});
  if (web && !native) web.metadata = new MediaMetadata({ title: m.title, artist: m.artist, album: m.album, artwork });
}

export function setPlaying(playing: boolean) {
  void plugin.then((p) => p?.MediaSession.setPlaybackState({ playbackState: playing ? 'playing' : 'paused' })).catch(() => {});
  if (web && !native) web.playbackState = playing ? 'playing' : 'paused';
}

let lastPos = 0;
export function setPosition(position: number, duration: number) {
  if (!duration || !isFinite(duration) || position > duration) return;
  // не чаще раза в секунду — плагину хватает
  if (Math.abs(position - lastPos) < 1 && position > 1) return;
  lastPos = position;
  void plugin.then((p) => p?.MediaSession.setPositionState({ position, duration, playbackRate: 1 })).catch(() => {});
  try {
    if (web && !native) web.setPositionState?.({ position, duration, playbackRate: 1 });
  } catch {
    /* неверные значения — пропускаем */
  }
}

export function onAction(action: MediaSessionAction, h: Handler) {
  void plugin.then((p) => p?.MediaSession.setActionHandler({ action }, (d) => h(d))).catch(() => {});
  try {
    if (web && !native) web.setActionHandler(action, (d) => h(d));
  } catch {
    /* действие не поддерживается браузером */
  }
}
