/* Быстрая ссылка на звук для сервера: youtubei.js, тот же вошедший в аккаунт клиент, что и у каталога.
   Плеер YouTube загружается один раз и живёт в памяти — поэтому ~1 с против 4–5 с у yt-dlp, который каждый раз
   заново разгадывает защиту. Клиенты-приложения (VR/Android) аккаунт не принимают, поэтому порядок другой, чем в десктопе.
   Какой клиент сработал — запоминаем и дальше начинаем с него. */
import type { Types } from 'youtubei.js';
import { yt } from '../electron/yt';

const ORDER: Types.InnerTubeClient[] = ['WEB_EMBEDDED', 'TV', 'MWEB', 'WEB', 'TV_EMBEDDED', 'ANDROID_VR'];
let best: Types.InnerTubeClient | null = null;

const timeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what}: нет ответа ${ms} мс`)), ms))]);

/** Ссылка реально отдаёт звук: начало и середину (без нужного токена YouTube отдаёт первые байты, а дальше 403) */
async function probe(url: string, len: number): Promise<boolean> {
  const mid = len > 1_100_000 ? 1_048_576 : 0;
  const get = (r: string) => fetch(`${url}&range=${r}`).then((x) => { void x.body?.cancel(); return x.ok; }, () => false);
  const [a, b] = await Promise.all([get('0-1'), mid ? get(`${mid}-${mid + 1}`) : Promise.resolve(true)]);
  return a && b;
}

export async function fastStream(id: string) {
  const c = await yt();
  const order = best ? [best, ...ORDER.filter((x) => x !== best)] : ORDER;
  const errors: string[] = [];
  const started = Date.now();
  for (const client of order) {
    if (Date.now() - started > 9000) break; // дальше пусть работает yt-dlp — гонка на звуковом сервере уже идёт
    const t0 = Date.now();
    try {
      const info: any = await timeout(c.getBasicInfo(id, { client } as any), 5000, client);
      const st = info.playability_status?.status;
      if (st && st !== 'OK') throw new Error(info.playability_status?.reason || st);
      const audio = (info.streaming_data?.adaptive_formats ?? []).filter((f: any) => f.has_audio && !f.has_video);
      const f = audio.filter((x: any) => String(x.mime_type).includes('mp4a')).sort((a: any, b: any) => b.bitrate - a.bitrate)[0] ?? audio[0];
      if (!f) throw new Error('нет аудио');
      const url: string = await f.decipher(c.session.player);
      const len = Number(f.content_length) || 0;
      if (!(await timeout(probe(url, len), 4000, 'проверка'))) throw new Error('403');
      best = client;
      return { url, mime: String(f.mime_type).split(';')[0], size: len, duration: Math.round((f.approx_duration_ms || 0) / 1000), bitrate: f.bitrate, client, ms: Date.now() - started };
    } catch (e) {
      if (best === client) best = null;
      errors.push(`${client}: ${(e as Error).message} (${Date.now() - t0} мс)`);
    }
  }
  throw new Error(errors.join('; ') || 'нет ссылки');
}
