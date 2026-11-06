/* TV profile used by yt-dlp's tv_samsung client. Keep player API headers and
   context consistent; youtubei.js's generic TV profile currently gets a reload error. */
export const TV_VERSION = process.env.LULL_TV_VERSION || '5.20260707';
export const TV_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/2.4.0 TV Safari/538.1';

export function streamFetch(base: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url).pathname === '/youtubei/v1/player' && typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      if (body.context?.client?.clientName === 'TVHTML5') {
        body.context = { client: { clientName: 'TVHTML5', clientVersion: TV_VERSION,
          deviceMake: 'Samsung', deviceModel: 'UKS9800', userAgent: TV_UA,
          osName: 'Tizen', osVersion: '2.4.0', hl: 'en' } };
        const headers = new Headers(init.headers);
        headers.set('X-Youtube-Client-Version', TV_VERSION);
        headers.set('User-Agent', TV_UA);
        init = { ...init, headers, body: JSON.stringify(body) };
      }
    }
    return base(input, init);
  };
}
