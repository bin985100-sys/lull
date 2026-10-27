import impactUrl from '../assets/sfx/impact.mp3';
import popUrl from '../assets/sfx/pop.mp3';
import swirlUrl from '../assets/sfx/swirl.mp3';
import swishUrl from '../assets/sfx/swish.mp3';
import { useSettings } from '../store/settings';

/** Звуки интерфейса (заставка «Волны»). Отдельный AudioContext — не мешает плееру. */
const URLS = { swish: swishUrl, swirl: swirlUrl, impact: impactUrl, pop: popUrl } as const;
export type Sfx = keyof typeof URLS;

let ctx: AudioContext | null = null;
const buffers = new Map<Sfx, AudioBuffer>();
let loading: Promise<void> | null = null;

export function preloadSfx(): Promise<void> {
  if (loading) return loading;
  ctx ??= new AudioContext();
  const c = ctx;
  loading = Promise.all(
    (Object.keys(URLS) as Sfx[]).map(async (k) => {
      try {
        const data = await (await fetch(URLS[k])).arrayBuffer();
        buffers.set(k, await c.decodeAudioData(data));
      } catch {
        /* без звука — не страшно */
      }
    })
  ).then(() => undefined);
  return loading;
}

/** Сыграть звук через `delay` секунд (точно по часам аудио). */
export function playSfx(name: Sfx, { delay = 0, volume = 0.6, rate = 1 } = {}) {
  if (!useSettings.getState().uiSounds) return;
  const b = buffers.get(name);
  if (!ctx || !b) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + delay);
}
