/* Быстрая ссылка на звук для сервера (youtubei.js). Плеер YouTube загружается один раз и живёт в памяти,
   поэтому ~1 с против 4–5 с у yt-dlp.
   С адреса сервера YouTube отдаёт файл целиком только с токеном прохождения проверки (PO token, см. potoken.ts):
   без него — первые ~256 КБ, дальше 403. Поэтому основной путь — сессия без аккаунта + токен:
   токен на id видео идёт в запрос плеера, токен на visitorData — в ссылку на файл (&pot=).
   Запасной — сессия с аккаунтом, как раньше. Какой клиент сработал — запоминаем и начинаем с него. */
import { Innertube, type Types } from 'youtubei.js';
import { yt } from '../electron/yt';
import { mint, potState, resetMinter, warmMinter } from './potoken';
import { alternatives } from './alternative';
import { streamFetch } from './stream-client';
import { StreamGate } from './stream-gate';
const audioGate = new StreamGate(2,8);

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
export const streamState = () => ({ ready: !!anonClient && Date.now() - anonAt < 6 * 3600_000, best, ...audioGate.state() });

async function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`${what}: нет ответа ${ms} мс`)), ms); })]);
  } finally { clearTimeout(timer); }
}

/** Ссылка реально отдаёт звук так, как его будет брать звуковой сервер: первый кусок 256 КБ, следующий
    кусок в 2 МБ и кусок ближе к концу. Возвращает ошибку или ''. */
const FIRST = 256 * 1024;
const CHUNK = 2 * 1024 * 1024;
const MAX_INLINE = 8 * 1024 * 1024;

async function probe(url: string, len: number, prepare: boolean): Promise<Buffer | undefined> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5500);
  async function read(start: number, end: number) {
    const response = await fetch(url + '&range=' + start + '-' + end, { signal: abort.signal });
    const expected = end - start + 1;
    if (!response.ok) throw Error(response.status + ' на ' + start);
    const count = response.headers.get('content-length');
    if (count !== null && Number(count) !== expected) throw Error('неверная длина на ' + start);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length !== expected) throw Error('неполный диапазон на ' + start);
    return data;
  }
  try {
    const bytes = prepare && len <= MAX_INLINE ? len : Math.min(len, FIRST + CHUNK);
    const reads = [read(0, Math.min(bytes, FIRST) - 1)];
    for (let start = FIRST; start < bytes; start += CHUNK)
      reads.push(read(start, Math.min(bytes, start + CHUNK) - 1));
    // For a large file also verify a later range before declaring the URL good.
    const tail = bytes < len && len > 4_000_000 ? Math.floor(len * 0.8) : 0;
    const [parts] = await Promise.all([Promise.all(reads), tail ? read(tail, Math.min(len - 1, tail + 65535)) : undefined]);
    if (prepare) return Buffer.concat(parts, bytes);
  } finally { clearTimeout(timer); abort.abort(); }
}

async function tryWay(id: string, w: Way, prepare = false) {
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
  const prefix = await probe(url, len, prepare);
  return { prefix, url, mime: String(f.mime_type).split(';')[0], size: len, duration: Math.round((f.approx_duration_ms || 0) / 1000), bitrate: f.bitrate, client: w.name };
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

export function fastStream(id: string, prepare = false) {
  return audioGate.run(id+':'+prepare, () => fastStreamOnce(id,prepare));
}

async function fastStreamOnce(id: string, prepare: boolean) {
  const order = best ? [WAYS.find((w) => w.name === best)!, ...WAYS.filter((w) => w.name !== best)] : WAYS;
  const errors: string[] = [];
  const started = Date.now();
  let candidates: string[] | undefined;
  for (const w of order) {
    if (Date.now() - started > 14000) break; // дальше пусть работает yt-dlp — гонка на звуковом сервере уже идёт
    const t0 = Date.now();
    try {
      const r = await tryWay(id, w, prepare);
      best = w.name;
      return { ...r, ms: Date.now() - started };
    } catch (e) {
      if (best === w.name) best = null;
      errors.push(`${w.name}: ${(e as Error).message} (${Date.now() - t0} мс)`);
      if (!candidates) candidates = await timeout(alternatives(id), 3000, 'поиск версии').catch(() => []);
      {
        for (const candidate of candidates.slice(0,3)) {
          if (Date.now()-started > 14000) break;
          try {
            const alt = await tryWay(candidate,w,prepare);
            console.log('[stream] alternate', id, candidate);
            return {...alt, mediaId:candidate, ms:Date.now()-started};
          } catch {}
        }
      }
    }
  }
  throw new Error(errors.join('; ') || 'нет ссылки');
}
