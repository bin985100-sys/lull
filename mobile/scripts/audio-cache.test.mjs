import { build } from 'esbuild';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

async function fresh() {
  const files = new Map();
  let downloads = 0, release, fail = false;
  class File {
    constructor(parent, name) { this.uri = name ? `${parent.uri}/${name}` : parent; }
    get name() { return this.uri.split('/').at(-1); }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.size || 0; }
    get modificationTime() { return files.get(this.uri)?.at || 0; }
    delete() { files.delete(this.uri); }
    async move(to) { files.set(to.uri,files.get(this.uri)); files.delete(this.uri); this.uri=to.uri; }
    static async downloadFileAsync(url, file) {
      downloads++; files.set(file.uri,{size:100,at:Date.now()});
      await new Promise(r=>{release=r;});
      if (fail) throw Error('connection lost');
      files.set(file.uri,{size:24*1024*1024,at:Date.now()});
      return file;
    }
  }
  class Directory {
    constructor(parent,name) { this.uri=parent+'/'+name; }
    create() {}
    list() { return [...files.keys()].map(u=>new File(u)); }
  }
  const key='__cacheTest'+Math.random().toString(36).slice(2);
  globalThis[key]={ File,Directory,Paths:{cache:'cache:'} };
  const r=await build({entryPoints:[fileURLToPath(new URL('../src/player/audio-cache.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'native',setup(b){
    b.onResolve({filter:/^(expo-file-system|react-native)$/},a=>({path:a.path,namespace:'stub'}));
    b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='react-native'?"export const Platform={OS:'android'};":`export const {File,Directory,Paths}=globalThis[${JSON.stringify(key)}];`}));
  }}]});
  const m=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
  return {m,files,get downloads(){return downloads;},release:()=>release(),fail:()=>{fail=true;}};
}
const tick=()=>new Promise(r=>setTimeout(r,15));
test('partial files never become playable; duplicate downloads coalesce',async()=>{
  const s=await fresh(); const id='dQw4w9WgXcQ';
  s.m.prefetchAudio(id,'https://example.invalid'); s.m.prefetchAudio(id,'https://example.invalid');
  assert.equal(s.m.localAudio(id),undefined);
  assert.equal(s.downloads,1);
  s.release(); await tick();
  assert.ok(s.m.localAudio(id).endsWith(id+'.m4a'));
  assert.equal(s.downloads,1);
  assert.equal([...s.files.keys()].some(k=>k.endsWith('.part')),false);
});
test('failed download removes partial file and can be retried',async()=>{
  const s=await fresh(); const id='dQw4w9WgXcQ';
  s.fail(); s.m.prefetchAudio(id,'https://example.invalid'); s.release(); await tick();
  assert.equal(s.m.localAudio(id),undefined); assert.equal(s.files.size,0);
  s.m.prefetchAudio(id,'https://example.invalid'); assert.equal(s.downloads,2);
  s.release(); await tick();
});
test('eviction keeps files referenced by the player',async()=>{
  const s=await fresh(); const pinned='aaaaaaaaaaa'; s.m.localAudio(pinned);
  for(const id of ['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc','ddddddddddd','eeeeeeeeeee']) s.files.set('cache:/lull-audio-v1/'+id+'.m4a',{size:24*1024*1024,at:1});
  s.m.pinAudio([pinned]); s.m.prefetchAudio('fffffffffff','https://example.invalid'); s.release(); await tick();
  assert.ok(s.m.localAudio(pinned));
  assert.equal(s.files.size,5);
});
