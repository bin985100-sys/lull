import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('./stream-file.ts',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')],bundle:true,platform:'node',format:'esm',write:false});
const {smallMedia}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const base=global.fetch;afterEach(()=>{global.fetch=base;});
test('unknown source size is discovered from actual complete bytes',async()=>{
 global.fetch=async()=>new Response(new Uint8Array([1,2,3]));
 assert.deepEqual(await smallMedia('https://fixture.invalid/audio',0),Buffer.from([1,2,3]));
});
test('declared or actual incomplete sources are rejected',async()=>{
 global.fetch=async()=>new Response('abc',{headers:{'content-length':'4'}});
 await assert.rejects(smallMedia('https://fixture.invalid/audio',0),/incomplete/);
 global.fetch=async()=>new Response('abc',{headers:{'content-length':'3'}});
 await assert.rejects(smallMedia('https://fixture.invalid/audio',4),/changed/);
});
test('size bound applies even without headers and cancels the response',async()=>{
 let cancelled=false;
 global.fetch=async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(5));},cancel(){cancelled=true;}}));
 await assert.rejects(smallMedia('https://fixture.invalid/audio',0,8),/oversized/);
 assert.equal(cancelled,true);
});
test('known large videos never start a download',async()=>{
 let requests=0;global.fetch=async()=>{requests++;throw Error('unexpected');};
 await assert.rejects(smallMedia('https://fixture.invalid/video',9,8),/limit/);
 assert.equal(requests,0);
});
test('a partial or forbidden source is never presented as complete',async()=>{
 for(const status of [206,403]){
  global.fetch=async()=>new Response('abc',{status});
  await assert.rejects(smallMedia('https://fixture.invalid/audio',3),new RegExp(String(status)));
 }
});
