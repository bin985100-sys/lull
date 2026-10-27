import { app, type WebContents } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { DownloadEntry, DownloadProgress, Track } from '../shared/types';
import { IPC } from '../shared/api';
import { storeGet, storeSet } from './store';
import { fetchRange, invalidateStream, resolveStream } from './yt';

const KEY = 'downloads';
// Куски поменьше: на больших YouTube чаще отвечает 403
const CHUNK = 1024 * 1024;

export const downloadsDir = () => path.join(app.getPath('userData'), 'downloads');

export function listDownloads(): Record<string, DownloadEntry> {
  return storeGet<Record<string, DownloadEntry>>(KEY) ?? {};
}

export function localFileFor(id: string): DownloadEntry | undefined {
  const entry = listDownloads()[id];
  if (entry && fs.existsSync(entry.file)) return entry;
  return undefined;
}

const active = new Map<string, Promise<DownloadEntry>>();

export function download(track: Track, sender: WebContents): Promise<DownloadEntry> {
  const existing = localFileFor(track.id);
  if (existing) return Promise.resolve(existing);
  const running = active.get(track.id);
  if (running) return running;

  const send = (p: DownloadProgress) => {
    if (!sender.isDestroyed()) sender.send(IPC.downloadProgress, p);
  };

  const task = (async () => {
    let s = await resolveStream(track.id, { keep: true });
    await fsp.mkdir(downloadsDir(), { recursive: true });
    const tmpBase = path.join(downloadsDir(), `${track.id}.part`);
    let out = fs.createWriteStream(tmpBase);
    let received = 0;
    let refreshes = 0;
    try {
      while (received < s.contentLength) {
        const end = Math.min(received + CHUNK, s.contentLength) - 1;
        const r = await fetchRange(s, received, end).catch(() => null);
        if (!r?.ok) {
          // Ссылка протухла или YouTube отказал — берём свежую (со второго раза — через yt-dlp) и продолжаем
          if (refreshes >= 3) throw new Error(r ? `Сервер ответил ${r.status}` : 'Нет соединения с сервером');
          refreshes++;
          console.warn(`[download] ${track.id}: ${r ? r.status : 'сеть'} — обновляю ссылку (${refreshes})`);
          invalidateStream(track.id);
          const prev = s;
          s = await resolveStream(track.id, { preferDlp: refreshes >= 2, keep: true });
          // Другой формат или размер — докачать нельзя, начинаем заново
          if (s.contentLength !== prev.contentLength || s.mime !== prev.mime) {
            out.destroy();
            out = fs.createWriteStream(tmpBase);
            received = 0;
          }
          continue;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        await new Promise<void>((res, rej) => out.write(buf, (e) => (e ? rej(e) : res())));
        received += buf.length;
        send({ id: track.id, received, total: s.contentLength, done: false });
      }
      await new Promise<void>((res) => out.end(res));
    } catch (e) {
      out.destroy();
      await fsp.rm(tmpBase, { force: true });
      send({ id: track.id, received, total: s.contentLength, done: true, error: (e as Error).message });
      throw e;
    }
    const file = path.join(downloadsDir(), `${track.id}.${s.mime.includes('webm') ? 'webm' : 'm4a'}`);
    await fsp.rename(tmpBase, file);
    const entry: DownloadEntry = { track, file, size: received, mime: s.mime, at: Date.now() };
    storeSet(KEY, { ...listDownloads(), [track.id]: entry });
    send({ id: track.id, received, total: s.contentLength, done: true });
    return entry;
  })().finally(() => active.delete(track.id));

  active.set(track.id, task);
  return task;
}

export async function removeDownload(id: string) {
  const all = listDownloads();
  const entry = all[id];
  if (entry) await fsp.rm(entry.file, { force: true });
  delete all[id];
  storeSet(KEY, { ...all });
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      total += e.isDirectory() ? await dirSize(p) : (await fsp.stat(p)).size;
    }
  } catch {
    /* папки может не быть */
  }
  return total;
}
