import { router } from 'expo-router';

/* Переход к корневому экрану со сбросом истории: «назад» больше не возвращает на вход и онбординг */
export function resetTo(path: '/listen' | '/discover' | '/collection' | '/onboarding' | '/welcome') {
  try { if (router.canDismiss()) router.dismissAll(); } catch { /* стек уже пуст */ }
  router.replace(path);
}
