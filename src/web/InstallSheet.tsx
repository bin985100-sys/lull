import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import logoUrl from '../assets/logo.svg';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const native = () => !!(window as unknown as { Capacitor?: unknown }).Capacitor;
const ios = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Сайт открыт в браузере телефона — предлагаем поставить Lull на экран «Домой». После установки не показывается. */
export function InstallSheet() {
  const [bip, setBip] = useState<BIP | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (standalone() || native() || !window.matchMedia('(max-width: 760px)').matches) return;
    try {
      if (Number(localStorage.getItem('lull:install-dismissed') ?? 0) > Date.now() - 3 * 86400_000) return;
    } catch {
      /* без хранилища — просто покажем */
    }
    const onBip = (e: Event) => (e.preventDefault(), setBip(e as BIP));
    window.addEventListener('beforeinstallprompt', onBip);
    const t = setTimeout(() => setOpen(true), 2500);
    return () => (clearTimeout(t), window.removeEventListener('beforeinstallprompt', onBip));
  }, []);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem('lull:install-dismissed', String(Date.now()));
    } catch {
      /* ignore */
    }
  };
  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    await bip.userChoice.catch(() => null);
    setOpen(false);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="inst-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && close()}>
          <motion.div className="inst" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <span className="inst-grab" />
            <div className="inst-head">
              <img src={logoUrl} alt="" />
              <div>
                <b>Lull</b>
                <span>Музыка, которая знает тебя</span>
              </div>
            </div>
            {ios() ? (
              <ol className="inst-steps">
                <li>Нажми <ShareIcon /> <b>Поделиться</b> внизу экрана</li>
                <li>Выбери <b>На экран «Домой»</b></li>
                <li>Нажми <b>Добавить</b> — Lull появится среди приложений</li>
              </ol>
            ) : bip ? (
              <p className="inst-p">Установи Lull — он откроется на весь экран, будет играть в фоне и появится среди приложений.</p>
            ) : (
              <ol className="inst-steps">
                <li>Открой меню браузера <b>⋮</b></li>
                <li>Выбери <b>Установить приложение</b> или <b>Добавить на главный экран</b></li>
              </ol>
            )}
            <div className="inst-btns">
              {bip && !ios() && <button type="button" className="inst-main" onClick={() => void install()}>Установить</button>}
              <button type="button" className="inst-later" onClick={close}>{bip && !ios() ? 'Не сейчас' : 'Понятно'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-3px', color: '#4da3ff' }} aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

/** Признаки «установленного приложения» на <html>: стили без выделения/лупы/резинки. */
export function markWebApp() {
  const h = document.documentElement;
  h.classList.add('webapp');
  if (standalone() || native()) h.classList.add('installed');
  if (ios()) h.classList.add('ios');
}
