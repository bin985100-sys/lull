import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUi } from '../store/ui';
import { Cover } from './Cover';

const KIND: Record<string, string> = { artist: 'Исполнитель', album: 'Альбом', playlist: 'Плейлист', track: 'Трек' };

/** «Добавить в библиотеку?» — с карточкой того, что добавляется. */
export function ConfirmDialog() {
  const c = useUi((s) => s.confirm);
  useEffect(() => {
    if (!c) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') c.resolve(false);
      if (e.key === 'Enter') c.resolve(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [c]);
  return (
    <AnimatePresence>
      {c && (
        <motion.div className="backdrop confirm-bd" style={{ zIndex: 95 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && c.resolve(false)}>
          <motion.div role="alertdialog" aria-modal="true" aria-label={c.title} className="confirm" initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
            <b className="confirm-t">{c.title}</b>
            <span className="muted">{c.text}</span>
            <div className="confirm-item">
              <Cover src={c.card.thumb} size={72} round={c.card.kind === 'artist'} radius={12} />
              <span className="lbl"><b className="ell">{c.card.title}</b><span>{KIND[c.card.kind]}</span></span>
            </div>
            <div className="confirm-btns">
              <button type="button" className="btn" onClick={() => c.resolve(false)}>Отмена</button>
              <button type="button" className="btn light" autoFocus onClick={() => c.resolve(true)}>{c.ok}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
