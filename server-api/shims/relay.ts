// На сервере всё ходит напрямую — он сам и есть «сервер Lull»
export const relayOn = () => false;
export const goesViaRelay = () => false;
export const markRelayDown = (_e?: unknown) => {};
export function relayApi(): Promise<Response> {
  return Promise.reject(new Error('relay недоступен на сервере'));
}
export function xfetch(input: any, init: any = {}): Promise<Response> {
  const { direct: _d, ...rest } = init ?? {};
  return globalThis.fetch(input, { ...rest, signal: rest.signal ?? AbortSignal.timeout(15000) });
}
