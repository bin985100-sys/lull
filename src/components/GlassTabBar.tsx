import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionStyle } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Главная', icon: 'home' },
  { to: '/search', label: 'Поиск', icon: 'search' },
  { to: '/wave', label: 'Волна', icon: 'wave' },
  { to: '/library', label: 'Библиотека', icon: 'library' }
] as const;

/** Hand-drawn paths follow the four silhouettes in the supplied reference. */
function NavigationIcon({ icon }: { icon: typeof tabs[number]['icon'] }) {
  return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">
    {icon === 'home' && <path fill="currentColor" d="M3.5 11.1 11.8 3a3.1 3.1 0 0 1 4.4 0l8.3 8.1c.7.7 1 1.4 1 2.4v10.2c0 1.2-.8 2-2 2h-7v-7.5a2.5 2.5 0 0 0-5 0v7.5h-7c-1.2 0-2-.8-2-2V13.5c0-1 .3-1.7 1-2.4Z" />}
    {icon === 'search' && <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12.1" cy="12" r="9.4"/><path d="m19 19 7 7"/></g>}
    {icon === 'wave' && <g stroke="currentColor" strokeWidth="2.7" strokeLinecap="round"><path d="M1.6 9.8c4.1-4.5 7.6-4.5 12.2 0s8.2 4.5 12.6 0M1.6 18.3c4.1-4.5 7.6-4.5 12.2 0s8.2 4.5 12.6 0"/></g>}
    {icon === 'library' && <g stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><rect x="3" y="3" width="8" height="22" rx="1.4"/><rect x="16.3" y="7" width="6.4" height="18" rx="1.1" transform="rotate(-9 19.5 16)"/></g>}
  </svg>;
}

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
  // Stretch during travel without shortening the bubble's full panel height.
  const bubbleWidth = useTransform(() => width.get() / 4 + (reduce ? 0 : Math.min(Math.abs(target.get() - position.get()) * .16, width.get() * .045)));
  const x = useTransform(() => position.get() - (bubbleWidth.get() - width.get() / 4) / 2);
  const edgeLight = useTransform(() => .36 + Math.min(Math.abs(target.get() - position.get()) / Math.max(1, width.get()), .2));

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
    <nav ref={nav} className="m-tabs glass-nav" aria-label="Навигация">
      <motion.span className="glass-nav-bubble" aria-hidden="true" style={{ x, width: bubbleWidth, opacity: index < 0 ? 0 : 1, '--edge-light': edgeLight } as MotionStyle} />
      {tabs.map(({ to, label, icon }) => <NavLink key={to} to={to} end={to === '/'} aria-label={label} className={({ isActive }) => `m-tab${isActive ? ' on' : ''}`}><NavigationIcon icon={icon}/></NavLink>)}
    </nav>
  </div>;
}
