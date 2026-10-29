import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NavigationIcon } from './NavigationIcon';

const tabs = [
  { to: '/', label: 'Главная', icon: 'home' },
  { to: '/search', label: 'Поиск', icon: 'search' },
  { to: '/wave', label: 'Волна', icon: 'wave' },
  { to: '/library', label: 'Библиотека', icon: 'library' }
] as const;

export function GlassTabBar() {
  const { pathname } = useLocation();
  const index = pathname === '/' ? 0 : pathname.startsWith('/search') ? 1 : pathname.startsWith('/wave') ? 2 : pathname.startsWith('/library') ? 3 : -1;
  const nav = useRef<HTMLElement>(null);
  const selected = useRef(index);
  selected.current = index;
  const reduce = useReducedMotion();
  const width = useMotionValue(0);
  const target = useMotionValue(0);
  const position = useSpring(target, { stiffness: 360, damping: 31, mass: .85 });
  // Only composited transforms change during travel; layout width stays fixed.
  const stretchTarget = useTransform(() => reduce ? 1 : 1 + Math.min(Math.abs(target.get() - position.get()) / Math.max(1, width.get()) * .28, .1));
  const scaleX = useSpring(stretchTarget, { stiffness: 440, damping: 26, mass: .45 });
  const scaleY = useTransform(scaleX, value => 1 - (value - 1) * .18);

  useLayoutEffect(() => {
    const node = nav.current;
    if (!node) return;
    const resize = () => {
      const size = node.clientWidth;
      width.set(size);
      const offset = Math.max(0, selected.current) * size / 4;
      target.set(offset); position.jump(offset);
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(node);
    return () => observer.disconnect();
  }, [position, target, width]);
  useEffect(() => {
    const offset = Math.max(0, index) * width.get() / 4;
    target.set(offset);
    if (reduce) position.jump(offset);
  }, [index, reduce, position, target, width]);

  return <div className="m-tabs-wrap">
    <nav ref={nav} className="m-tabs reference-nav" aria-label="Навигация">
      <div className="reference-nav-track" aria-hidden="true"><motion.span className="reference-nav-indicator" style={{ x: position, scaleX, scaleY, opacity: index < 0 ? 0 : 1 }} /></div>
      {tabs.map(({ to, label, icon }) => <NavLink key={to} to={to} end={to === '/'} aria-label={label} className={({ isActive }) => `m-tab${isActive ? ' on' : ''}`}><NavigationIcon icon={icon}/></NavLink>)}
    </nav>
  </div>;
}
