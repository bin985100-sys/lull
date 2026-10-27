import { Client } from '@xhayper/discord-rpc';
import type { DiscordStatus, Track } from '../shared/types';

/**
 * Discord Rich Presence. Нужен Client ID приложения из Discord Developer Portal
 * (вводится в настройках). Ошибки подключения не мешают работе плеера.
 */
let client: Client | null = null;
let currentId = '';
let enabled = false;
let connecting: Promise<void> | null = null;

export async function configureDiscord(on: boolean, clientId: string) {
  enabled = on && !!clientId;
  if (!enabled || clientId !== currentId) {
    const old = client;
    client = null;
    currentId = '';
    await old?.destroy().catch(() => {});
  }
  if (enabled && !client) {
    currentId = clientId;
    const c = new Client({ clientId });
    client = c;
    connecting = c.login().catch(() => {
      if (client === c) client = null;
    });
    await connecting;
  }
}

/** Подключён ли Discord и под каким аккаунтом — для карточки в настройках. */
export async function discordStatus(): Promise<DiscordStatus> {
  if (!enabled || !client) return { connected: false };
  await connecting;
  const u = client?.user;
  if (!u) return { connected: false };
  const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : undefined;
  return { connected: true, user: { name: (u as { globalName?: string }).globalName || u.username, avatar } };
}

export async function setDiscordActivity(payload: { track: Track; positionSec: number; playing: boolean } | null) {
  if (!enabled || !client) return;
  await connecting;
  const user = client?.user;
  if (!user) return;
  try {
    if (!payload) return void (await user.clearActivity());
    const { track, positionSec, playing } = payload;
    const now = Date.now();
    await user.setActivity({
      type: 2, // «Слушает»
      details: track.title,
      state: track.artists.map((a) => a.name).join(', ') || undefined,
      largeImageKey: track.thumb,
      largeImageText: track.album?.name,
      ...(playing && track.durationSec
        ? { startTimestamp: now - positionSec * 1000, endTimestamp: now + (track.durationSec - positionSec) * 1000 }
        : {}),
      buttons: [{ label: 'Слушать', url: `https://music.youtube.com/watch?v=${track.id}` }]
    });
  } catch {
    /* Discord закрыт или недоступен */
  }
}
