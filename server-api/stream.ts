/* Быстрая ссылка на звук для сервера (youtubei.js). Плеер YouTube загружается один раз и живёт в памяти,
   поэтому ~1 с против 4–5 с у yt-dlp.
   С адреса сервера YouTube отдаёт файл целиком только с токеном прохождения проверки (PO token, см. potoken.ts):
   без него — первые ~256 КБ, дальше 403. Поэтому основной путь — сессия без аккаунта + токен:
   токен на id видео идёт в запрос плеера, токен на visitorData — в ссылку на файл (&pot=).
   Запасной — сессия с аккаунтом, как раньше. Какой клиент сработал — запоминаем и начинаем с него. */
import { Innertube, type Types } from 'youtubei.js';
import { yt } from '../electron/yt';
import { mint, potState, resetMinter, warmMinter } from './potoken';
import { streamFetch } from './stream-client';

type Way = { name: string; client: Types.InnerTubeClient; pot: '' | 'video' | 'visitor'; playerPot?: boolean; anonymous?: boolean };
// pot — токен в ссылке на файл: привязан к id видео (так сейчас делает сайт YouTube) или к сессии (как раньше).
// playerPot — токен ещё и в запросе плеера; с ним YouTube иногда не отдаёт обычных ссылок («No valid URL»).
const WAYS: Way[] = [
  { name: 'TV-SAMSUNG', client: 'TV', pot: '', anonymous: true },
  { name: 'MWEB+токен в ссылке', client: 'MWEB', pot: 'video' },
  { name: 'MWEB+токен в ссылке(сессия)', client: 'MWEB', pot: 'visitor' },
  { name: 'MWEB+токен', client: 'MWEB', pot: 'video', playerPot: true },
  { name: 'WEB+токен в ссылке', client: 'WEB', pot: 'video' },
  { name: 'TV+токен', client: 'TV', pot: 'video', playerPot: true },
  { name: 'MWEB', client: 'MWEB', pot: '' }
];
let best: string | null = null;

let anonClient: Innertube | null = null;
let anonMaking: Promise<Innertube> | null = null;
let anonAt = 0;
/** Сессия без аккаунта: токен привязывается к её visitorData. Пересоздаём раз в 6 часов. */
async function anon(): Promise<Innertube> {
  if (anonClient && Date.now() - anonAt < 6 * 3600_000) return anonClient;
  if (!anonMaking)
    anonMaking = Innertube.create({ fetch: streamFetch(fetch), retrieve_player: true, enable_session_cache: false, generate_session_locally: false, lang: 'ru' } as any)
      .then((c) => { anonClient = c; anonAt = Date.now(); return c; })
      .finally(() => (anonMaking = null));
  return anonMaking;
}

export function warmStream() {
  anon().catch(() => {});
}
export const streamState = () => ({ ready: !!anonClient && Date.now() - anonAt < 6 * 3600_000, best });

async function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`${what}: нет ответа ${ms} мс`)), ms); })]);
  } finally { clearTimeout(timer); }
}

/** Ссылка реально отдаёт звук так, как его будет брать звуковой сервер: первый кусок 256 КБ, следующий
    кусок в 2 МБ и кусок ближе к концу. Возвращает ошибку или ''. */
async function probe(url: string, len: number): Promise<string> {
  const get = async (a: number, b: number) => {
    const r = await fetch(`${url}&range=${a}-${b}`, { signal: AbortSignal.timeout(5000) });
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

async function tryWay(id: string, w: Way) {
  const c = w.pot || w.anonymous ? await timeout(anon(), 8000, 'сессия') : await yt();
  let gvs = '';
  const opts: any = { client: w.client };
  if (w.pot) {
    const visitor = c.session.context.client.visitorData ?? '';
    const [p, g] = await timeout(Promise.all([mint(id), w.pot === 'video' ? mint(id) : mint(visitor)]), 15000, 'токен');
    if (w.playerPot) opts.po_token = p;
    gvs = g;
  }
  const info: any = await timeout(c.getBasicInfo(id, opts), 5000, w.client);
  const st = info.playability_status?.status;
  if (st && st !== 'OK') throw new Error(info.playability_status?.reason || st);
  const audio = (info.streaming_data?.adaptive_formats ?? []).filter((f: any) => f.has_audio && !f.has_video);
  const f = audio.filter((x: any) => String(x.mime_type).includes('mp4a')).sort((a: any, b: any) => b.bitrate - a.bitrate)[0] ?? audio[0];
  if (!f) throw new Error('нет аудио');
  let url: string = await f.decipher(c.session.player);
  if (w.name === 'TV-SAMSUNG') {
    const u = new URL(url);
    // decipher() adds the library's generic TV cver, which differs from our request.
    u.searchParams.delete('cver');
    url = u.toString();
  }
  // youtubei.js при ошибке разгадки пишет в n «enhanced_except_…» и всё равно отдаёт ссылку — она обрывается после 256 КБ
  const n = new URL(url).searchParams.get('n') || '';
  if (n.startsWith('enhanced_except_')) throw new Error('n не разгадан');
  if (gvs) {
    const u = new URL(url);
    u.searchParams.set('pot', gvs);
    url = u.toString();
  }
  const len = Number(f.content_length) || 0;
  if (!len) throw new Error('нет размера');
  const bad = await timeout(probe(url, len), 6000, 'проверка');
  if (bad) throw new Error(bad);
  return { url, mime: String(f.mime_type).split(';')[0], size: len, duration: Math.round((f.approx_duration_ms || 0) / 1000), bitrate: f.bitrate, client: w.name };
}

/** Замер для обновления сервера: каждый способ отдельно, со временем и ошибкой */
export async function diagClients(id: string) {
  const out: Record<string, string> = {};
  for (const w of WAYS) {
    const t0 = Date.now();
    try { await tryWay(id, w); out[w.name] = `ok ${Date.now() - t0} мс`; } catch (e) { out[w.name] = `${(e as Error).message} (${Date.now() - t0} мс)`; }
  }
  return { best, token: potState(), clients: out };
}

/** Звуковой сервер сообщает, что ссылка этого способа перестала отдавать файл — начнём с другого */
export function markBad(name: string) {
  if (best === name) best = null;
  if (name.includes('токен')) resetMinter();
}

export async function fastStream(id: string) {
  const order = best ? [WAYS.find((w) => w.name === best)!, ...WAYS.filter((w) => w.name !== best)] : WAYS;
  const errors: string[] = [];
  const started = Date.now();
  for (const w of order) {
    if (Date.now() - started > 14000) break; // дальше пусть работает yt-dlp — гонка на звуковом сервере уже идёт
    const t0 = Date.now();
    try {
      const r = await tryWay(id, w);
      best = w.name;
      return { ...r, ms: Date.now() - started };
    } catch (e) {
      if (best === w.name) best = null;
      errors.push(`${w.name}: ${(e as Error).message} (${Date.now() - t0} мс)`);
    }
  }
  throw new Error(errors.join('; ') || 'нет ссылки');
}
