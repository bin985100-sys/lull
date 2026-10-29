import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUi, type MenuItem } from '../store/ui';
import { IChevronRight } from './icons';

function MenuList({ items, x, y, onDone, depth = 0 }: { items: MenuItem[]; x: number; y: number; onDone: () => void; depth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null);

  // Не даём меню вылезти за край окна
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The opening scale animation must not shrink the measured menu size.
    const r = { width: el.offsetWidth, height: el.offsetHeight };
    const style = getComputedStyle(document.documentElement);
    const inset = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
    const leftEdge = Math.max(8, inset('--safe-left'));
    const rightEdge = window.innerWidth - Math.max(8, inset('--safe-right'));
    const viewport = window.visualViewport;
    const topEdge = (viewport?.offsetTop ?? 0) + Math.max(8, inset('--safe-top'));
    const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - Math.max(16, inset('--safe-bottom'));
    let left = x, top = y;
    if (left + r.width > rightEdge) left = depth ? x - r.width - 250 : rightEdge - r.width;
    if (top + r.height > bottomEdge) top = bottomEdge - r.height;
    setPos({ left: Math.max(leftEdge, left), top: Math.max(topEdge, top) });
  }, [x, y, depth]);

  return (
    <>
      <motion.div
        ref={ref}
        role="menu"
        className="menu"
        style={pos}
        initial={{ opacity: 0, scale: 0.97, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, pointerEvents: 'none' }}
        transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((it, i) =>
          it.divider ? (
            <div key={i} className="menu-sep" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              aria-haspopup={it.submenu ? 'menu' : undefined}
              className={`menu-item ${it.danger ? 'danger' : ''} ${sub?.i === i ? 'open' : ''}`}
              onMouseEnter={(e) => {
                if (it.submenu) {
                  const r = e.currentTarget.getBoundingClientRect();
                  setSub({ i, x: r.right + 4, y: r.top - 6 });
                } else setSub(null);
              }}
              onClick={(e) => {
                if (it.submenu) {
                  const r = e.currentTarget.getBoundingClientRect();
                  setSub({ i, x: r.right + 4, y: r.top - 6 });
                  return;
                }
                onDone();
                it.onClick?.();
              }}
            >
              {it.icon ?? <span style={{ width: 17 }} />}
              <span className="ell" style={{ flex: 1 }}>{it.label}</span>
              {it.submenu && <IChevronRight size={14} />}
            </button>
          )
        )}
      </motion.div>
      {sub && items[sub.i]?.submenu && <MenuList items={items[sub.i].submenu!} x={sub.x} y={sub.y} onDone={onDone} depth={depth + 1} />}
    </>
  );
}

export function ContextMenu() {
  const menu = useUi((s) => s.menu);
  const close = useUi((s) => s.closeMenu);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.visualViewport?.addEventListener('resize', close);
    window.visualViewport?.addEventListener('scroll', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.visualViewport?.removeEventListener('resize', close);
      window.visualViewport?.removeEventListener('scroll', close);
    };
  }, [menu, close]);
  return <AnimatePresence>{menu && <MenuList key={`${menu.x}:${menu.y}`} items={menu.items} x={menu.x} y={menu.y} onDone={close} />}</AnimatePresence>;
}
