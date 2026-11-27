/* Тесты плеера: настоящий код player.ts против имитации нативного плеера Android (expo-audio AudioPlaylist).
   Имитация, как и настоящий плеер, присылает события с задержкой — именно на этом раньше и ломалось
   («играет 505, а на экране Sparks», «старый трек продолжает играть после переключения»).
   Запуск: node scripts/player.test.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lull-player-'));

/* ---------- имитация AudioPlaylist ---------- */
globalThis.__makePlaylist = () => {
  const L = {}; const lag = () => 20 + Math.random() * 60;
  const emit = (ev, data) => globalThis.__syncPlaylistEvents ? (L[ev] || []).forEach(f=>f(data)) : setTimeout(() => (L[ev] || []).forEach((f) => f(data)), lag());
  const p = {
    sources: [], currentIndex: 0, playing: false, time: 0, loop: 'none', log: [], isLoaded:true,isBuffering:false,
    get currentTime(){return p.time;},get duration(){return 200;},
    addListener(ev, f) { (L[ev] ||= []).push(f); return { remove() {} }; },
    get trackCount() { return p.sources.length; },
    /* как Media3: номер текущего трека вне списка — медиасессия роняет приложение (Invalid PlayerInfo update) */
    check(what) { if (p.sources.length && p.currentIndex >= p.sources.length) (globalThis.__reports ||= []).push(`ВЫЛЕТ Invalid PlayerInfo update после ${what}: трек ${p.currentIndex} при ${p.sources.length}`); },
    add(s) { p.sources.push(s); p.lastChange = Date.now(); p.check('add'); },
    remove(i) { if (i === p.currentIndex && p.playing) (globalThis.__reports ||= []).push(`удалён играющий трек ${i}`); p.sources.splice(i, 1); if (p.currentIndex > i) p.currentIndex--; if (p.currentIndex >= p.sources.length) p.currentIndex = Math.max(0, p.sources.length - 1); emit('trackChanged', { currentIndex: p.currentIndex }); },
    /* как ExoPlayer: после очистки номер текущего трека не сбрасывается */
    clear() { p.sources = []; p.playing = false; emit('trackChanged', { currentIndex: p.currentIndex }); },
    skipTo(i) { if (i < p.sources.length) { p.currentIndex = i; p.time = 0; p.lastChange = Date.now(); emit('trackChanged', { currentIndex: i }); } },
    next() { p.skipTo(p.currentIndex + 1); },
    previous() { p.skipTo(p.currentIndex - 1); },
    play() { p.playing = p.sources.length > 0; p.isLoaded=true; },
    pause() { p.playing = false; },
    seekTo(t) { p.time = t; },
    setActiveForLockScreen(active,meta) { p.lastMeta=meta; p.lockSets = (p.lockSets || 0) + 1; }, updateLockScreenMetadata(meta) { p.lastMeta=meta; if (globalThis.__platform !== 'web' && Date.now() - (p.lastChange || 0) < 300) throw new Error('Invalid PlayerInfo update: метаданные во время переключения'); p.lockUpdates = (p.lockUpdates || 0) + 1; }, clearLockScreenControls() {},
    get current() { return p.playing ? p.sources[p.currentIndex]?.uri : null; },
    /* «звук идёт»: раз в 100 мс шлём статус, как настоящий плеер */
    tick() {
      if (p.playing) p.time += 0.1;
      emit('playlistStatusUpdate', { playing: p.playing, isLoaded:p.isLoaded,isBuffering:p.isBuffering, currentTime: p.time, duration: 200, currentIndex: p.currentIndex, trackCount: p.sources.length, didJustFinish: false });
    },
    finish() { /* трек доиграл: плеер сам переходит на следующий */ emit('playlistStatusUpdate', { playing: true, isBuffering: false, currentTime: 200, duration: 200, currentIndex: p.currentIndex, trackCount: p.sources.length, didJustFinish: true }); if (p.currentIndex < p.sources.length - 1) { p.currentIndex++; p.time = 0; emit('trackChanged', { currentIndex: p.currentIndex }); } },
  };
  globalThis.__pl = p;
  return p;
};

