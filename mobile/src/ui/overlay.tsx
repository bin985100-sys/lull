import { resolveThemeValues , useTheme, themeValues } from '@/theme/state';
/* Тосты, нижние панели и диалоги поверх всего приложения. */
import { type ReactNode, useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { DOCK, EASE, F } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Btn, T } from './kit';
import { usePlayer } from '@/player/player';
import { Surface } from './Surface';
import { Image } from 'expo-image';

type Toast = { id: number; icon?: IconName; text: string; action?: { label: string; fn: () => void };previews?:string[] };
type Dialog = { borderless?:boolean; icon?: IconName; title: string; text?: string; safe: string; danger: string; onDanger: () => void };
export type MenuAnchor={x:number;y:number};
type O = { anchor:MenuAnchor|null;toast: Toast | null; sheet: (() => ReactNode) | null; backdrop:(()=>ReactNode)|null; dialog: Dialog | null };
export const useOverlay = create<O>(() => ({ anchor:null,toast: null, sheet: null, backdrop:null, dialog: null }));

let tt: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, icon?: IconName, action?: Toast['action'],previews?:string[]) {
  clearTimeout(tt);
  useOverlay.setState({ toast: { id: Date.now(), text, icon, action,previews } });
  tt = setTimeout(() => useOverlay.setState({ toast: null }), action ? 5000 : previews?.length?3600:2600);
}
export const openSheet = (render: () => ReactNode,backdrop?:()=>ReactNode) => useOverlay.setState({ sheet: render,anchor:null,backdrop:backdrop??null });
export const openPopover=(render:()=>ReactNode,anchor:MenuAnchor)=>useOverlay.setState({sheet:render,anchor,backdrop:null});
export const closeSheet = () => useOverlay.setState({ sheet: null,anchor:null,backdrop:null });
export const confirm = (d: Dialog) => useOverlay.setState({ dialog: d });

const ease = Easing.bezier(...EASE);

