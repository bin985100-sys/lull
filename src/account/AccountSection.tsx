import { useEffect, useState } from 'react';
import { cloud, signIn, sessionProvider } from './client';
import { useSyncStatus } from './sync';
import { importYoutube, useYoutubeImport } from './youtube';

let beforeSignOut: (() => Promise<void>) | undefined;
export function setBeforeSignOut(fn: () => Promise<void>) { beforeSignOut = fn; }

export function AccountSection() {
  const sync = useSyncStatus((s) => s.status);
  const youtube = useYoutubeImport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState('');
  const [googleSession, setGoogleSession] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);
  useEffect(() => {
    let active = true;
    void cloud?.auth.getSession().then(async ({ data }) => {
      const provider = data.session ? await sessionProvider(data.session) : null;
      if (active) {
        setIdentity(data.session?.user.email ?? '');
        setGoogleSession(provider === 'google');
        setGoogleLinked(data.session?.user.identities?.some(i => i.provider === 'google') ?? false);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div style={{ padding: 20 }}>
    <h3>Твой аккаунт Lull</h3>{identity && <p>{identity}</p>}<p role="status">{sync}</p>
    <p>Любимые треки, плейлисты и очередь доступны на других устройствах после входа в тот же аккаунт Lull.</p>
    <p role="status">{youtube.message}</p>
    {googleSession ? <button type="button" className="btn" disabled={youtube.busy || busy} onClick={() => void importYoutube(false)}>{youtube.busy ? 'Переносим…' : 'Обновить музыку из YouTube'}</button> : <button type="button" className="btn" disabled={busy} onClick={() => {
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
