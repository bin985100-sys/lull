import { useEffect, useState } from 'react';
import { type CoverColors, fallbackColors } from './cover-colors';
import { extractCover } from './extract-cover';
const cache=new Map<string,Promise<CoverColors>>();
export function useCoverColors(uri?:string,seed='lull'){
 const [result,setResult]=useState<{uri:string;colors:CoverColors}|null>(null);
 useEffect(()=>{if(!uri)return;let live=true;let job=cache.get(uri);if(!job){job=extractCover(uri).catch(e=>{cache.delete(uri);throw e;});cache.set(uri,job);if(cache.size>40)cache.delete(cache.keys().next().value!);}void job.then(colors=>{if(live)setResult({uri,colors});},()=>{/* Keep the deterministic fallback for unavailable covers. */});return()=>{live=false;};},[uri]);
 return result&&result.uri===uri?result.colors:fallbackColors(seed);
}
