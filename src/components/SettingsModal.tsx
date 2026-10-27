import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import type { DiagStep, HotkeyAction } from '../../shared/types';
import { BUILD } from '../../shared/config';
import { api, isDesktop } from '../api';
import { usePlayer } from '../store/player';
import { formatBytes } from '../lib/format';
import { useLibrary } from '../store/library';
import { EQ_PRESETS, useSettings, type Settings } from '../store/settings';
import { useUi } from '../store/ui';
import { useIsMobile } from './MobileChrome';
import { EQ_FREQS } from '../player/engine';
import { IClose, ISearch, IChevronLeft } from './icons';
import { BrandIcon, type Brand } from './BrandIcon';
import { DiscordSection, YoutubeSection } from './Integrations';

const NAV_BRAND: Record<string, Brand> = { youtube: 'ytmusic', discord: 'discord' };

const DESKTOP_ONLY = new Set(['keys', 'overlay', 'youtube', 'discord', 'relay']);
const ALL_SECTIONS: { title: string; items: [string, string][] }[] = [
  { title: 'Плеер', items: [['play', 'Воспроизведение'], ['sound', 'Звук и эквалайзер'], ['keys', 'Горячие клавиши']] },
  { title: 'Интерфейс', items: [['look', 'Внешний вид'], ['overlay', 'Оверлей']] },
  { title: 'Интеграции', items: [['youtube', 'YouTube Music'], ['discord', 'Discord']] },
  { title: 'Приложение', items: [['relay', 'Сервер Lull'], ['storage', 'Хранилище и кеш'], ['about', 'О приложении']] }
];
// В веб-версии и на телефоне нет глобальных клавиш, оверлея, Discord и входа в YouTube
const SECTIONS = isDesktop ? ALL_SECTIONS : ALL_SECTIONS.map((g) => ({ ...g, items: g.items.filter(([id]) => !DESKTOP_ONLY.has(id)) })).filter((g) => g.items.length);

const TITLES: Record<string, [string, string]> = {
  play: ['Воспроизведение', 'Очередь, переходы между треками и вывод звука.'],
  sound: ['Звук и эквалайзер', 'Эквалайзер на 10 полос и выравнивание громкости.'],
  keys: ['Горячие клавиши', 'Глобальные сочетания работают везде, остальные — когда окно приложения активно. Нажми на сочетание, чтобы его изменить.'],
  look: ['Внешний вид', 'Фон и анимации.'],
  youtube: ['YouTube Music', 'Аккаунт: твои плейлисты и понравившиеся треки, рекомендации под тебя.'],
  overlay: ['Оверлей', 'Текст песни поверх всех окон — например, поверх игры или браузера.'],
  discord: ['Discord', 'Показывать в профиле, что ты сейчас слушаешь.'],
  relay: ['Сервер Lull', 'Музыка через наш сервер в Нидерландах: работает там, где YouTube замедлен или SoundCloud заблокирован, и треки стартуют быстрее.'],
  storage: ['Хранилище и кеш', 'Скачанные треки и временные файлы.'],
  about: ['О приложении', '']
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="lbl"><b>{label}</b>{hint && <span>{hint}</span>}</span>
      {children}
    </div>
  );
}

