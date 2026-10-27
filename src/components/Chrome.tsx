import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import logoUrl from '../assets/logo.svg';
import { useUi } from '../store/ui';
import { IClose, IHome, IHomeFill, ILibrary, IMinus, IRestore, ISearch, ISliders, ISquare, IWaveNav } from './icons';

export function Rail() {
  const openSettings = useUi((s) => s.openSettings);
  const link = (to: string, label: string, icon: (active: boolean) => ReactNode, end = false) => (
    <NavLink to={to} end={end} aria-label={label} title={label} className={({ isActive }) => `rail-btn no-drag ${isActive ? 'active' : ''}`}>
      {({ isActive }) => icon(isActive)}
    </NavLink>
  );
  return (
    <nav className="rail drag" aria-label="Навигация">
      <div className="rail-logo">
        <img src={logoUrl} alt="Логотип" draggable={false} />
      </div>
      <div className="rail-panel no-drag">
        {link('/', 'Главная', (a) => (a ? <IHomeFill size={21} /> : <IHome size={21} />), true)}
        {link('/search', 'Поиск', (a) => <ISearch size={21} strokeWidth={a ? 2.6 : 2} />)}
        {link('/library', 'Библиотека', (a) => <ILibrary size={21} strokeWidth={a ? 2.6 : 2} />)}
        {link('/wave', 'Моя волна', (a) => <IWaveNav size={22} strokeWidth={a ? 2.6 : 2} />)}
        <span style={{ flex: 1 }} />
      </div>
      <button type="button" className="rail-gear no-drag" aria-label="Настройки" title="Настройки" onClick={() => openSettings()}>
        <ISliders size={21} />
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
