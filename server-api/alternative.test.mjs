import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
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
test('a partial catalog snapshot does not erase known duration or artist identity',async()=>{
 const m=await load();m.rememberTracks({...a,durationSec:149});m.rememberTracks({...a,artists:[{name:a.artists[0].name}]});
 globalThis.catalog={music:{getUpNext:async()=>{throw Error('unavailable');},search:async()=>({contents:[]})},search:async()=>({videos:[]})};
 globalThis.catalogSearch=async(q,type)=>type==='all'?{top:{track:b}}:{tracks:[]};
 assert.deepEqual(await m.alternatives(a.id),[b.id]);
});
test('up-next enriches an existing snapshot whose duration is missing',async()=>{
 const m=await load();m.rememberTracks({...a,artists:[{name:a.artists[0].name}]});
 globalThis.catalog={music:{getUpNext:async()=>({contents:[{video_id:a.id,title:'AIST',artists:a.artists,duration:{seconds:149}}]}),search:async()=>({contents:[]})},search:async()=>({videos:[]})};
 globalThis.catalogSearch=async(q,type)=>type==='all'?{top:{track:{...b,artists:[{name:a.artists[0].name}]}}}:{tracks:[]};
 assert.deepEqual(await m.alternatives(a.id),[b.id]);
});
