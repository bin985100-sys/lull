import { useState } from 'react';
import { cloud } from './client';
import { useSyncStatus } from './sync';

let beforeSignOut: (() => Promise<void>) | undefined;
export function setBeforeSignOut(fn: () => Promise<void>) { beforeSignOut = fn; }

export function AccountSection() {
  const sync = useSyncStatus((s) => s.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div style={{ padding: 20 }}>
    <h3>Твой аккаунт Lull</h3><p>{sync}</p>
    <p>Любимые треки, плейлисты и очередь доступны на других устройствах после входа в тот же аккаунт Google.</p>
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
