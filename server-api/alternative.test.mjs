import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

test('audio gate coalesces duplicates, bounds concurrency and recovers failed slots',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('./stream-gate.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
 const {StreamGate}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const gate=new StreamGate(1,1);let release,calls=0;
 const first=gate.run('first',()=>{calls++;return new Promise(r=>{release=r;});});
 assert.equal(gate.run('first',()=>{throw Error('duplicate');}),first);
 const next=gate.run('next',async()=>{calls++;throw Error('failed');});
 const failed=assert.rejects(next,/failed/);
 await assert.rejects(gate.run('overflow',async()=>1),/busy/);
 await Promise.resolve();assert.equal(calls,1);release(7);assert.equal(await first,7);await failed;
 await new Promise(r=>setImmediate(r));
 assert.equal(await gate.run('next',async()=>9),9);
});

test('alternate recording tries MWEB when TV cannot play it',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('./stream.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'stream-fixture',setup(b){
  b.onResolve({filter:/^(youtubei\.js|\.\/potoken|\.\/alternative|\.\/stream-client|.*electron\/yt)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='youtubei.js' ? 'export const Innertube={create:async()=>globalThis.audioFixture};' : a.path.includes('electron/yt') ? 'export const yt=async()=>globalThis.audioFixture;' : a.path==='./potoken' ? "export const mint=async()=> 'fixture';export const potState=()=>({});export const resetMinter=()=>{};export const warmMinter=()=>{};" : a.path==='./alternative' ? "export const alternatives=async()=>['alternate01'];" : 'export const streamFetch=f=>f;'}));
 }}]});
 const calls=[];const oldFetch=globalThis.fetch;
 globalThis.audioFixture={session:{context:{client:{visitorData:'fixture'}},player:{}},getBasicInfo:async(id,opts)=>{
  calls.push([id,opts.client]);
  if(id!=='alternate01' || opts.client==='TV')throw Error('unavailable');
  return {playability_status:{status:'OK'},streaming_data:{adaptive_formats:[{has_audio:true,has_video:false,mime_type:'audio/mp4; codecs="mp4a.40.2"',content_length:16,bitrate:128000,decipher:async()=> 'https://fixture.invalid/audio?x=1'}]}};
 }};
 globalThis.fetch=async()=>new Response(new Uint8Array(16),{headers:{'content-length':'16'}});
 try {
  const {fastStream}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
  const found=await fastStream('original001',true);
  assert.equal(found.mediaId,'alternate01');assert.equal(found.prefix.length,16);
  assert.deepEqual(calls.slice(0,4),[['original001','TV'],['alternate01','TV'],['original001','MWEB'],['alternate01','MWEB']]);
 } finally {globalThis.fetch=oldFetch;delete globalThis.audioFixture;}
});
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('./alternative.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'catalog-fixture',setup(b){
 b.onResolve({filter:/electron\/yt$/},()=>({path:'catalog',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const yt=async()=>globalThis.catalog;export const search=(...args)=>globalThis.catalogSearch(...args);'}));
}}]});
const load=()=>import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')+'#'+Math.random());
const a={id:'k7Coe5G-l74',title:'AIST',artists:[{id:'official',name:'FRIENDLY THUG 52 NGG'}]};
const b={id:'toyY9NScPMc',title:'AIST',artists:[{id:'official',name:'FRIENDLY THUG 52 NGG'}],durationSec:149};

