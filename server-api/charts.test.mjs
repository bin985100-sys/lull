import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('./charts.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/\.\/importer$/},()=>({path:'match',namespace:'fixture'}));
 b.onResolve({filter:/electron\/store$/},()=>({path:'store',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='match' ? 'export const find=(...a)=>globalThis.match(...a);' : 'export const storeGet=()=>globalThis.saved;export const storeSet=(k,v)=>globalThis.saved=v;'}));
}}]});
const load=()=>import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')+'#'+Math.random());
test('chart preserves source order despite concurrent matching and skips unmatched entries',async()=>{
 globalThis.saved=undefined;
 const songs=Array.from({length:7},(_,i)=>({name:'Song '+i,artistName:'Artist '+i}));
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({feed:{updated:'2026-11-16T00:00:00Z',results:songs}})});
 globalThis.match=async(q,strict)=>{assert.equal(strict,true);const i=Number(q.title.slice(-1));await new Promise(r=>setTimeout(r,(7-i)*2));return i===2 ? null : {id:'track'+i,title:q.title,artists:[{name:q.artist}]};};
 try{const m=await load();const [section]=await m.publicCharts();assert.deepEqual(section.items.map(t=>t.title),['Song 0','Song 1','Song 3','Song 4','Song 5','Song 6']);assert.match(section.subtitle,/Apple Music/);assert.match(section.title,/России/);}finally{globalThis.fetch=oldFetch;}
});
test('failed source keeps the last good chart and never substitutes regional explore tracks',async()=>{
 globalThis.saved={at:Date.now()-8*3600_000,updated:'2026-11-15T00:00:00Z',tracks:[{id:'known',title:'Known',artists:[{name:'Known'}]}]};
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline');};
 try{const m=await load();const [section]=await m.publicCharts();assert.equal(section.items[0].id,'known');}finally{globalThis.fetch=oldFetch;}
});
