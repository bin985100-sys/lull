/**
 * Вход в Lull: Telegram (через бота) и Google (OAuth). Один и тот же сценарий для приложения и веб-версии:
 *   1. приложение: POST /api/auth/start {provider} → { nonce, url }, открывает url;
 *   2. пользователь подтверждает вход в Telegram-боте или в Google;
 *   3. приложение опрашивает GET /api/auth/poll?nonce= → { status: 'ok', token, user }.
 * Секреты только в переменных окружения сервера: LULL_TG_TOKEN, LULL_GOOGLE_ID, LULL_GOOGLE_SECRET.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.LULL_API_DATA || './data';
const PUBLIC = process.env.LULL_PUBLIC_URL || 'https://api.lull.website';
const APP_URL = process.env.LULL_APP_URL || 'https://app.lull.website';
const TG = process.env.LULL_TG_TOKEN || '';
const TG_API = process.env.LULL_TG_API || 'https://api.telegram.org';
const G_ID = process.env.LULL_GOOGLE_ID || '';
const G_SECRET = process.env.LULL_GOOGLE_SECRET || '';

export type User = { id: string; name: string; avatar?: string; provider: 'telegram' | 'google'; tgId?: number; tgUsername?: string; googleSub?: string; email?: string; createdAt: number; ytRefresh?: string; ytName?: string; ytAt?: number };
type Db = { users: Record<string, User>; sessions: Record<string, { userId: string; at: number }> };

const FILE = path.join(DATA, 'auth.json');
let db: Db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* первый запуск */ }
let saveT: NodeJS.Timeout | undefined;
const save = () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(FILE + '.tmp', FILE);
  }, 200);
};

/* Незавершённые входы живут 10 минут */
const pending = new Map<string, { provider: string; at: number; token?: string; userId?: string; done?: boolean }>();
setInterval(() => { const now = Date.now(); for (const [k, v] of pending) if (now - v.at > 10 * 60e3) pending.delete(k); }, 60e3).unref();

const rid = (n = 24) => crypto.randomBytes(n).toString('base64url');
const pub = (u: User) => ({ id: u.id, name: u.name, avatar: u.avatar, provider: u.provider, username: u.tgUsername, email: u.email, youtube: u.ytRefresh ? { name: u.ytName || '' } : null });

function login(find: (u: User) => boolean, make: () => Omit<User, 'id' | 'createdAt'>): string {
  let u = Object.values(db.users).find(find);
  const fresh = make();
  if (!u) { u = { ...fresh, id: rid(9), createdAt: Date.now() }; db.users[u.id] = u; }
  else Object.assign(u, { name: fresh.name || u.name, avatar: fresh.avatar || u.avatar, tgUsername: fresh.tgUsername ?? u.tgUsername, email: fresh.email ?? u.email });
  const token = rid(32);
  db.sessions[token] = { userId: u.id, at: Date.now() };
  save();
  return token;
}

let botName = '';
async function tg(method: string, body: unknown) {
  const r = await fetch(`${TG_API}/bot${TG}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json()) as { ok: boolean; result: any; description?: string };
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`);
  return j.result;
}

export const authEnabled = () => ({ telegram: !!TG, google: !!(G_ID && G_SECRET) });

export async function start(provider: string) {
  if (provider === 'telegram') {
    if (!TG) throw Object.assign(new Error('Вход через Telegram ещё не настроен на сервере'), { status: 503 });
    if (!botName) botName = (await tg('getMe', {})).username;
    const nonce = rid(18);
    pending.set(nonce, { provider, at: Date.now() });
    return { nonce, url: `https://t.me/${botName}?start=${nonce}` };
  }
  if (provider === 'google') {
    if (!G_ID || !G_SECRET) throw Object.assign(new Error('Вход через Google ещё не настроен на сервере'), { status: 503 });
    const nonce = rid(18);
    pending.set(nonce, { provider, at: Date.now() });
    return { nonce, url: `${PUBLIC}/api/auth/google/go?nonce=${nonce}` };
  }
  throw Object.assign(new Error('unknown provider'), { status: 400 });
}

export function poll(nonce: string) {
  const p = pending.get(nonce);
  if (!p) return { status: 'expired' };
  if (p.provider === 'yt') { if (!p.done) return { status: 'pending' }; return { status: 'ok', user: pub(db.users[p.userId!]) }; }
  if (!p.token) return { status: 'pending' };
  /* не удаляем сразу: приложение может спросить несколько раз (таймер, возврат по ссылке, перезапуск) */
  p.at = Math.min(p.at, Date.now() - 5 * 60e3);
  const s = db.sessions[p.token];
  return { status: 'ok', token: p.token, user: pub(db.users[s.userId]) };
}

