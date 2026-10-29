import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { api } from '../api';
import logoUrl from '../assets/logo.svg';
import { useUi } from '../store/ui';
import { IClose, IMinus, IRestore, ISquare } from './icons';
import { NavigationIcon, NavigationSettingsIcon, type NavigationIconName } from './NavigationIcon';

export function Rail() {
  const openSettings = useUi((s) => s.openSettings);
  const { pathname } = useLocation();
  const index = pathname === '/' ? 0 : pathname.startsWith('/search') ? 1 : pathname.startsWith('/wave') ? 2 : pathname.startsWith('/library') ? 3 : -1;
  const reduce = useReducedMotion();
  const target = useMotionValue(Math.max(0, index) * 76);
  const position = useSpring(target, { stiffness: 360, damping: 31, mass: .85 });
  const stretchTarget = useTransform(() => reduce ? 1 : 1 + Math.min(Math.abs(target.get() - position.get()) / 76 * .08, .1));
  const scaleY = useSpring(stretchTarget, { stiffness: 440, damping: 26, mass: .45 });
  const scaleX = useTransform(scaleY, value => 1 - (value - 1) * .18);
  useEffect(() => {
    const offset = Math.max(0, index) * 76;
    target.set(offset);
    if (reduce) position.jump(offset);
  }, [index, reduce, target, position]);
  const link = (to: string, label: string, icon: NavigationIconName, end = false) => (
    <NavLink to={to} end={end} aria-label={label} title={label} className={({ isActive }) => `rail-btn no-drag ${isActive ? 'active' : ''}`}>
      <NavigationIcon icon={icon} desktop/>
    </NavLink>
  );
  return (
    <nav className="rail drag" aria-label="Навигация">
      <div className="rail-logo">
        <img src={logoUrl} alt="Логотип" draggable={false} />
      </div>
      <div className="rail-panel no-drag">
        <div className="rail-indicator-track" aria-hidden="true"><motion.span className="rail-active-indicator" style={{ y: position, scaleX, scaleY, opacity: index < 0 ? 0 : 1 }}/></div>
        {link('/', 'Главная', 'home', true)}
        {link('/search', 'Поиск', 'search')}
        {link('/wave', 'Моя волна', 'wave')}
        {link('/library', 'Библиотека', 'library')}
      </div>
      <button type="button" className="rail-gear no-drag" aria-label="Настройки" title="Настройки" onClick={() => openSettings()}>
        <NavigationSettingsIcon/>
      </button>
    </nav>
  );
}

export function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => api.onMaximizedChange(setMax), []);
  if (api.platform === 'darwin' || api.platform === 'web') return null;
  return (
    <div className="winctl no-drag">
      <button type="button" aria-label="Свернуть окно" onClick={() => api.windowMinimize()}><IMinus size={14} /></button>
      <button type="button" aria-label={max ? 'Восстановить' : 'Развернуть'} onClick={() => api.windowToggleMaximize()}>{max ? <IRestore size={13} /> : <ISquare size={13} />}</button>
      <button type="button" className="close" aria-label="Закрыть" onClick={() => api.windowClose()}><IClose size={14} /></button>
    </div>
  );
}

export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar drag" onDoubleClick={(e) => e.target === e.currentTarget && api.windowToggleMaximize()}>
      {children}
      <WindowControls />
    </header>
  );
}
