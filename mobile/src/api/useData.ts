import { startTransition, useCallback, useEffect, useEffectEvent, useState } from 'react';

import { ApiError } from './audius';

/* Небольшой кэш запросов: одинаковый ключ не грузится дважды за 5 минут. */
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 5 * 60e3;

export type DataState<T> = { data: T | undefined; loading: boolean; error: ApiError | null; reload(): void };

const isFresh=(entry:{at:number}|undefined)=>!!entry&&Date.now()-entry.at<TTL;

export function useData<T>(key: string | null, fn: (signal: AbortSignal) => Promise<T>): DataState<T> {
  const [nonce,setNonce]=useState(0);
  const [result,setResult]=useState<{key:string;nonce:number;data:T|undefined;error:ApiError|null}|null>(null);
  const fetchData=useEffectEvent((signal:AbortSignal)=>fn(signal));
  const hit=key ? cache.get(key) : undefined;
  const fresh=isFresh(hit)&&nonce===0;
  const current=result?.key===key&&result.nonce===nonce ? result : null;
  useEffect(()=>{
    if(!key)return;
    const c=cache.get(key);
    if(c&&Date.now()-c.at<TTL&&nonce===0)return;
    const ac=new AbortController();
    fetchData(ac.signal).then(data=>{
      if(ac.signal.aborted)return;
      cache.set(key,{at:Date.now(),data});startTransition(()=>setResult({key,nonce,data,error:null}));
    },e=>{if(!ac.signal.aborted)startTransition(()=>setResult({key,nonce,data:c?.data as T|undefined,error:e instanceof ApiError ? e : new ApiError('http',String(e?.message||e))}));});
    return()=>ac.abort();
  },[key,nonce]);
  const reload=useCallback(()=>{if(key)cache.delete(key);setNonce(n=>n+1);},[key]);
  return {data:key ? current?.data??hit?.data as T|undefined : undefined,loading:!!key&&!current&&!fresh,error:current?.error??null,reload};
}

/* Сбросить кэш подборок после изменения настроек вкуса */
export function invalidate(prefix: string) { for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k); }
