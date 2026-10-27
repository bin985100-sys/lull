import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { relayApi, relayOn } from './relay';
import { scDownload, scSearch } from './ytdlp';

/**
 * Запасной источник: если трека нет в YouTube ни в каком виде, ищем ту же песню на SoundCloud,
 * скачиваем в кэш и играем как локальный файл. Совпадать должны название, исполнитель и длительность
 * (30-секундные отрывки платных треков отбрасываем).
 */
type ScEntry = { file: string; size: number; mime: string; at: number; source: string };

const dir = () => path.join(app.getPath('userData'), 'sc-cache');
const indexFile = () => path.join(dir(), 'index.json');
let index: Record<string, ScEntry> | null = null;
const inflight = new Map<string, Promise<ScEntry | null>>();
const missed = new Map<string, number>();

function load() {
  if (index) return index;
  try {
    index = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  } catch {
    index = {};
  }
  return index!;
}
function save() {
  try {
    const all = Object.entries(load()).sort((a, b) => b[1].at - a[1].at);
    // Держим кэш небольшим: последние 150 треков
    for (const [, e] of all.slice(150)) fs.rmSync(e.file, { force: true });
    index = Object.fromEntries(all.slice(0, 150));
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(indexFile(), JSON.stringify(index));
  } catch {
    /* не критично */
  }
}

export function scFileFor(id: string): ScEntry | undefined {
  const e = load()[id];
  if (e && fs.existsSync(e.file)) return e;
  return undefined;
}

const norm = (x: string) =>
  x.toLowerCase().replace(/\(.*?\)|\[.*?\]|\bprod\.? by.*$|official|video|audio|lyrics?|remastered/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const mimeOf = (f: string) => (f.endsWith('.mp3') ? 'audio/mpeg' : f.endsWith('.opus') || f.endsWith('.ogg') ? 'audio/ogg' : f.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg');

async function relayDownload(url: string, base: string): Promise<string> {
  const r = await relayApi(`/sc/file?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`сервер Lull: ${r.status}`);
  const ext = r.headers.get('x-ext') || 'mp3';
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), `${base}.${ext}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}

export function soundcloudFallback(id: string, hint: { title: string; artist: string; duration?: number } | undefined): Promise<ScEntry | null> {
  const hit = scFileFor(id);
  if (hit) return Promise.resolve(hit);
  if (!hint?.title) return Promise.resolve(null);
  if ((missed.get(id) ?? 0) > Date.now()) return Promise.resolve(null);
  const running = inflight.get(id);
  if (running) return running;
  const task = (async () => {
    const t0 = Date.now();
    const want = norm(hint.title);
    const artist = norm(hint.artist);
    // В России SoundCloud заблокирован — при включённом сервере Lull ищем и качаем через него
    const server = relayOn();
    const query = `${hint.artist} ${hint.title}`;
    const list: Array<{ url: string; title: string; uploader: string; duration: number }> = server
      ? await relayApi(`/sc/search?q=${encodeURIComponent(query)}`).then((r) => r.json()).then((j) => (Array.isArray(j) ? j : [])).catch(() => [])
      : await scSearch(query).catch(() => []);
    const pick = list.find((c) => {
      const t = norm(c.title);
      const u = norm(c.uploader);
      const titleOk = !!want && t.includes(want);
      // Исполнитель — в названии («артист - трек») или это его аккаунт
      const artistOk = !artist || t.includes(artist) || u.includes(artist) || artist.includes(u);
      const durOk = c.duration > 40 && (!hint.duration || Math.abs(c.duration - hint.duration) <= 15);
      return titleOk && artistOk && durOk;
    });
    if (!pick) {
      console.warn(`[soundcloud] «${hint.artist} — ${hint.title}»: не нашёл (кандидатов ${list.length})`);
      missed.set(id, Date.now() + 6 * 3600_000);
      return null;
    }
    const file = server ? await relayDownload(pick.url, `sc-${id}`) : await scDownload(pick.url, dir(), `sc-${id}`);
    const entry: ScEntry = { file, size: fs.statSync(file).size, mime: mimeOf(file), at: Date.now(), source: pick.url };
    load()[id] = entry;
    save();
    console.log(`[soundcloud] ${id} «${hint.title}» — взял с SoundCloud за ${((Date.now() - t0) / 1000).toFixed(1)} с (${pick.url})`);
    return entry;
  })()
    .catch((e) => {
      console.warn(`[soundcloud] ${id}: ${(e as Error).message}`);
      return null;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, task);
  return task;
}