function Toggle<K extends keyof Settings>({ k, label, hint }: { k: K; label: string; hint?: string }) {
  const value = useSettings((s) => s[k]) as boolean;
  const set = useSettings((s) => s.set);
  return (
    <Row label={label} hint={hint}>
      <button type="button" role="switch" aria-checked={value} aria-label={label} className="switch" onClick={() => set(k, !value as Settings[K])} />
    </Row>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function PlaySection() {
  const s = useSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === 'audiooutput'))).catch(() => {});
  }, []);
  return (
    <>
      <Toggle k="autoplay" label="Автовоспроизведение похожих" hint="Когда очередь закончится, играет «Волна» по последнему треку" />
      <Toggle k="gapless" label="Без пауз между треками" hint="Следующий трек загружается заранее" />
      <Row label="Кроссфейд" hint="Плавный переход между треками">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
          <input type="range" className="slider" min={0} max={12} value={s.crossfade} onChange={(e) => s.set('crossfade', Number(e.target.value))} aria-label="Длительность кроссфейда" style={{ flex: 1, ['--p' as string]: `${(s.crossfade / 12) * 100}%` }} />
          <b style={{ width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.crossfade ? `${s.crossfade} с` : 'нет'}</b>
        </div>
      </Row>
      <Row label="Качество потока" hint="Opus 160 кбит/с — лучшее качество, AAC 128 — максимальная совместимость, «Экономия» — для медленной сети">
        <Seg label="Качество потока" value={s.quality} options={[['auto', 'Авто'], ['opus', 'Opus 160'], ['aac', 'AAC 128'], ['low', 'Экономия']]} onChange={(v) => s.set('quality', v)} />
      </Row>
      <Row label="Клик по треку">
        <Seg label="Клик по треку" value={s.doubleClick} options={[['play', 'Играть сразу'], ['queue', 'В очередь']]} onChange={(v) => s.set('doubleClick', v)} />
      </Row>
      <Toggle k="restoreQueue" label="Восстанавливать очередь" hint="При запуске продолжать с того же места" />
      <Toggle k="pauseOnDeviceChange" label="Пауза при отключении устройства" hint="Например, когда отключились наушники" />
      <Row label="Устройство вывода">
        <select className="select" aria-label="Устройство вывода" value={s.outputDeviceId} onChange={(e) => s.set('outputDeviceId', e.target.value)}>
          <option value="">Системное по умолчанию</option>
          {devices.filter((d) => d.deviceId !== 'default' && d.deviceId).map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Устройство'}</option>
          ))}
        </select>
      </Row>
    </>
  );
}

function SoundSection() {
  const s = useSettings();
  const setBand = (i: number, v: number) => s.patch({ eqGains: s.eqGains.map((g, k) => (k === i ? v : g)), eqPreset: 'custom' });
  return (
    <>
      <Toggle k="eqEnabled" label="Эквалайзер" />
      <div className="chips">
        {Object.entries(EQ_PRESETS).map(([id, p]) => (
          <button key={id} type="button" aria-pressed={s.eqPreset === id} className={`chip ${s.eqPreset === id ? 'on' : ''}`} onClick={() => s.patch({ eqPreset: id, eqGains: p.gains, eqEnabled: true })}>{p.label}</button>
        ))}
        {s.eqPreset === 'custom' && <button type="button" className="chip on">Свой</button>}
      </div>
      <div className={`eq ${s.eqEnabled ? '' : 'off'}`}>
        {EQ_FREQS.map((f, i) => (
          <label key={f} className="eq-band">
            <b>{s.eqGains[i] > 0 ? '+' : ''}{s.eqGains[i]}</b>
            <input type="range" min={-12} max={12} step={1} value={s.eqGains[i]} aria-label={`${f} Гц`} onChange={(e) => setBand(i, Number(e.target.value))} onDoubleClick={() => setBand(i, 0)} />
            <span>{f >= 1000 ? `${f / 1000}к` : f}</span>
          </label>
        ))}
      </div>
      <Toggle k="normalize" label="Нормализация громкости" hint="Все треки звучат примерно на одном уровне" />
    </>
  );
}

const KEYS: [string, string][] = [
  ['Пробел', 'Пауза / воспроизведение'],
  ['Ctrl + →', 'Следующий трек'],
  ['Ctrl + ←', 'Предыдущий трек'],
  ['Shift + → / ←', 'Перемотка на 10 секунд'],
  ['Ctrl + ↑ / ↓', 'Громкость'],
  ['M', 'Выключить звук'],
  ['L', 'Нравится'],
  ['S', 'Перемешать'],
  ['R', 'Режим повтора'],
  ['Ctrl + K', 'Поиск'],
  ['F', 'Полноэкранный плеер'],
  ['Esc', 'Закрыть окно или плеер']
];

