import { Kawarp, type KawarpRef } from '@kawarp/react';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { LiveBackground } from './LiveBackground';

/** Нет WebGL (старый телефон, отключённое ускорение) — Kawarp бросает ошибку; не роняем приложение. */
class GlGuard extends Component<{ fallback: ReactNode; children: ReactNode; resetKey?: string }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidUpdate(previous: Readonly<{ resetKey?: string }>) {
    if (this.state.bad && previous.resetKey !== this.props.resetKey) this.setState({ bad: false });
  }
  render() {
    return this.state.bad ? this.props.fallback : this.props.children;
  }
}

const hasWebGL = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl');
  } catch {
    return false;
  }
})();

export type BackdropMode = 'cover' | 'gradient' | 'mono' | 'black';

/**
 * Фон приложения.
 *  cover    — живая обложка (kawarp: размытие Kawase + плавная деформация), цвета сохраняются
 *  mono     — то же без цвета, «серебряная» обложка
 *  gradient — наш шейдер с цветовыми пятнами из палитры обложки
 *  black    — без фона
 */
export function Backdrop({ src, mode, palette, animated, strong, paused = false }: { src?: string; mode: BackdropMode; palette: string[]; animated: boolean; strong?: boolean; paused?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const renderer = useRef<KawarpRef>(null);
  const hidden = useRef(paused);
  hidden.current = paused;
  useEffect(() => {
    if (paused) renderer.current?.stop(); else renderer.current?.start();
    return () => renderer.current?.stop();
  }, [paused, mode]);
  if (mode === 'black') return null;
  const gradient = <LiveBackground colors={palette} intensity={strong ? 0.95 : 0.6} animated={animated && !paused} scale={0.45} />;
  if (mode === 'gradient' || !src || failedSrc === src) return gradient;
  if (!hasWebGL)
    return <img src={api.imageUrl(src)} onError={() => setFailedSrc(src)} alt="" className="kawarp" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: `blur(60px) saturate(${mode === 'mono' ? 0 : 1.5}) brightness(.6)`, transform: 'scale(1.3)' }} />;
  return (
    <GlGuard fallback={gradient} resetKey={src}>
    <Kawarp
      ref={renderer}
      autoPlay={false}
      onLoad={() => { if (hidden.current) renderer.current?.stop(); else renderer.current?.start(); }}
      className="kawarp"
      src={api.imageUrl(src)}
      warpIntensity={0.85}
      blurPasses={10}
      animationSpeed={animated ? 1 : 0}
      transitionDuration={1600}
      saturation={mode === 'mono' ? 0 : strong ? 1.6 : 1.45}
      tintColor={[0.1, 0.1, 0.13]}
      tintIntensity={strong ? 0.12 : 0.36}
      dithering={0.01}
      scale={1.15}
      onError={() => setFailedSrc(src)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
    </GlGuard>
  );
}
