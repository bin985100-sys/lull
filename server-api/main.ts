/**
 * Lull API — каталог для веб-версии и телефона: главная, поиск, артисты, альбомы, плейлисты, «далее», тексты, обложки.
 * Тот же код, что и в десктопном приложении (electron/yt.ts, lyrics.ts), без Electron.
 * Слушает 127.0.0.1:8787; наружу его отдаёт Python-часть Lull Relay по /api/*.
 */
import http from 'node:http';
import { album, artist, charts, home, homeChips, playlist, search, suggest, suggestRich, upNext } from '../electron/yt';
import { lyrics } from '../electron/lyrics';
import type { Track } from '../shared/types';
import { importStatus, startImport } from './importer';
import { authEnabled, googleCallback, googleGo, logout, me, page, poll, runBot, start, tgPhoto, ytLibrary, ytLinkStart, ytPlaylist, ytUnlink } from './auth';

const PORT = Number(process.env.LULL_API_PORT || 8787);
const cache = new Map<string, { t: number; body: string }>();
const TTL: Record<string, number> = { home: 10, chips: 60, charts: 30, search: 10, suggest: 30, 'suggest-rich': 30, album: 60, playlist: 15, artist: 30, upnext: 30, lyrics: 24 * 60 };

async function route(name: string, arg: string, q: URLSearchParams, body: string): Promise<unknown> {
  switch (name) {
    case 'home': return home(q.get('chip') || undefined);
    case 'chips': return homeChips();
    case 'charts': return charts();
    case 'search': return search(q.get('q') ?? '', (q.get('f') as any) || 'all');
    case 'suggest': return suggest(q.get('q') ?? '');
    case 'suggest-rich': return suggestRich(q.get('q') ?? '');
    case 'album': return album(arg);
    case 'playlist': return playlist(arg);
    case 'artist': return artist(arg);
    case 'upnext': return upNext(arg);
    case 'lyrics': return lyrics(JSON.parse(body) as Track);
    default: throw Object.assign(new Error('not found'), { status: 404 });
  }
}

async function image(u: string, res: http.ServerResponse) {
  if (!/^https:\/\/([a-z0-9-]+\.)*(ytimg\.com|ggpht\.com|googleusercontent\.com|sndcdn\.com)\//.test(u)) {
    res.writeHead(400).end();
    return;
  }
  const r = await fetch(u);
  res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': 'public, max-age=604800, immutable' });
  res.end(Buffer.from(await r.arrayBuffer()));
}

const json = (res: http.ServerResponse, v: unknown, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(v));
const html = (res: http.ServerResponse, v: string) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(v);

async function auth(rest: string[], q: URLSearchParams, body: string, res: http.ServerResponse) {
  const b = body ? (JSON.parse(body) as Record<string, string>) : {};
  switch (rest[0]) {
    case 'config': return json(res, authEnabled());
    case 'start': return json(res, await start(b.provider ?? q.get('provider') ?? ''));
    case 'poll': return json(res, poll(q.get('nonce') ?? ''));
    case 'me': return json(res, me(b.token ?? ''));
    case 'logout': return json(res, logout(b.token ?? ''));
    case 'back': return html(res, page('Готово', 'Ты вошёл в Lull. Возвращаемся в приложение…', q.get('nonce') ?? undefined));
    case 'yt': {
      const tok = b.token ?? '';
      if (rest[1] === 'start') return json(res, ytLinkStart(tok));
      if (rest[1] === 'library') return json(res, await ytLibrary(tok));
      if (rest[1] === 'playlist') return json(res, await ytPlaylist(tok, b.id ?? ''));
      if (rest[1] === 'unlink') return json(res, ytUnlink(tok));
      return json(res, { error: 'not found' }, 404);
    }
    case 'google': return html(res, rest[1] === 'callback' ? await googleCallback(q) : googleGo(q.get('nonce') ?? ''));
    case 'tgphoto': {
      const f = await tgPhoto(decodeURIComponent(rest.slice(1).join('/')));
      if (!f) return void res.writeHead(404).end();
      return void res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': 'public, max-age=86400' }).end(f.body);
    }
    default: return json(res, { error: 'not found' }, 404);
  }
}

runBot();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const [, api, name, ...rest] = url.pathname.split('/');
    if (api !== 'api') return void res.writeHead(404).end();
    try {
      if (name === 'img') return void (await image(url.searchParams.get('u') ?? '', res));
      if (name === 'health') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      let body = '';
      for await (const c of req) body += c;
      if (name === 'auth') return void (await auth(rest, url.searchParams, body, res));
      if (name === 'import') return json(res, rest[0] ? importStatus(rest[0]) : startImport((body ? JSON.parse(body).url : url.searchParams.get('url')) ?? ''));
      const key = `${url.pathname}?${url.searchParams}#${body}`;
      const ttl = (TTL[name] ?? 0) * 60_000;
      const hit = cache.get(key);
      let out: string;
      if (hit && Date.now() - hit.t < ttl) out = hit.body;
      else {
        out = JSON.stringify(await route(name, decodeURIComponent(rest.join('/')), url.searchParams, body));
        if (ttl) {
          cache.set(key, { t: Date.now(), body: out });
          if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': ttl ? `public, max-age=${Math.min(ttl / 1000, 600)}` : 'no-store' });
      res.end(out);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      console.warn(`[api] ${url.pathname}: ${(e as Error).message}`);
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }));
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`[api] Lull API на 127.0.0.1:${PORT}`));
