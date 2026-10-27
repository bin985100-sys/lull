import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { buildURL, GOOG_API_KEY } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { api, isDesktop } from '../api';

/**
 * PO-токен для потоков YouTube. BotGuard выполняется здесь, в Chromium-окне приложения
 * (это обычная браузерная среда), а сетевые запросы идут через main-процесс без CORS.
 */
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

const bridgeFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
  const r = await api.netFetch(url, { method: init?.method, headers, body: typeof init?.body === 'string' ? init.body : undefined });
  return new Response(r.text, { status: r.status });
};

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export async function initPoToken(): Promise<void> {
  if (!isDesktop) return;
  clearTimeout(refreshTimer);
  try {
    const visitorData = await api.visitorData();
    if (!visitorData) throw new Error('Нет visitorData');

    const challenge = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction: bridgeFetch });
    let js = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
    const jsUrl = challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
    if (!js && jsUrl) js = (await api.netFetch(jsUrl.startsWith('//') ? `https:${jsUrl}` : jsUrl, {})).text;
    if (!js || !challenge.program || !challenge.globalName) throw new Error('BotGuard недоступен');
    new Function(js)();

    const bg = await BotGuardClient.create({ program: challenge.program, globalName: challenge.globalName, globalObject: window });
    const signal: WebPoSignalOutput = [];
    const botguardResponse = await bg.snapshot({ webPoSignalOutput: signal });

    const it = await api.netFetch(buildURL('GenerateIT', true), {
      method: 'POST',
      headers: { 'content-type': 'application/json+protobuf', 'x-goog-api-key': GOOG_API_KEY, 'x-user-agent': 'grpc-web-javascript/0.1' },
      body: JSON.stringify([REQUEST_KEY, botguardResponse])
    });
    const [integrityToken, ttl] = JSON.parse(it.text) as [string, number];
    if (typeof integrityToken !== 'string') throw new Error('Нет integrity token');

    const minter = await WebPoMinter.create({ integrityToken }, signal);
    const token = await minter.mintAsWebsafeString(visitorData);
    await api.setPoToken(token, visitorData);

    const refreshIn = Math.max(10 * 60, (ttl || 6 * 3600) - 10 * 60) * 1000;
    refreshTimer = setTimeout(() => void initPoToken(), refreshIn);
  } catch (e) {
    console.warn('[potoken] не удалось получить токен, потоки пойдут через запасные клиенты:', e);
    refreshTimer = setTimeout(() => void initPoToken(), 5 * 60 * 1000);
  }
}
