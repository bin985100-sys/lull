import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('./search-prefix.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {SearchPrefixes}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const aist={id:'k7Coe5G-l74',title:'AIST',artists:[{name:'FRIENDLY THUG 52 NGG'}]};
const empty={tracks:[]};
test('a discovered recording completes a prefix without replacing the exact artist result',()=>{
 const index=new SearchPrefixes([aist]);
 const exactArtist={...empty,top:{kind:'artist',id:'ais',title:'AIS'}};
 assert.deepEqual(index.complete('ais',exactArtist),[aist]);
 assert.equal(exactArtist.top.title,'AIS');
 assert.deepEqual(index.complete('aist',empty),[]);
 assert.deepEqual(index.complete('ai', {tracks:[aist]}),[]);
 assert.deepEqual(index.complete('a',empty),[]);
 assert.deepEqual(index.complete('random',empty),[]);
});
test('completion metadata survives restart and duplicate learning',()=>{
 const index=new SearchPrefixes([aist]);index.learn([aist]);
 assert.equal(index.snapshot().length,1);
 assert.deepEqual(new SearchPrefixes(index.snapshot()).complete('AIS',empty),[aist]);
});
