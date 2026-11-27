import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lull-wave-engine-'));
const T=(id,extra={})=>({id,source:'yt',title:id,artist:'Artist',artistId:'artist',streamable:true,duration:180,...extra});
const stubs={
 '@/api/lull':`export const lull={upNext:(...a)=>globalThis.__api.upNext(...a),artist:(...a)=>globalThis.__api.artist(...a),collection:async()=>({tracks:[]}),home:async()=>[]};`,
 '@/api/audius':`export const audius={artistTracks:async()=>[],related:async()=>[]};`,
 '@/store/library':`export const useLibrary={getState:()=>globalThis.__lib};`,
 '@/store/taste':`export const artistKey=t=>t.artistId||'n:'+t.artist.toLowerCase();export const monthKey=()=> 'now';export const prevMonthKey=()=> 'previous';export const useTaste={getState:()=>globalThis.__taste};`,
};
const plugin={name:'wave-engine-test',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:mobile}));}};
const out=path.join(tmp,'engine.mjs');await esbuild.build({entryPoints:[path.join(mobile,'src/reco/engine.ts')],bundle:true,platform:'node',format:'esm',outfile:out,plugins:[plugin],logLevel:'silent'});
const {buildWave,cleanup}=await import(pathToFileURL(out));
function reset(){globalThis.__lib={liked:[],history:[],favArtists:[]};globalThis.__taste={months:{},artistSkips:{},hiddenTracks:{},hiddenArtists:{},reco:{balance:2,noRepeatHours:2,useSkips:true,perArtist:2,similarArtists:true,timeOfDay:true}};globalThis.__api={upNext:async()=>Array.from({length:14},(_,i)=>T('r'+i)),artist:async()=>({top:[],similar:[]})};}
async function test(name,fn){reset();await fn();console.log('OK',name);}
await test('Ready track radio is returned without requesting slow artist pages',async()=>{let calls=0;__api.artist=()=>{calls++;return new Promise(()=>{});};const start=Date.now();const list=await buildWave(T('seed'),'sound',50,new AbortController().signal);assert.equal(list[0].id,'seed');assert.ok(list.length>8);assert.equal(calls,0);assert.ok(Date.now()-start<500);});
await test('A recent-only catalog still supplies a track wave',async()=>{__taste.months.now={artists:{},tracks:Object.fromEntries(Array.from({length:14},(_,i)=>['r'+i,{track:T('r'+i),last:Date.now(),skips:0}]))};const list=await buildWave(T('seed'),'sound',50,new AbortController().signal);assert.ok(list.length>8);});
await test('Hidden tracks stay hidden when the recent-listening filter is relaxed',async()=>{__taste.hiddenTracks.r0=true;__taste.months.now={artists:{},tracks:Object.fromEntries(Array.from({length:14},(_,i)=>['r'+i,{track:T('r'+i),last:Date.now(),skips:0}]))};const list=await buildWave(T('seed'),'sound',50,new AbortController().signal);assert.ok(list.length>2);assert.ok(!list.some(t=>t.id==='r0'));});
await test('Fallback loads a shared artist page only once',async()=>{__api.upNext=async()=>[];let count=0;__api.artist=async()=>{count++;return {top:[T('own')],similar:[]};};const list=await buildWave(T('seed'),'sound',25,new AbortController().signal);assert.equal(count,1);assert.deepEqual(list.map(t=>t.id),['seed','own']);});
await test('A hung optional artist endpoint has a bounded deadline',async()=>{__api.upNext=async()=>[T('next')];let aborted=false;__api.artist=(_id,s)=>{s.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});};const start=Date.now();const list=await buildWave(T('seed'),'sound',25,new AbortController().signal);assert.ok(Date.now()-start<4000);assert.equal(aborted,true);assert.deepEqual(list.map(t=>t.id),['seed','next']);});
await test('Cancellation exits even when a source ignores AbortSignal',async()=>{__api.upNext=()=>new Promise(()=>{});const ac=new AbortController();const done=buildWave(T('seed'),'sound',25,ac.signal);ac.abort();await assert.rejects(done,{name:'AbortError'});});
await test('Distinct providers with the same track ID are not removed as duplicates',async()=>{const list=cleanup([T('id'),T('id',{source:'audius'})]);assert.equal(list.length,2);});
console.log('7 recommendation-engine scenarios passed');
