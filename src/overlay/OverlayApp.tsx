import { useEffect, useMemo, useRef, useState } from 'react';
import type { OverlayOptions, OverlayState } from '../../shared/types';
import { api } from '../api';
import { SyncedLyrics, type LyricsClock } from '../components/SyncedLyrics';

/**
 * Окно-оверлей: прозрачное, поверх всех окон. Показывает только поющиеся строки.
 * Время «доигрывается» локально между пакетами состояния из главного окна.
 */
export function OverlayApp() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [opts, setOpts] = useState<OverlayOptions>({ enabled: true, locked: true, fontSize: 34, lines: 2 });
  const ref = useRef<OverlayState | null>(null);
  ref.current = state;

  useEffect(() => {
    document.documentElement.classList.add('overlay-root');
    const a = api.onOverlayState(setState);
    const b = api.onOverlayOptions(setOpts);
    return () => (a(), b());
  }, []);

  const clock: LyricsClock = useMemo(
    () => ({
      time: () => {
        const s = ref.current;
        if (!s) return 0;
        return s.playing ? s.position + (Date.now() - s.at) / 1000 : s.position;
      },
      playing: () => !!ref.current?.playing
    }),
    []
  );

  const theme = useMemo(
    () => `
/* blyrics-hide-credits = true; */
.blyrics-container {
  --blyrics-font-family: 'Onest', system-ui, sans-serif;
  --blyrics-font-size: ${opts.fontSize}px;
  --blyrics-font-weight: 800;
  --blyrics-line-height: 1.18;
  --blyrics-padding: 0.35rem;
  --blyrics-lyric-active-color: #ffffff;
  --blyrics-lyric-inactive-color: rgb(255 255 255 / 0.5);
  --blyrics-glow-color: rgb(255 255 255 / 0.55);
  text-align: center;
}
`,
    [opts.fontSize]
  );

  const synced = !!state?.lyrics && !!(state.lyrics.ttml || state.lyrics.lrc || state.lyrics.synced?.length);
  return (
    <div className={`ov ${opts.locked ? 'locked' : 'unlocked'} lines-${opts.lines}`}>
      {!opts.locked && (
        <div className="ov-handle">
          <span>Оверлей: перетащи и измени размер окна, затем закрепи его в настройках</span>
        </div>
      )}
      {state?.track ? (
        synced ? (
          <SyncedLyrics key={state.track.id} lyrics={state.lyrics!} offset={state.offset} layout="stage" clock={clock} durationSec={state.track.durationSec ?? 240} theme={theme} className="ov-lyrics" />
        ) : (
          <div className="ov-fallback" style={{ fontSize: Math.round(opts.fontSize * 0.7) }}>
            <b>{state.track.title}</b>
            <span>{state.track.artists.map((a) => a.name).join(', ')}</span>
          </div>
        )
      ) : (
        !opts.locked && <div className="ov-fallback" style={{ fontSize: 18 }}>Ничего не играет</div>
      )}
    </div>
  );
}