const STUBS = {
  '@/player/downloads': `export const downloaded=()=>undefined;`,
  '@/player/audio-cache': `export const localAudio=id=>globalThis.__localAudio?.get(id); export const pinAudio=()=>{}; export const prefetchAudio=()=>{};`,
  'expo-audio': `export const createAudioPlaylist=()=>globalThis.__makePlaylist(); export const setAudioModeAsync=async()=>{};`,
  '@react-native-async-storage/async-storage': `const m=new Map(); export default { getItem:async k=>m.get(k)??null, setItem:async (k,v)=>{m.set(k,v)}, removeItem:async k=>{m.delete(k)} };`,
  'react-native': `export const Platform={OS:globalThis.__platform||'android'}; export const AppState={addEventListener(){return {remove(){}}}};`,
  '@/ui/Crash': `export const log=(m)=>{ if(process.env.V) console.log('   log:',m) }; export const logNow=async(m)=>{if(globalThis.__logDelay)await new Promise(r=>setTimeout(r,globalThis.__logDelay));}; export const report=(e,w)=>{ (globalThis.__reports ||= []).push(w+': '+e?.message); if(process.env.V) console.log('   REPORT',w,e?.message) };`,
  '@/api/lull': `export const streamUrlYt=id=>'yt:'+id; export const warm=()=>{}; export const lull={ upNext: async()=>[] };`,
  '@/api/audius': `export const streamUrl=id=>'au:'+id;`,
};
const plugin = {
  name: 'lull', setup(b) {
    for (const k of Object.keys(STUBS)) b.onResolve({ filter: new RegExp('^' + k.replace(/[/@.-]/g, (m) => '\\' + m) + '$') }, () => ({ path: k, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js', resolveDir: mobile }));
    b.onResolve({ filter: /^@\// }, (a) => { const f = path.join(mobile, 'src', a.path.slice(2)); return { path: f + (fs.existsSync(f + '.ts') ? '.ts' : '.tsx') }; });
  },
};

/* prime() спрашивает сервер — отвечаем с задержкой; «холодные» треки готовятся дольше */
let slow = new Set();
globalThis.fetch = async (url) => { const id = String(url).replace('yt:', ''); await new Promise((r) => setTimeout(r, slow.has(id) ? 400 : 30)); return { ok: true, json: async () => ({}) }; };

async function freshApp() {
  const out = path.join(tmp, `p-${Math.random().toString(36).slice(2)}.mjs`);
  await esbuild.build({ stdin: { contents: `export * from '@/player/player';`, resolveDir: mobile, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, plugins: [plugin], logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => ({ id, title: 'Трек ' + id, artist: 'X', artwork: '', duration: 200, streamable: true, source: 'yt' });
const LIST = ['s0', 's1', 's2', 's3', 's4', 's5', 's6'].map(T);

/* главный инвариант: на экране тот трек, который реально звучит */
function same(m, what) {
  const s = m.usePlayer.getState(); const p = globalThis.__pl;
  const shown = s.queue[s.index]?.id; const heard = p.current?.replace('yt:', '');
  if (s.playing && shown !== heard) throw new Error(`${what}: на экране ${shown}, а играет ${heard ?? 'тишина'}`);
  return shown;
}
async function settle(ms = 1800) { const end = Date.now() + ms; while (Date.now() < end) { globalThis.__pl?.tick(); await sleep(100); } }

let pass = 0, fail = 0;
async function test(name, f) { if(process.env.LULL_TEST_FILTER&&!name.includes(process.env.LULL_TEST_FILTER))return;slow = new Set(); globalThis.__reports = []; globalThis.__localAudio = new Map(); try { await f(); const crash = (globalThis.__reports || []).find((x) => x.includes('ВЫЛЕТ') || x.includes('удалён играющий')); if (crash) throw new Error(crash); pass++; console.log(`✓ ${name}`); } catch (e) { fail++; console.log(`✗ ${name}\n    ${e.message}`); } }

await test('Готовый локальный трек играет без сетевой проверки prime', async () => {
  const m = await freshApp();
  globalThis.__localAudio.set('s0', 'file:s0');
  const fetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (...args) => { requests++; return fetch(...args); };
  try {
    await m.player.play([LIST[0]], 's0');
    if (requests) throw new Error('локальный старт сделал сетевой запрос');
    if (globalThis.__pl.current !== 'file:s0') throw new Error('плеер не получил локальный файл');
  } finally { globalThis.fetch = fetch; }
});

await test('Включил трек — играет он, на экране он', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(600);
  if (same(m, 'старт') !== 's0') throw new Error('должен играть s0');
});

await test('«Дальше» на подготовленный трек — мгновенно, звук и экран совпадают', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(1500);
  m.player.next(); await settle(600);
  if (same(m, 'после next') !== 's1') throw new Error('должен играть s1');
});

await test('Нажатие на готовый следующий в том же списке сохраняет нативный буфер', async () => {
  const m = await freshApp();
  await m.player.play(LIST, 's0'); await settle(900);
  const native = globalThis.__pl;
  const item = native.sources[1];
  if (!item) throw new Error('следующий не подготовлен');
  m.player.move(3, 4); m.player.move(4, 3);
  if (native.sources[1] !== item) throw new Error('перестановка дальних треков сбросила буфер');
  await m.player.play(LIST.map(t => ({...t})), 's1');
  if (native.currentIndex !== 1 || native.sources[1] !== item || native.current !== 'yt:s1') throw new Error('потерян буфер следующего');
  if (m.usePlayer.getState().queue.length !== LIST.length) throw new Error('не восстановлен выбранный список');
});

await test('Пять быстрых «дальше» подряд — в итоге играет s5, а не старый трек', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(1500);
  for (let i = 0; i < 5; i++) { m.player.next(); await sleep(40); }
  await settle(2500);
  if (same(m, 'после серии') !== 's5') throw new Error(`ожидали s5, а на экране ${m.usePlayer.getState().queue[m.usePlayer.getState().index].id}`);
});

await test('Переход на неподготовленный трек: старый сразу замолкает', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(300);
  slow = new Set(['s4']);
  m.player.skipTo(4); await sleep(100);
  if (globalThis.__pl.current) throw new Error(`пока s4 готовится, играет ${globalThis.__pl.current}`);
  await settle(1500);
  if (same(m, 'после подготовки') !== 's4') throw new Error('должен играть s4');
});

await test('Пауза/плей, пока новый трек готовится, не будит старый трек', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(300);
  slow = new Set(['s5']);
  m.player.skipTo(5); await sleep(80);
  m.player.toggle(); m.player.toggle(); await sleep(50);
  if (globalThis.__pl.current) throw new Error(`проснулся ${globalThis.__pl.current}`);
  await settle(1500);
  if (same(m, 'после подготовки') !== 's5') throw new Error('должен играть s5');
});

await test('Запоздалые события от очистки плеера не откатывают экран (баг «играет 505, на экране Sparks»)', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(1500);
  m.player.next(); await sleep(30);               // быстрый переход на s1
  slow = new Set(['s3', 's4']);
  m.player.skipTo(3); await sleep(20);            // неподготовленный — плеер очищается
  await settle(2500);
  if (same(m, 'итог') !== 's3') throw new Error('должен играть s3');
});

await test('Трек доиграл сам — на экране следующий, звук следующий', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(3000);
  globalThis.__pl.finish(); await settle(800);
  if (same(m, 'после конца трека') !== 's1') throw new Error('должен играть s1');
});

await test('«Дальше» с экрана блокировки — приложение следует за плеером', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(3000);
  globalThis.__pl.next(); await settle(800);
  if (same(m, 'после кнопки на экране блокировки') !== 's1') throw new Error('должен быть s1');
});

await test('«Назад» после нескольких переходов — возвращает на прошлый трек', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(1500);
  m.player.next(); await settle(1500); m.player.next(); await settle(600);
  m.player.prev(); await settle(800);
  if (same(m, 'после prev') !== 's1') throw new Error('должен быть s1');
});

