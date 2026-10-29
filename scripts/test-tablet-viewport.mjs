import {webkit,chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5198';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198','--strictPort'],{stdio:'ignore'});
const root='test-results/tablet-viewport';fs.mkdirSync(root,{recursive:true});
const results=[];
try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  for(const engine of [webkit,chromium]){
    const browser=await engine.launch();
    try{
      for(const [width,height] of [[768,1024],[1024,768]]){
        const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
        const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>{
          const viewport=new EventTarget();Object.assign(viewport,{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});
          Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>viewport});
          window.__visual=(height,top=0)=>{viewport.height=height;viewport.offsetTop=top;viewport.dispatchEvent(new Event('resize'));};
        });
        await page.goto(base);await page.waitForFunction(()=>!!window.__stores);
        await page.evaluate(()=>{
          document.documentElement.classList.add('webapp');
          document.documentElement.style.setProperty('--safe-top','24px');document.documentElement.style.setProperty('--safe-bottom','20px');
        });
        await page.getByRole('button',{name:/^Поиск/}).tap();
        const search=page.locator('.sov-input input');await search.waitFor();await search.tap();
        const visible=height-320;await page.evaluate(h=>window.__visual(h,24),visible);
        await page.waitForFunction(()=>document.documentElement.classList.contains('keyboard-open'));
        await search.fill('Daft Punk');await page.locator('.sov-panel').waitFor();
        await page.waitForFunction(h=>{const r=document.querySelector('.sov-panel').getBoundingClientRect();return r.top>=48&&r.bottom<=24+h-19;},visible);
        const field=await search.boundingBox();assert.ok(field.y>=48&&field.y+field.height<=visible+24);
        assert.ok(await page.locator('.sov-tabs button').evaluateAll(nodes=>nodes.every(el=>el.getBoundingClientRect().height>=43.5)));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal tablet overflow');
        await page.screenshot({path:`${root}/${engine.name()}-${width}-keyboard.png`});
        await search.press('Escape');await page.locator('.sov').waitFor({state:'detached'});
        await page.evaluate(h=>window.__visual(h),height);
        await page.getByRole('link',{name:'Библиотека',exact:true}).tap();await page.locator('.library-page').waitFor();
        assert.deepEqual(errors,[]);
        results.push({engine:engine.name(),width,height,keyboard:'overlaid viewport simulated',passed:true});
        console.log(`PASS ${engine.name()} ${width}x${height}: tablet search and keyboard`);
        await context.close();
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync(`${root}/results.json`,JSON.stringify(results,null,2));
}finally{server.kill();}
