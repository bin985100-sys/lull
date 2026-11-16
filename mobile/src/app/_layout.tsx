import Animated, { useReducedMotion } from 'react-native-reanimated';
import { usePlayer } from '@/player/player';
import { listenForAppearance, useAppearance, useTheme } from '@/theme/state';
import { Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold, useFonts } from '@expo-google-fonts/montserrat';
import { DarkTheme, DefaultTheme, router, ThemeProvider, usePathname } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';
import { Appearance, PanResponder, Platform, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { startSync } from '@/api/sync';
import { Dock } from '@/components/Dock';
import { DesktopRail } from '@/components/DesktopRail';
import { layoutMetrics } from '@/ui/layout';
import { useLibrary } from '@/store/library';

import { CrashBanner, Guard, ScreenError } from '@/ui/Crash';
import { Overlays } from '@/ui/overlay';
import { GlassScene } from '@/ui/Glass';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync().catch(() => {});
const subscribeAppearance=(notify:()=>void)=>useAppearance.persist.onFinishHydration(()=>notify());
const subscribeLibrary=(notify:()=>void)=>useLibrary.persist.onFinishHydration(()=>notify());

/* Жест «назад» от левого края, как в iOS: у веб-приложения на экране «Домой» его нет */
const edge = PanResponder.create({
  onStartShouldSetPanResponder: () => router.canGoBack(),
  onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dy) < 30,
  onPanResponderRelease: (_, g) => { if (g.dx > 70 && router.canGoBack()) router.back(); },
});
function EdgeBack() {

  return <View {...edge.panHandlers} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, zIndex: 5 }} />;
}

export default function Root() {
  const palette=useTheme();
  const expanded=usePlayer(s=>s.expanded),reduced=useReducedMotion();
 const {colors:C}=palette;
  const mode=useAppearance(s=>s.mode);
  const themeReady=useSyncExternalStore(subscribeAppearance,useAppearance.persist.hasHydrated,()=>false);
  useEffect(listenForAppearance,[]);
  useEffect(()=>{if(Platform.OS!=='web'){Appearance.setColorScheme(mode==='system' ? 'auto' : mode);return;}document.documentElement.style.colorScheme=palette.dark?'dark':'light';document.body.style.backgroundColor=C.bg;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',C.bg);},[mode,palette.dark,C.bg]);
  const base=palette.dark ? DarkTheme : DefaultTheme;
  const theme={...base,colors:{...base.colors,background:C.bg,card:C.s1,text:C.tx,border:'transparent',primary:C.sky}};
  const {width,height,fontScale}=useWindowDimensions();
  const layout=layoutMetrics(width,height,fontScale);
  const path=usePathname();
  const rail=['/','/welcome','/auth','/onboarding'].includes(path) ? 0 : layout.rail;
  const [fonts] = useFonts({ Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });
  const hydrated=useSyncExternalStore(subscribeLibrary,useLibrary.persist.hasHydrated,()=>false);
  useEffect(() => { startSync(); }, []);
  const ready = fonts && hydrated && themeReady;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style={palette.dark ? 'light' : 'dark'} />
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <GlassScene overlay={<>
            <Guard name="dock" quiet><Dock /></Guard>
            <Guard name="overlays" quiet><Overlays /></Guard>
            <CrashBanner />
          </>}>
          <Animated.View pointerEvents={expanded?'none':'auto'} aria-hidden={expanded} accessibilityElementsHidden={expanded} style={{flex:1,marginLeft:rail,borderRadius:expanded?24:0,overflow:'hidden',transform:[{scale:expanded?.975:1}],transitionProperty:['transform','borderRadius'],transitionDuration:reduced?0:380}}>
          <Guard name="screens">
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="listen" options={{ animation: 'fade' }} />
            <Stack.Screen name="discover" options={{ animation: 'fade' }} />
            <Stack.Screen name="collection" options={{ animation: 'fade' }} />
            <Stack.Screen name="new-playlist" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
          </Guard>
          </Animated.View>
          <DesktopRail />
          {Platform.OS === 'web' ? <EdgeBack /> : null}
          </GlassScene>
        </View>
      </ThemeProvider>
    </SafeAreaProvider></GestureHandlerRootView>
  );
}

/* Ошибка внутри экрана показывается на этом экране, а не закрывает приложение */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {

  return <ScreenError error={error} retry={retry} />;
}
