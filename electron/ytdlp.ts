import { app, net, session } from 'electron';
import { isProxyDead } from './relay';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ACCOUNTS_ENABLED } from '../shared/config';

/**
 * Основной способ получить аудио, когда YouTube не пускает встроенный клиент: yt-dlp.
 * Его обновляют почти каждый день под изменения YouTube.
 *
 * Скорость:
 *  - на Windows берём «распакованную» сборку (yt-dlp_win.zip): обычный yt-dlp.exe при
 *    каждом запуске распаковывает себя во временную папку — это лишние 1–3 секунды;
 *  - сначала спрашиваем клиент android_vr: ему не нужен JavaScript-плеер YouTube,
 *    ответ приходит в разы быстрее; если не вышло — полный набор клиентов;
 *  - запросы на воспроизведение идут сразу, а заранее (следующие треки, наведение) —
 *    по одному, чтобы не отнимать процессор у текущего трека.
 */

const isWin = process.platform === 'win32';
const binDir = () => path.join(app.getPath('userData'), 'bin');
const oneFile = () => path.join(binDir(), isWin ? 'yt-dlp.exe' : 'yt-dlp');
const winDir = () => path.join(binDir(), 'yt-dlp-win');
const winExe = () => path.join(winDir(), 'yt-dlp.exe');
const UPDATE_EVERY = 3 * 24 * 3600_000;

let ready: Promise<string | null> | null = null;

async function download(asset: string): Promise<Buffer> {
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log('[yt-dlp] скачиваю', url);
  const r = await net.fetch(url);
  if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1_000_000) throw new Error('скачался неполный файл');
  return buf;
}

/** Windows: распакованная сборка (быстрый старт). tar встроен в Windows 10+. */
async function installWinDir(): Promise<string> {
  const buf = await download('yt-dlp_win.zip');
  fs.mkdirSync(binDir(), { recursive: true });
  const zip = path.join(binDir(), 'yt-dlp_win.zip');
  const tmp = `${winDir()}.new`;
  fs.writeFileSync(zip, buf);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  await new Promise<void>((res, rej) => execFile('tar', ['-xf', zip, '-C', tmp], { windowsHide: true, timeout: 120_000 }, (e) => (e ? rej(e) : res())));
  fs.rmSync(zip, { force: true });
  if (!fs.existsSync(path.join(tmp, 'yt-dlp.exe'))) throw new Error('в архиве нет yt-dlp.exe');
  try {
    fs.rmSync(winDir(), { recursive: true, force: true });
  } catch {
    /* старая версия занята — заменим при следующем запуске */
  }
  fs.renameSync(tmp, winDir());
  // В архиве у файла дата сборки — ставим текущую, иначе обновление запускалось бы при каждом старте
  fs.utimesSync(winExe(), new Date(), new Date());
  return winExe();
}

async function installOneFile(): Promise<string> {
  const buf = await download(isWin ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux');
  fs.mkdirSync(binDir(), { recursive: true });
  fs.writeFileSync(`${oneFile()}.part`, buf);
  fs.renameSync(`${oneFile()}.part`, oneFile());
  if (!isWin) fs.chmodSync(oneFile(), 0o755);
  return oneFile();
}

/** Путь к yt-dlp: скачанный приложением (быстрая сборка), иначе системный. */
export function ensureYtDlp(): Promise<string | null> {
  if (ready) return ready;
  const task = (async () => {
    if (isWin && fs.existsSync(winExe())) {
      console.log('[yt-dlp] готов (быстрая сборка):', winExe());
      maybeUpdate(winExe());
      return winExe();
    }
    if (isWin) {
      try {
        const p = await installWinDir();
        console.log('[yt-dlp] готов (быстрая сборка):', p);
        return p;
      } catch (e) {
        console.warn('[yt-dlp] быстрая сборка не установилась:', (e as Error).message);
      }
    }
    if (fs.existsSync(oneFile()) && fs.statSync(oneFile()).size > 1_000_000) {
      console.log('[yt-dlp] готов:', oneFile());
      maybeUpdate(oneFile());
      return oneFile();
    }
    const system = await which(isWin ? 'yt-dlp.exe' : 'yt-dlp');
    if (system) {
      console.log('[yt-dlp] системный:', system);
      return system;
    }
    const p = await installOneFile();
    console.log('[yt-dlp] готов:', p);
    return p;
  })();
  ready = task.catch((e) => {
    console.warn('[yt-dlp] не удалось подготовить:', (e as Error).message);
    ready = null; // попробуем ещё раз при следующем треке
    return null;
  });
  return ready;
}

function maybeUpdate(bin: string) {
  try {
    if (Date.now() - fs.statSync(bin).mtimeMs < UPDATE_EVERY) return;
    fs.utimesSync(bin, new Date(), new Date());
    // Свежая версия нужна, когда YouTube что-то меняет; обновляемся тихо в фоне
    if (bin === winExe()) {
      void installWinDir().then(
        () => console.log('[yt-dlp] обновлён'),
        (e) => console.warn('[yt-dlp] обновление не удалось:', (e as Error).message)
      );
      return;
    }
    execFile(bin, ['-U'], { windowsHide: true, timeout: 120_000 }, (err, out) => {
      if (!err) console.log('[yt-dlp]', String(out).trim().split('\n').pop());
    });
  } catch {
    /* не критично */
  }
}

function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(isWin ? 'where' : 'which', [cmd], { windowsHide: true, timeout: 5000 }, (err, out) => {
      const p = String(out ?? '').split(/\r?\n/)[0]?.trim();
      resolve(!err && p ? p : null);
    });
  });
}

