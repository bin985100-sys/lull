/* Тесты входа и синхронизации библиотеки на настоящем сервере Lull (запускается локально).
   Запуск: node scripts/sync.test.mjs  (из папки mobile; сервер собирается из ../server-api)

   Каждый сценарий — «телефон»: свежие сторы и хранилище, сервер общий. */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const root = path.resolve(mobile, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lull-sync-'));
const PORT = 18000 + Math.floor(Math.random() * 1000);
const API = `http://127.0.0.1:${PORT}`;

/* ---------- сервер с двумя аккаунтами ---------- */
const now = Date.now();
const users = { uA: { id: 'uA', name: 'Аня', provider: 'google', createdAt: now }, uB: { id: 'uB', name: 'Борис', provider: 'telegram', createdAt: now }, uC: { id: 'uC', name: 'Вика', provider: 'google', createdAt: now } };
const sessions = { tA: { userId: 'uA', at: now }, tA2: { userId: 'uA', at: now }, tB: { userId: 'uB', at: now }, tC: { userId: 'uC', at: now } };
fs.writeFileSync(path.join(tmp, 'auth.json'), JSON.stringify({ users, sessions }));
execSync('node server-api/build.mjs', { cwd: root, stdio: 'ignore' });
const srv = spawn('node', [path.join(root, 'dist-server/lull-api.mjs')], { env: { ...process.env, LULL_API_DATA: tmp, LULL_API_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('сервер не стартовал')), 15000); srv.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } }); });

