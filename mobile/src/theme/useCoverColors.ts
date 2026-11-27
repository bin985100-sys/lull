import { useEffect, useState } from 'react';
import { type CoverColors, fallbackColors } from './cover-colors';
import { extractCover } from './extract-cover';
import { useConnectivity } from '@/store/connectivity';
const cache=new Map<string,Promise<CoverColors>>();
const neutral:CoverColors={deep:'#0a0b0d',main:'#30333a',accent:'#22252c',light:'#cdd0d6'};
export function useCoverColors(uri?:string,seed='lull'){
 const epoch=useConnectivity(s=>s.epoch);
 const [result,setResult]=useState<{uri:string;colors:CoverColors}|null>(null);
 useEffect(()=>{if(!uri)return;let live=true,attempt=0,timer:ReturnType<typeof setTimeout>|undefined;const load=()=>{let job=cache.get(uri);if(!job){job=extractCover(uri).catch(e=>{if(cache.get(uri)===job)cache.delete(uri);throw e;});cache.set(uri,job);if(cache.size>40)cache.delete(cache.keys().next().value!);}void job.then(colors=>{if(live)setResult({uri,colors});},()=>{if(live&&attempt++===0)timer=setTimeout(load,1200);});};load();return()=>{live=false;clearTimeout(timer);};},[uri,epoch]);
 return result&&result.uri===uri?result.colors:uri?neutral:fallbackColors(seed);
}
