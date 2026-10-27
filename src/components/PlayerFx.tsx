import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { LyricLine } from '../../shared/types';
import { audioEngine } from '../store/player';

/**
 * Кнопка «играть/пауза» с морфингом: две фигуры плавно перетекают
 * из половинок треугольника в две полоски паузы и обратно.
 */
const PLAY_L = 'M7 4.5 L12.5 7.9 L12.5 16.1 L7 19.5 Z';
const PLAY_R = 'M12.5 7.9 L19.6 12 L19.6 12 L12.5 16.1 Z';
const PAUSE_L = 'M6 4.5 L10 4.5 L10 19.5 L6 19.5 Z';
const PAUSE_R = 'M14 4.5 L18 4.5 L18 19.5 L14 19.5 Z';

export function MorphPlayIcon({ playing, size = 26 }: { playing: boolean; size?: number }) {
  const t = { type: 'spring' as const, stiffness: 380, damping: 30 };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <motion.path fill="currentColor" initial={false} animate={{ d: playing ? PAUSE_L : PLAY_L }} transition={t} />
      <motion.path fill="currentColor" initial={false} animate={{ d: playing ? PAUSE_R : PLAY_R }} transition={t} />
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
