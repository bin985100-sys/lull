import { useState } from 'react';
import { signIn } from './client';
import './account.css';

export function LoginScreen({ error: initialError = '' }: { error?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  return <main className="account-screen">
    {window.api && <header className="account-window"><span>Lull</span><div>
      <button type="button" aria-label="Свернуть" onClick={() => window.api?.windowMinimize()}>−</button>
      <button type="button" aria-label="Закрыть" onClick={() => window.api?.windowClose()}>×</button>
    </div></header>}
    <section className="account-card">
    <div className="account-brand">Lull</div>
    <h1>Твоя музыка с тобой</h1>
    <p>Войди, чтобы сохранить любимые треки и продолжить слушать на другом устройстве.</p>
    <button type="button" disabled={busy} onClick={() => {
      setBusy(true); setError('');
      void signIn().catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
    }}>{busy ? 'Открываем Google…' : 'Продолжить с Google'}</button>
    <p className="account-note">При входе Google отдельно запросит разрешение читать твои плейлисты и понравившиеся видео YouTube.</p>
    {error && <p role="alert">{error}</p>}
  </section></main>;
}