export function Overlays() {
  const {colors:C}=useTheme();
 const st=resolveThemeValues(stThemeTable,C);
  const { toast: t, sheet, dialog,anchor,backdrop } = useOverlay();
  const [presented,setPresented]=useState<{sheet:()=>ReactNode;anchor:MenuAnchor|null;backdrop:(()=>ReactNode)|null;id:number}|null>(null);
  const sheetProgress=useSharedValue(0);
  const ins = useSafeAreaInsets();
  const {width,height}=useWindowDimensions();
  const [contentHeight,setContentHeight]=useState(0);
  const menuWidth=Math.min(340,width-24),menuHeight=Math.min(contentHeight?contentHeight+38:600,600,height-ins.top-ins.bottom-40);
  const shownAnchor=presented?.anchor,anchored=shownAnchor ? {left:Math.max(12,Math.min(width-menuWidth-12,shownAnchor.x-menuWidth/2)),right:undefined,width:menuWidth,top:Math.max(ins.top+12,Math.min(height-ins.bottom-menuHeight-12,shownAnchor.y-menuHeight-10)),bottom:undefined,height:menuHeight,maxHeight:menuHeight,borderRadius:34,paddingHorizontal:18,paddingTop:16} : null;
  const hasTrack = usePlayer((x) => x.index >= 0);
  const expanded = usePlayer((x) => x.expanded);
  const reduced = useReducedMotion();
  useEffect(()=>{
    let frame=0,next=0,arrival=0,timer:ReturnType<typeof setTimeout>|undefined;
    if(sheet){
      sheetProgress.set(0);
      // Mount first, then animate explicitly. Fabric can reuse a popup's native
      // view and skip layout-entry animations during fast menu changes.
      frame=requestAnimationFrame(()=>{setContentHeight(0);setPresented({sheet,anchor,backdrop,id:Date.now()});next=requestAnimationFrame(()=>{arrival=requestAnimationFrame(()=>sheetProgress.set(reduced?1:withTiming(1,{duration:anchor?460:540,easing:ease})));});});
    }else{
      sheetProgress.set(reduced?0:withTiming(0,{duration:300,easing:Easing.bezier(.4,0,.2,1)}));
      timer=setTimeout(()=>setPresented(null),reduced?0:320);
    }
    return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(next);cancelAnimationFrame(arrival);clearTimeout(timer);};
  },[sheet,anchor,backdrop,reduced,sheetProgress]);
  const sheetShade=useAnimatedStyle(()=>({opacity:sheetProgress.get()}));
  const sheetMotion=useAnimatedStyle(()=>{const p=sheetProgress.get();return {opacity:p,transform:[{translateY:(1-p)*(shownAnchor?14:64)},{scale:(shownAnchor?.94:.975)+(shownAnchor?.06:.025)*p}]};});

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
  useEffect(()=>{if(Platform.OS!=='web')return;const close=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;const state=useOverlay.getState();if(state.dialog)useOverlay.setState({dialog:null});else if(state.sheet)closeSheet();else if(usePlayer.getState().expanded)usePlayer.setState({expanded:false});};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
  const bottom = expanded ? undefined : (hasTrack ? DOCK.mini : DOCK.compact) + Math.max(ins.bottom, 14) + 14;
  return (
    <>
      {presented ? (
        <View collapsable={false} style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: shownAnchor ? 'rgba(0,0,0,.14)' : 'rgba(0,0,0,0.35)' },sheetShade]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityRole="button" accessibilityLabel="Закрыть панель" />
          </Animated.View>
          <Animated.View testID="sheet-panel" pointerEvents={sheet?'auto':'none'} collapsable={false} style={[st.sheet, { bottom: 8 + ins.bottom * 0.4 },anchored,sheetMotion]}>
            <Surface pointerEvents="none" radius={34} style={StyleSheet.absoluteFill}/>
            {presented.backdrop?.()}
            {!shownAnchor&&<View style={st.grab} />}
            <ScrollView key={presented.id} onContentSizeChange={(_w,h)=>setContentHeight(h)} style={{flexGrow:0,flexShrink:1}} contentContainerStyle={{paddingBottom:8}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{presented.sheet()}</ScrollView>
          </Animated.View>
        </View>
      ) : null}
      {dialog ? (
        <Animated.View entering={reduced?undefined:FadeIn.duration(420)} exiting={reduced?undefined:FadeOut.duration(400)} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} accessibilityViewIsModal>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
          <View style={[st.dlg,dialog.borderless?{borderWidth:0,backgroundColor:C.bg}:null]} accessibilityRole="alert">
            {!dialog.borderless?<Surface pointerEvents="none" radius={32} style={StyleSheet.absoluteFill}/>:null}
            {dialog.icon ? <Icon name={dialog.icon} size={44} /> : null}
            <T v="h2" style={{ fontSize: 24, textAlign: 'center' }}>{dialog.title}</T>
            {dialog.text ? <T v="body" style={{ textAlign: 'center', fontSize: 15 }}>{dialog.text}</T> : null}
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 10 }}>
              <Btn borderless={dialog.borderless} label={dialog.safe} small onPress={() => useOverlay.setState({ dialog: null })} style={{ justifyContent: 'center' }} />
              <Btn borderless={dialog.borderless} label={dialog.danger} small kind="flat" onPress={() => { const f = dialog.onDanger; useOverlay.setState({ dialog: null }); f(); }} style={{ justifyContent: 'center' }} />
            </View>
          </View>
        </Animated.View>
      ) : null}
      {t ? (
        <Animated.View key={t.id} entering={reduced ? undefined : FadeIn.duration(220)} exiting={reduced ? undefined : FadeOut.duration(420)}
          style={[st.toast,t.previews?.length?{borderWidth:0,borderRadius:999,backgroundColor:'#000',paddingRight:16}:null, expanded ? { top: Math.max(ins.top, 18) + 64 } : { bottom }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {t.icon&&(!t.previews?.length||width>=350) ? <Icon name={t.icon} size={22} /> : null}
          <T v="title" numberOfLines={t.previews?.length?2:undefined} style={{ flex: 1,minWidth:0, fontSize:width<350&&t.previews?.length?14:15 }}>{t.text}</T>
          {t.previews?.length?<View testID="added-tracks-covers" pointerEvents="none" accessibilityElementsHidden style={{flexDirection:'row',alignItems:'center',paddingVertical:3}}>{t.previews.slice(0,width<350?3:4).map((uri,i)=><Animated.View key={uri+':'+i} entering={reduced?undefined:ZoomIn.duration(480).delay(i*70)} style={{width:width<350?24:28,height:width<350?24:28,borderRadius:999,marginLeft:i?-8:0,overflow:'hidden',backgroundColor:'#000'}}><Image testID="toast-track-cover" source={{uri}} contentFit="cover" style={StyleSheet.absoluteFill}/></Animated.View>)}</View>:null}
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

const st = themeValues((C) => (StyleSheet.create({
  sheet: { position: 'absolute', left: 8, right: 8, borderRadius: 34, overflow: 'hidden', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 22, maxHeight: '84%', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: C.sky, opacity:.6, alignSelf: 'center', marginBottom: 14 },
  dlg: { width: '86%', maxWidth: 340, borderRadius: 32, overflow:'hidden',padding: 24, paddingBottom: 20, gap: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine },
  toast: { position: 'absolute', left: 16, right: 16, minHeight: 56, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 8, paddingVertical: 8, backgroundColor: C.s1, borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine },
  tAct: { height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.s4, justifyContent: 'center' },
})));

const stThemeTable=st;