function OverlaySection() {
  const o = useSettings((s) => s.overlay);
  const hk = useSettings((s) => s.hotkeys.overlay);
  const set = useSettings((s) => s.set);
  const patch = (p: Partial<typeof o>) => set('overlay', { ...o, ...p });
  return (
    <>
      <Row label="Показывать оверлей" hint={hk ? `Быстро включить или выключить: ${hk}` : undefined}>
        <button type="button" role="switch" aria-checked={o.enabled} aria-label="Показывать оверлей" className="switch" onClick={() => patch({ enabled: !o.enabled })} />
      </Row>
      <Row label="Закрепить" hint="Закреплённый оверлей пропускает клики сквозь себя. Открепи, чтобы перетащить окно и изменить его размер">
        <button type="button" role="switch" aria-checked={o.locked} aria-label="Закрепить оверлей" className="switch" onClick={() => patch({ locked: !o.locked })} />
      </Row>
      <Row label="Строк одновременно">
        <Seg label="Строк" value={o.lines} options={[[1, 'Одна'], [2, 'Две']]} onChange={(v) => patch({ lines: v as 1 | 2 })} />
      </Row>
      <Row label="Размер текста">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
          <input type="range" className="slider" min={20} max={64} value={o.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} aria-label="Размер текста оверлея" style={{ flex: 1, ['--p' as string]: `${((o.fontSize - 20) / 44) * 100}%` }} />
          <b style={{ width: 52, textAlign: 'right' }}>{o.fontSize} px</b>
        </div>
      </Row>
    </>
  );
}

const GLOBAL_KEYS: [HotkeyAction, string][] = [
  ['playPause', 'Пауза / воспроизведение'],
  ['next', 'Следующий трек'],
  ['prev', 'Предыдущий трек'],
  ['like', 'Нравится'],
  ['volumeUp', 'Громче'],
  ['volumeDown', 'Тише'],
  ['overlay', 'Показать / скрыть оверлей'],
  ['showWindow', 'Открыть окно приложения']
];

/** Запись сочетания: нажми клавиши, Esc — отмена, Backspace — очистить. */
function KeyRecorder({ action }: { action: HotkeyAction }) {
  const value = useSettings((s) => s.hotkeys[action] ?? '');
  const set = useSettings((s) => s.set);
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setRec(false);
      const hk = useSettings.getState().hotkeys;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        set('hotkeys', { ...hk, [action]: '' });
        return setRec(false);
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[];
      if (mods.length === 0) return;
      const map: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space' };
      const key = map[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      set('hotkeys', { ...hk, [action]: [...mods, key].join('+') });
      setRec(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rec, action, set]);
  return (
    <button type="button" className={`kbd ${rec ? 'rec' : ''}`} style={{ minWidth: 120, justifyContent: 'center', height: 32, cursor: 'pointer' }} onClick={() => setRec(true)} aria-label="Изменить сочетание">
      {rec ? 'Нажми сочетание…' : value || 'Не задано'}
    </button>
  );
}

function KeysSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Глобальные — работают даже в свёрнутом окне</span>
      {GLOBAL_KEYS.map(([a, d]) => (
        <div key={a} className="set-row" style={{ padding: '10px 18px' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{d}</span>
          <KeyRecorder action={a} />
        </div>
      ))}
      <span style={{ fontSize: 15, fontWeight: 600, marginTop: 14 }}>В окне приложения</span>
      {KEYS.map(([k, d]) => (
        <div key={k} className="set-row" style={{ padding: '12px 18px' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{d}</span>
          <span className="kbd">{k}</span>
        </div>
      ))}
    </div>
  );
}

function LookSection() {
  const s = useSettings();
  const options: [Settings['background'], string, string][] = [
    ['cover', 'Живая обложка', 'radial-gradient(70% 80% at 30% 30%, #8a5a9c 0%, transparent 70%), radial-gradient(70% 80% at 80% 80%, #3a5aa8 0%, transparent 70%), #141218'],
    ['gradient', 'Градиент по цветам', 'radial-gradient(80% 90% at 50% 0%, #5B3FD1 0%, #0B0B0E 70%)'],
    ['mono', 'Монохром', 'radial-gradient(80% 90% at 40% 100%, #77777f 0%, #1a1a1e 70%)'],
    ['black', 'Чистый чёрный', '#0B0B0E']
  ];

  return (
    <>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Фон приложения</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {options.map(([id, label, bg]) => (
          <button key={id} type="button" aria-pressed={s.background === id} onClick={() => s.set('background', id)} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 16, border: `2px solid ${s.background === id ? '#F5F5F7' : 'transparent'}`, background: 'rgba(255,255,255,.04)', textAlign: 'left' }}>
            <span style={{ height: 96, borderRadius: 10, background: bg, filter: id === 'cover' ? 'blur(3px)' : undefined, border: '1px solid rgba(255,255,255,.06)' }} />
            <span style={{ fontSize: 14, fontWeight: s.background === id ? 700 : 600 }}>{label}</span>
          </button>
        ))}
      </div>
      <Toggle k="animatedBg" label="Анимированный фон" hint="Цвета медленно перетекают за интерфейсом" />
      <Toggle k="waveIntro" label="Заставка «Волны»" hint="Обложки закручиваются в вихрь — показывается один раз, при первом входе в волну" />
      <Row label="Показать заставку снова" hint="При следующем входе в волну — заставка и кнопка запуска">
        <button type="button" className="btn sm" onClick={() => (useSettings.getState().set('waveIntroSeen', false), useSettings.getState().set('waveStarted', false), useUi.getState().toast('Заставка покажется при следующем входе в волну'))}>Сбросить</button>
      </Row>
      <Toggle k="uiSounds" label="Звуки интерфейса" hint="Короткие звуки анимаций" />
    </>
  );
}

