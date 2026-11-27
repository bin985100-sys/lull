import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Track } from '@/api/audius';
import { currentTrack, player, usePlayer } from '@/player/player';
import { useTaste, type WaveMode } from '@/store/taste';
import { useConnectivity } from '@/store/connectivity';
import { buildWave } from './engine';

type WaveSession = {
  autoContinue: boolean; active: boolean; busy: boolean;
  seed: Track | null; tracks: Track[]; error: string | null;
};
export const useWaveSession = create<WaveSession>()(persist((): WaveSession => ({
  autoContinue: true, active: false, busy: false, seed: null, tracks: [], error: null,
}), { name: 'lull.wave.v1', storage: createJSONStorage(() => AsyncStorage), partialize: s => ({ autoContinue: s.autoContinue }) }));

const key = (t: Track) => `${t.source || 'audius'}:${t.id}`;
type Intent = 'preview' | 'continue' | 'manual';
type Request = {
  controller: AbortController; seed: Track; mode: WaveMode; session: number;
  starting: boolean; intent: Intent; queue: Track[]; done: Promise<boolean>;
};
let request: Request | null = null;
let pending: { seed: string; session: number; tracks: Track[]; queue: Track[]; intent: Intent } | null = null;
let applying = false, waveSession = -1, continued = '';
let prepared: { seed: string; mode: WaveMode; length: number; tracks: Track[]; session: number } | null = null;
let failed: { seed: string; session: number; at: number } | null = null;

function cancel() {
  request?.controller.abort(); request = null; pending = null;
}
function preserveUpcoming(seed: Track, tracks: Track[]) {
  const s = usePlayer.getState(), seen = new Set(s.queue.map(key));
  return [seed, ...s.queue.slice(s.index + 1), ...tracks.slice(1).filter(t => !seen.has(key(t)))];
}
function apply(seed: Track, tracks: Track[], intent: Intent) {
  const s = usePlayer.getState(), cur = currentTrack(s);
  if (!cur || key(cur) !== key(seed)) return;
  if (intent === 'continue' && s.continueQueue === false) return;
  if (!s.playing) { pending = { seed: key(seed), session: s.session, tracks, queue: s.queue, intent }; return; }
  applying = true;
  try {
    waveSession = s.session;
    continued = `${s.session}:${key(seed)}`;
    useWaveSession.setState({ active: true, error: null });
    player.startWave(tracks);
  } finally { applying = false; }
}

function begin(seed: Track, mode: WaveMode, intent: Intent): Promise<boolean> {
  const state = usePlayer.getState(), length = useTaste.getState().reco.waveLength;
  if (request && key(request.seed) === key(seed) && request.mode === mode && request.session === state.session) {
    if (intent !== 'preview') request.intent = intent;
    if (intent === 'manual' && !state.playing) player.toggle();
    return request.done;
  }
  cancel();
  const r: Request = { controller: new AbortController(), seed, mode, session: state.session,
    starting: intent === 'manual' && (!currentTrack(state) || key(currentTrack(state)!) !== key(seed)),
    intent, queue: state.queue, done: Promise.resolve(false) };
  request = r;
  failed = null;
  const cached = prepared?.seed === key(seed) && prepared.mode === mode && prepared.length === length && prepared.session === state.session ? prepared.tracks : null;
  useWaveSession.setState({ busy: !cached, seed, tracks: cached || [seed], error: null });

  // Prepare recommendations alongside audio. Old status events must not cancel
  // a manual launch while the audio subsystem is still initializing.
  const playback = intent === 'manual' ? (() => {
    if (r.starting) return Promise.resolve(player.play([seed], seed.id, { shuffle: false }));
    if (!state.playing) player.toggle();
    return Promise.resolve();
  })() : Promise.resolve();
  const result = cached ? Promise.resolve(cached) : buildWave(seed, mode, length, r.controller.signal);
  r.done = Promise.all([playback, result]).then(([, list]) => {
    const now = usePlayer.getState(), cur = currentTrack(now);
    if (request !== r || r.controller.signal.aborted || !cur || key(cur) !== key(seed) || now.session !== r.session) return false;
    if (list.length < 2) throw Error('Пока не нашли похожие треки. Попробуй другой характер волны.');
    prepared = { seed: key(seed), mode, length, tracks: list, session: now.session };
    useWaveSession.setState({ seed, tracks: list, error: null });
    if (r.intent !== 'preview') apply(seed, now.queue === r.queue ? list : preserveUpcoming(seed, list), r.intent);
    return true;
  }).catch(e => {
    if (request === r && !r.controller.signal.aborted) {
      failed = { seed: key(seed), session: r.session, at: Date.now() };
      useWaveSession.setState({ active: waveSession === usePlayer.getState().session,
        error: e instanceof Error ? e.message : 'Не удалось собрать волну. Попробуй ещё раз.' });
    }
    return false;
  }).finally(() => {
    if (request === r) { request = null; useWaveSession.setState({ busy: false }); }
  });
  return r.done;
}