/* ---------- бандл кода приложения с заглушками нативного ---------- */
const stub = (name, code) => ({ name, setup(b) { b.onResolve({ filter: new RegExp(`^${name.replace(/[/@.]/g, (m) => '\\' + m)}$`) }, () => ({ path: name, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' })); } });
const STUBS = {
  '@react-native-async-storage/async-storage': `const m=globalThis.__store; export default { getItem:async k=>m.has(k)?m.get(k):null, setItem:async (k,v)=>{m.set(k,v)}, removeItem:async k=>{m.delete(k)} };`,
  'react-native': `export const AppState={addEventListener(){return {remove(){}}}}; export const Platform={OS:'android'};`,
  '@/ui/Crash': `export const log=(m)=>{ if(process.env.V) console.log('   log:',m) };`,
  '@/nav': `export const resetTo=(p)=>{ globalThis.__routes.push(p) };`,
  './lull': `export const LULL_API=globalThis.__api;`,
};
const plugin = {
  name: 'lull', setup(b) {
    for (const k of Object.keys(STUBS)) b.onResolve({ filter: new RegExp('^' + k.replace(/[/@.]/g, (m) => '\\' + m) + '$') }, () => ({ path: k, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js', resolveDir: mobile }));
    b.onResolve({ filter: /^@\// }, (a) => ({ path: path.join(mobile, 'src', a.path.slice(2)) + (fs.existsSync(path.join(mobile, 'src', a.path.slice(2)) + '.ts') ? '.ts' : '.tsx') }));
  },
};
const entry = `export * as sync from '@/api/sync'; export * as session from '@/api/session'; export { useLibrary } from '@/store/library'; export { useTaste } from '@/store/taste';`;
async function freshPhone() {
  globalThis.__store = new Map(); globalThis.__routes = []; globalThis.__api = API;
  const out = path.join(tmp, `app-${Math.random().toString(36).slice(2)}.mjs`);
  await esbuild.build({ stdin: { contents: entry, resolveDir: mobile, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, plugins: [plugin], logLevel: 'silent', nodePaths: [path.join(mobile, 'node_modules')] });
  const m = await import(out);
  await new Promise((r) => setTimeout(r, 20)); // persist успевает «загрузиться»
  return m;
}

/* сеть: можно выключить */
const realFetch = globalThis.fetch;
let offline = false;
globalThis.fetch = (...a) => (offline ? Promise.reject(new TypeError('Network request failed')) : realFetch(...a));

const server = async (token) => (await realFetch(`${API}/api/auth/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, op: 'get' }) })).json();
const serverPut = async (token, at, data) => (await realFetch(`${API}/api/auth/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, op: 'put', at, data }) })).json();
const T = (id, title) => ({ id, title, artist: 'X', artwork: '', duration: 200, streamable: true, source: 'yt' });
const art = (id) => ({ id, name: id, handle: '', followers: 0, source: 'yt' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function signIn(m, token, userId) { m.useLibrary.getState().setAccount({ provider: 'Google', name: userId, token, userId }); }

/* у Ани на сервере уже есть библиотека */
await serverPut('tA', now - 60e3, { lib: { onboarded: true, favArtists: [art('a1'), art('a2'), art('a3'), art('a4'), art('a5')], liked: [T('t1', 'Song A1'), T('t2', 'Song A2')], playlists: [], savedPlaylists: [], history: [], recentSearches: [], settings: { saveHistory: true, balance: 40 } }, taste: {} });

let pass = 0, fail = 0;
async function test(name, f) {
  try { await f(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name}\n    ${e.message}`); }
  offline = false;
}
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ожидали ${JSON.stringify(b)}, получили ${JSON.stringify(a)}`); };
const ok = (c, what) => { if (!c) throw new Error(what); };

await test('Новый аккаунт на чистом телефоне → выбор артистов', async () => {
  const m = await freshPhone(); signIn(m, 'tB', 'uB');
  await m.session.finishLogin();
  eq(globalThis.__routes.at(-1), '/onboarding', 'экран');
  eq(m.useLibrary.getState().onboarded, false, 'onboarded');
});

await test('Существующий аккаунт на чистом телефоне → сразу музыка и его библиотека', async () => {
  const m = await freshPhone(); signIn(m, 'tA', 'uA');
  await m.session.finishLogin();
  eq(globalThis.__routes.at(-1), '/listen', 'экран');
  eq(m.useLibrary.getState().liked.map((t) => t.id), ['t1', 't2'], 'любимые');
  eq(m.useLibrary.getState().favArtists.length, 5, 'артисты');
});

await test('Вышел из Ани, вошёл новым Борисом → выбор артистов, чужих лайков нет, у Ани на сервере всё цело', async () => {
  const m = await freshPhone(); signIn(m, 'tA', 'uA'); await m.session.finishLogin();
  await m.sync.signOutSync(); m.useLibrary.getState().setAccount({ token: undefined, userId: undefined });
  signIn(m, 'tB', 'uB'); await m.session.finishLogin();
  eq(globalThis.__routes.at(-1), '/onboarding', 'экран');
  eq(m.useLibrary.getState().liked.length, 0, 'лайки у Бориса');
  eq((await server('tA')).data.lib.liked.length, 2, 'лайки Ани на сервере');
});

await test('Без выхода сменили аккаунт (Аня → Вика) → данные Ани стёрты и не уехали Вике', async () => {
  const m = await freshPhone(); signIn(m, 'tA', 'uA'); await m.session.finishLogin();
  signIn(m, 'tC', 'uC'); await m.session.finishLogin();
  eq(globalThis.__routes.at(-1), '/onboarding', 'экран');
  eq(m.useLibrary.getState().liked.length, 0, 'лайки на телефоне');
  m.sync.startSync(); await sleep(50);
  m.useLibrary.getState().setFavArtists([art('c1'), art('c2'), art('c3'), art('c4'), art('c5')]); m.useLibrary.getState().setOnboarded(true);
  await m.sync.push();
  const c = await server('tC');
  eq(c.data.lib.liked.length, 0, 'лайки на сервере у Вики');
  eq(c.data.lib.favArtists[0].id, 'c1', 'артисты Вики');
  eq((await server('tA')).data.lib.liked.length, 2, 'Аня не пострадала');
});

await test('Телефон со старой версии (данные без владельца) + аккаунт с библиотекой → берём библиотеку с сервера', async () => {
  const m = await freshPhone();
  m.useLibrary.setState({ onboarded: true, liked: [T('old', 'Old')] });
  signIn(m, 'tA', 'uA'); await m.session.finishLogin();
  eq(globalThis.__routes.at(-1), '/listen', 'экран');
  eq(m.useLibrary.getState().liked.map((t) => t.id), ['t1', 't2'], 'любимые');
});

await test('Нет интернета при входе → не отправляем в выбор артистов, ждём «Повторить»; потом всё загружается', async () => {
  const m = await freshPhone(); signIn(m, 'tA', 'uA');
  offline = true;
  await m.session.finishLogin();
  eq(globalThis.__routes.at(-1), '/welcome', 'экран при ошибке');
  eq(m.session.useSession.getState().error, true, 'ошибка');
  offline = false;
  await m.session.finishLogin();
  eq(globalThis.__routes.at(-1), '/listen', 'экран после повтора');
  eq(m.useLibrary.getState().liked.length, 2, 'любимые');
});

await test('Пока библиотека не загрузилась, телефон ничего не отправляет на сервер', async () => {
  const before = await server('tA');
  const m = await freshPhone(); signIn(m, 'tA', 'uA');
  offline = true; await m.session.finishLogin(); offline = false;
  m.sync.startSync().catch(() => {}); offline = true; await sleep(30);
  m.useLibrary.getState().setOnboarded(false); m.useLibrary.getState().setFavArtists([art('zz')]);
  offline = false;
  await m.sync.push();
  const after = await server('tA');
  ok(after.at >= before.at, 'время');
  eq(after.data.lib.liked.length, 2, 'лайки Ани на сервере');
  eq(after.data.lib.onboarded, true, 'onboarded на сервере');
});

await test('Изменения после входа уходят на сервер и приходят на второй телефон', async () => {
  const p1 = await freshPhone(); signIn(p1, 'tA', 'uA'); await p1.session.finishLogin(); p1.sync.startSync(); await sleep(50);
  p1.useLibrary.setState({ liked: [T('t9', 'New'), ...p1.useLibrary.getState().liked] });
  await sleep(20); await p1.sync.push();
  const p2 = await freshPhone(); signIn(p2, 'tA2', 'uA'); await p2.session.finishLogin();
  eq(p2.useLibrary.getState().liked[0].id, 't9', 'новый лайк на втором телефоне');
});

await test('Повторный запуск приложения: пока сверяемся с сервером, онбординг не показывается', async () => {
  const m = await freshPhone(); signIn(m, 'tA', 'uA');
  // приложение выгрузили сразу после входа: на телефоне ещё пусто, библиотека не загружена
  await m.session.finishLogin();
  eq(globalThis.__routes.includes('/onboarding'), false, 'онбординг не показан');
});

await test('Одновременный вход из двух мест (ссылка + опрос) — одна загрузка, один переход', async () => {
  const m = await freshPhone(); signIn(m, 'tB', 'uB');
  await Promise.all([m.session.finishLogin(), m.session.finishLogin(), m.session.finishLogin()]);
  eq(globalThis.__routes.length, 1, 'переходов');
});

await test('Удаление аккаунта: на сервере не остаётся ни профиля, ни библиотеки, вход по старому токену не работает', async () => {
  const m = await freshPhone(); signIn(m, 'tB', 'uB'); await m.session.finishLogin();
  m.sync.startSync(); await sleep(50);
  m.useLibrary.getState().setFavArtists([art('b1')]); m.useLibrary.getState().setOnboarded(true); await sleep(20); await m.sync.push();
  eq((await server('tB')).data.lib.favArtists[0].id, 'b1', 'до удаления библиотека на сервере');
  const r = await realFetch(`${API}/api/auth/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'tB' }) });
  eq(r.status, 200, 'ответ на удаление');
  m.sync.forgetAccount();
  eq(m.useLibrary.getState().favArtists.length, 0, 'телефон очищен');
  const after = await realFetch(`${API}/api/auth/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'tB', op: 'get' }) });
  ok(after.status >= 400, `после удаления sync должен отвечать ошибкой, а ответил ${after.status}`);
  const me = await realFetch(`${API}/api/auth/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'tB' }) });
  ok(me.status >= 400 || !(await me.json()).user, 'профиль удалён');
});

srv.kill();
console.log(`\n${pass} прошло, ${fail} упало`);
process.exit(fail ? 1 : 0);