function StorageSection() {
  const [info, setInfo] = useState<{ bytes: number; downloadsBytes: number } | null>(null);
  const downloads = useLibrary((s) => s.downloads);
  const toast = useUi((s) => s.toast);
  const load = () => void api.cacheInfo().then(setInfo).catch(() => {});
  useEffect(load, [downloads]);
  return (
    <>
      <Row label="Скачанные треки" hint={`${Object.keys(downloads).length} шт. · ${info ? formatBytes(info.downloadsBytes) : '…'}`}>
        <span className="muted small">Управление — в Библиотеке → Скачанное</span>
      </Row>
      <Row label="Кеш" hint={info ? formatBytes(info.bytes) : '…'}>
        <button type="button" className="btn sm" onClick={() => void api.clearCache().then(() => (toast('Кеш очищен'), load()))}>Очистить</button>
      </Row>
    </>
  );
}

function RelaySection() {
  const relay = useSettings((s) => s.relay);
  const set = useSettings((s) => s.set);
  const [draft, setDraft] = useState(relay);
  const [state, setState] = useState<{ ok: boolean; ms: number; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async (raw?: string) => {
    setBusy(true);
    setState(await api.relayHealth(raw).catch((e) => ({ ok: false, ms: 0, detail: String(e) })));
    setBusy(false);
  };
  useEffect(() => void check(), []);
  const save = async () => {
    const raw = draft.trim();
    if (raw) {
      setBusy(true);
      const r = await api.relayHealth(raw).catch((e) => ({ ok: false, ms: 0, detail: String(e) }));
      setState(r);
      setBusy(false);
      if (!r.ok) return;
    }
    set('relay', raw);
    useUi.getState().toast(raw ? 'Сервер подключён' : 'Сервер отключён', 'ok');
  };
  return (
    <>
      <Toggle k="relayOn" label="Слушать через сервер Lull" hint="Поиск, звук и тексты идут через сервер. Выключи, если YouTube у тебя работает напрямую быстро" />
      <Row label="Состояние" hint={busy ? 'Проверяю…' : state ? (state.ok ? `Работает · ответ за ${state.ms} мс · ${state.detail}` : `Нет связи: ${state.detail}`) : '—'}>
        <button type="button" className="btn sm" disabled={busy} onClick={() => void check()}>Проверить</button>
      </Row>
      <div className="set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <span className="lbl"><b>Строка подключения</b><span>Её выдаёт скрипт установки сервера: lull://ключ@адрес:порт#отпечаток. Пусто — встроенный сервер приложения.</span></span>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="field" style={{ flex: 1, minWidth: 0, height: 44 }}><input value={draft} placeholder="lull://…" spellCheck={false} onChange={(e) => setDraft(e.target.value)} aria-label="Строка подключения к серверу Lull" /></label>
          <button type="button" className="btn light sm" disabled={busy || draft.trim() === relay} onClick={() => void save()}>Сохранить</button>
        </div>
      </div>
    </>
  );
}

function AboutSection() {
  const [v, setV] = useState('');
  useEffect(() => void api.appVersion().then(setV), []);
  return (
    <>
      <Row label="Версия" hint={`${v} · сборка ${BUILD}`}><span /></Row>
      <Row label="Источники" hint="Каталог — YouTube Music; звук — YouTube (сервер Lull, встроенный клиент или yt-dlp), запасной — SoundCloud; тексты — LRCLIB, Better Lyrics"><span /></Row>
      <DiagBlock />
    </>
  );
}

/** Проверка воспроизведения: каким способом трек открывается и что отвечает каждый. */
function DiagBlock() {
  const cur = usePlayer((p) => p.current());
  const [steps, setSteps] = useState<DiagStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!cur) return;
    setBusy(true);
    setSteps(null);
    try {
      setSteps(await api.diagnose(cur));
    } catch (e) {
      setSteps([{ name: 'Проверка', ok: false, ms: 0, detail: String((e as Error).message) }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Row label="Проверка воспроизведения" hint={cur ? `Проверить «${cur.title}» всеми способами — встроенный клиент, yt-dlp и SoundCloud` : 'Включи любой трек — проверим его'}>
        <button type="button" className="btn light sm" disabled={!cur || busy} onClick={() => void run()}>{busy ? 'Проверяю… до минуты' : 'Проверить'}</button>
      </Row>
      {steps && (
        <div className="diag">
          {steps.map((x) => (
            <div key={x.name} className={`diag-row ${x.ok ? 'ok' : 'bad'}`}>
              <i>{x.ok ? '✓' : '✕'}</i>
              <b>{x.name}</b>
              <span className="muted">{(x.ms / 1000).toFixed(1)} с</span>
              <span className="diag-detail">{x.detail}</span>
            </div>
          ))}
        </div>
      )}
      <Row label="Журнал" hint="Файл player.log со всеми ошибками — его можно просто переслать">
        <button type="button" className="btn sm" onClick={() => void api.openLogs()}>Открыть папку</button>
      </Row>
    </>
  );
}

export function SettingsModal() {
  const open = useUi((s) => s.settings);
  const section = useUi((s) => s.settingsSection);
  const openSettings = useUi((s) => s.openSettings);
  const close = useUi((s) => s.closeSettings);
  const [q, setQ] = useState('');
  const mobile = useIsMobile();
  const [mBody, setMBody] = useState(false);
  useEffect(() => { if (!open) setMBody(false); }, [open]);
  const [title, sub] = TITLES[section] ?? TITLES.play;
  const filtered = SECTIONS.map((g) => ({ ...g, items: g.items.filter(([, l]) => l.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.items.length);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="set-title" className={`dialog ${mobile ? (mBody ? 'm-set body' : 'm-set nav') : ''}`} initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.985 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}>
            <aside className="set-nav">
              {mobile && (
                <div className="m-set-head">
                  <h1 style={{ fontSize: 24, fontWeight: 800 }}>Настройки</h1>
                  <button type="button" className="ic ic-40 filled" aria-label="Закрыть настройки" onClick={close}><IClose size={16} /></button>
                </div>
              )}
              <label className="field">
                <ISearch size={16} />
                <span className="sr">Поиск настроек</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск настроек" />
              </label>
              {filtered.map((g) => (
                <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="grp-title">{g.title}</span>
                  {g.items.map(([id, label]) => (
                    <button key={id} type="button" aria-current={section === id ? 'page' : undefined} className={`nav-item ${section === id ? 'on' : ''}`} onClick={() => (openSettings(id), setMBody(true))}>{NAV_BRAND[id] && <BrandIcon brand={NAV_BRAND[id]} size={24} radius={7} />}{label}</button>
                  ))}
                </div>
              ))}
            </aside>
            <section className="set-body">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                {mobile && <button type="button" className="ic ic-40 filled" aria-label="Назад к разделам" onClick={() => setMBody(false)}><IChevronLeft size={18} /></button>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                  <h1 id="set-title" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em' }}>{title}</h1>
                  {sub && <span className="muted">{sub}</span>}
                </div>
                <button type="button" className="ic ic-40 filled" aria-label="Закрыть настройки" onClick={close}><IClose size={16} /></button>
              </div>
              <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section === 'play' && <PlaySection />}
                {section === 'sound' && <SoundSection />}
                {section === 'keys' && <KeysSection />}
                {section === 'look' && <LookSection />}
                {section === 'discord' && <DiscordSection />}
                {section === 'youtube' && <YoutubeSection />}
                {section === 'overlay' && <OverlaySection />}
                {section === 'relay' && <RelaySection />}
                {section === 'storage' && <StorageSection />}
                {section === 'about' && <AboutSection />}
              </motion.div>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
