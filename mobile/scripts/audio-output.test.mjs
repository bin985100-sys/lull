import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import * as esbuild from 'esbuild';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lull-sinks-')),out=path.join(dir,'router.mjs');
await esbuild.build({entryPoints:['src/player/sink-router.ts'],bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'silent'});const {createSinkRouter}=await import(pathToFileURL(out).href);
const media=(reject='')=>({calls:[],async setSinkId(id){this.calls.push(id);if(id===reject&&id)throw Error('Unavailable');}});
const host=()=>({_currentMedia:media(),_nextMedia:media(),_createMediaElement(){assert.ok(this._currentMedia);return media();}});
let p=host(),r=createSinkRouter(p);assert.ok(r.supported());await r.select('speakers');assert.equal(r.selected,'speakers');assert.deepEqual(p._currentMedia.calls,['speakers']);assert.deepEqual(p._nextMedia.calls,['speakers']);
const next=p._createMediaElement('source');await new Promise(queueMicrotask);assert.deepEqual(next.calls,['speakers']);
p._currentMedia=next;await r.select('headphones');assert.equal(r.selected,'headphones');assert.equal(next.calls.at(-1),'headphones');
p._nextMedia=media('missing');await assert.rejects(r.select('missing'));assert.equal(r.selected,'headphones');assert.equal(p._currentMedia.calls.at(-1),'headphones');assert.equal(p._nextMedia.calls.at(-1),'headphones');
await r.select('');assert.equal(r.selected,'');assert.equal(p._currentMedia.calls.at(-1),'');
for(const value of [null,{}, {_currentMedia:{}}, Object.freeze(host())]){const unsupported=createSinkRouter(value);assert.equal(unsupported.supported(),false);await assert.rejects(unsupported.select('device'));}
p=host();p._createMediaElement=function(){return media('gone');};r=createSinkRouter(p);await r.select('gone');const lost=p._createMediaElement();await new Promise(resolve=>setImmediate(resolve));assert.equal(r.selected,'');assert.deepEqual(lost.calls,['gone','']);
let opened=false;const airplay=createSinkRouter({_currentMedia:{webkitShowPlaybackTargetPicker(){opened=true;}}});assert.equal(airplay.airplay(),true);airplay.showAirplay();assert.equal(opened,true);
console.log('Audio output: current/next/future tracks, rollback, default, unsupported/frozen host, unplug fallback and AirPlay passed');assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('lull-sinks-'));fs.rmSync(dir,{recursive:true,force:true});
