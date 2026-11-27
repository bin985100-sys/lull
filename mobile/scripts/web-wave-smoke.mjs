// Cross-platform wave regression: real browser audio, deterministic catalog only.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),{webkit}=require(process.env.LULL_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve('dist'),base='http://127.0.0.1:18884',dir=fs.mkdtempSync(path.join(os.tmpdir(),'lull-web-audio-'));
const rate=22050,samples=rate*60,wav=Buffer.alloc(44+samples*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*800),44+i*2);
let audio=wav,mime='audio/wav';
if(process.platform==='darwin'){fs.writeFileSync(path.join(dir,'tone.wav'),wav);const converted=spawnSync('/usr/bin/afconvert',['-f','m4af','-d','aac',path.join(dir,'tone.wav'),path.join(dir,'tone.m4a')],{encoding:'utf8'});if(converted.status)throw Error(converted.stderr);audio=fs.readFileSync(path.join(dir,'tone.m4a'));mime='audio/mp4';}
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,base).pathname;let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(18884,'127.0.0.1',r));
const raw=Array.from({length:10},(_,i)=>({id:'song'+i,title:'Песня '+i,artists:[{id:'artist'+i%3,name:'Артист '+i%3}],durationSec:60}));
const tracks=raw.map(t=>({id:t.id,title:t.title,artist:t.artists[0].name,artistId:t.artists[0].id,duration:60,source:'yt',streamable:true}));
const sections=[{title:'Песни',layout:'tracks',items:raw.map(track=>({kind:'track',id:track.id,title:track.title,track}))}];
const browser=await webkit.launch({headless:true});fs.mkdirSync('web-smoke-artifacts',{recursive:true});
try{for(const width of [412,840,1440]){
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width,height:915}}),errors=[],seeds=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(tracks=>{localStorage.setItem('lull.appearance.v1',JSON.stringify({state:{mode:'dark'},version:0}));localStorage.setItem('lull.library.v1',JSON.stringify({version:1,state:{onboarded:true,account:{name:'Тест'},liked:tracks,history:[],playlists:[{id:'qa',name:'Проверка волны',tracks,createdAt:1}],savedPlaylists:[],favArtists:[]}}));window.__audios=[];const A=window.Audio;window.Audio=class extends A{constructor(...args){super(...args);window.__audios.push(this);}};},tracks);
 await page.route('https://api.lull.website/**',async route=>{const request=route.request(),u=new URL(request.url()),headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'Content-Type,Range,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(u.pathname.includes('/api/stream/')){const m=request.headers().range?.match(/bytes=(\d+)-(\d*)/),start=m?Number(m[1]):0,end=m&&m[2]?Math.min(audio.length-1,Number(m[2])):audio.length-1;if(start>=audio.length)return route.fulfill({status:416,headers:{...headers,'Content-Range':`bytes */${audio.length}`}});return route.fulfill({status:m?206:200,contentType:mime,headers:{...headers,'Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(m?{'Content-Range':`bytes ${start}-${end}/${audio.length}`}:{})},body:audio.subarray(start,end+1)});}
  let data=[];if(u.pathname.includes('/upnext/')){seeds.push(u.pathname.split('/').pop());data=raw;}else if(u.pathname.endsWith('/charts')||u.pathname.endsWith('/home'))data=sections;else if(u.pathname.includes('/artist/'))data={id:'artist0',name:'Артист 0',topTracks:raw,sections:[]};return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(data)});
 });
 try{
  await page.goto(base+'/my/qa');await page.getByRole('button',{name:'Песня 3, Артист 0',exact:true}).click();const mini=page.getByRole('button',{name:/Открыть плеер:/});await mini.waitFor();
  await page.waitForFunction(()=>window.__audios.some(a=>!a.paused&&a.currentTime>.2));
  await page.getByRole('tab',{name:'Волна',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="wave-cover-deck"]')?.getAttribute('aria-valuetext')?.startsWith('Песня 3,'));
  await page.getByRole('button',{name:'Включить мою волну',exact:true}).click();await page.getByRole('button',{name:'Приостановить волну',exact:true}).waitFor();
  if(!(await mini.getAttribute('aria-label')).includes('Песня 3'))throw Error('Wrong seed song');
  await page.getByRole('tab',{name:'Моё',exact:true}).click();await page.getByRole('button',{name:'Проверка волны',exact:true}).click();await page.getByRole('button',{name:'Песня 5, Артист 2',exact:true}).click();
  await page.getByRole('tab',{name:'Волна',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="wave-cover-deck"]')?.getAttribute('aria-valuetext')?.startsWith('Песня 5,'));await page.getByRole('button',{name:'Включить мою волну',exact:true}).click();await page.getByRole('button',{name:'Приостановить волну',exact:true}).waitFor();
  if(!seeds.includes('song3')||!seeds.includes('song5')||errors.length)throw Error(JSON.stringify({seeds,errors}));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow');
  await page.screenshot({path:`web-smoke-artifacts/wave-${width}.png`});console.log(JSON.stringify({ok:true,engine:'WebKit',platform:process.platform,width,audio:mime,seeds,errors}));
 }catch(e){console.log('DIAGNOSTIC',JSON.stringify({width,body:await page.locator('body').innerText(),audio:await page.evaluate(()=>window.__audios.map(a=>({src:a.src,error:a.error?.code,time:a.currentTime,paused:a.paused}))),seeds,errors}));await page.screenshot({path:`web-smoke-artifacts/failure-${width}.png`});throw e;}finally{await page.close();}
}}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
