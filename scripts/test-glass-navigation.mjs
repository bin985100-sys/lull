import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='test-results/glass-navigation';fs.mkdirSync(root,{recursive:true});
const base='http://127.0.0.1:5199';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199','--strictPort'],{stdio:'ignore'});
const results=[];
try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  for(const engine of [chromium,webkit]){
    if(process.env.LULL_NAV_ENGINE&&engine.name()!==process.env.LULL_NAV_ENGINE)continue;
    const browser=await engine.launch();
    try{
      for(const width of [320,393,430]){
        if(process.env.LULL_NAV_WIDTH&&width!==Number(process.env.LULL_NAV_WIDTH))continue;
        const page=await browser.newPage({viewport:{width,height:852},isMobile:true,hasTouch:true});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base);await page.waitForFunction(()=>!!window.__stores);
        await page.evaluate(()=>window.__stores.useSettings.setState({waveIntro:false,waveIntroSeen:true,waveStarted:true,background:'black',animatedBg:false}));
        await page.locator('.glass-nav-bubble').waitFor();
        const nav=await page.locator('.glass-nav').boundingBox();
        assert.ok(Math.abs(nav.width-(width-24))<1);
        assert.ok(Math.abs(nav.height-Math.max(44,Math.min(64,(width-24)*.13873)))<1);
        assert.equal(await page.locator('.m-tab svg').count(),4);
        assert.ok(await page.locator('.m-tab').evaluateAll(nodes=>nodes.every(n=>!n.textContent.trim())),'Reference has no text labels');
        for(const [label,index] of [['Поиск',1],['Волна',2],['Библиотека',3],['Главная',0]]){
          await page.evaluate(()=>{
            window.__navFrames=[];window.__navDone=false;
            document.querySelector('.glass-nav').addEventListener('click',()=>{
              const record=()=>{
                const b=document.querySelector('.glass-nav-bubble').getBoundingClientRect();
                const p=document.querySelector('.glass-nav').getBoundingClientRect();
                window.__navFrames.push({x:b.x-p.x,width:b.width,top:b.top-p.top,height:b.height,panelHeight:p.height});
                if(window.__navFrames.length<75)requestAnimationFrame(record);else window.__navDone=true;
              };
              record();
            },{capture:true,once:true});
          });
          await page.getByRole('link',{name:label,exact:true}).tap();
          await page.waitForFunction(()=>window.__navDone);
          const frames=await page.evaluate(()=>window.__navFrames);
          fs.writeFileSync(`${root}/${engine.name()}-${width}-${index}-frames.json`,JSON.stringify(frames));
          const xs=new Set(frames.map(f=>f.x.toFixed(1)));
          if(xs.size<6)console.log('Navigation diagnostics',JSON.stringify({errors,frames:frames.slice(-2),links:await page.locator('.m-tab').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label'),current:n.getAttribute('aria-current')})))}));
          assert.ok(xs.size>5,`${engine.name()} ${label}: bubble must really animate across frames (${xs.size}); ${page.url()}; ${await page.locator('.m-tab').evaluateAll(nodes=>JSON.stringify(nodes.map(n=>({label:n.getAttribute('aria-label'),current:n.getAttribute('aria-current')}))))}`);
          assert.ok(frames.some(f=>f.width>nav.width/4+1),'Bubble deforms during movement');
          assert.ok(frames.every(f=>Math.abs(f.top)<.5&&Math.abs(f.height-f.panelHeight)<.5),'Bubble always fills the panel height');
          assert.ok(Math.abs(frames.at(-1).x-index*nav.width/4)<1,'Spring settles on selected tab');
          assert.equal(await page.getByRole('link',{name:label,exact:true}).getAttribute('aria-current'),'page');
        }
        await page.screenshot({path:`${root}/${engine.name()}-${width}.png`});
        await page.locator('.glass-nav').screenshot({path:`${root}/${engine.name()}-${width}-bar.png`});
        assert.deepEqual(errors,[]);results.push({engine:engine.name(),width,passed:true,animated:true,fullHeight:true});
        await page.close();console.log(`PASS ${engine.name()} ${width}: four SVGs, geometry, spring travel, deformation, full-height bubble`);
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync(`${root}/results.json`,JSON.stringify(results,null,2));
}finally{server.kill();}
