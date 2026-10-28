import {chromium, webkit} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const port=process.env.LULL_BACKGROUND_TEST_PORT||'5193';
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',port,'--strictPort'],{stdio:'ignore'});
const animated=process.argv.includes('--animated');
const brokenGpu=process.argv.includes('--broken-gpu');
const root=`test-results/background-modes/${brokenGpu?'broken-gpu':animated?'animated':'still'}`;fs.mkdirSync(root,{recursive:true});
const tracks=['#ee3311','#1155ee'].map((color,index)=>({id:`background-${index}`,title:'Background test',artists:[{name:'QA'}],durationSec:240,thumb:'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${color}"/><circle cx="${index?230:60}" cy="80" r="65" fill="white"/></svg>`).toString('base64')}));
const results=[];
try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      for(const width of brokenGpu?[393]:[393,1280])for(const gpu of brokenGpu?[true]:[true,false]){
        const page=await browser.newPage({viewport:{width,height:852}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
        if(!gpu)await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/.test(kind)?null:original.call(this,kind,...args);};});
        if(brokenGpu)await page.addInitScript(()=>{if(window.WebGLRenderingContext)WebGLRenderingContext.prototype.readPixels=function(...args){window.__blockedProbe=true;args[6].fill(0);};});
        await page.goto(base);await page.waitForFunction(()=>!!window.__stores);
        await page.addStyleTag({content:'.app > :not(.ambient-wrap){visibility:hidden!important}.ambient-wrap{opacity:1!important}'});
        for(const mode of brokenGpu?['gradient']:['cover','blur','gradient','mono','black']){
          const shots=[];
          for(const index of [0,1]){
            await page.evaluate(({mode,index,tracks,animated})=>{window.__stores.useSettings.setState({background:mode,animatedBg:animated,waveIntro:false,waveIntroSeen:true,waveStarted:true});window.__stores.usePlayer.setState({queue:tracks,index,source:{path:'/wave',label:'QA'},loading:false,playing:false});location.hash='#/wave';},{mode,index,tracks,animated});
            await page.waitForFunction(id=>window.__stores.usePlayer.getState().current()?.id===id,tracks[index].id);
            if(mode==='black')await page.waitForFunction(()=>document.querySelector('.ambient-wrap').querySelectorAll('canvas,img').length===0);
            else await page.waitForFunction(()=>{const ambient=document.querySelector('.ambient-wrap');const img=ambient.querySelector('img');return img?img.complete&&img.naturalWidth>0:!!ambient.querySelector('canvas');});
            // Kawarp interpolates new artwork for 1600 ms even with motion off.
            await page.waitForTimeout(1850);
            const shot=await page.screenshot({path:`${root}/${engine.name()}-${width}-${gpu?'gpu':'fallback'}-${mode}-${index}.png`});
            if(['cover','blur','gradient'].includes(mode)){
              const rgb=await page.evaluate(async encoded=>{const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,32,32);const bytes=ctx.getImageData(0,0,32,32).data;const total=[0,0,0];for(let n=0;n<bytes.length;n+=4)for(let c=0;c<3;c++)total[c]+=bytes[n+c];return total.map(n=>n/1024);},shot.toString('base64'));
              assert.ok(index===0?rgb[0]>rgb[2]+4:rgb[2]>rgb[0]+4,`${engine.name()} ${width} ${mode}: rendered palette belongs to stale artwork: ${rgb}`);
            }
            shots.push(createHash('sha256').update(shot).digest('hex'));
          }
          if(mode!=='black')assert.notEqual(shots[0],shots[1],`${engine.name()} ${width} ${gpu} ${mode}: artwork change must change rendered background`);
          assert.deepEqual(errors,[],`${engine.name()} ${width} ${mode}: page errors`);
          const rendering=await page.locator('.ambient-wrap canvas').evaluateAll(nodes=>nodes.map(c=>({fallback:c.dataset.fallback||null,reason:c.dataset.fallbackReason||null})));
          if(brokenGpu&&await page.evaluate(()=>!!window.__blockedProbe))assert.ok(rendering.some(r=>r.fallback==='1'&&r.reason==='shader-probe'),'A broken shader must switch to the working colour fallback');
          results.push({engine:engine.name(),width,gpuRequested:gpu,animated,mode,rendering,passed:true});
          console.log(`PASS ${engine.name()} ${width} ${gpu?'gpu':'fallback'} ${mode}`);
        }
        await page.close();
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync(`${root}/results.json`,JSON.stringify(results,null,2));
}finally{server.kill();}