export function me(token: string) {
  const s = db.sessions[token];
  const u = s && db.users[s.userId];
  if (!u) throw Object.assign(new Error('unauthorized'), { status: 401 });
  return pub(u);
}
export function logout(token: string) { delete db.sessions[token]; save(); return { ok: true }; }
/* Удаление аккаунта по просьбе пользователя: профиль, все входы, библиотека на сервере и доступ к YouTube */
export function deleteAccount(token: string) {
  const s = db.sessions[token];
  const u = s && db.users[s.userId];
  if (!u) throw Object.assign(new Error('Войди в Lull заново'), { status: 401 });
  if (u.ytRefresh) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(u.ytRefresh)}`, { method: 'POST' }).catch(() => {});
  for (const [t, x] of Object.entries(db.sessions)) if (x.userId === u.id) delete db.sessions[t];
  delete db.users[u.id];
  try { fs.rmSync(syncFile(u.id), { force: true }); } catch { /* библиотеки могло не быть */ }
  save();
  return { ok: true };
}

/* ---------- страница «вернись в приложение» (relay не пробрасывает Location, поэтому без 302) ---------- */
export function page(title: string, text: string, nonce?: string, redirect?: string) {
  const back = `lull://auth${nonce ? `?nonce=${nonce}` : ''}`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#000"><title>Lull</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#f5f5f4;font:600 17px/1.45 system-ui,-apple-system,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:26px;margin:0 0 10px}p{color:#9ba0a7;margin:0 0 26px}a{display:block;margin:10px auto;max-width:320px;padding:17px 22px;border-radius:999px;text-decoration:none;font-weight:700}
.w{background:#f5f5f4;color:#000}.d{background:#1a1c1f;color:#f5f5f4}</style></head><body><div>
<h1>${title}</h1><p>${text}</p>${redirect ? '' : `<a class="w" href="${back}">Вернуться в Lull</a><a class="d" href="${APP_URL}">Открыть веб-версию</a>`}</div>
<script>${redirect ? `location.replace(${JSON.stringify(redirect)})` : `setTimeout(function(){location.href=${JSON.stringify(back)}},400)`}</script></body></html>`;
}

/* ---------- Google ---------- */
export function googleGo(nonce: string) {
  const p = pending.get(nonce);
  if (!p) return page('Ссылка устарела', 'Вернись в Lull и нажми кнопку ещё раз.');
  /* Вход через Google — только имя и почта: для них Google не показывает «приложение не проверено».
     Доступ к YouTube Music — «чувствительное» разрешение, его просим отдельно (Настройки → Подключить YouTube Music),
     пока Google не проверит Lull. После проверки можно вернуть всё в один шаг: LULL_G_YT_ON_LOGIN=1. */
  const yt = p.provider === 'yt' || (p.provider === 'google' && process.env.LULL_G_YT_ON_LOGIN === '1');
  const q = new URLSearchParams({
    client_id: G_ID, redirect_uri: `${PUBLIC}/api/auth/google/callback`, response_type: 'code', state: nonce,
    scope: yt ? 'openid email profile https://www.googleapis.com/auth/youtube.readonly' : 'openid email profile',
    ...(yt ? { access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent select_account' } : { prompt: 'select_account' }),
  });
  return page('Переходим в Google…', '', undefined, `https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}
export async function googleCallback(q: URLSearchParams) {
  const nonce = q.get('state') || '';
  const p = pending.get(nonce);
  if (!p || !q.get('code')) return page('Не получилось войти', 'Вернись в Lull и попробуй ещё раз.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: q.get('code')!, client_id: G_ID, client_secret: G_SECRET, redirect_uri: `${PUBLIC}/api/auth/google/callback`, grant_type: 'authorization_code' }),
  });
  const j = (await r.json()) as { id_token?: string; refresh_token?: string; access_token?: string; expires_in?: number; scope?: string };
  if (!j.id_token) return page('Не получилось войти', 'Google не подтвердил вход. Попробуй ещё раз.');
  /* id_token получен напрямую от Google по TLS — подпись не перепроверяем */
  const c = JSON.parse(Buffer.from(j.id_token.split('.')[1], 'base64url').toString());
  if (c.aud !== G_ID) return page('Не получилось войти', 'Попробуй ещё раз.');
  if (p.provider === 'yt') {
    const u = db.users[p.userId!];
    if (!u) return page('Не получилось', 'Войди в Lull заново и попробуй ещё раз.');
    if (!j.refresh_token || !j.scope?.includes('youtube')) return page('Нет доступа к YouTube', 'Отметь галочку доступа к YouTube на экране Google и попробуй ещё раз.');
    u.ytRefresh = j.refresh_token; u.ytName = c.email || c.name; u.ytAt = Date.now();
    if (j.access_token) yt.set(u.id, { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 - 60e3 });
    save();
    p.done = true;
    return page('YouTube Music подключён', 'Возвращаемся в Lull — там можно перенести лайки и плейлисты.', nonce);
  }
  p.token = login((u) => u.googleSub === c.sub, () => ({ provider: 'google', googleSub: c.sub, name: c.name || c.email, avatar: c.picture, email: c.email }));
  /* если на экране Google оставили галочку YouTube — сразу подключаем YouTube Music к аккаунту */
  if (j.refresh_token && j.scope?.includes('youtube')) {
    const u = db.users[db.sessions[p.token].userId];
    u.ytRefresh = j.refresh_token; u.ytName = c.email || c.name; u.ytAt = Date.now();
    if (j.access_token) yt.set(u.id, { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 - 60e3 });
    save();
  }
  return page('Готово', 'Ты вошёл в Lull. Возвращаемся в приложение…', nonce);
}

