/** Android (Capacitor): кнопка «Назад» как в нативных приложениях. */
export async function initNative() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;
  const [{ App }, { useUi }] = await Promise.all([import('@capacitor/app'), import('../store/ui')]);
  void App.addListener('backButton', () => {
    const ui = useUi.getState();
    if (ui.menu) return ui.closeMenu();
    if (ui.settings) return ui.closeSettings();
    if (ui.search) return ui.setSearch(false);
    if (ui.nowPlaying) return ui.setNowPlaying(ui.nowPlayingPanelRequested);
    const h = location.hash.replace(/^#/, '') || '/';
    if (h !== '/' && !['/search', '/library', '/wave'].includes(h)) return history.back();
    if (h !== '/') return void (location.hash = '#/');
    // На главной «Назад» сворачивает приложение — музыка продолжает играть
    void App.minimizeApp();
  });
}
