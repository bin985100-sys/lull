import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DARK, LIGHT, type ThemeColors } from './palette';

export type ThemeMode='light'|'dark'|'system';
type AppearanceState={mode:ThemeMode;systemDark:boolean;motion:boolean;setMode:(mode:ThemeMode)=>void};
export const useAppearance=create<AppearanceState>()(persist((set)=>({
  mode:'dark',systemDark:Appearance?.getColorScheme?.()==='dark',motion:true,setMode:mode=>set({mode}),
}),{name:'lull.appearance.v1',storage:createJSONStorage(()=>AsyncStorage),partialize:state=>({mode:state.mode,motion:state.motion})}));
const darkFrom=(state:{mode:ThemeMode;systemDark:boolean})=>state.mode==='dark'||state.mode==='system'&&state.systemDark;
export const isDarkTheme=()=>darkFrom(useAppearance.getState());
export const getPalette=()=>isDarkTheme() ? DARK : LIGHT;
const themes={light:{dark:false,colors:LIGHT},dark:{dark:true,colors:DARK}};
export function useTheme(){const dark=useAppearance(darkFrom);return dark ? themes.dark : themes.light;}
export function listenForAppearance(){
  useAppearance.setState({systemDark:Appearance?.getColorScheme?.()==='dark'});
  const sub=Appearance?.addChangeListener?.(({colorScheme})=>useAppearance.setState({systemDark:colorScheme==='dark'}));
  return ()=>sub?.remove();
}

/** Resolve module-level style tables lazily; cache one table per appearance. */
const THEME_VALUES=Symbol('lull.theme-values');
export function themeValues<T extends object>(make:(colors:ThemeColors)=>T):T {
  const cache=new Map<ThemeColors,T>();
  const resolve=(colors:ThemeColors)=>{if(!cache.has(colors))cache.set(colors,make(colors));return cache.get(colors)!;};
  const current=()=>resolve(getPalette());
  return new Proxy({} as T,{
    get:(_target,key)=>key===THEME_VALUES ? resolve : Reflect.get(current(),key),
    ownKeys:()=>Reflect.ownKeys(current()),
    getOwnPropertyDescriptor:(_target,key)=>({...Object.getOwnPropertyDescriptor(current(),key),configurable:true}),
  });
}

export function resolveThemeValues<T extends object>(table:T,colors:ThemeColors):T {
  const resolve=Reflect.get(table,THEME_VALUES) as ((palette:ThemeColors)=>T)|undefined;
  return resolve ? resolve(colors) : table;
}
