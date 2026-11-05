/* Токен прохождения проверки YouTube (PO token) для звука с сервера.
   Без него веб-клиенты YouTube отдают только первые ~256 КБ файла, дальше 403.
   Десктоп получал токен из окна браузера Electron; на сервере окна нет, поэтому запускаем ту же
   проверку BotGuard в jsdom (библиотека bgutils-js от автора youtubei.js). Генератор живёт в памяти
   несколько часов, сам токен на трек делается за миллисекунды. */
import { JSDOM } from 'jsdom';
import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { buildURL, getHeaders, USER_AGENT } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
let minter: { m: WebPoMinter; until: number } | null = null;
let making: Promise<WebPoMinter> | null = null;
let lastError = '';

function env() {
  if ((globalThis as any).__lullDom) return;
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    userAgent: USER_AGENT
  });
  (globalThis as any).__lullDom = dom;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, origin: dom.window.origin });
  if (!Reflect.has(globalThis, 'navigator')) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
}

async function make(): Promise<WebPoMinter> {
  env();
  const ch = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction: fetch, useYouTubeAPI: true });
  let js = ch.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  const url = ch.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  if (!js && url) js = await (await fetch(url.startsWith('//') ? `https:${url}` : url)).text();
  if (!js) throw new Error('нет скрипта проверки');
  new Function(js)();
  const bg = await BotGuardClient.create({ program: ch.program, globalName: ch.globalName, globalObject: globalThis });
  const out: any[] = [];
  const resp = await bg.snapshot({ webPoSignalOutput: out });
  const r = await fetch(buildURL('GenerateIT', true), { method: 'POST', headers: getHeaders(), body: JSON.stringify([REQUEST_KEY, resp]) });
  if (!r.ok) throw new Error(`GenerateIT ${r.status}`);
  const [integrityToken, ttl, refresh] = (await r.json()) as [string, number, number];
  if (typeof integrityToken !== 'string') throw new Error('нет integrity token');
  const m = await WebPoMinter.create({ integrityToken }, out);
  const life = Math.max(600, (Number(ttl) || 21600) - (Number(refresh) || 1800));
  minter = { m, until: Date.now() + life * 1000 };
  console.log(`PO token: генератор готов на ${Math.round(life / 60)} мин`);
  return m;
}

async function getMinter(): Promise<WebPoMinter> {
  if (minter && minter.until > Date.now()) return minter.m;
  if (!making) making = make().catch((e) => { lastError = (e as Error).message; throw e; }).finally(() => (making = null));
  return making;
}

/** Токен, привязанный к строке (id видео — для запроса плеера, visitorData — для скачивания файла) */
export async function mint(binding: string): Promise<string> {
  const m = await getMinter();
  return m.mintAsWebsafeString(binding);
}

export function resetMinter() { minter = null; }
export const potState = () => ({ ready: !!minter && minter.until > Date.now(), error: lastError });

/** Готовим генератор заранее, чтобы первый трек не ждал */
export function warmMinter() { getMinter().catch((e) => console.log('PO token: не получилось —', (e as Error).message)); }
