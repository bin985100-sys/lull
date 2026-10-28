import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { LyricLine } from '../../shared/types';
import { audioEngine } from '../store/player';

/**
 * One filled path per state avoids a rasterisation seam through the triangle.
 */
const PLAY = 'M7 4.5 L19.6 12 L7 19.5 Z';
const PAUSE = 'M6 4.5 H10 V19.5 H6 Z M14 4.5 H18 V19.5 H14 Z';

export function MorphPlayIcon({ playing, size = 26 }: { playing: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <motion.path key={playing ? 'pause' : 'play'} fill="currentColor" d={playing ? PAUSE : PLAY} initial={{ opacity: .65, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .16 }} style={{ transformOrigin: 'center' }} />
    </svg>
  );
}

/**
 * Текущая строка текста: буквы появляются волной, затем загораются одна за другой
 * в темпе пения (до начала следующей строки). Обновление идёт напрямую в DOM по кадрам.
 */
export function ActiveLyric({ line, next, offset = 0, onClick }: { line: LyricLine; next?: number; offset?: number; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const text = line.text || '♪';
  const words = text.split(/(\s+)/);
  let idx = 0;

  useEffect(() => {
    const el = ref.current!;
    const chars = Array.from(el.querySelectorAll<HTMLElement>('.ch'));
    const end = next ?? line.t + Math.max(2, chars.length * 0.08);
    // Строка поётся не до самого конца паузы — ограничиваем длительность
    const dur = Math.min(end - line.t, Math.max(1.2, chars.length * 0.11));
    let raf = 0;
    let lit = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = Math.max(0, Math.min(1, (audioEngine.position + offset + 0.15 - line.t) / dur));
      const n = Math.floor(p * chars.length);
      if (n === lit) return;
      for (let i = 0; i < chars.length; i++) chars[i].classList.toggle('lit', i < n);
      lit = n;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line, next, offset]);

  return (
    <button ref={ref} type="button" className="lyric on" data-active="1" onClick={onClick} aria-label={text}>
      {words.map((w, wi) =>
        /^\s+$/.test(w) ? (
          <span key={wi}> </span>
        ) : (
          <span key={wi} className="word" aria-hidden="true">
            {[...w].map((c) => {
              const i = idx++;
              return (
                <span key={i} className="ch" style={{ animationDelay: `${i * 18}ms` }}>
                  {c}
                </span>
              );
            })}
          </span>
        )
      )}
    </button>
  );
}
