import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import './styles/mobile.css';

if (import.meta.env.VITE_TARGET === 'web') {
  void import('./web/InstallSheet').then((m) => m.markWebApp());
  void import('./web/native').then((m) => m.initNative());
}

const root = createRoot(document.getElementById('root')!);

async function bootOverlay() {
  const { OverlayApp } = await import('./overlay/OverlayApp');
  root.render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>
  );
}

async function bootApp() {
  const [{ App }, { initPoToken }, { useLibrary }, { applyEngineSettings, audioEngine, usePlayer }, { useSettings }, { useLyrics }, { startBridges }, { isMock }, { useWave }] = await Promise.all([
    import('./App'),
    import('./lib/potoken'),
    import('./store/library'),
    import('./store/player'),
    import('./store/settings'),
    import('./store/lyrics'),
    import('./lib/bridges'),
    import('./api'),
    import('./store/wave')
  ]);
  // Сначала настройки (от них зависит восстановление очереди), затем остальное
  await useSettings.getState().hydrate().catch(() => {});
  await Promise.all([useLibrary.getState().hydrate().catch(() => {}), usePlayer.getState().hydrate().catch(() => {}), useLyrics.getState().hydrate().catch(() => {}), useWave.getState().hydrate().catch(() => {})]);
  applyEngineSettings();
  startBridges();
  // Новому пользователю — готовые плейлисты, чтобы библиотека не была пустой
  void import('./lib/starter').then((m) => m.seedStarterLibrary()).catch(() => {});
  // Отладочный доступ к состоянию — только в браузерном режиме с тестовыми данными
  if (isMock) {
    (window as unknown as Record<string, unknown>).__stores = { useLibrary, usePlayer, useSettings, useLyrics, useWave, audioEngine };
    // Для покадровой записи заставки «Волны»
    void Promise.all([import('./components/WaveIntro'), import('./screens/Wave')]).then(([m, w]) => ((window as unknown as Record<string, unknown>).__intro = { ...m, covers: w.INTRO_COVERS }));
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  // BotGuard тяжёлый — запускаем после первой отрисовки
  setTimeout(() => void initPoToken(), 1500);
}

void (location.hash.startsWith('#/overlay') ? bootOverlay() : bootApp());
