import { router } from 'expo-router';
import { routeExit } from '@/ui/route-motion-state';

/* Переход к корневому экрану со сбросом истории: «назад» больше не возвращает на вход и онбординг */
export function resetTo(path: '/listen' | '/wave' | '/search' | '/discover' | '/collection' | '/onboarding' | '/welcome') {
  try { if (router.canDismiss()) router.dismissAll(); } catch { /* стек уже пуст */ }
  router.replace(path);
}

/** Tabs use one action; dismissAll + replace briefly exposed the previous screen. */
export function softExit(action:()=>void){if(routeExit.run)routeExit.run(action);else action();}
export function softPush(path:Parameters<typeof router.push>[0]){softExit(()=>router.push(path));}
export const softBack=()=>softExit(()=>router.back());
export function switchTab(path:'/listen'|'/wave'|'/search'|'/discover'|'/collection'){softExit(()=>router.dismissTo(path));}
