import type { CapacitorConfig } from '@capacitor/cli';

// Android-приложение Lull: та же веб-сборка (dist-web) внутри нативной оболочки
const config: CapacitorConfig = {
  appId: 'website.lull.app',
  appName: 'Lull',
  webDir: 'dist-web',
  backgroundColor: '#0B0B0E',
  server: { androidScheme: 'https', hostname: 'localhost' },
  android: { allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: false },
  plugins: {
    SplashScreen: { launchShowDuration: 600, launchAutoHide: true, backgroundColor: '#0B0B0E', showSpinner: false, androidScaleType: 'CENTER_INSIDE', splashFullScreen: false, splashImmersive: false },
    StatusBar: { overlaysWebView: false, style: 'DARK', backgroundColor: '#0B0B0E' }
  }
};

export default config;
