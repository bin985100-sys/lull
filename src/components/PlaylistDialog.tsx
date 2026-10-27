import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

interface DialogState {
  open: boolean;
  title: string;
  value: string;
  resolve: ((v: string | null) => void) | null;
}
const useDialog = create<DialogState>(() => ({ open: false, title: '', value: '', resolve: null }));

/** Диалог ввода названия плейлиста. Возвращает имя или null. */
export function promptPlaylistName(title: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => useDialog.setState({ open: true, title, value, resolve }));
}

export function PlaylistDialog() {
  const { open, title, value, resolve } = useDialog();
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setText(value);
      setTimeout(() => input.current?.select(), 30);
    }
  }, [open, value]);
  const close = (v: string | null) => {
    resolve?.(v);
    useDialog.setState({ open: false, resolve: null });
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="backdrop" style={{ zIndex: 90 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="dialog sm"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              close(text.trim() || null);
            }}
          >
            <h2 className="h2">{title}</h2>
            <label className="field" style={{ height: 48 }}>
              <span className="sr">Название</span>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Название плейлиста" maxLength={80} onKeyDown={(e) => e.key === 'Escape' && close(null)} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => close(null)}>Отмена</button>
              <button type="submit" className="btn primary" disabled={!text.trim()}>Сохранить</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
