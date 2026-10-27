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
    const r = el.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > window.innerWidth - 8) left = depth ? x - r.width - 250 : window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 16) top = Math.max(8, window.innerHeight - r.height - 16);
    setPos({ left: Math.max(8, left), top });
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
        exit={{ opacity: 0, scale: 0.97 }}
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
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu, close]);
  return <AnimatePresence>{menu && <MenuList key={`${menu.x}:${menu.y}`} items={menu.items} x={menu.x} y={menu.y} onDone={close} />}</AnimatePresence>;
}
