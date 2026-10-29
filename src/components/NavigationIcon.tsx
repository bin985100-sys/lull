import { navigationPaths } from './navigationPaths';

export type NavigationIconName = keyof typeof navigationPaths;

export function NavigationIcon({ icon, desktop = false }: { icon: NavigationIconName; desktop?: boolean }) {
  return <svg viewBox="0 0 72 72" fill="currentColor" aria-hidden="true" focusable="false">
    {desktop && icon === 'library' ? <>
      <rect x="9" y="9" width="12" height="54" rx="4"/>
      <rect x="27" y="12" width="11" height="51" rx="4"/>
      <rect x="45" y="20" width="11" height="43" rx="4" transform="rotate(-11 50.5 41.5)"/>
    </> : <path d={navigationPaths[icon]} fillRule="evenodd"/>}
  </svg>;
}

export function NavigationSettingsIcon() {
  return <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false">
    <path fillRule="evenodd" d="M9 3h14a6 6 0 0 1 0 12H9A6 6 0 0 1 9 3Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 17h14a6 6 0 0 1 0 12H9a6 6 0 0 1 0-12Zm14 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
  </svg>;
}
