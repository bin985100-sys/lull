/* Завершение входа — одно место для всех путей (экран входа, возврат из Google/Telegram по ссылке, перезапуск приложения).
   Сначала загружаем библиотеку аккаунта с сервера и только потом решаем: выбор артистов или сразу музыка. */
import { create } from 'zustand';

import { resetTo } from '@/nav';
import { useLibrary } from '@/store/library';
import { loadAccount } from './sync';

export const useSession = create<{ loading: boolean; error: boolean }>(() => ({ loading: false, error: false }));

let flight: Promise<void> | null = null;
export function finishLogin(): Promise<void> {
  if (!flight) flight = (async () => {
    useSession.setState({ loading: true, error: false });
    const r = await loadAccount();
    if (r === 'error') {
      /* нет связи — не гадаем (иначе старый аккаунт снова попадёт в выбор артистов), ждём на экране входа с кнопкой «Повторить» */
      useSession.setState({ loading: false, error: true });
      resetTo('/welcome');
      return;
    }
    useSession.setState({ loading: false, error: false });
    resetTo(useLibrary.getState().onboarded ? '/listen' : '/onboarding');
  })().finally(() => { flight = null; });
  return flight;
}