/* ---------- Telegram-бот: долгий опрос, без вебхука ---------- */
export async function runBot() {
  if (!TG) { console.log('[auth] LULL_TG_TOKEN не задан — вход через Telegram выключен'); return; }
  let offset = 0;
  try { botName = (await tg('getMe', {})).username; console.log(`[auth] бот @${botName}`); } catch (e) { console.warn('[auth]', (e as Error).message); }
  for (;;) {
    try {
      const ups = (await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] })) as any[];
      for (const u of ups) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m?.text || !m.from) continue;
        const [cmd, arg] = m.text.trim().split(/\s+/, 2);
        if (cmd !== '/start') continue;
        const p = arg ? pending.get(arg) : undefined;
        if (!p) {
          await tg('sendMessage', { chat_id: m.chat.id, text: 'Привет! Это бот входа в Lull. Чтобы войти, нажми «Продолжить с Telegram» в приложении.', reply_markup: { inline_keyboard: [[{ text: 'Открыть Lull', url: APP_URL }]] } });
          continue;
        }
        let avatar: string | undefined;
        try {
          const ph = await tg('getUserProfilePhotos', { user_id: m.from.id, limit: 1 });
          const fid = ph.photos?.[0]?.slice(-1)[0]?.file_id;
          if (fid) avatar = `${PUBLIC}/api/auth/tgphoto/${encodeURIComponent(fid)}`;
        } catch { /* без аватара */ }
        const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || m.from.username || 'Слушатель';
        p.token = login((x) => x.tgId === m.from.id, () => ({ provider: 'telegram', tgId: m.from.id, tgUsername: m.from.username, name, avatar }));
        await tg('sendMessage', {
          chat_id: m.chat.id,
          text: `Готово, ${m.from.first_name || 'ты'} — ты зарегистрирован в Lull ✅\nВозвращайся в приложение, там уже всё готово.`,
          reply_markup: { inline_keyboard: [[{ text: 'Вернуться в Lull', url: `${PUBLIC}/api/auth/back?nonce=${arg}` }]] },
        });
      }
    } catch (e) {
      console.warn('[auth] бот:', (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/* Аватар из Telegram отдаём через сервер, не раскрывая токен бота */
export async function tgPhoto(fileId: string): Promise<{ type: string; body: Buffer } | null> {
  if (!TG) return null;
  const f = await tg('getFile', { file_id: fileId });
  const r = await fetch(`${TG_API}/file/bot${TG}/${f.file_path}`);
  if (!r.ok) return null;
  return { type: r.headers.get('content-type') || 'image/jpeg', body: Buffer.from(await r.arrayBuffer()) };
}

/* ---------- YouTube Music пользователя: лайки и плейлисты (YouTube Data API, только чтение) ---------- */
const yt = new Map<string, { token: string; exp: number }>();
const userOf = (token: string) => { const s = db.sessions[token]; const u = s && db.users[s.userId]; if (!u) throw Object.assign(new Error('Войди в Lull заново'), { status: 401 }); return u; };

export function ytLinkStart(token: string) {
  const u = userOf(token);
  if (!G_ID || !G_SECRET) throw Object.assign(new Error('Google ещё не настроен на сервере'), { status: 503 });
  const nonce = rid(18);
  pending.set(nonce, { provider: 'yt', at: Date.now(), userId: u.id });
  return { nonce, url: `${PUBLIC}/api/auth/google/go?nonce=${nonce}` };
}
export function ytUnlink(token: string) {
  const u = userOf(token);
  const rt = u.ytRefresh;
  delete u.ytRefresh; delete u.ytName; yt.delete(u.id); save();
  if (rt) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: 'POST' }).catch(() => {});
  return { ok: true };
}

async function access(u: User) {
  const c = yt.get(u.id);
  if (c && c.exp > Date.now()) return c.token;
  if (!u.ytRefresh) throw Object.assign(new Error('YouTube Music не подключён'), { status: 409 });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, refresh_token: u.ytRefresh, grant_type: 'refresh_token' }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!j.access_token) {
    if (j.error === 'invalid_grant') { delete u.ytRefresh; save(); }
    throw Object.assign(new Error('Google отозвал доступ — подключи YouTube Music заново'), { status: 409 });
  }
  yt.set(u.id, { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 - 60e3 });
  return j.access_token;
}

