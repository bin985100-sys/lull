import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { ITune } from './icons';

function SliderRow({ label, value, display, min, max, step, onChange, onReset, isDefault }: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void; onReset: () => void; isDefault: boolean }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="ac-row">
      <div className="ac-top">
        <span>{label}</span>
        <span className="ac-val">
          {display}
          <button type="button" className="ac-reset" onClick={onReset} disabled={isDefault} aria-label={`Сбросить: ${label}`}>Сброс</button>
        </span>
      </div>
      <input type="range" className="slider" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', ['--p' as string]: `${pct}%` }} />
    </div>
  );
}

/** Кнопка с всплывающей панелью: скорость, тональность и громкость. */
export function AudioControls({ placement = 'up', className = 'ic ic-40', size = 18 }: { placement?: 'up' | 'down'; className?: string; size?: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const speed = useSettings((s) => s.speed);
  const pitch = useSettings((s) => s.pitch);
  const set = useSettings((s) => s.set);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const changed = speed !== 1 || pitch !== 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false));
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={box} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={`${className} ${open || changed ? 'on' : ''}`} aria-label="Скорость и тональность" aria-expanded={open} title="Скорость · тональность · громкость" onClick={() => setOpen(!open)}>
        <ITune size={size} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={`ac-pop ${placement}`}
            role="dialog"
            aria-label="Скорость, тональность, громкость"
            initial={{ opacity: 0, y: placement === 'up' ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'up' ? 6 : -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <SliderRow label="Скорость" value={speed} display={`${speed.toFixed(2).replace(/0$/, '').replace('.', ',')}×`} min={0.5} max={2} step={0.05} onChange={(v) => set('speed', Math.round(v * 100) / 100)} onReset={() => set('speed', 1)} isDefault={speed === 1} />
            <SliderRow label="Тональность" value={pitch} display={`${pitch > 0 ? '+' : ''}${pitch} пт`} min={-12} max={12} step={1} onChange={(v) => set('pitch', v)} onReset={() => set('pitch', 0)} isDefault={pitch === 0} />
            <SliderRow label="Громкость" value={Math.round((muted ? 0 : volume) * 100)} display={`${Math.round((muted ? 0 : volume) * 100)}%`} min={0} max={100} step={1} onChange={(v) => setVolume(v / 100)} onReset={() => setVolume(0.8)} isDefault={Math.round(volume * 100) === 80 && !muted} />
            <div className="ac-presets">
              {[
                ['Обычно', 1, 0],
                ['Slowed', 0.85, -2],
                ['Sped up', 1.25, 2],
                ['Nightcore', 1.2, 4]
              ].map(([l, sp, pt]) => (
                <button key={l as string} type="button" className={`chip ${speed === sp && pitch === pt ? 'on' : ''}`} onClick={() => useSettings.getState().patch({ speed: sp as number, pitch: pt as number })}>
                  {l}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
