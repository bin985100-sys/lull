import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportProgress, ImportResult } from '../../shared/types';
import { api } from '../api';
import { SOURCE_NAME } from '../lib/links';
import { tracksWord } from '../lib/format';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { IClose, ILink } from './icons';
import { BRAND_NAME, BrandIcon, type Brand } from './BrandIcon';

/** Какой сервис узнаётся по ссылке — его значок подсвечивается. */
function detectBrand(url: string): Brand | null {
  if (/spotify\.com|spotify:/i.test(url)) return 'spotify';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'ytmusic';
  if (/soundcloud\.com/i.test(url)) return 'soundcloud';
  return null;
}

/** Импорт плейлиста по ссылке из Spotify, YouTube или SoundCloud. */
export function ImportDialog() {
  const initial = useUi((s) => s.importUrl);
  const close = useUi((s) => s.closeImport);
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial == null) return;
    setUrl(initial);
    setProgress(null);
    setResult(null);
    setError(null);
    setBusy(false);
  }, [initial]);
  useEffect(() => api.onImportProgress(setProgress), []);
  useEffect(() => {
    if (initial == null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [initial, busy, close]);

  const start = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      setResult(await api.importPlaylist(url.trim()));
    } catch (e) {
      setError((e as Error).message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Не удалось импортировать');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!result) return;
    const p = useLibrary.getState().createPlaylist(result.name, result.tracks);
    useUi.getState().toast(`Плейлист «${result.name}» создан`);
    close();
    navigate(`/local/${p.id}`);
  };

  const detected = detectBrand(url);
  const pct = progress && progress.total ? (progress.done / progress.total) * 100 : busy ? 4 : 0;

  return (
    <AnimatePresence>
      {initial != null && (
        <motion.div className="backdrop" style={{ zIndex: 90 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
          <motion.div role="dialog" aria-modal="true" aria-label="Импорт плейлиста" className="dialog sm" style={{ maxWidth: 620 }} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="h2">Импорт плейлиста</h2>
              <button type="button" className="ic ic-36" aria-label="Закрыть" onClick={close} disabled={busy}><IClose size={16} /></button>
            </div>
            <span className="muted">Вставь ссылку на плейлист или альбом — треки найдутся на YouTube Music и сохранятся как твой плейлист.</span>
            <div className="imp-sources">
              {(['spotify', 'ytmusic', 'soundcloud'] as Brand[]).map((b) => (
                <span key={b} className={`imp-src ${detected === b ? 'on' : ''}`}><BrandIcon brand={b} size={26} radius={8} />{BRAND_NAME[b]}</span>
              ))}
            </div>
            <label className="field" style={{ height: 48 }}>
              <ILink size={17} />
              <span className="sr">Ссылка</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/…" disabled={busy} onKeyDown={(e) => e.key === 'Enter' && void start()} autoFocus />
            </label>
            {(busy || progress) && !result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="imp-bar"><span style={{ width: `${pct}%` }} /></div>
                <span className="muted small">{progress ? `Сопоставлено ${progress.matched} из ${progress.total} · проверено ${progress.done}` : 'Читаем список треков…'}</span>
              </div>
            )}
            {error && <span style={{ color: '#ff9aa4' }}>{error}</span>}
            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="set-row" style={{ padding: '14px 16px' }}>
                  <span className="lbl">
                    <b>{result.name}</b>
                    <span>{SOURCE_NAME[result.source]} · найдено {result.tracks.length} из {result.total} ({tracksWord(result.tracks.length)})</span>
                  </span>
                  <b style={{ color: result.missing.length ? '#f5d27a' : 'var(--ok)', fontVariantNumeric: 'tabular-nums' }}>{result.tracks.length}/{result.total}</b>
                </div>
                {result.missing.length > 0 && (
                  <details>
                    <summary className="muted small" style={{ cursor: 'pointer' }}>Не нашлись на YouTube Music: {result.missing.length}</summary>
                    <div className="imp-missing" style={{ marginTop: 8 }}>{result.missing.map((m) => <span key={m}>{m}</span>)}</div>
                  </details>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {result ? (
                <>
                  <button type="button" className="btn" onClick={() => (setResult(null), setProgress(null))}>Ещё ссылку</button>
                  <button type="button" className="btn primary" onClick={save} disabled={!result.tracks.length}>Сохранить плейлист</button>
                </>
              ) : (
                <button type="button" className="btn primary" onClick={() => void start()} disabled={busy || !url.trim()}>{busy ? 'Импортируем…' : 'Импортировать'}</button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
