import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5196';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5196','--strictPort'],{stdio:'ignore'});
try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:393,height:852}});
      const origins=[];
      await page.route('https://images.lull.test/api/img?**',async route=>{
        origins.push(route.request().headers().origin);
        const color=route.request().url().includes('art=red')?'#ee3311':'#1155ee';
        await route.fulfill({status:200,headers:{'Content-Type':'image/svg+xml','Access-Control-Allow-Origin':base,'Vary':'Origin','Cache-Control':'public, max-age=604800, immutable'},body:`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${color}"/></svg>`});
      });
      await page.goto(base);await page.waitForFunction(()=>!!window.__stores);
      const tracks=['red','blue'].map(color=>({id:color,title:color,artists:[{name:'Image cache QA'}],durationSec:240,thumb:`https://images.lull.test/api/img?art=${color}&iv=3`}));
      let previous;
      for(const index of [0,1,0]){
        await page.evaluate(({tracks,index})=>{window.__stores.useSettings.setState({background:'cover',animatedBg:false,waveIntro:false,waveIntroSeen:true,waveStarted:true});window.__stores.usePlayer.setState({queue:tracks,index,source:{path:'/wave',label:'QA'},playing:false,loading:false});location.hash='#/wave';},{tracks,index});
        await page.waitForFunction(old=>{const tint=getComputedStyle(document.documentElement).getPropertyValue('--tint').trim();return /^#[a-f0-9]{6}$/.test(tint)&&tint!==old&&tint!=='#5B3FD1';},previous);
        previous=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tint').trim());
        await page.waitForFunction(()=>{const img=document.querySelector('.wave-cover img.cover');return img?.complete&&img.naturalWidth>0&&img.crossOrigin==='anonymous';});
      }
      assert.ok(origins.length>=2);
      assert.ok(origins.every(origin=>origin===base),`Cover and palette must both use CORS image cache entries: ${JSON.stringify(origins)}`);
      console.log(`PASS ${engine.name()}: real HTTP image cache, CORS cover requests and red/blue/red palette recovery`);
    }finally{await browser.close();}
  }
}finally{server.kill();}
