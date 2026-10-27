/**
 * Аудиодвижок: две «деки» (HTMLAudioElement) для кроссфейда и бесшовных переходов,
 * общий граф Web Audio: дека → нормализация → эквалайзер (10 полос) → громкость → выход.
 */

import { PITCH_WORKLET_SOURCE } from './pitchWorklet';

export const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

interface Deck {
  el: HTMLAudioElement;
  fade: GainNode | null;
  norm: GainNode | null;
  key: string | null;
  /** Пользователь хочет, чтобы эта дека играла */
  want: boolean;
  /** Сколько раз уже перезапрашивали поток */
  tries: number;
  watchdog?: ReturnType<typeof setTimeout>;
}

/** Сколько ждём начала звука, прежде чем перезапросить поток */
const STALL_MS = 20_000;
/** Первый старт трека дольше: yt-dlp иногда отвечает за 10–20 с — не дёргаем его зря */
const FIRST_LOAD_MS = 45_000;
const MAX_TRIES = 2;

export interface EngineEvents {
  time(position: number, duration: number): void;
  ended(): void;
  state(s: 'playing' | 'paused' | 'loading'): void;
  error(message: string): void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private decks: [Deck, Deck];
  private active = 0;
  private eq: BiquadFilterNode[] = [];
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freq = new Uint8Array(128);
  private energy = 0;
  private bus: GainNode | null = null;
  private pitchNode: AudioWorkletNode | null = null;
  private pitchSemis = 0;
  private rate = 1;
  private volume = 0.8;
  private eqGains = EQ_FREQS.map(() => 0);
  private eqOn = false;
  private fading = false;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Длительность трека по данным каталога — чтобы отличить обрыв потока от настоящего конца */
  expectedDuration = 0;

  constructor(readonly on: EngineEvents) {
    const mk = (): Deck => {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      return { el, fade: null, norm: null, key: null, want: false, tries: 0 };
    };
    this.decks = [mk(), mk()];
    this.decks.forEach((d, i) => this.bind(d, i));
  }

  private get cur() {
    return this.decks[this.active];
  }
  private get idle() {
    return this.decks[1 - this.active];
  }

  private bind(d: Deck, i: number) {
    const isActive = () => i === this.active;
    d.el.addEventListener('timeupdate', () => isActive() && this.on.time(d.el.currentTime, d.el.duration || 0));
    d.el.addEventListener('durationchange', () => isActive() && this.on.time(d.el.currentTime, d.el.duration || 0));
    d.el.addEventListener('playing', () => {
      clearTimeout(d.watchdog);
      d.tries = 0;
      if (isActive()) this.on.state('playing');
    });
    d.el.addEventListener('pause', () => isActive() && !this.fading && this.on.state('paused'));
    d.el.addEventListener('waiting', () => {
      if (!isActive()) return;
      this.on.state('loading');
      this.arm(d);
    });
    d.el.addEventListener('ended', () => {
      if (!isActive() || this.fading) return;
      // «Конец» сильно раньше длительности трека — это оборвался поток, а не трек доиграл:
      // продолжаем с того же места, а не перескакиваем на следующий
      const dur = Number.isFinite(d.el.duration) && d.el.duration > 0 ? d.el.duration : this.expectedDuration;
      console.warn(`[engine] конец трека на ${d.el.currentTime.toFixed(1)} из ${dur.toFixed(1)} с`);
      if (dur && d.el.currentTime < dur - 3 && d.tries < MAX_TRIES + 2) {
        console.warn('[engine] поток оборвался на', d.el.currentTime.toFixed(1), 'из', dur.toFixed(0), '— продолжаю');
        d.want = true;
        return this.retry(d);
      }
      this.on.ended();
    });
    d.el.addEventListener('error', () => {
      if (!isActive() || !d.el.src) return;
      clearTimeout(d.watchdog);
      // Ссылки YouTube протухают, запрос может оборваться — сначала тихо перезапрашиваем поток.
      // Посреди трека пробуем настойчивее: пропускать уже играющую песню хуже, чем подождать
      console.warn(`[engine] ошибка потока (код ${d.el.error?.code}: ${d.el.error?.message ?? ''}) на ${d.el.currentTime.toFixed(1)} с, попытка ${d.tries + 1}`);
      if (d.tries < (d.el.currentTime > 1 ? MAX_TRIES + 2 : MAX_TRIES)) return this.retry(d);
      d.want = false;
      const code = d.el.error?.code;
      this.on.error(code === 4 ? 'Трек недоступен для воспроизведения' : 'Ошибка загрузки потока');
    });
  }

  /** Сторож: если звук так и не пошёл — перезапрашиваем поток. */
  private arm(d: Deck) {
    clearTimeout(d.watchdog);
    if (!d.want) return;
    d.watchdog = setTimeout(() => {
      if (d !== this.cur || !d.want || d.el.paused === false && d.el.readyState >= 3) return;
      console.warn('[engine] поток не начался, перезапрашиваю', d.key);
      if (d.tries < MAX_TRIES) this.retry(d);
      else {
        d.want = false;
        d.el.pause();
        this.on.error('Трек не загружается — проверь интернет');
      }
    }, d.el.currentTime > 0.5 ? STALL_MS : FIRST_LOAD_MS);
  }

