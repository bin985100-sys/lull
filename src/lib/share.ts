import { useEffect } from 'react';
import { SHARE_BASE_URL, SHARE_OWN_DOMAIN } from '../../shared/config';
import type { Card } from '../../shared/types';
import { useUi } from '../store/ui';

/** Ссылка на артиста, альбом, плейлист или трек. */
export function shareUrl(kind: Card['kind'] | 'track', id: string): string {
  // Пока своего домена нет — ссылки YouTube Music, они открываются у всех
  return SHARE_OWN_DOMAIN ? `${SHARE_BASE_URL}/${kind}/${encodeURIComponent(id)}` : ytMusicUrl(kind, id);
}

/** Та же страница на music.youtube.com. */
export function ytMusicUrl(kind: Card['kind'] | 'track', id: string): string {
  if (kind === 'track') return `https://music.youtube.com/watch?v=${id}`;
  if (kind === 'artist') return `https://music.youtube.com/channel/${id}`;
  if (kind === 'playlist') return `https://music.youtube.com/playlist?list=${id.replace(/^VL/, '')}`;
  return `https://music.youtube.com/browse/${id}`;
}

export async function share(kind: Card['kind'] | 'track', id: string, name: string) {
  const url = shareUrl(kind, id);
  try {
    await navigator.clipboard.writeText(url);
    useUi.getState().toast(`Ссылка скопирована · ${name}`, 'ok');
  } catch {
    useUi.getState().toast('Не удалось скопировать ссылку', 'error');
  }
}

/** Страница красит фон своей обложкой, пока открыта. */
export function usePageArt(src: string | undefined) {
  useEffect(() => {
    useUi.getState().setPageArt(src ?? null);
    return () => useUi.getState().setPageArt(null);
  }, [src]);
}

/** Сохранение в библиотеку с подтверждением (снять — без вопросов). */
export async function confirmSave(card: Card, isSaved: boolean, toggle: (c: Card) => boolean) {
  const ui = useUi.getState();
  if (isSaved) {
    toggle(card);
    ui.toast('Убрано из библиотеки');
    return;
  }
  const ok = await ui.ask({ title: 'Добавить в библиотеку', text: 'Этот элемент будет добавлен в вашу библиотеку.', card });
  if (ok && toggle(card)) ui.toast(`Добавлено в библиотеку · ${card.title}`, 'ok');
}
