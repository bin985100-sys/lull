import type { NavigateFunction } from 'react-router-dom';
import type { Card, Track } from '../../shared/types';
import { api, isDesktop } from '../api';
import { IDisc, IDownload, IHeart, IHeartFill, ILink, IPlayNext, IPlus, IQueue, ITrash, IUser, IWave, ICheckCircle } from '../components/icons';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi, type MenuItem } from '../store/ui';
import { promptPlaylistName } from '../components/PlaylistDialog';

const toast = (t: string, k?: 'info' | 'error') => useUi.getState().toast(t, k);

export function addToPlaylistSubmenu(tracks: Track[]): MenuItem[] {
  const lib = useLibrary.getState();
  const items: MenuItem[] = [
    {
      label: 'Новый плейлист',
      icon: <IPlus size={17} />,
      onClick: async () => {
        const name = await promptPlaylistName('Новый плейлист');
        if (!name) return;
        lib.createPlaylist(name, tracks);
        toast(`Создан плейлист «${name}»`);
      }
    }
  ];
  if (lib.playlists.length) items.push({ divider: true });
  for (const p of lib.playlists.slice(0, 12)) {
    items.push({
      label: p.name,
      onClick: () => {
        const n = useLibrary.getState().addToPlaylist(p.id, tracks);
        toast(n ? `Добавлено в «${p.name}»` : `Уже есть в «${p.name}»`);
      }
    });
  }
  return items;
}

export function trackMenu(track: Track, navigate: NavigateFunction, opts: { playlistId?: string; index?: number; queueIndex?: number } = {}): MenuItem[] {
  const lib = useLibrary.getState();
  const player = usePlayer.getState();
  const liked = lib.isLiked(track.id);
  const downloaded = !!lib.downloads[track.id];
  const artist = track.artists.find((a) => a.id);
  const items: MenuItem[] = [
    { label: 'Играть следующим', icon: <IPlayNext size={17} />, onClick: () => (player.playNext([track]), toast('Сыграет следующим')) },
    { label: 'Добавить в очередь', icon: <IQueue size={17} />, onClick: () => (player.addToQueue([track]), toast('Добавлено в очередь')) },
    { label: 'Волна по треку', icon: <IWave size={17} />, onClick: () => void player.startRadio(track) },
    { label: 'Добавить в плейлист', icon: <IPlus size={17} />, submenu: addToPlaylistSubmenu([track]) },
    { divider: true },
    {
      label: liked ? 'Убрать из любимого' : 'Нравится',
      icon: liked ? <IHeartFill size={17} style={{ color: 'var(--liked)' }} /> : <IHeart size={17} />,
      onClick: () => toast(useLibrary.getState().toggleLike(track) ? 'Добавлено в любимое' : 'Убрано из любимого')
    },
    !isDesktop
      ? { divider: true }
      : downloaded
      ? { label: 'Удалить загрузку', icon: <ICheckCircle size={17} style={{ color: 'var(--ok)' }} />, onClick: () => void lib.removeDownload(track.id).then(() => toast('Загрузка удалена')) }
      : {
          label: 'Скачать',
          icon: <IDownload size={17} />,
          onClick: () =>
            void lib.download(track).then(
              () => toast(`Скачано: ${track.title}`),
              (e: Error) => toast(`Не удалось скачать: ${e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'error')
            )
        },
    { divider: true }
  ];
  if (artist?.id) items.push({ label: 'Перейти к исполнителю', icon: <IUser size={17} />, onClick: () => navigate(`/artist/${artist.id}`) });
  if (track.album?.id) items.push({ label: 'Перейти к альбому', icon: <IDisc size={17} />, onClick: () => navigate(`/album/${track.album!.id}`) });
  items.push({
    label: 'Скопировать ссылку',
    icon: <ILink size={17} />,
    onClick: () => void navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${track.id}`).then(() => toast('Ссылка скопирована'))
  });
  if (opts.playlistId != null && opts.index != null) {
    items.push({ divider: true }, { label: 'Убрать из плейлиста', icon: <ITrash size={17} />, danger: true, onClick: () => lib.removeFromPlaylist(opts.playlistId!, opts.index!) });
  }
  if (opts.queueIndex != null) {
    items.push({ divider: true }, { label: 'Убрать из очереди', icon: <ITrash size={17} />, danger: true, onClick: () => player.removeAt(opts.queueIndex!) });
  }
  return items;
}

export function cardMenu(card: Card, navigate: NavigateFunction): MenuItem[] {
  const lib = useLibrary.getState();
  if (card.kind === 'track' && card.track) return trackMenu(card.track, navigate);
  const saved = lib.isSaved(card.id);
  const items: MenuItem[] = [
    {
      label: saved ? 'Убрать из библиотеки' : 'Сохранить в библиотеку',
      icon: saved ? <IHeartFill size={17} style={{ color: 'var(--liked)' }} /> : <IHeart size={17} />,
      onClick: () => toast(useLibrary.getState().toggleSaved(card) ? 'Сохранено в библиотеку' : 'Убрано из библиотеки')
    }
  ];
  if (card.kind !== 'artist') {
    const load = () => (card.kind === 'album' ? api.album(card.id) : api.playlist(card.id));
    items.unshift(
      { label: 'Играть следующим', icon: <IPlayNext size={17} />, onClick: () => void load().then((c) => (usePlayer.getState().playNext(c.tracks), toast('Сыграет следующим'))) },
      { label: 'Добавить в очередь', icon: <IQueue size={17} />, onClick: () => void load().then((c) => (usePlayer.getState().addToQueue(c.tracks), toast('Добавлено в очередь'))) }
    );
  }
  items.push({
    label: 'Скопировать ссылку',
    icon: <ILink size={17} />,
    onClick: () => {
      const url = card.kind === 'artist' ? `https://music.youtube.com/channel/${card.id}` : card.kind === 'album' ? `https://music.youtube.com/browse/${card.id}` : `https://music.youtube.com/playlist?list=${card.id}`;
      void navigator.clipboard.writeText(url).then(() => toast('Ссылка скопирована'));
    }
  });
  return items;
}

export function openMenuAt(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  useUi.getState().openMenu(e.clientX, e.clientY, items);
}