  private retry(d: Deck) {
    d.tries++;
    const pos = d.el.currentTime;
    const base = d.el.src.replace(/[?&]r=\d+$/, '');
    d.el.src = `${base}${base.includes('?') ? '&' : '?'}r=${Date.now()}`;
    if (pos > 0.5) d.el.currentTime = pos;
    if (d.want) {
      this.on.state('loading');
      this.arm(d);
      void this.safePlay(d.el);
    }
  }

  /** Граф создаётся лениво: AudioContext нужен только после первого запуска. */
  private ensureGraph() {
    if (this.ctx) return;
    // iPhone: играть как музыкальное приложение — в фоне, при заблокированном экране и с выключенным звонком
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    // Звонок или другое приложение прервали звук — после возврата продолжаем
    const revive = () => {
      if (ctx.state !== 'running' && this.decks.some((d) => !d.el.paused)) void ctx.resume().catch(() => {});
    };
    ctx.addEventListener('statechange', revive);
    document.addEventListener('visibilitychange', revive);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume ** 2;
    this.eq = EQ_FREQS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.1;
      b.gain.value = 0;
      return b;
    });
    for (let i = 0; i < this.eq.length - 1; i++) this.eq[i].connect(this.eq[i + 1]);
    this.eq[this.eq.length - 1].connect(this.master);
    this.master.connect(ctx.destination);
    // Анализатор для визуализации: живой фон, пульс обложки, спектр
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(this.analyser);
    // Общая шина: деки → шина → [сдвиг тональности] → эквалайзер
    this.bus = ctx.createGain();
    this.bus.connect(this.eq[0]);
    for (const d of this.decks) {
      d.el.volume = 1;
      const src = ctx.createMediaElementSource(d.el);
      d.norm = ctx.createGain();
      d.fade = ctx.createGain();
      src.connect(d.norm).connect(d.fade).connect(this.bus);
    }
    void this.loadPitch(ctx);
    this.applyEq();
  }

  private async resume() {
    this.ensureGraph();
    if (this.ctx!.state === 'suspended') await this.ctx!.resume();
  }

  /** Загрузить трек в активную деку. Если он уже предзагружен во второй — просто переключаемся. */
  async load(key: string, url: string, opts: { autoplay: boolean; startAt?: number }) {
    this.cancelFade();
    await this.resume();
    const old = this.cur;
    old.want = false;
    clearTimeout(old.watchdog);
    old.el.pause();
    // Предзагруженную деку берём, только если она загрузилась без ошибки
    if (this.idle.key === key && this.idle.el.src && !this.idle.el.error) {
      this.active = 1 - this.active;
    } else {
      this.cur.key = key;
      this.cur.el.src = url;
    }
    const d = this.cur;
    d.tries = 0;
    d.want = opts.autoplay;
    d.el.playbackRate = this.rate;
    d.fade!.gain.cancelScheduledValues(0);
    d.fade!.gain.value = 1;
    this.idle.fade!.gain.value = 0;
    if (opts.startAt) d.el.currentTime = opts.startAt;
    else if (d.el.currentTime > 0.5) d.el.currentTime = 0;
    this.on.state('loading');
    if (opts.autoplay) {
      this.arm(d);
      await this.safePlay(d.el);
    } else this.on.state('paused');
  }

  /** Предзагрузка следующего трека во вторую деку. */
  preload(key: string, url: string) {
    const d = this.idle;
    if (d.key === key) return;
    this.ensureGraph();
    d.key = key;
    d.el.src = url;
    d.el.load();
  }

  /** Плавный переход в предзагруженный трек. */
  async crossfade(key: string, url: string, seconds: number) {
    await this.resume();
    const ctx = this.ctx!;
    if (this.idle.key !== key) this.preload(key, url);
    const from = this.cur;
    const to = this.idle;
    this.fading = true;
    this.active = 1 - this.active;
    const t = ctx.currentTime;
    to.fade!.gain.cancelScheduledValues(t);
    to.fade!.gain.setValueAtTime(0, t);
    to.fade!.gain.linearRampToValueAtTime(1, t + seconds);
    from.fade!.gain.cancelScheduledValues(t);
    from.fade!.gain.setValueAtTime(from.fade!.gain.value, t);
    from.fade!.gain.linearRampToValueAtTime(0, t + seconds);
    to.el.currentTime = 0;
    to.el.playbackRate = this.rate;
    from.want = false;
    to.want = true;
    to.tries = 0;
    this.arm(to);
    await this.safePlay(to.el);
    this.fadeTimer = setTimeout(() => {
      from.el.pause();
      this.fading = false;
    }, seconds * 1000 + 100);
  }

  private cancelFade() {
    if (!this.fading) return;
    clearTimeout(this.fadeTimer);
    this.idle.el.pause();
    this.fading = false;
  }

  private async safePlay(el: HTMLAudioElement) {
    try {
      await el.play();
    } catch (e) {
      // AbortError — трек сменили; NotSupportedError — обработает событие error (с повтором)
      const name = (e as DOMException).name;
      if (name !== 'AbortError' && name !== 'NotSupportedError') this.on.error('Не удалось начать воспроизведение');
    }
  }

  async play() {
    await this.resume();
    const d = this.cur;
    d.want = true;
    // Поток упал или завис — перезапрашиваем, а не жмём play впустую
    if (d.el.src && (d.el.error || d.el.readyState === 0)) {
      d.tries = 0;
      return this.retry(d);
    }
    this.arm(d);
    await this.safePlay(d.el);
  }

  pause() {
    this.cancelFade();
    this.cur.want = false;
    clearTimeout(this.cur.watchdog);
    this.cur.el.pause();
  }

  seek(sec: number) {
    this.cancelFade();
    const el = this.cur.el;
    if (Number.isFinite(sec)) el.currentTime = Math.max(0, Math.min(sec, (el.duration || sec) - 0.25));
  }

  stop() {
    for (const d of this.decks) {
      d.want = false;
      clearTimeout(d.watchdog);
      d.el.pause();
      d.el.removeAttribute('src');
      d.el.load();
      d.key = null;
    }
  }

  get position() {
    return this.cur.el.currentTime;
  }
  get duration() {
    return this.cur.el.duration || 0;
  }
  get isFading() {
    return this.fading;
  }

  private async loadPitch(ctx: AudioContext) {
    try {
      const url = URL.createObjectURL(new Blob([PITCH_WORKLET_SOURCE], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.pitchNode = new AudioWorkletNode(ctx, 'pitch-shifter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      this.applyPitch();
    } catch (e) {
      console.warn('[engine] сдвиг тональности недоступен', e);
    }
  }

  private applyPitch() {
    if (!this.bus || !this.ctx) return;
    this.bus.disconnect();
    this.pitchNode?.disconnect();
    if (this.pitchNode && this.pitchSemis !== 0) {
      this.pitchNode.parameters.get('ratio')!.value = Math.pow(2, this.pitchSemis / 12);
      this.bus.connect(this.pitchNode).connect(this.eq[0]);
    } else {
      this.bus.connect(this.eq[0]);
    }
  }

  /** Тональность в полутонах (−12…+12), скорость не меняется. */
  setPitch(semitones: number) {
    this.pitchSemis = Math.max(-12, Math.min(12, semitones));
    this.applyPitch();
  }

  /** Скорость 0.5…2 с сохранением тона. */
  setRate(rate: number) {
    this.rate = Math.max(0.5, Math.min(2, rate));
    for (const d of this.decks) {
      d.el.preservesPitch = true;
      d.el.defaultPlaybackRate = this.rate;
      d.el.playbackRate = this.rate;
    }
  }

  /** Сглаженная энергия низких частот 0..1 — для пульсации фона и обложки. */
  getEnergy(): number {
    const a = this.analyser;
    if (!a || this.cur.el.paused) {
      this.energy *= 0.92;
      return this.energy;
    }
    a.getByteFrequencyData(this.freq);
    let sum = 0;
    for (let i = 1; i < 14; i++) sum += this.freq[i];
    const raw = Math.min(1, sum / (13 * 255) / Math.max(0.25, this.volume ** 2) * 0.9);
    this.energy += (raw - this.energy) * (raw > this.energy ? 0.35 : 0.08);
    return this.energy;
  }

  /** Спектр 0..255 в переданный массив (длина до 128). */
  getSpectrum(out: Uint8Array): boolean {
    if (!this.analyser || this.cur.el.paused) return false;
    this.analyser.getByteFrequencyData(this.freq);
    const step = Math.max(1, Math.floor(80 / out.length));
    for (let i = 0; i < out.length; i++) out[i] = this.freq[2 + i * step] ?? 0;
    return true;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    // Квадратичная кривая звучит естественнее линейной
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume ** 2, this.ctx.currentTime, 0.03);
    else for (const d of this.decks) d.el.volume = this.volume ** 2;
  }

  /** Нормализация: loudnessDb > 0 — трек громче эталона, приглушаем. */
  setNormalization(loudnessDb: number | null) {
    const d = this.cur;
    if (!d.norm) return;
    const gain = loudnessDb == null ? 1 : Math.min(2, Math.pow(10, -loudnessDb / 20));
    d.norm.gain.value = gain;
  }

  setEq(enabled: boolean, gains: number[]) {
    this.eqOn = enabled;
    this.eqGains = gains;
    this.applyEq();
  }

  private applyEq() {
    this.eq.forEach((b, i) => {
      b.gain.value = this.eqOn ? (this.eqGains[i] ?? 0) : 0;
    });
  }

  async setOutputDevice(deviceId: string) {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    try {
      if (ctx?.setSinkId) await ctx.setSinkId(deviceId || '');
    } catch {
      /* устройство пропало — остаёмся на текущем */
    }
  }
}
