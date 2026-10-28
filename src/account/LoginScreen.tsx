import { useState } from 'react';
import { signIn } from './client';
import './account.css';
import googleLogo from '../assets/providers/google.png';
import discordLogo from '../assets/providers/discord.svg';

export function LoginButtons({ error: initialError = '' }: { error?: string }) {
  const [busy, setBusy] = useState<'google' | 'discord' | null>(null);
  const [error, setError] = useState(initialError);
  return <>
    {(['google', 'discord'] as const).map(provider => <button className="account-provider" key={provider} type="button" disabled={!!busy} onClick={() => {
      setBusy(provider); setError('');
      void signIn(provider).catch((e: Error) => setError(e.message)).finally(() => setBusy(null));
    }}><span className="account-provider-label">{busy === provider ? 'Открываем вход…' : `Продолжить с ${provider === 'google' ? 'Google' : 'Discord'}`}</span><span className={`account-provider-logo ${provider}`} aria-hidden="true"><img src={provider === 'google' ? googleLogo : discordLogo} alt="" draggable={false}/></span></button>)}
    {error && <p role="alert">{error}</p>}
  </>;
}

export function LoginScreen({ error = '' }: { error?: string }) {
  return <main className="account-screen">
    {window.api && <header className="account-window"><span>Lull</span><div>
      <button type="button" aria-label="Свернуть" onClick={() => window.api?.windowMinimize()}>−</button>
      <button type="button" aria-label="Закрыть" onClick={() => window.api?.windowClose()}>×</button>
    </div></header>}
    <section className="account-card">
    <div className="account-brand">Lull</div>
    <h1>Твоя музыка с тобой</h1>
    <p>Войди, чтобы сохранить любимые треки и продолжить слушать на другом устройстве.</p>
    <LoginButtons error={error}/>
    <p className="account-note">При входе через Google разреши доступ к YouTube: музыка подключится автоматически. Через Discord можно войти без подключения YouTube.</p>
    <p className="account-note"><a href="https://app.lull.website/privacy.html" target="_blank" rel="noopener noreferrer">Данные и конфиденциальность</a></p>
  </section></main>;
}
