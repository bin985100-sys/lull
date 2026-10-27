import { useEffect, useState, type ReactNode } from 'react';
import { DISCORD_CLIENT_ID } from '../../shared/config';
import type { AccountState, DiscordStatus } from '../../shared/types';
import { api } from '../api';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { BrandIcon, type Brand } from './BrandIcon';

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="set-row">
      <span className="lbl"><b>{label}</b>{hint && <span>{hint}</span>}</span>
      {children}
    </div>
  );
}

/** Шапка подключения: фирменный значок, статус, действие. */
function Hero({ brand, title, status, ok, children }: { brand: Brand; title: string; status: string; ok?: boolean; children?: ReactNode }) {
  return (
    <div className="int-hero">
      <BrandIcon brand={brand} size={56} radius={15} />
      <span className="lbl">
        <b>{title}</b>
        <span className={ok ? 'int-ok' : undefined}>{ok && <i className="int-dot" />}{status}</span>
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{children}</span>
    </div>
  );
}

// --- YouTube Music -----------------------------------------------------------

export function YoutubeSection() {
  const [acc, setAcc] = useState<AccountState | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useUi((s) => s.toast);
  const load = () => void api.ytAccount().then(setAcc).catch(() => setAcc({ signedIn: false, channels: [] }));
  useEffect(load, []);
  const windowLogin = async () => {
    setBusy(true);
    try {
      if (await api.ytLogin()) (toast('Аккаунт подключён'), useUi.getState().bumpAccount());
    } finally {
      setBusy(false);
      load();
    }
  };
  if (!acc) return <span className="muted">Проверяем…</span>;
  if (!acc.signedIn)
    return (
      <>
        <Hero brand="ytmusic" title="YouTube Music" status="Не подключён" />
        <Row label="Войти в аккаунт Google" hint="Откроется окно входа Google. Пароль вводится на странице Google — приложение его не видит. После входа появятся твои плейлисты, понравившиеся и личные рекомендации.">
          <button type="button" className="btn light" disabled={busy} onClick={() => void windowLogin()}>{busy ? 'Ждём вход…' : 'Войти'}</button>
        </Row>
      </>
    );
  const current = acc.channels.find((c) => c.selected);
  return (
    <>
      <Hero brand="ytmusic" title="YouTube Music" status={acc.broken ? 'Вход не принимается — работаю без аккаунта' : current ? `Подключён · ${current.name}` : 'Подключён'} ok={!acc.broken}>
        <button type="button" className="btn danger sm" onClick={() => void api.ytLogout().then(() => (useUi.getState().bumpAccount(), load()))}>Выйти</button>
      </Hero>
      {acc.broken && (
        <Row label="YouTube Music не принимает этот вход" hint="Сессия устарела — выйди и войди снова. Пока музыка играет без аккаунта.">
          <button type="button" className="btn light" onClick={() => void api.ytLogout().then(() => (useUi.getState().bumpAccount(), load()))}>Выйти</button>
        </Row>
      )}
      <span style={{ fontSize: 15, fontWeight: 600 }}>Канал</span>
      {acc.channels.map((c) => (
        <button key={c.pageId ?? 'main'} type="button" className="set-row" style={{ textAlign: 'left', cursor: 'pointer', borderColor: c.selected ? 'rgba(255,255,255,.4)' : undefined }} onClick={() => void api.ytSelectChannel(c.pageId ?? null).then(() => (useUi.getState().bumpAccount(), load()))}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {c.photo ? <img src={api.imageUrl(c.photo)} alt="" width={40} height={40} style={{ borderRadius: '50%' }} /> : <span className="kbd" style={{ width: 40, height: 40, borderRadius: '50%', justifyContent: 'center' }}>{c.name[0]}</span>}
            <span className="lbl"><b>{c.name}</b>{c.handle && <span>{c.handle}</span>}</span>
          </span>
          {c.selected && <span style={{ color: 'var(--ok)', fontWeight: 700, fontSize: 14 }}>Выбран</span>}
        </button>
      ))}
      <span className="muted small">Плейлисты и понравившиеся треки аккаунта — в Библиотеке.</span>
    </>
  );
}

// --- Discord -----------------------------------------------------------------

export function DiscordSection() {
  const s = useSettings();
  const [id, setId] = useState(s.discordClientId);
  const [st, setSt] = useState<DiscordStatus | null>(null);
  const cur = usePlayer((p) => p.current());
  useEffect(() => {
    let alive = true;
    const poll = () => void api.discordStatus().then((x) => alive && setSt(x)).catch(() => alive && setSt({ connected: false }));
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [s.discordRpc, s.discordClientId]);
  const hasId = !!(s.discordClientId || DISCORD_CLIENT_ID);
  const status = !s.discordRpc ? 'Выключено' : !hasId ? 'Нужен Client ID' : st?.connected ? `Подключён · ${st.user?.name ?? ''}` : 'Ищем запущенный Discord…';
  return (
    <>
      <Hero brand="discord" title="Discord" status={status} ok={s.discordRpc && hasId && !!st?.connected}>
        <button type="button" role="switch" aria-checked={s.discordRpc} aria-label="Показывать в Discord" className="switch" onClick={() => s.set('discordRpc', !s.discordRpc)} />
      </Hero>
      <span className="muted small">Друзья увидят в твоём профиле, что ты слушаешь: трек, исполнителя, обложку и сколько осталось. Нужен запущенный Discord на этом компьютере — входить отдельно не надо.</span>
      <div className="dc-preview" aria-label="Как это выглядит в Discord">
        <span className="dc-user">
          {st?.user?.avatar ? <img src={st.user.avatar} alt="" /> : <span className="dc-ava" />}
          <b>{st?.user?.name ?? 'Ты'}</b>
        </span>
        <span className="dc-label">Слушает</span>
        <span className="dc-act">
          {cur?.thumb ? <img src={api.imageUrl(cur.thumb)} alt="" /> : <BrandIcon brand="discord" size={64} radius={10} />}
          <span className="lbl">
            <b className="ell">{cur?.title ?? 'Название трека'}</b>
            <span className="ell">{cur ? cur.artists.map((a) => a.name).join(', ') : 'Исполнитель'}</span>
            <span className="dc-bar"><i /></span>
          </span>
        </span>
        <span className="dc-btn">Слушать</span>
      </div>
      {!DISCORD_CLIENT_ID && (
        <Row label="Client ID приложения" hint="Создай приложение на discord.com/developers и вставь его Application ID — его название будет видно в статусе">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="text-input" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} placeholder="123456789012345678" aria-label="Client ID" style={{ width: 220 }} />
            <button type="button" className="btn sm" onClick={() => s.set('discordClientId', id)} disabled={id === s.discordClientId}>Сохранить</button>
          </div>
        </Row>
      )}
    </>
  );
}