await test('Новый список во время подготовки прошлого — играет последний выбранный', async () => {
  const m = await freshApp();
  slow = new Set(['s0']);
  const a = m.player.play(LIST, 's0');
  await sleep(50);
  const b = m.player.play(LIST, 's6');
  await Promise.all([a, b]); await settle(1200);
  if (same(m, 'итог') !== 's6') throw new Error('должен играть s6');
});

await test('Свайпы подряд: название в шторке не обновляется во время переключения (падение Invalid PlayerInfo)', async () => {
  globalThis.__reports = [];
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(1500);
  for (let i = 0; i < 3; i++) { m.player.next(); await settle(250); }
  await settle(1500);
  const bad = globalThis.__reports.filter((x) => x.includes('lockscreen'));
  if (bad.length) throw new Error(bad[0]);
  if (!(globalThis.__pl.lockUpdates >= 1)) throw new Error('название в шторке так и не обновилось');
  same(m, 'итог');
});

await test('Шторка/экран блокировки: плеер регистрируется один раз, дальше только обновляется название', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(1500);
  m.player.next(); await settle(1200); m.player.next(); await settle(1200);
  const p = globalThis.__pl;
  const bad = (globalThis.__reports || []).filter((x) => x.includes('lockscreen'));
  if (bad.length) throw new Error('обновление шторки во время переключения (на телефоне это падение): ' + bad[0]);
  if (p.lockSets !== 1) throw new Error(`регистраций ${p.lockSets}, а должна быть одна`);
  if (!(p.lockUpdates >= 2)) throw new Error('название в шторке не обновлялось');
});

