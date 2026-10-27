import { net } from 'electron';
import { mainSettings } from './store';
import type { StreamMeta } from '../shared/types';

const BASE = 'https://api.lull.website';
export interface BrokerAudio { kind: 'broker'; meta: StreamMeta; url: string; expiresAt: number }

/** Desktop uses the same pinned recording and prepared cache as Android/Web. */
export async function prepareBroker(id: string, hint?: { title: string; artist: string; duration?: number }): Promise<BrokerAudio> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id) || (mainSettings() as { relayOn?: boolean }).relayOn === false) throw new Error('Shared audio broker disabled');
  const quality = mainSettings().quality;
  const query = new URLSearchParams({ q: quality === 'low' ? 'low' : quality === 'opus' || quality === 'high' ? 'auto' : 'aac' });
  if (hint) {
    query.set('t', hint.title); query.set('a', hint.artist);
    if (hint.duration) query.set('d', String(hint.duration));
  }
  const response = await net.fetch(`${BASE}/api/prepare/${id}?${query}`, { signal: AbortSignal.timeout(14_000) });
  if (!response.ok) throw new Error(`Audio broker: ${response.status}`);
  const meta = await response.json() as StreamMeta;
  if (meta.id !== id || !meta.mime?.startsWith('audio/') || !(meta.contentLength > 0)) throw new Error('Invalid broker audio metadata');
  return { kind: 'broker', meta, url: `${BASE}/api/stream/${id}?${query}`, expiresAt: Date.now() + 3 * 60_000 };
}

export async function brokerResponse(source: BrokerAudio, range: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try { response = await net.fetch(source.url, { headers: range ? { Range: range } : {}, signal: controller.signal }); }
  finally { clearTimeout(timer); }
  // The deadline covers response headers only. A wall-clock timeout left on
  // the body would cut off a perfectly healthy song partway through playback.
  if (![200, 206, 416].includes(response.status)) {
    void response.body?.cancel(); throw new Error(`Audio broker stream: ${response.status}`);
  }
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const value = response.headers.get(name); if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
