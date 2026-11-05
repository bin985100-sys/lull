/* Быстрая ссылка на звук для сервера: youtubei.js, тот же вошедший в аккаунт клиент, что и у каталога.
   Плеер YouTube загружается один раз и живёт в памяти — поэтому ~1 с против 4–5 с у yt-dlp, который каждый раз
   заново разгадывает защиту. Клиенты-приложения (VR/Android) аккаунт не принимают, поэтому порядок другой, чем в десктопе.
   Какой клиент сработал — запоминаем и дальше начинаем с него. */
import type { Types } from 'youtubei.js';
import { yt } from '../electron/yt';

const ORDER: Types.InnerTubeClient[] = ['TV', 'WEB_EMBEDDED', 'TV_EMBEDDED', 'MWEB', 'WEB', 'ANDROID_VR'];
let best: Types.InnerTubeClient | null = null;

const timeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what}: нет ответа ${ms} мс`)), ms))]);

/** Ссылка реально отдаёт звук так, как его будет брать звуковой сервер: первый кусок 256 КБ и следующий за ним
    кусок в 2 МБ (без нужного токена YouTube отдаёт начало, а дальше 403). Возвращает ошибку или ''. */
async function probe(url: string, len: number): Promise<string> {
  const get = async (a: number, b: number) => {
    const r = await fetch(`${url}&range=${a}-${b}`);
    const buf = await r.arrayBuffer().catch(() => new ArrayBuffer(0));
    if (!r.ok) return `${r.status} на ${a}`;
    if (buf.byteLength !== b - a + 1) return `короткий ответ на ${a}`;
    return '';
  };
  const first = 262143, second = Math.min(len - 1, first + 2 * 1024 * 1024);
  const tail = len > 4_000_000 ? Math.floor(len * 0.8) : 0;
  const res = await Promise.all([get(0, Math.min(first, len - 1)), second > first ? get(first + 1, second) : '', tail ? get(tail, tail + 65535) : '']);
  return res.filter(Boolean).join(', ');
}

async function tryClient(c: any, id: string, client: Types.InnerTubeClient) {
  const info: any = await timeout(c.getBasicInfo(id, { client } as any), 5000, client);
  const st = info.playability_status?.status;
  if (st && st !== 'OK') throw new Error(info.playability_status?.reason || st);
  const audio = (info.streaming_data?.adaptive_formats ?? []).filter((f: any) => f.has_audio && !f.has_video);
  const f = audio.filter((x: any) => String(x.mime_type).includes('mp4a')).sort((a: any, b: any) => b.bitrate - a.bitrate)[0] ?? audio[0];
  if (!f) throw new Error('нет аудио');
  const url: string = await f.decipher(c.session.player);
  const len = Number(f.content_length) || 0;
  if (!len) throw new Error('нет размера');
  const bad = await timeout(probe(url, len), 6000, 'проверка');
  if (bad) throw new Error(bad);
  return { url, mime: String(f.mime_type).split(';')[0], size: len, duration: Math.round((f.approx_duration_ms || 0) / 1000), bitrate: f.bitrate, client };
}

/** Замер для обновления сервера: каждый клиент отдельно, со временем и ошибкой */
export async function diagClients(id: string) {
  const c = await yt();
  const out: Record<string, string> = {};
  for (const client of ORDER) {
    const t0 = Date.now();
    try { await tryClient(c, id, client); out[client] = `ok ${Date.now() - t0} мс`; } catch (e) { out[client] = `${(e as Error).message} (${Date.now() - t0} мс)`; }
  }
  return { best, clients: out };
}

/** Звуковой сервер сообщает, что ссылка этого клиента перестала отдавать файл — начнём с другого */
export function markBad(client: string) { if (best === client) best = null; }

export async function fastStream(id: string) {
  const c = await yt();
  const order = best ? [best, ...ORDER.filter((x) => x !== best)] : ORDER;
  const errors: string[] = [];
  const started = Date.now();
  for (const client of order) {
    if (Date.now() - started > 12000) break; // дальше пусть работает yt-dlp — гонка на звуковом сервере уже идёт
    const t0 = Date.now();
    try {
      const r = await tryClient(c, id, client);
      best = client;
      return { ...r, ms: Date.now() - started };
    } catch (e) {
      if (best === client) best = null;
      errors.push(`${client}: ${(e as Error).message} (${Date.now() - t0} мс)`);
    }
  }
  throw new Error(errors.join('; ') || 'нет ссылки');
}