test('missing duration permits the exact official channel, never a same-name impersonator',async()=>{
 const {sameRecording}=await load();assert.equal(sameRecording(a,b),true);
 assert.equal(sameRecording(a,{...b,artists:[{id:'other',name:a.artists[0].name}]}),false);
 assert.equal(sameRecording(a,{...b,title:'AIST (Remix)'}),false);
 assert.equal(sameRecording({...a,durationSec:149},{...b,durationSec:200}),false);
 assert.equal(sameRecording({...a,durationSec:133},b),true);
 assert.equal(sameRecording({...a,durationSec:133},{...b,artists:[{name:a.artists[0].name,id:'someone-else'}]}),false);
});
test('new video lockups retain actual channel identity and duration; playlists are excluded',async()=>{
 const {videoCandidates,sameRecording}=await load();
 const video={type:'LockupView',content_type:'VIDEO',content_id:b.id,metadata:{title:'AIST',metadata:{metadata_rows:[{metadata_parts:[{text:{runs:[{text:a.artists[0].name,endpoint:{payload:{browseId:'UCofficial'}}}]}}]}]}},duration:{seconds:149}};
 const candidates=videoCandidates({videos:[],results:[video,{...video,content_type:'PLAYLIST',content_id:'PLplaylist'}]});
 assert.equal(candidates.length,1);assert.equal(candidates[0].artists[0].id,'UCofficial');
 assert.equal(sameRecording({...a,artists:[{name:a.artists[0].name,id:'UCofficial'}],durationSec:133},candidates[0]),true);
});
test('collaborations accept complete credited subtitle uploads, never remixes or short edits',async()=>{
 const {sameRecording}=await load();
 const source={id:'fgGTimY1rYc',title:'OCG',artists:[{name:'FRIENDLY THUG 52 NGG'},{name:'SaintPrince 52'}],durationSec:141};
 const upload={id:'_uDvfU7K-6E',title:'FRIENDLY THUG 52 NGG & SaintPrince 52 — OCG (English Subtitles)',artists:[{name:'KILL ME, V1SA'}],durationSec:141};
 assert.equal(sameRecording(source,upload),true);
 assert.equal(sameRecording(source,{...upload,title:upload.title+' Remix'}),false);
 assert.equal(sameRecording(source,{...upload,durationSec:96}),false);
 assert.equal(sameRecording(source,{...upload,title:'FRIENDLY THUG 52 NGG — OCG (English Subtitles)'}),false);
 const russian={id:'tsVRBUDIeEU',title:'пускают стрелы',artists:[{name:'fallen777angel'}],durationSec:120};
 assert.equal(sameRecording(russian,{id:'GXQI82X4Mmw',title:'fallen777angel – пускают стрелы |Текст|',artists:[{name:'死手'}],durationSec:121}),true);
 assert.equal(sameRecording(russian,{id:'RPDmRyh59TE',title:'fallen777angel - пускают стрелы (текст песни)',artists:[{name:'Hаise'}],durationSec:121}),true);
});
test('a guest absent from Music credits must be anchored to the actual verified original video',async()=>{
 const {sameOfficialVideo}=await load();
 const source={id:'ncDkosGdvRw',title:'Olurmusun?',artists:[{name:'MERO'}],durationSec:187};
 const original={...source,title:'MERO x Poizi - Olurmusun? [Official Video]',artists:[{name:'MERO и Poizi',verified:true}]};
 const upload={id:'7MgEsS68Dzs',title:'MERO x Poizi - Olurmusun '+new Date().getFullYear(),artists:[{name:'RMProMix'}],durationSec:187};
 assert.equal(sameOfficialVideo(source,original,upload),true);
 assert.equal(sameOfficialVideo(source,original,{...upload,title:'MERO x Poizi - Olurmusun 2025'}),true);
 assert.equal(sameOfficialVideo(source,{...original,id:'wrong'},upload),false);
 assert.equal(sameOfficialVideo(source,{...original,artists:[{name:'MERO'}]},upload),false);
 assert.equal(sameOfficialVideo(source,original,{...upload,title:upload.title+' Remix'}),false);
 assert.equal(sameOfficialVideo(source,original,{...upload,durationSec:204}),false);
});
test('a partial catalog snapshot does not erase known duration or artist identity',async()=>{
 const m=await load();m.rememberTracks({...a,durationSec:149});m.rememberTracks({...a,artists:[{name:a.artists[0].name}]});
 globalThis.catalog={music:{getUpNext:async()=>{throw Error('unavailable');},search:async()=>({contents:[]})},search:async()=>({videos:[]})};
 globalThis.catalogSearch=async(q,type)=>type==='all'?{top:{track:b}}:{tracks:[]};
 assert.deepEqual(await m.alternatives(a.id),[b.id]);
});

test('recording metadata survives a resolver restart when upstream metadata is unavailable',async()=>{
 const first=await load();first.rememberTracks({...a,durationSec:149});
 const saved=JSON.parse(JSON.stringify(first.recordingHints()));
 const restarted=await load();restarted.rememberTracks(saved);
 globalThis.catalog={music:{getUpNext:async()=>{throw Error('blocked');},search:async()=>({contents:[]})},search:async()=>({videos:[]})};
 globalThis.catalogSearch=async(q,type)=>type==='all'?{top:{track:b}}:{tracks:[]};
 assert.deepEqual(await restarted.alternatives(a.id),[b.id]);
});
test('up-next enriches an existing snapshot whose duration is missing',async()=>{
 const m=await load();m.rememberTracks({...a,artists:[{name:a.artists[0].name}]});
 globalThis.catalog={music:{getUpNext:async()=>({contents:[{video_id:a.id,title:'AIST',artists:a.artists,duration:{seconds:149}}]}),search:async()=>({contents:[]})},search:async()=>({videos:[]})};
 globalThis.catalogSearch=async(q,type)=>type==='all'?{top:{track:{...b,artists:[{name:a.artists[0].name}]}}}:{tracks:[]};
 assert.deepEqual(await m.alternatives(a.id),[b.id]);
});


test('bitrate and lyrics annotations do not hide the exact recording; live and karaoke remain excluded',async()=>{
 const {sameRecording}=await load();
 const source={id:'pIpb40PWNlg',title:'Тмстс',artists:[{name:'Пошлая Молли'}],durationSec:161};
 const upload={id:'mNXGhWmHl3I',title:'ПОШЛАЯ МОЛЛИ –ТМСТС [320 kbps] + Текст',artists:[{name:'ХАРТ_hack'}],durationSec:161};
 assert.equal(sameRecording(source,upload),true);
 for(const suffix of [' (live)',' караоке',' remix',' instrumental',' cover'])
  assert.equal(sameRecording(source,{...upload,title:upload.title+suffix}),false);
 assert.equal(sameRecording(source,{...upload,durationSec:143}),false);
});
