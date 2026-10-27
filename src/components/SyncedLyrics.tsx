import '@braccato/core/element';
import '@braccato/core/styles/variables.css';
import '@braccato/core/styles/lyrics.css';
import '@braccato/core/styles/instrumental.css';
import { detectParser, PlainParser, type Lyric } from '@braccato/parsers';
import { useEffect, useRef } from 'react';
import type { Lyrics } from '../../shared/types';
import { audioEngine, usePlayer } from '../store/player';

/** Превращаем любой вариант текста в формат рендерера (времена в мс). */
export function toBraccato(l: Lyrics, durationSec: number): Lyric[] {
  const durMs = Math.max(1, durationSec) * 1000;
  const raw = l.ttml ?? l.lrc;
  if (raw) {
    try {
      return detectParser(raw).parse(raw, durMs);
    } catch {
      /* падаем на построчный вариант */
    }
  }
  if (l.synced?.length) {
    return l.synced.map((line, i) => {
      const start = line.t * 1000;
      const end = (l.synced![i + 1]?.t ?? durationSec) * 1000;
      return { startTimeMs: start, durationMs: Math.max(200, end - start), words: line.text } as Lyric;
    });
  }
  if (l.plain) return PlainParser.parse(l.plain, durMs);
  return [];
}

const THEME = `
/* blyrics-target-scroll-pos-ratio = 0.32; */
/* blyrics-hide-credits = true; */
.blyrics-container {
  --blyrics-font-family: 'Onest', system-ui, sans-serif;
  --blyrics-font-size: 2.6rem;
  --blyrics-font-weight: 700;
  --blyrics-line-height: 1.22;
  --blyrics-padding: 1.1rem;
  --blyrics-lyric-active-color: #ffffff;
  --blyrics-lyric-inactive-color: rgb(255 255 255 / 0.32);
  --blyrics-glow-color: rgb(255 255 255 / 0.45);
  --blyrics-padding-top: 18vh;
}
`;

interface BraccatoEl extends HTMLElement {
  lyrics: Lyric[] | null;
  currentTime: number;
  playing: boolean;
  theme: string;
  host: { getScrollElement?: () => HTMLElement };
  layout: 'scroll' | 'stage';
  lyricsOptions: Record<string, unknown>;
}

/**
 * Текст с подсветкой по слогам/словам (рендерер braccato). Часы задаём сами по кадрам —
 * так учитываются сдвиг синхронизации и кроссфейд.
 */
export interface LyricsClock {
  time(): number;
  playing(): boolean;
}
const engineClock: LyricsClock = { time: () => audioEngine.position, playing: () => usePlayer.getState().playing };

export function SyncedLyrics({ lyrics, offset, layout = 'scroll', className, onSeek, clock = engineClock, durationSec, theme = THEME }: { lyrics: Lyrics; offset: number; layout?: 'scroll' | 'stage'; className?: string; onSeek?: (t: number) => void; clock?: LyricsClock; durationSec?: number; theme?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const el = useRef<BraccatoEl | null>(null);
  const playerDuration = usePlayer((s) => s.duration);
  const duration = durationSec ?? playerDuration;
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;

  // Создаём элемент один раз
  useEffect(() => {
    const box = scroller.current!;
    const node = document.createElement('braccato-lyrics') as BraccatoEl;
    node.style.display = 'block';
    node.theme = theme;
    node.layout = layout;
    node.host = { getScrollElement: () => box };
    node.addEventListener('braccato:line-click', (e) => seekRef.current?.(Math.max(0, (e as CustomEvent<{ timeS: number }>).detail.timeS - offsetRef.current)));
    box.appendChild(node);
    el.current = node;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      node.playing = clockRef.current.playing();
      node.currentTime = clockRef.current.time() + offsetRef.current;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node.remove();
      el.current = null;
    };
  }, [layout, theme]);

  useEffect(() => {
    if (el.current) el.current.lyrics = toBraccato(lyrics, duration || 240);
  }, [lyrics, duration, layout]);

  return <div ref={scroller} className={`blyrics-scroller ${className ?? ''}`} />;
}
