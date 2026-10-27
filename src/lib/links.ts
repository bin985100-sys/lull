/** Разбор ссылок, вставленных в поиск. */
export type LinkTarget =
  | { type: 'track'; id: string; list?: string }
  | { type: 'playlist'; id: string }
  | { type: 'album'; id: string }
  | { type: 'artist'; id: string }
  | { type: 'import'; source: 'spotify' | 'soundcloud'; url: string };

export function parseLink(input: string): LinkTarget | null {
  const text = input.trim();
  if (!/^https?:\/\//i.test(text) && !/^(www\.|music\.|open\.|youtu)/i.test(text)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return u.pathname.length > 1 ? { type: 'track', id: u.pathname.slice(1) } : null;
  if (/(^|\.)youtube\.com$/.test(host)) {
    const v = u.searchParams.get('v');
    const list = u.searchParams.get('list');
    if (v) return { type: 'track', id: v, list: list ?? undefined };
    if (list) return { type: 'playlist', id: list };
    const browse = u.pathname.match(/\/browse\/([\w-]+)/)?.[1];
    if (browse?.startsWith('MPRE')) return { type: 'album', id: browse };
    if (browse?.startsWith('VL')) return { type: 'playlist', id: browse.slice(2) };
    const channel = u.pathname.match(/\/channel\/(UC[\w-]+)/)?.[1] ?? (browse?.startsWith('UC') ? browse : undefined);
    if (channel) return { type: 'artist', id: channel };
    return null;
  }
  if (host === 'open.spotify.com') return { type: 'import', source: 'spotify', url: u.href };
  if (/(^|\.)soundcloud\.com$/.test(host)) return { type: 'import', source: 'soundcloud', url: u.href };
  return null;
}

export const SOURCE_NAME = { spotify: 'Spotify', soundcloud: 'SoundCloud', youtube: 'YouTube' } as const;