/** A library song gets its own cover deck without replacing the library queue. */
export function prepareTrackWave(seed: Track) {
  const s = usePlayer.getState(), ui = useWaveSession.getState(), r = useTaste.getState().reco;
  if (ui.active || request?.intent === 'manual' || useConnectivity.getState().offline) return;
  if (prepared?.seed === key(seed) && prepared.mode === r.waveMode && prepared.length === r.waveLength && prepared.session === s.session) return;
  if (failed?.seed === key(seed) && failed.session === s.session && Date.now() - failed.at < 10000) return;
  void begin(seed, r.waveMode, 'preview');
}

/** An explicit launch can always retry, including after an offline failure. */
export function startPersonalWave(seed: Track, mode?: WaveMode) {
  return begin(seed, mode ?? useTaste.getState().reco.waveMode, 'manual');
}

/** One owner for recommendations; the audio player has no separate radio task. */
export function startWaveContinuation() {
  let context = '';
  const check = () => {
    if (applying) return;
    const s = usePlayer.getState(), cur = currentTrack(s), ui = useWaveSession.getState();
    if (request?.starting && s.session !== request.session) {
      if (cur && key(cur) === key(request.seed)) {
        request.starting = false; request.session = s.session; request.queue = s.queue;
      } else cancel();
    }
    const nextContext = `${s.session}:${cur ? key(cur) : ''}`;
    if (context !== nextContext) {
      context = nextContext;
      if (request && !request.starting && (s.session !== request.session || !cur || key(cur) !== key(request.seed))) cancel();
      if (pending && (pending.session !== s.session || !cur || pending.seed !== key(cur))) pending = null;
      if (waveSession !== s.session) {
        waveSession = -1;
        useWaveSession.setState({ active: false, busy: !!request, seed: cur || null, tracks: cur ? [cur] : [], error: null });
      }
    }
    if (!cur) return;
    if (pending && s.playing) {
      const next = pending; pending = null;
      apply(cur, s.queue === next.queue ? next.tracks : preserveUpcoming(cur, next.tracks), next.intent);
      return;
    }
    if (!s.playing || s.error || s.continueQueue === false || !ui.autoContinue || s.repeat !== 'off' || useConnectivity.getState().offline) return;
    const remaining = s.queue.length - s.index - 1;
    if (remaining > (waveSession === s.session ? 2 : 0) || continued === nextContext) return;
    if (request) {
      if (!request.starting && request.session === s.session && key(request.seed) === key(cur) && request.intent === 'preview') request.intent = 'continue';
      return;
    }
    if (failed?.seed === key(cur) && failed.session === s.session && Date.now() - failed.at < 10000) return;
    void begin(cur, useTaste.getState().reco.waveMode, 'continue');
  };
  const offPlayer = usePlayer.subscribe(check);
  const offSettings = useWaveSession.subscribe((s, p) => {
    if (s.autoContinue === p.autoContinue) return;
    if (!s.autoContinue && pending?.intent === 'continue') pending = null;
    if (!s.autoContinue && request?.intent === 'continue') { cancel(); useWaveSession.setState({ busy: false }); }
    else if (s.autoContinue) check();
  });
  const offNetwork = useConnectivity.subscribe((s, p) => {
    if (p.offline && !s.offline) { failed = null; check(); }
  });
  check();
  return () => { offPlayer(); offSettings(); offNetwork(); cancel(); };
}
