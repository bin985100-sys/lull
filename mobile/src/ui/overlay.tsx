/* Тосты, нижние панели и диалоги поверх всего приложения. */
import { BlurView } from 'expo-blur';
import { type ReactNode, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { C, DOCK, EASE, F } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Btn, T } from './kit';
import { usePlayer } from '@/player/player';

type Toast = { id: number; icon?: IconName; text: string; action?: { label: string; fn: () => void } };
type Dialog = { icon?: IconName; title: string; text?: string; safe: string; danger: string; onDanger: () => void };
type O = { toast: Toast | null; sheet: (() => ReactNode) | null; dialog: Dialog | null };
export const useOverlay = create<O>(() => ({ toast: null, sheet: null, dialog: null }));

let tt: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, icon?: IconName, action?: Toast['action']) {
  clearTimeout(tt);
  useOverlay.setState({ toast: { id: Date.now(), text, icon, action } });
  tt = setTimeout(() => useOverlay.setState({ toast: null }), action ? 5000 : 2600);
}
export const openSheet = (render: () => ReactNode) => useOverlay.setState({ sheet: render });
export const closeSheet = () => useOverlay.setState({ sheet: null });
export const confirm = (d: Dialog) => useOverlay.setState({ dialog: d });

const ease = Easing.bezier(...EASE);

export function Overlays() {
  const { toast: t, sheet, dialog } = useOverlay();
  const ins = useSafeAreaInsets();
  const hasTrack = usePlayer((x) => x.index >= 0);
  const expanded = usePlayer((x) => x.expanded);
  const reduced = useReducedMotion();
  const [, force] = useState(0);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = useOverlay.getState();
      if (s.dialog) { useOverlay.setState({ dialog: null }); return true; }
      if (s.sheet) { closeSheet(); return true; }
      if (usePlayer.getState().expanded) { usePlayer.setState({ expanded: false }); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);
  void force;
  const bottom = expanded ? undefined : (hasTrack ? DOCK.mini : DOCK.compact) + Math.max(ins.bottom, 14) + 14;
  return (
    <>
      {sheet ? (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Animated.View entering={reduced ? undefined : FadeIn.duration(220)} exiting={reduced ? undefined : FadeOut.duration(200)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Закрыть панель" />
          </Animated.View>
          <Animated.View entering={reduced ? undefined : SlideInDown.duration(380).easing(ease)} exiting={reduced ? undefined : SlideOutDown.duration(260)} style={[st.sheet, { bottom: 8 + ins.bottom * 0.4 }]}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,32,36,0.78)' }]} />
            <View style={st.grab} />
            {sheet()}
          </Animated.View>
        </View>
      ) : null}
      {dialog ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} accessibilityViewIsModal>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
          <View style={st.dlg} accessibilityRole="alert">
            {dialog.icon ? <Icon name={dialog.icon} size={44} /> : null}
            <T v="h2" style={{ fontSize: 24, textAlign: 'center' }}>{dialog.title}</T>
            {dialog.text ? <T v="body" style={{ textAlign: 'center', fontSize: 15 }}>{dialog.text}</T> : null}
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 10 }}>
              <Btn label={dialog.safe} small onPress={() => useOverlay.setState({ dialog: null })} style={{ justifyContent: 'center' }} />
              <Btn label={dialog.danger} small kind="flat" onPress={() => { const f = dialog.onDanger; useOverlay.setState({ dialog: null }); f(); }} style={{ justifyContent: 'center' }} />
            </View>
          </View>
        </Animated.View>
      ) : null}
      {t ? (
        <Animated.View key={t.id} entering={reduced ? undefined : FadeIn.duration(220)} exiting={reduced ? undefined : FadeOut.duration(200)}
          style={[st.toast, expanded ? { top: Math.max(ins.top, 18) + 64 } : { bottom }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {t.icon ? <Icon name={t.icon} size={22} /> : null}
          <T v="title" style={{ flex: 1, fontSize: 15 }}>{t.text}</T>
          {t.action ? (
            <Pressable onPress={() => { useOverlay.setState({ toast: null }); t.action!.fn(); }} style={st.tAct} accessibilityRole="button">
              <T v="small" style={{ color: C.tx, fontFamily: F.bold }}>{t.action.label}</T>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  sheet: { position: 'absolute', left: 8, right: 8, borderRadius: 38, overflow: 'hidden', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 22, maxHeight: '84%', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', alignSelf: 'center', marginBottom: 14 },
  dlg: { width: '86%', maxWidth: 340, borderRadius: 34, padding: 24, paddingBottom: 20, gap: 8, alignItems: 'center', backgroundColor: 'rgba(32,34,38,0.94)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine },
  toast: { position: 'absolute', left: 16, right: 16, minHeight: 56, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 8, paddingVertical: 8, backgroundColor: 'rgba(36,38,42,0.96)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine },
  tAct: { height: 40, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.s4, justifyContent: 'center' },
});
