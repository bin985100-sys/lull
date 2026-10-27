import type { HotkeyAction } from '../../shared/types';
import { api, isMock } from '../api';
import { useLibrary } from '../store/library';
import { useLyrics } from '../store/lyrics';
import { audioEngine, usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';

/**
 * Связи главного окна с системой: глобальные клавиши и оверлей.
 * Запускается один раз после загрузки сохранённого состояния.
 */
export function startBridges() {
  // --- Глобальные горячие клавиши
  const applyHotkeys = () =>
    void api.setHotkeys(useSettings.getState().hotkeys).then((st) => {
      const failed = Object.entries(st).filter(([, ok]) => !ok).map(([a]) => a);
      if (failed.length && !isMock) useUi.getState().toast(`Не удалось занять сочетание клавиш (${failed.length}) — оно уже используется другой программой`, 'error');
    });
  applyHotkeys();
  useSettings.subscribe((s, p) => s.hotkeys !== p.hotkeys && applyHotkeys());

  api.onHotkey((a: HotkeyAction) => {
    const p = usePlayer.getState();
    const ui = useUi.getState();
    switch (a) {
      case 'playPause': return p.toggle();
      case 'next': return void p.next();
      case 'prev': return p.prev();
      case 'volumeUp': return p.setVolume(Math.min(1, p.volume + 0.05));
      case 'volumeDown': return p.setVolume(Math.max(0, p.volume - 0.05));
      case 'like': {
        const t = p.current();
        if (t) ui.toast(useLibrary.getState().toggleLike(t) ? 'Добавлено в любимое' : 'Убрано из любимого');
        return;
      }
      case 'overlay': {
        const s = useSettings.getState();
        return s.set('overlay', { ...s.overlay, enabled: !s.overlay.enabled });
      }
    }
  });

  // --- Оверлей: настройки и поток состояния
  useSettings.subscribe((s, p) => s.overlay !== p.overlay && void api.overlayConfigure(s.overlay));

  // Текст нужен оверлею, даже когда полноэкранный плеер закрыт
  const ensureLyrics = () => {
    if (useSettings.getState().overlay.enabled || useUi.getState().nowPlaying) useLyrics.getState().load(usePlayer.getState().current());
  };
  usePlayer.subscribe((s, p) => (s.index !== p.index || s.queue !== p.queue) && ensureLyrics());
  useSettings.subscribe((s, p) => s.overlay.enabled !== p.overlay.enabled && ensureLyrics());
  ensureLyrics();

  const push = () => {
    if (!useSettings.getState().overlay.enabled) return;
    const p = usePlayer.getState();
    const l = useLyrics.getState();
    api.overlayPush({
      track: p.current() ?? null,
      lyrics: l.trackId === p.current()?.id ? l.current() : null,
      position: audioEngine.position,
      playing: p.playing,
      offset: l.offset,
      at: Date.now()
    });
  };
  // Позицию оверлей «доигрывает» сам; периодическая синхронизация — раз в полсекунды
  setInterval(push, 500);
  usePlayer.subscribe((s, p) => (s.playing !== p.playing || s.index !== p.index) && push());
  useLyrics.subscribe(push);
}
