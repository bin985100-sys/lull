import fs from 'node:fs';
import type { StreamMeta } from '../shared/types';
import { localFileFor } from './downloads';
import { scFileFor, soundcloudFallback, prepareSoundcloud, type ScRemote } from './soundcloud';
import { fetchRange, hintFor, invalidateStream, noteForbidden, resolveStream, withTimeout, type ResolvedStream } from './yt';
import { firstPlayable } from './stream-selection';

export type PreparedAudio =
  | { kind: 'local'; file: string; size: number; mime: string; durationSec: number }
  | ({ kind: 'soundcloud' } & ScRemote)
  | { kind: 'remote'; stream: ResolvedStream };

const chosen = new Map<string, { source: PreparedAudio; until: number }>();
const pending = new Map<string, Promise<PreparedAudio>>();

function localAudio(id: string): PreparedAudio | null {
  const download = localFileFor(id);
  const file = download ?? scFileFor(id);
  if (!file) return null;
  return { kind: 'local', file: file.file, size: file.size, mime: file.mime,
    durationSec: download?.track.durationSec ?? hintFor(id)?.duration ?? 0 };
}

export function forgetPreparedAudio(id: string) { chosen.delete(id); }

async function checkedRemote(id: string, prefetch: boolean): Promise<PreparedAudio> {
  const verify = async (stream: ResolvedStream) => {
    const response = await withTimeout(fetchRange(stream, 0, Math.min(1023, stream.contentLength - 1)), 6000, 'Проверка аудио не ответила');
    if (!response.ok || response.headers.get('content-type')?.startsWith('text/')) {
      void response.body?.cancel();
      if (response.status === 403) noteForbidden(id);
      throw new Error(`Аудиоссылка отклонена (${response.status})`);
    }
    const bytes = await withTimeout(response.arrayBuffer(), 6000, 'Аудио не начало загружаться');
    if (!bytes.byteLength) throw new Error('Пустой ответ аудиопотока');
    return { kind: 'remote' as const, stream };
  };
  try {
    return await verify(await resolveStream(id, { prefetch }));
  } catch {
    invalidateStream(id);
    return verify(await resolveStream(id, { preferDlp: true, background: prefetch }));
  }
}

/** IPC preparation and media requests share the same choice. In particular a
 * fallback file must not be followed by another full YouTube resolution.
 */
export function preparePlayback(id: string, prefetch = false): Promise<PreparedAudio> {
  const hit = chosen.get(id);
  if (hit && hit.until > Date.now() && (hit.source.kind !== 'local' || fs.existsSync(hit.source.file))) return Promise.resolve(hit.source);
  chosen.delete(id);
  const local = localAudio(id);
  if (local) {
    chosen.set(id, { source: local, until: Infinity });
    return Promise.resolve(local);
  }
  const running = pending.get(id);
  if (running) return running;
  const started = Date.now();
  const primary = checkedRemote(id, prefetch);
  const task = firstPlayable(primary, async () => {
    const stream = await prepareSoundcloud(id, hintFor(id));
    if (stream) return { kind: 'soundcloud' as const, ...stream };
    await soundcloudFallback(id, hintFor(id));
    return localAudio(id);
  }, prefetch ? 1000 : 0).then((source) => {
    chosen.set(id, { source, until: source.kind === 'remote' ? source.stream.expiresAt : Infinity });
    if (chosen.size > 200) chosen.delete(chosen.keys().next().value as string);
    console.log(`[audio] ${id}: ${source.kind}, ready in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return source;
  }).finally(() => pending.delete(id));
  pending.set(id, task);
  return task;
}

export function playbackMeta(id: string, audio: PreparedAudio): StreamMeta {
  if (audio.kind !== 'remote') return { id, mime: audio.mime, contentLength: audio.size,
    durationSec: audio.durationSec, bitrate: 0, loudnessDb: 0 };
  const { url: _url, expiresAt: _exp, headers: _headers, via: _via, formatId: _format, ...meta } = audio.stream;
  return meta;
}
