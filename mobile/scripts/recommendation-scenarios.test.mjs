import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lull-reco-matrix-')),out=path.join(dir,'selection.mjs');
await esbuild.build({entryPoints:[path.join(mobile,'src/reco/selection.ts')],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {selectRecommendations:select,recordingKey:key}=await import(pathToFileURL(out));
const random=(seed)=>{let n=seed;return()=>((n=Math.imul(n,1664525)+1013904223>>>0)/2**32);};
const modes=['sound','artist','discover','favorite','calm','energy'],sources=['radio','artist','favorite','discovery','mood','charts'];
const now=1_800_000_000_000;
const pool=Array.from({length:480},(_,i)=>({track:{id:'t'+i,source:i%3?'yt':'audius',title:'Song '+i,artistId:'a'+i%40,artist:'Artist '+i%40,streamable:i%53!==0},source:sources[i%6]}));
// Duplicate recordings arriving through different recommendation endpoints, plus
// an unrelated recording with the same ID at another provider.
pool.push(...pool.slice(1,70).map(row=>({...row,source:'discovery'})),{...pool[1],track:{...pool[1].track,source:'audius'}});
const snapshot=JSON.stringify(pool);
let cases=0;
for(const mode of modes) for(let balance=0;balance<5;balance++) for(const perArtist of [1,2,3,5]) for(const noRepeatHours of [0,2,12,24,72]) for(const profile of ['cold','narrow','broad']) {
  const length=profile==='cold'?25:profile==='narrow'?50:100;
  const knownArtists=new Set(Array.from({length:profile==='cold'?0:profile==='narrow'?3:20},(_,i)=>'a'+i));
  const liked=new Set(pool.filter(row=>knownArtists.has(row.track.artistId)&&Number(row.track.id.slice(1))%7===0).map(row=>key(row.track)));
  const hiddenTracks=new Set(['t7','t31']),hiddenArtists=new Set(['a39']),skipped=new Set(pool.filter((_,i)=>i%29===0).map(row=>key(row.track)));
  const exclude=new Set(pool.filter((_,i)=>i%23===0).map(row=>key(row.track)));
  const lastPlayed=new Map(pool.filter((_,i)=>i%5===0).map((row,i)=>[key(row.track),now-[1,6,18,36,80][i%5]*3600e3]));
  const base={mode,length,balance,perArtist,personal:true,knownArtists,liked,hiddenTracks,hiddenArtists,skipped,lastPlayed,exclude,noRepeatHours,useSkips:profile!=='cold',now};
  const rows=select(pool,{...base,random:random(42)}),ids=rows.map(key);
  const context=JSON.stringify({mode,balance,perArtist,noRepeatHours,profile});
  assert.ok(rows.length>=Math.min(length,25),context+' unexpectedly empty');
  assert.ok(rows.length<=length,context+' exceeds length');
  assert.equal(new Set(ids).size,ids.length,context+' duplicate');
  assert.deepEqual(ids,select(pool,{...base,random:random(42)}).map(key),context+' unstable');
  const counts=new Map();let last='',run=0;
  for(const t of rows){
    assert.ok(t.streamable&&!hiddenTracks.has(t.id)&&!hiddenArtists.has(t.artistId)&&!exclude.has(key(t)),context+' forbidden candidate');
    assert.ok(!base.useSkips||!skipped.has(key(t)),context+' ignored skip');
    assert.ok(!noRepeatHours||now-(lastPlayed.get(key(t))||0)>=noRepeatHours*3600e3,context+' recent repeat');
    run=t.artistId===last?run+1:1;last=t.artistId;assert.ok(run<=perArtist,context+' consecutive artist limit');
    counts.set(t.artistId,(counts.get(t.artistId)||0)+1);
  }
  assert.ok(Math.max(...counts.values())<=Math.max(2,Math.ceil(length*.2)),context+' artist monopolizes batch');
  if(profile==='broad'&&mode==='sound'){
    const familiar=rows.filter(t=>knownArtists.has(t.artistId)||liked.has(key(t))).length/rows.length;
    assert.ok(Math.abs(familiar-[.95,.75,.5,.25,.05][balance])<=.1,context+' familiar/new balance ignored');
  }
  cases++;
}
assert.equal(cases,1800);
assert.equal(JSON.stringify(pool),snapshot,'Selection mutated shared catalog input');
const base={mode:'sound',length:25,balance:2,perArtist:2,personal:true,knownArtists:new Set(),liked:new Set(),hiddenTracks:new Set(),hiddenArtists:new Set(),skipped:new Set(),lastPlayed:new Map(),exclude:new Set(),noRepeatHours:0,useSkips:true,now,random:random(1)};
const providers=select([pool[1],{...pool[1],track:{...pool[1].track,source:'audius'}}],base);
assert.equal(providers.length,2,'Same ID from different providers was lost');
const mono=Array.from({length:30},(_,i)=>({...pool[1],track:{...pool[1].track,id:'mono'+i}}));
assert.ok(select(mono,{...base,random:random(1)}).length<=2,'Sparse personal catalog fabricated diversity');
assert.equal(select(mono,{...base,mode:'artist',personal:false,random:random(1)}).length,25,'Explicit artist wave ignored user intent');
console.log(`${cases} recommendation combinations passed; provider identity, sparse catalog and explicit artist mode passed`);
fs.rmSync(dir,{recursive:true,force:true});