/**
 * yt-dlp решает задачи YouTube на JavaScript — ему нужен Node или Deno.
 * Берём системный Node, а если его нет — сам Electron в режиме Node.
 */
let runtime: Promise<{ args: string[]; env: NodeJS.ProcessEnv }> | null = null;
function jsRuntime() {
  runtime ??= (async () => {
    if (await which('deno')) return { args: [], env: process.env };
    if (await which(isWin ? 'node.exe' : 'node')) return { args: ['--js-runtimes', 'node'], env: process.env };
    return { args: ['--js-runtimes', `node:${process.execPath}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } };
  })();
  return runtime;
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number, onSpawn?: (p: ChildProcess) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true, env });
    onSpawn?.(p);
    let out = '';
    let err = '';
    const t = setTimeout(() => {
      p.kill();
      reject(new Error('yt-dlp: таймаут'));
    }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => (clearTimeout(t), reject(e)));
    p.on('close', (code) => {
      clearTimeout(t);
      if (code === 0 && out.trim()) resolve(out);
      else reject(Object.assign(new Error(err.trim().split('\n').filter(Boolean).pop()?.replace(/^ERROR:\s*/, '') || `yt-dlp завершился с кодом ${code}`), { stdout: out }));
    });
  });
}

/**
 * YouTube стал требовать «подтвердить, что вы не бот» и от yt-dlp. Если пользователь вошёл
 * в YouTube Music, отдаём yt-dlp его cookies (файл в формате Netscape в папке данных) —
 * с ними YouTube отвечает как обычному вошедшему пользователю.
 */
let cookiesCache: { file: string | null; at: number } | null = null;
/** Вход/выход в YouTube Music — перечитать cookies */
export function resetYtDlpCookies() {
  cookiesCache = null;
}
async function cookiesFile(): Promise<string | null> {
  if (ACCOUNTS_ENABLED) return null;
  if (cookiesCache && Date.now() - cookiesCache.at < 10 * 60_000) return cookiesCache.file;
  let file: string | null = null;
  try {
    const list = await session.fromPartition('persist:youtube-auth').cookies.get({});
    const yt = list.filter((c) => /(^|\.)(youtube|google)\.com$/.test((c.domain ?? '').replace(/^\./, '')) || /youtube\.com|google\.com/.test(c.domain ?? ''));
    if (yt.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID')) {
      const lines = ['# Netscape HTTP Cookie File'];
      for (const c of yt) {
        const domain = c.domain ?? '';
        const sub = domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const exp = Math.floor(c.expirationDate ?? Date.now() / 1000 + 30 * 86400);
        lines.push([domain, sub, c.path ?? '/', c.secure ? 'TRUE' : 'FALSE', String(exp), c.name, c.value].join('\t'));
      }
      file = path.join(app.getPath('userData'), 'yt-cookies.txt');
      fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
    }
  } catch (e) {
    console.warn('[yt-dlp] не удалось взять cookies входа:', (e as Error).message);
  }
  cookiesCache = { file, at: Date.now() };
  return file;
}

/** Понятная причина вместо длинного английского текста yt-dlp */
async function runOrExplain(withCookies: boolean, fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (e) {
    const m = String((e as Error).message);
    if (/confirm you.{0,3}re not a bot|Sign in to confirm/i.test(m))
      throw new Error(withCookies ? 'YouTube просит подтвердить, что ты не бот, даже со входом — выйди и войди в YouTube Music заново' : 'YouTube просит подтвердить, что ты не бот — войди в YouTube Music (Настройки → YouTube Music)');
    throw e;
  }
}

export interface DlpStream {
  url: string;
  headers: Record<string, string>;
  mime: string;
  bitrate: number;
  contentLength: number;
  durationSec: number;
  /** id формата — чтобы при обновлении ссылки получить тот же самый файл */
  formatId: string;
}

/** Клиент YouTube для yt-dlp — выбирается замером на этом компьютере (см. diagnose) */
let clientOverride = '';
export function setYtDlpClient(c: string) {
  clientOverride = c;
}

/**
 * Все запущенные yt-dlp. Когда пользователь включает трек, остальные запуски (заранее
 * и для уже брошенных треков) прерываем — иначе они делят процессор и сеть с нужным.
 * Скачивание треков (keep) не трогаем.
 */
type Kind = 'background' | 'play' | 'keep';
const running = new Map<ChildProcess, { id: string; kind: Kind }>();
export function stopOthers(exceptId: string) {
  for (const [p, r] of running) {
    // Брошенные клики останавливаем; заготовки следующих треков и скачивания — нет (они понадобятся)
    if (r.id === exceptId || r.kind !== 'play') continue;
    p.kill();
    running.delete(p);
    console.log(`[yt-dlp] ${r.id}: прервано — включён другой трек`);
  }
}

/** VPN выключен, а системный прокси остался — yt-dlp тоже идёт напрямую. */
const noProxy = () => (isProxyDead() ? ['--proxy', ''] : []);

/** Общие ключи: не тянуть HLS/DASH-манифесты (нам нужен прямой поток), постоянный кэш плеера YouTube. */
function baseArgs(format: string, rtArgs: string[], cookies: string | null | undefined, client = clientOverride) {
  const ex = `youtube:skip=hls,dash,translated_subs${client ? `;player_client=${client}` : ''}`;
  return [...noProxy(), '-j', '--no-playlist', '--no-warnings', '--no-progress', '--socket-timeout', '10', '--cache-dir', path.join(app.getPath('userData'), 'yt-dlp-cache'), '--extractor-args', ex, '-f', format, ...rtArgs, ...(cookies ? ['--cookies', cookies] : [])];
}

function formatFor(quality: string | undefined) {
  return quality === 'low' ? 'wa[protocol=https]/wa' : quality === 'aac' ? 'ba[protocol=https][ext=m4a]/ba[protocol=https]/ba' : 'ba[protocol=https][ext=webm]/ba[protocol=https]/ba';
}

function toStream(j: Record<string, any>): DlpStream {
  const f = j.requested_formats?.[0] ?? j;
  if (!f.url) throw new Error('yt-dlp не вернул ссылку');
  const ext = f.ext ?? j.ext;
  return {
    url: f.url,
    headers: { ...(j.http_headers ?? {}), ...(f.http_headers ?? {}) },
    mime: ext === 'webm' ? 'audio/webm' : ext === 'm4a' || ext === 'mp4' ? 'audio/mp4' : `audio/${ext ?? 'webm'}`,
    bitrate: Math.round((f.abr ?? f.tbr ?? 128) * 1000),
    contentLength: f.filesize ?? 0,
    durationSec: Math.round(j.duration ?? 0),
    formatId: String(f.format_id ?? '')
  };
}

/**
 * Несколько треков одним запуском yt-dlp: запуск программы, загрузка плеера YouTube и
 * разгадывание подписи происходят один раз на всю пачку — заранее готовим быстрее.
 */
export async function ytdlpResolveMany(ids: string[], quality: string | undefined): Promise<Map<string, DlpStream>> {
  const out = new Map<string, DlpStream>();
  if (!ids.length) return out;
  const bin = await ensureYtDlp();
  if (!bin) throw new Error('yt-dlp недоступен');
  const rt = await jsRuntime();
  const cookies = await cookiesFile();
  const t0 = Date.now();
  let text = '';
  try {
    text = await run(bin, [...baseArgs(formatFor(quality), rt.args, cookies), '--ignore-errors', '--', ...ids.map((i) => `https://www.youtube.com/watch?v=${i}`)], rt.env, 25_000 + ids.length * 8_000, (p) => (running.set(p, { id: ids[0], kind: 'background' }), p.on('close', () => running.delete(p))));
  } catch (e) {
    // С --ignore-errors код ошибки бывает и при частичном успехе — забираем то, что успело выйти
    text = String((e as { stdout?: string }).stdout ?? '');
    if (!text) throw e;
  }
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      out.set(String(j.id), toStream(j));
    } catch {
      /* пропускаем битую строку */
    }
  }
  console.log(`[yt-dlp] пачка ${out.size}/${ids.length}: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  return out;
}

export async function ytdlpResolve(id: string, quality: string | undefined, opts: { kind?: Kind; formatId?: string; client?: string } = {}): Promise<DlpStream> {
  const job = async () => {
    const bin = await ensureYtDlp();
    if (!bin) throw new Error('yt-dlp недоступен');
    const rt = await jsRuntime();
    // Только прямые http-потоки (не HLS) — их можно читать кусками
    const base = formatFor(quality);
    const format = opts.formatId ? `${opts.formatId}/${base}` : base;
    const cookies = await cookiesFile();
    const common = baseArgs(format, rt.args, cookies, opts.client || clientOverride);
    const url = `https://www.youtube.com/watch?v=${id}`;
    const t0 = Date.now();
    const json = await runOrExplain(!!cookies, () => run(bin, [...common, '--', url], rt.env, 35_000, (p) => (running.set(p, { id, kind: opts.kind ?? 'play' }), p.on('close', () => running.delete(p)))));
    console.log(`[yt-dlp] ${id}: ${((Date.now() - t0) / 1000).toFixed(1)} с${opts.client || clientOverride ? ` (клиент ${opts.client || clientOverride})` : ''}`);
    return toStream(JSON.parse(json));
  };
  return job();
}

/** Версия yt-dlp — для диагностики. */
export async function ytdlpVersion(): Promise<string> {
  const bin = await ensureYtDlp();
  if (!bin) throw new Error('не скачался (нет доступа к GitHub?)');
  return new Promise((resolve, reject) =>
    execFile(bin, ['--version'], { windowsHide: true, timeout: 15000 }, (err, out) => (err ? reject(err) : resolve(`${String(out).trim()} · ${bin === winExe() ? 'быстрая сборка' : 'обычная'}`)))
  );
}

/** Замер: сколько секунд yt-dlp получает ссылку с заданным клиентом YouTube. */
export async function ytdlpBench(id: string, client: string): Promise<string> {
  const bin = await ensureYtDlp();
  if (!bin) throw new Error('yt-dlp недоступен');
  const rt = await jsRuntime();
  const t0 = Date.now();
  const out = await run(bin, ['-j', '--no-playlist', '--no-warnings', '-f', 'ba[protocol=https]/ba', ...rt.args, ...(client ? ['--extractor-args', `youtube:player_client=${client}`] : []), '--', `https://www.youtube.com/watch?v=${id}`], rt.env, 40_000);
  const j = JSON.parse(out);
  const f = j.requested_formats?.[0] ?? j;
  return `${((Date.now() - t0) / 1000).toFixed(1)} с · ${f.format_id} ${f.ext} ${f.protocol}`;
}

/** Поиск на SoundCloud: несколько кандидатов с названием, автором и длительностью (без скачивания). */
export async function scSearch(query: string, n = 6): Promise<Array<{ url: string; title: string; uploader: string; duration: number }>> {
  const bin = await ensureYtDlp();
  if (!bin) throw new Error('yt-dlp недоступен');
  const rt = await jsRuntime();
  const out = await run(bin, [...noProxy(), '-j', '--flat-playlist', '--no-warnings', '--socket-timeout', '10', '--', `scsearch${n}:${query}`], rt.env, 25_000);
  const res: Array<{ url: string; title: string; uploader: string; duration: number }> = [];
  for (const line of out.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      res.push({ url: j.url ?? j.webpage_url, title: String(j.title ?? ''), uploader: String(j.uploader ?? j.channel ?? ''), duration: Number(j.duration ?? 0) });
    } catch {
      /* пропускаем */
    }
  }
  return res;
}

/** Скачивает звук с SoundCloud в папку кэша; возвращает путь к файлу. */
export async function scDownload(url: string, dir: string, base: string): Promise<string> {
  const bin = await ensureYtDlp();
  if (!bin) throw new Error('yt-dlp недоступен');
  const rt = await jsRuntime();
  fs.mkdirSync(dir, { recursive: true });
  const out = await run(bin, [...noProxy(), '-f', 'http_mp3_1_0/http_mp3/bestaudio[protocol^=http]/bestaudio', '--no-warnings', '--no-progress', '--no-playlist', '--socket-timeout', '10', '-o', path.join(dir, `${base}.%(ext)s`), '--print', 'after_move:filepath', '--', url], rt.env, 90_000);
  const file = out.trim().split('\n').filter(Boolean).pop() ?? '';
  if (!file || !fs.existsSync(file)) throw new Error('SoundCloud: файл не скачался');
  return file;
}