async function gapi(u: User, path: string, q: Record<string, string>) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${await access(u)}` } });
  const j = (await r.json()) as any;
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `YouTube ${r.status}`), { status: r.status === 401 ? 409 : 502 });
  return j;
}
async function pages(u: User, path: string, q: Record<string, string>, max: number) {
  const out: any[] = [];
  let pageToken = '';
  while (out.length < max) {
    const j = await gapi(u, path, { ...q, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    out.push(...(j.items || []));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out.slice(0, max);
}

const iso = (d = '') => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d); return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0; };
const thumb = (t: any) => (t?.maxres || t?.high || t?.medium || t?.default)?.url;
/* «Исполнитель - Topic» → «Исполнитель»; у клипов вида «Артист - Название» берём артиста из названия */
function toTrack(v: any) {
  const sn = v.snippet || {};
  let title: string = sn.title || '';
  let artist: string = (sn.videoOwnerChannelTitle || sn.channelTitle || '').replace(/ - Topic$/, '');
  const chId: string = sn.videoOwnerChannelId || sn.channelId;
  if (!/ - Topic$/.test(sn.videoOwnerChannelTitle || sn.channelTitle || '')) {
    const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
    if (m) { artist = m[1]; title = m[2].replace(/\s*[\[(](official|music|lyric|audio|video|clip|hd|4k)[^\])]*[\])]/gi, '').trim(); }
  }
  return { id: v.id, title, artists: [{ id: chId, name: artist }], durationSec: iso(v.contentDetails?.duration), thumb: thumb(sn.thumbnails) };
}
async function videos(u: User, ids: string[]) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await gapi(u, 'videos', { part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
    out.push(...(j.items || []));
  }
  return out;
}

export async function ytLibrary(token: string) {
  const u = userOf(token);
  const [liked, lists] = await Promise.all([
    pages(u, 'videos', { part: 'snippet,contentDetails', myRating: 'like' }, 1000),
    pages(u, 'playlists', { part: 'snippet,contentDetails', mine: 'true' }, 200),
  ]);
  return {
    account: u.ytName || '',
    /* лайки YouTube общие для клипов и музыки — оставляем только категорию «Музыка» */
    liked: liked.filter((v) => v.snippet?.categoryId === '10').map(toTrack),
    playlists: lists.map((p) => ({ id: p.id, title: p.snippet?.title || 'Плейлист', count: p.contentDetails?.itemCount || 0, thumb: thumb(p.snippet?.thumbnails) })),
  };
}
export async function ytPlaylist(token: string, id: string) {
  const u = userOf(token);
  const items = await pages(u, 'playlistItems', { part: 'contentDetails', playlistId: id }, 1000);
  const vs = await videos(u, items.map((x) => x.contentDetails?.videoId).filter(Boolean));
  return vs.map(toTrack);
}

/* ---------- синхронизация библиотеки: любимое, плейлисты, исполнители, статистика, настройки ---------- */
const SYNC_DIR = path.join(DATA, 'sync');
const syncFile = (id: string) => path.join(SYNC_DIR, `${id.replace(/[^\w-]/g, '')}.json`);

export function syncGet(token: string) {
  const u = userOf(token);
  try { return JSON.parse(fs.readFileSync(syncFile(u.id), 'utf8')) as { at: number; data: unknown }; } catch { return { at: 0, data: null }; }
}
/* сохраняем, только если снимок новее того, что уже лежит: так старое устройство не затрёт свежие данные */
export function syncPut(token: string, at: number, data: unknown) {
  const u = userOf(token);
  const cur = syncGet(token);
  if (!at || at < cur.at) return { ok: false, at: cur.at };
  const raw = JSON.stringify({ at, data });
  if (raw.length > 6 * 1024 * 1024) throw Object.assign(new Error('Библиотека слишком большая для синхронизации'), { status: 413 });
  fs.mkdirSync(SYNC_DIR, { recursive: true });
  fs.writeFileSync(syncFile(u.id) + '.tmp', raw);
  fs.renameSync(syncFile(u.id) + '.tmp', syncFile(u.id));
  return { ok: true, at };
}
