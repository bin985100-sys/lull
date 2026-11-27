import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('src/player/stream-health.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {createStreamHealth}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const base={key:'session:track',wanted:true,loading:false,online:true,playing:true,buffering:false,loaded:true,time:0,duration:240};
const h=createStreamHealth();
assert.equal(h.sample(base,0).action,'wait');
assert.equal(h.sample({...base,time:100},100000).action,'wait');
assert.equal(h.sample({...base,time:100,playing:true,buffering:true},111999).action,'wait');
let r=h.sample({...base,time:0,playing:false,loaded:false},112000);assert.equal(r.action,'retry');assert.equal(r.position,100);
assert.equal(h.sample({...base,time:100,playing:false,buffering:true},124000).action,'retry');
assert.equal(h.sample({...base,time:100,playing:false,loaded:false},136000).action,'retry');
assert.equal(h.sample({...base,time:100,playing:false,loaded:false},148000).action,'failed');
assert.equal(h.sample({...base,key:'new:track'},160000).attempts,0);
for(const guarded of [{wanted:false},{online:false},{loading:true},{time:240,buffering:true},{playing:false,loaded:true}]){
 const g=createStreamHealth();g.sample({...base,...guarded},0);assert.equal(g.sample({...base,...guarded},60000).action,'wait',JSON.stringify(guarded));
}
const seeking=createStreamHealth();seeking.sample({...base,time:150},0);seeking.sample({...base,time:30},100);assert.equal(seeking.sample({...base,time:30,buffering:true},12100).position,30);
const online=createStreamHealth();online.sample({...base,time:80},0);assert.equal(online.sample({...base,time:80,buffering:true,online:false},60000).attempts,0);assert.equal(online.sample({...base,time:80,buffering:true},72000).action,'retry');
const error=createStreamHealth();error.sample({...base,time:80},0);assert.equal(error.sample({...base,time:0,playing:false,loaded:false},3000).action,'retry');
console.log('Stream recovery: mid-track failure, retained position, three-retry bound, new context, pause, offline, loading, ending and seek passed');
