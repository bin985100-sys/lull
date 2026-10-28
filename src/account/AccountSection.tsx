import { useEffect, useState } from 'react';
import { cloud, signIn, waitForAccountCallback } from './client';
import { useSyncStatus } from './sync';
import { importYoutube, useYoutubeImport } from './youtube';
import { LoginButtons } from './LoginScreen';
import './account.css';
import { refreshGoogleStatus, useGoogleConnection } from './google';

let beforeSignOut: (() => Promise<void>) | undefined;
export function setBeforeSignOut(fn: () => Promise<void>) { beforeSignOut = fn; }

export function AccountSection() {
  const sync = useSyncStatus((s) => s.status);
  const youtube = useYoutubeImport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const googleConnected = useGoogleConnection((s) => s.connected);
  const [googleLinked, setGoogleLinked] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => cloud?.auth.getSession().then(async ({ data }) => {
      await waitForAccountCallback();
      if (active) {
        setSignedIn(!!data.session);
        setChecking(false);
        setIdentity(data.session?.user.email ?? '');
        setGoogleLinked(data.session?.user.identities?.some(i => i.provider === 'google') ?? false);
      }
      if (data.session) await refreshGoogleStatus();
    }).catch(() => { if (active) { setChecking(false); setError('Не удалось проверить аккаунт. Попробуй открыть этот раздел снова.'); } });
    void refresh();
    const subscription = cloud?.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void refresh(); }, 0); });
    return () => { active = false; subscription?.data.subscription.unsubscribe(); };
  }, []);
  if (checking) return <div className="account-section" role="status">Проверяем аккаунт…</div>;
  if (!signedIn) return <div className="account-section"><h3>Твой аккаунт Lull</h3><p>Войди через Google или Discord, чтобы сохранить библиотеку и продолжить слушать на другом устройстве.</p><LoginButtons error={error}/><p className="account-note">Google запросит доступ к YouTube, и доступная музыка перенесётся автоматически после твоего согласия.</p><a href="https://app.lull.website/privacy.html" target="_blank" rel="noopener noreferrer">Данные и конфиденциальность</a></div>;
  return <div className="account-section">
    <h3>Твой аккаунт Lull</h3>{identity && <p>{identity}</p>}<p role="status">{sync}</p>
    <p>Любимые треки, плейлисты и очередь доступны на других устройствах после входа в тот же аккаунт Lull.</p>
    <p role="status">{youtube.message}</p>
    {googleConnected ? <button type="button" className="btn" disabled={youtube.busy || busy} onClick={() => void importYoutube(false)}>{youtube.busy ? 'Переносим…' : 'Обновить музыку из YouTube'}</button> : <button type="button" className="btn" disabled={busy} onClick={() => {
      setBusy(true); setError('');
      void signIn('google', !googleLinked).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
    }}>Подключить Google и музыку YouTube</button>}
    <p>Переносим музыкальные видео и доступные через YouTube плейлисты. Автоматические подборки YouTube Music могут быть недоступны.</p>
    <button type="button" className="btn" disabled={busy} onClick={() => {
      setBusy(true);
      void (async () => {
        const { audioEngine } = await import('../store/player'); audioEngine.pause();
        await beforeSignOut?.();
        const result = await cloud?.auth.signOut({ scope: 'local' });
        if (result?.error) throw result.error;
        location.reload();
      })().catch((e: Error) => { setError(e.message); setBusy(false); });
    }}>{busy ? 'Выходим…' : 'Выйти на этом устройстве'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
