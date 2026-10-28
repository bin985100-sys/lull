import { useState } from 'react';
import { signIn } from './client';
import './account.css';

export function LoginScreen({ error: initialError = '' }: { error?: string }) {
  const [busy, setBusy] = useState<'google' | 'discord' | null>(null);
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
    {(['google', 'discord'] as const).map(provider => <button key={provider} type="button" disabled={!!busy} onClick={() => {
      setBusy(provider); setError('');
      void signIn(provider).catch((e: Error) => setError(e.message)).finally(() => setBusy(null));
    }}>{busy === provider ? 'Открываем вход…' : `Продолжить с ${provider === 'google' ? 'Google' : 'Discord'}`}</button>)}
    <p className="account-note">При входе через Google разреши доступ к YouTube: музыка подключится автоматически. Через Discord можно войти без подключения YouTube.</p>
    {error && <p role="alert">{error}</p>}
  </section></main>;
}
