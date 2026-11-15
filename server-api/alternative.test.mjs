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
test('up-next enriches an existing snapshot whose duration is missing',async()=>{
 const m=await load();m.rememberTracks({...a,artists:[{name:a.artists[0].name}]});
 globalThis.catalog={music:{getUpNext:async()=>({contents:[{video_id:a.id,title:'AIST',artists:a.artists,duration:{seconds:149}}]}),search:async()=>({contents:[]})},search:async()=>({videos:[]})};
 globalThis.catalogSearch=async(q,type)=>type==='all'?{top:{track:{...b,artists:[{name:a.artists[0].name}]}}}:{tracks:[]};
 assert.deepEqual(await m.alternatives(a.id),[b.id]);
});
