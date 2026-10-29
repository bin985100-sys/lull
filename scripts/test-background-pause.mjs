import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5203';const root='test-results/background-pause';fs.mkdirSync(root,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5203','--strictPort'],{stdio:'ignore'});
const results=[];
try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
      await page.addInitScript(()=>{
        window.__drawCounts={ambient:0,player:0};
        if(!window.WebGLRenderingContext)return;
        const draw=WebGLRenderingContext.prototype.drawArrays;
        WebGLRenderingContext.prototype.drawArrays=function(...args){
          if(this.canvas.closest('.ambient-wrap'))window.__drawCounts.ambient++;
          if(this.canvas.closest('.np'))window.__drawCounts.player++;
          return draw.apply(this,args);
        };
      });
      await page.goto(base);await page.waitForFunction(()=>!!window.__stores);
      await page.evaluate(()=>{
        const track={id:'pause-test',title:'Pause hidden renderer',artists:[{name:'QA'}],durationSec:240,thumb:'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#dd5522"/></svg>')};
        window.__stores.useSettings.setState({background:'cover',animatedBg:true,waveIntro:false});
        window.__stores.usePlayer.setState({queue:[track],index:0,loading:false,playing:false,duration:240});
      });
      await page.waitForFunction(()=>window.__drawCounts.ambient>10);
      await page.getByRole('button',{name:'Открыть плеер',exact:true}).tap();
      await page.waitForFunction(()=>window.__drawCounts.player>10);
      await page.evaluate(()=>window.__drawCounts={ambient:0,player:0});
      await page.waitForTimeout(400);
      const hidden=await page.evaluate(()=>window.__drawCounts);
      assert.equal(hidden.ambient,0,'Covered page must not consume WebGL draw calls');
      assert.ok(hidden.player>0,'Visible player remains genuinely animated');
      await page.getByRole('button',{name:'Свернуть плеер',exact:true}).tap();
      await page.waitForFunction(()=>window.__drawCounts.ambient>10);
      results.push({engine:engine.name(),hiddenDraws:hidden.ambient,visibleDraws:hidden.player,resumed:true,passed:true});
      console.log(`PASS ${engine.name()}: hidden renderer stopped, visible renderer draws, background resumes`);
      await page.close();
    }finally{await browser.close();}
  }
  fs.writeFileSync(`${root}/results.json`,JSON.stringify(results,null,2));
}finally{server.kill();}
