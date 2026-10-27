import { protocol } from 'electron';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { localFileFor } from './downloads';
import { xfetch } from './relay';
import { soundcloudFallback, scFileFor } from './soundcloud';
import { fetchRange, hintFor, invalidateStream, markInnertubeFailed, noteForbidden, rememberHint, resolveStream, withTimeout, type ResolvedStream } from './yt';

/**
 * Схема media:// — прокси для аудио и обложек.
 *  media://stream/<videoId>   — аудиопоток по частям (Range), локальный файл если скачан
 *  media://img/?u=<url>        — обложка с CORS-заголовками (для извлечения цвета на canvas)
 */
export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } }
  ]);
}

const CHUNK = 1024 * 1024;
/** Что уже отдавали плееру по каждому треку — чтобы докачивать тот же самый файл */
const served = new Map<string, { formatId?: string; total: number; mime: string }>();
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length' };

function parseRange(header: string | null, total: number): [number, number | undefined] {
  const m = header?.match(/bytes=(\d*)-(\d*)/);
  if (!m) return [0, undefined];
  if (m[1] === '' && m[2] !== '') return [Math.max(0, total - Number(m[2])), total - 1];
  return [Number(m[1] || 0), m[2] ? Number(m[2]) : undefined];
}

async function streamResponse(id: string, range: string | null): Promise<Response> {
  const local = localFileFor(id) ?? scFileFor(id);
  if (local) {
    const total = local.size;
    const [start, endReq] = parseRange(range, total);
    const end = Math.min(endReq ?? total - 1, total - 1);
    const body = Readable.toWeb(fs.createReadStream(local.file, { start, end })) as unknown as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...cors, 'Content-Type': local.mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${total}` }
    });
  }

  let total0: number;
  try {
    total0 = (await sameFile(id, range === null || /^bytes=0-/.test(range), 0)).contentLength;
  } catch (e) {
    // В YouTube трека нет ни в каком виде — последняя ступенька: та же песня с SoundCloud
    const sc = await soundcloudFallback(id, hintFor(id));
    if (sc) return streamResponse(id, range);
    throw e;
  }
  const [start, endReq] = parseRange(range, total0);
  if (start >= total0) return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${total0}` } });
  // Отдаём ВЕСЬ запрошенный диапазон (до конца файла), а не кусок в 1 МБ: плеер Chromium
  // по своей схеме media:// не всегда дозапрашивает продолжение — и решал, что трек кончился
  // примерно на первой минуте, перескакивая на следующий. Сам YouTube читаем кусками.
  const end = Math.min(endReq ?? total0 - 1, total0 - 1);
  const first = await chunk(id, start, Math.min(start + CHUNK - 1, end));
  const s = first.stream;
  let pos = start + first.data.byteLength;
  let cancelled = false; // плеер перемотал или переключил трек — дальше не читаем
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    start(c) {
      c.enqueue(first.data);
      if (pos > end) c.close();
    },
    async pull(c) {
      if (cancelled) return;
      try {
        const next = await chunk(id, pos, Math.min(pos + CHUNK - 1, end));
        if (cancelled) return;
        c.enqueue(next.data);
        pos += next.data.byteLength;
        if (pos > end) c.close();
      } catch (e) {
        if (cancelled) return;
        console.warn(`[stream] ${id} — не удалось дочитать с ${pos}: ${(e as Error).message}`);
        try {
          c.error(e);
        } catch {
          /* поток уже закрыт */
        }
      }
    }
  });
  return new Response(body, {
    status: 206,
    headers: { ...cors, 'Content-Type': s.mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${total0}`, 'Cache-Control': 'no-store' }
  });
}

/**
 * Ссылка на ТОТ ЖЕ файл трека. С начала трека можно брать любую свежую ссылку;
 * посреди — только тот же формат и размер, иначе кусок из другого файла ломает декодер.
 */
async function sameFile(id: string, fresh: boolean, attempt: number): Promise<ResolvedStream> {
  if (fresh && attempt === 0) served.delete(id);
  const prev = served.get(id);
  const s = await resolveStream(id, attempt >= 2 || prev ? { preferDlp: attempt >= 2, formatId: prev?.formatId } : {});
  if (prev && (s.contentLength !== prev.total || s.mime !== prev.mime) && attempt < 3) {
    console.warn(`[stream] ${id} — новая ссылка ведёт на другой файл (${s.contentLength} вместо ${prev.total}), беру тот же формат через yt-dlp`);
    invalidateStream(id);
    return sameFile(id, false, Math.max(attempt + 1, 2));
  }
  served.set(id, { formatId: s.formatId, total: s.contentLength, mime: s.mime });
  if (served.size > 50) served.delete(served.keys().next().value as string);
  return s;
}

/** Кусок файла с проверкой длины и повторами (свежая ссылка на тот же файл). */
async function chunk(id: string, a: number, b: number, attempt = 0): Promise<{ data: Uint8Array; stream: ResolvedStream }> {
  const s = await sameFile(id, false, attempt);
  try {
    const r = await withTimeout(fetchRange(s, a, b), 15_000, 'таймаут потока');
    if (!r.ok) {
      if (!s.headers && r.status === 403) markInnertubeFailed();
      if (s.headers && r.status === 403) noteForbidden(id);
      throw new Error(`сервер ответил ${r.status} (${s.headers ? 'yt-dlp' : 'встроенный клиент'})`);
    }
    const data = new Uint8Array(await withTimeout(r.arrayBuffer(), 30_000, 'таймаут потока'));
    if (data.byteLength !== b - a + 1) throw new Error(`кусок оборвался: ${data.byteLength} из ${b - a + 1} байт`);
    return { data, stream: s };
  } catch (e) {
    if (attempt >= 3) throw e;
    console.warn(`[stream] ${id} — ${(e as Error).message}, беру свежую ссылку`);
    invalidateStream(id);
    return chunk(id, a, b, attempt + 1);
  }
}

const images = new Map<string, { type: string; data: ArrayBuffer }>();

async function imageResponse(src: string): Promise<Response> {
  let hit = images.get(src);
  if (!hit) {
    // Превью клипов (i.ytimg.com) бывают крошечными — сначала пробуем крупные версии
    const m = src.match(/^(https:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/[\w-]+\/)(default|mqdefault|hqdefault|sddefault)\.(jpg|webp)/);
    const tries = m ? [`${m[1]}maxresdefault.jpg`, `${m[1]}sddefault.jpg`, src] : [src];
    let r: Response | null = null;
    for (const u of tries) {
      r = await xfetch(u).catch(() => null);
      if (r?.ok) break;
    }
    if (!r?.ok) return new Response(null, { status: r?.status ?? 502, headers: cors });
    hit = { type: r.headers.get('content-type') ?? 'image/jpeg', data: await r.arrayBuffer() };
    images.set(src, hit);
    if (images.size > 400) images.delete(images.keys().next().value as string);
  }
  return new Response(hit.data, { headers: { ...cors, 'Content-Type': hit.type, 'Cache-Control': 'max-age=86400' } });
}

export function handleMediaScheme() {
  protocol.handle('media', async (req) => {
    const url = new URL(req.url);
    try {
      if (url.host === 'stream') {
        const id = decodeURIComponent(url.pathname.slice(1));
        // Название и исполнитель приходят в ссылке — по ним ищется замена, если ролик недоступен
        const t = url.searchParams.get('t');
        if (t) rememberHint(id, { title: t, artist: url.searchParams.get('a') ?? '', duration: Number(url.searchParams.get('d')) || undefined });
        try {
          return await streamResponse(id, req.headers.get('range'));
        } catch (e) {
          invalidateStream(id);
          console.warn(`[stream] ${id}: ${(e as Error).message ?? e}`);
          throw e;
        }
      }
      if (url.host === 'img') {
        const src = url.searchParams.get('u');
        if (!src || !/^https:\/\//.test(src)) return new Response(null, { status: 400 });
        return await imageResponse(src);
      }
      return new Response(null, { status: 404 });
    } catch (e) {
      return new Response(String((e as Error).message ?? e), { status: 502, headers: cors });
    }
  });
}

export function clearImageCache() {
  images.clear();
}