await test('«Дальше» из шторки, когда следующий трек ещё готовится: ничего не ломается, потом переключается', async () => {
  slow = new Set(['s1']);
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(100);
  const p = globalThis.__pl;
  if (p.sources.length > 1) throw new Error('неподготовленный трек уже лежит в плеере телефона');
  p.next(); await settle(300);                     // кнопка в шторке: следующего ещё нет — остаёмся на s0
  if (same(m, 'пока готовится') !== 's0') throw new Error('сломалось');
  await settle(800);                               // s1 подготовился и лёг в плеер
  p.next(); await settle(800);
  if (same(m, 'после подготовки') !== 's1') throw new Error('должен играть s1');
});

await test('Быстрый переход, потом неподготовленный трек: плеер не остаётся на «треке №1 при одном треке» (падение Invalid PlayerInfo)', async () => {
  const m = await freshApp(); await m.player.play(LIST, 's0'); await settle(1500);
  m.player.next(); await settle(400);              // плеер телефона на треке №1
  slow = new Set(['s5']);
  m.player.skipTo(5); await settle(1500);          // очистка и новый трек
  if (same(m, 'итог') !== 's5') throw new Error('должен играть s5');
  m.player.next(); await settle(600); m.player.skipTo(2); await settle(1200);
  same(m, 'итог 2');
});

await test('Медленная запись диагностики не оставляет название первого трека в системном плеере',async()=>{
 globalThis.__logDelay=2000;try{const m=await freshApp();await m.player.play(LIST,'s0');await settle(500);m.player.next();await settle(900);const p=globalThis.__pl;if(p.lastMeta?.title!==m.currentTrack().title)throw Error('System metadata is stale');if(p.lockSets!==1)throw Error('Media session registered more than once');}finally{globalThis.__logDelay=0;}
});
await test('Два быстрых перехода в шторке принимают живой индекс, а не теряют событие в окне 700 мс',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(1600);const p=globalThis.__pl;p.next();await settle(180);m.player.prev();await settle(300);p.next();await settle(1000);same(m,'Быстрый переход из шторки');if(p.lastMeta?.title!==m.currentTrack().title)throw Error('System title does not match current song');
});

