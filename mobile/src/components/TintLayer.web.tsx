import { useEffect, useRef } from 'react';

/* В браузере CSS-размытие на весь плеер дорого: на iPhone из-за него тормозила анимация.
   Рисуем обложку в холст 8×8 и растягиваем: браузер сглаживает пиксели в мягкий цветной фон,
   а это обычная текстура без пересчёта на каждом кадре. */
export function TintLayer({ uri }: { uri: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => {
      const c = ref.current; if (!c) return;
      const ctx = c.getContext('2d'); if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, c.width, c.height);
    };
    img.src = uri;
  }, [uri]);
  return <canvas ref={ref} width={8} height={8} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scale(1.25)' }} aria-hidden="true" />;
}
