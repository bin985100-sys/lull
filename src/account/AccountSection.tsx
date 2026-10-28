import { useEffect, useState } from 'react';
import { cloud } from './client';
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
  useEffect(() => {
    let active = true;
    void cloud?.auth.getSession().then(({ data }) => {
      if (active) setIdentity(data.session?.user.email ?? '');
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div style={{ padding: 20 }}>
    <h3>Твой аккаунт Lull</h3>{identity && <p>{identity}</p>}<p role="status">{sync}</p>
    <p>Любимые треки, плейлисты и очередь доступны на других устройствах после входа в тот же аккаунт Google.</p>
    <p role="status">{youtube.message}</p>
    <button type="button" className="btn" disabled={youtube.busy || busy} onClick={() => void importYoutube(false)}>{youtube.busy ? 'Переносим…' : 'Обновить музыку из YouTube'}</button>
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