await test('Поток после обрыва восстанавливает позицию и очередь, а пауза отменяет повтор',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(600);const p=globalThis.__pl;
 p.time=93;p.isLoaded=false;p.playing=false;await settle(8500);
 if(!p.playing||p.time<93||m.currentTrack().id!=='s0'||m.usePlayer.getState().queue.length!==LIST.length)throw Error('После обрыва потеряна позиция/очередь');
 p.time=110;p.isLoaded=false;p.playing=false;await settle(250);m.player.toggle();await settle(6500);
 if(p.playing||m.usePlayer.getState().playing)throw Error('Ручная пауза не отменила восстановление');
 m.player.stop();
});
await test('Несколько аппаратных назад до доставки первого события обновляют живой трек и метаданные',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(900);const p=globalThis.__pl;
 p.next();await settle(700);p.next();await settle(700);if(p.currentIndex!==2)throw Error('Тест не подготовил очередь');
 p.previous();p.previous();await settle(1100);same(m,'Аппаратная серия');
 if(m.currentTrack().id!=='s0'||p.lastMeta?.title!==LIST[0].title)throw Error('Метаданные застряли после серии аппаратных кнопок');m.player.stop();
});
await test('Ручная очередь играет следующей в порядке добавления, перед альбомом', async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(700);
 m.player.addToQueue(T('manual-a'));m.player.addToQueue(T('manual-b'));await settle(600);
 if(m.usePlayer.getState().queue.slice(1,3).map(t=>t.id).join()!=='manual-a,manual-b')throw Error('Ручные треки затерялись в конце альбома');
 m.player.next();await settle(650);if(same(m,'Первый из очереди')!=='manual-a')throw Error('Первый ручной трек не заиграл');
 globalThis.__pl.next();await settle(650);if(same(m,'Второй из очереди')!=='manual-b')throw Error('Аппаратная кнопка пропустила ручную очередь');m.player.stop();
});
await test('Холодный добавленный трек играет при немедленном переключении',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(300);slow.add('cold-manual');
 m.player.addToQueue(T('cold-manual'));m.player.next();await settle(1100);
 if(same(m,'Холодная очередь')!=='cold-manual')throw Error('Добавленный трек не включился');m.player.stop();
});
await test('Перестановка и удаление очереди обновляют звук, сохраняя текущий трек',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(800);const p=globalThis.__pl;p.time=42;
 m.player.move(3,1);await settle(500);if(p.current!=='yt:s0'||p.time<42)throw Error('Редактирование перезапустило текущий трек');
 m.player.removeAt(1);await settle(400);m.player.move(3,1);await settle(500);p.next();await settle(600);
 if(same(m,'Порядок после редактирования')!=='s4')throw Error('Нативная очередь не приняла новый порядок');m.player.stop();
});
await test('Неверные индексы и редактирование текущего трека не портят очередь',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(400);const q=m.usePlayer.getState().queue;
 m.player.removeAt(-1);m.player.removeAt(500);m.player.move(-1,2);m.player.move(1,500);m.player.move(0,1);m.player.removeAt(0);
 if(m.usePlayer.getState().queue!==q)throw Error('Неверный индекс изменил очередь');m.player.stop();
});
await test('Добавление до доставки нативного перехода не подменяет уже играющую песню',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(900);const p=globalThis.__pl;
 p.next();m.player.playNext(T('manual-race'));await settle(650);
 if(same(m,'Переход в фоне')!=='s1')throw Error('Добавление подменило уже играющий трек');
 p.next();await settle(650);if(same(m,'Ручной трек после перехода')!=='manual-race')throw Error('Добавление потерялось после нативного перехода');m.player.stop();
});

await test('Синхронный плеер веба не откатывает трек при открытии готовой песни из очереди',async()=>{
 globalThis.__syncPlaylistEvents=true;globalThis.__platform='web';
 try{const m=await freshApp();await m.player.play(LIST,'s0');await settle(700);m.player.next();await settle(600);
 m.player.skipTo(3);await settle(800);if(same(m,'Выбор готового дальнего трека')!=='s3')throw Error('Синхронное событие очистки откатило индекс');
 if(globalThis.__pl.lastMeta?.title!==LIST[3].title)throw Error('Метаданные не следуют выбранному треку');m.player.stop();
 }finally{globalThis.__syncPlaylistEvents=false;globalThis.__platform='android';}
});
await test('Новая волна сохраняет ручную очередь и повторные добавления одной песни',async()=>{
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(500);m.player.addToQueue(T('chosen'));m.player.addToQueue(T('chosen'));
 m.player.startWave([LIST[0],T('radio')]);
 if(m.usePlayer.getState().queue.slice(1).map(t=>t.id).join()!=='chosen,chosen,radio')throw Error('Волна затёрла ручные добавления');
 const q=m.usePlayer.getState().queue;m.player.move(3,1);const edited=m.usePlayer.getState().queue;
 m.player.startWave([edited[0],...edited.slice(1),T('more')]);
 if(m.usePlayer.getState().queue.slice(1).map(t=>t.id).join()!=='radio,chosen,chosen,more')throw Error('Волна сбросила изменённый порядок');
 if(q[1]===q[2])throw Error('Повторные добавления неразличимы');m.player.stop();
});
await test('Недоступная песня в очереди не оставляет ошибку при выборе следующей',async()=>{
 const fetch=globalThis.fetch;try{globalThis.fetch=async(url,...args)=>String(url).includes('unavailable')?{ok:false}:fetch(url,...args);
 const m=await freshApp();await m.player.play(LIST,'s0');await settle(400);m.player.playNext(T('unavailable'));m.player.next();await settle(400);
 if(!m.usePlayer.getState().error)throw Error('Ошибка источника не обнаружена');m.player.next();await settle(650);
 if(same(m,'После недоступного трека')!=='s1'||m.usePlayer.getState().error)throw Error('Следующая песня сохранила состояние ошибки');m.player.stop();
 }finally{globalThis.fetch=fetch;}
});
console.log(`\n${pass} прошло, ${fail} упало`);
process.exit(fail ? 1 : 0);
