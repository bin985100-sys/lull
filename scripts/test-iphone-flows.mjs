import {webkit,chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5197';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5197','--strictPort'],{stdio:'ignore'});
const root='test-results/iphone-flows';fs.mkdirSync(root,{recursive:true});
const result=[];
try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  for(const engine of [webkit,chromium]){
    const browser=await engine.launch();
    try{
      for(const [width,height,top,bottom] of [[375,667,0,0],[375,812,44,34],[390,844,47,34],[393,852,59,34],[430,932,59,34]]){
        const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
        const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        // Model Safari's overlaid keyboard: layout viewport stays unchanged.
        await page.addInitScript(()=>{
          const viewport=new EventTarget();Object.assign(viewport,{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});
          Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>viewport});
          window.__visual=(height,top=0)=>{viewport.height=height;viewport.width=innerWidth;viewport.offsetTop=top;viewport.dispatchEvent(new Event('resize'));};
        });
        await page.goto(base);await page.waitForFunction(()=>!!window.__stores);
        await page.evaluate(({top,bottom})=>{
          document.documentElement.classList.add('webapp');
          document.documentElement.style.setProperty('--safe-top',`${top}px`);document.documentElement.style.setProperty('--safe-bottom',`${bottom}px`);
          window.__stores.useSettings.setState({animatedBg:false,waveIntro:false,waveIntroSeen:true,waveStarted:true});
        },{top,bottom});
        await page.locator('.m-gear').waitFor();
        const gear=await page.locator('.m-gear').boundingBox();assert.ok(gear.width>=44&&gear.height>=44&&gear.y>=top);
        await page.getByRole('button',{name:'Настройки',exact:true}).tap();
        await page.locator('.dialog.m-set').waitFor();
        await page.getByRole('button',{name:'Закрыть настройки',exact:true}).tap();
        const libraryTab=await page.getByRole('link',{name:'Библиотека',exact:true}).boundingBox();
        await page.touchscreen.tap(libraryTab.x+libraryTab.width/2,libraryTab.y+libraryTab.height/2);
        await page.locator('.library-page').waitFor();
        await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.scroll > div')).opacity)>.99);
        const heading=await page.locator('.library-page h1').boundingBox();assert.ok(heading.y>=top+8,'Library heading must clear the status area');
        assert.ok(await page.locator('.library-view button').evaluateAll(nodes=>nodes.every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
        await page.getByRole('button',{name:'Создать плейлист',exact:true}).tap();
        const dialog=page.getByRole('dialog',{name:'Новый плейлист'});await dialog.waitFor();
        const input=dialog.getByPlaceholder('Название плейлиста');await input.tap();
        assert.ok(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'iOS inputs must not trigger focus zoom');
        const visible=height-300;
        await page.evaluate(h=>window.__visual(h,24),visible);
        await page.waitForFunction(()=>document.documentElement.classList.contains('keyboard-open'));
        await page.locator('.m-dock').waitFor({state:'hidden'});
        await page.waitForFunction(h=>{const r=document.querySelector('[role="dialog"]').getBoundingClientRect();return r.top>=24&&r.bottom<=24+h+1;},visible);
        await input.fill('Проверка iPhone');
        await page.screenshot({path:`${root}/${engine.name()}-${width}-keyboard.png`});
        await dialog.getByRole('button',{name:'Сохранить',exact:true}).tap();
        await dialog.waitFor({state:'detached'});
        await page.evaluate(h=>window.__visual(h),height);
        await page.locator('.m-dock').waitFor({state:'visible'});
        await page.getByRole('link',{name:'Поиск',exact:true}).tap();
        const search=page.getByPlaceholder('Трек, исполнитель, альбом');await search.waitFor();await search.tap();
        await page.evaluate(h=>window.__visual(h),visible);
        await page.waitForFunction(()=>document.documentElement.classList.contains('keyboard-open'));
        await search.fill('Daft Punk');await search.press('Enter');
        const field=await search.boundingBox();assert.ok(field.y>=top&&field.y+field.height<=visible,'Search must remain above keyboard');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page scroll');
        await search.evaluate(el=>el.blur());await page.evaluate(h=>window.__visual(h),height);
        await page.getByRole('link',{name:'Волна',exact:true}).tap();
        await page.evaluate(async()=>{
          const {api}=await import('/src/api.ts');api.lyrics=async()=>({plain:'Первая строка\nВторая строка',source:'qa'});
          const tracks=[0,1].map(n=>({id:`iphone-${n}`,title:'Длинное название композиции',artists:[{name:'Исполнитель'}],durationSec:240,thumb:'data:image/svg+xml;base64,'+btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${n?'#2277dd':'#dd5522'}"/></svg>`)}));
          window.__stores.usePlayer.setState({queue:tracks,index:0,source:{path:'/wave',label:'QA'},playing:false,loading:false,duration:240});
          window.__stores.useLyrics.setState({trackId:tracks[0].id,loading:false,data:{plain:'Первая строка\nВторая строка',source:'qa'}});
        });
        await page.locator('.wave-chip').filter({hasText:'Текст'}).tap();
        await page.locator('.np-lyrics').getByText('Первая строка',{exact:false}).waitFor();
        await page.getByRole('tab',{name:'Очередь',exact:true}).tap();
        assert.equal(await page.locator('.np-side').getAttribute('aria-label'),'Очередь');
        await page.getByRole('button',{name:'Вернуться к плееру',exact:true}).tap();
        await page.locator('.np-player').waitFor({state:'visible'});
        await page.setViewportSize({width:height,height:width});
        await page.evaluate(({height,side})=>{window.__visual(height);document.documentElement.style.setProperty('--safe-top','0px');document.documentElement.style.setProperty('--safe-bottom','21px');document.documentElement.style.setProperty('--safe-left',`${side}px`);document.documentElement.style.setProperty('--safe-right',`${side}px`);},{height:width,side:top?44:0});
        await page.waitForFunction(()=>Math.abs(document.querySelector('.np').getBoundingClientRect().top)<.5);
        await page.waitForTimeout(350);
        const bounds=await page.locator('.np-ctrls button,.np-bottom button').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};}));
        assert.ok(bounds.every(r=>r.x>=0&&r.right<=height+1&&r.y>=0&&r.bottom<=width-20),`Landscape controls remain visible: ${JSON.stringify(bounds)}`);
        await page.screenshot({path:`${root}/${engine.name()}-${width}-rotated.png`});
        await page.getByRole('button',{name:'Ещё',exact:true}).tap();
        const menu=page.getByRole('menu');await menu.waitFor();
        await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.menu')).opacity)>.99);
        const menuBounds=await menu.boundingBox();
        assert.ok(menuBounds.y>=0&&menuBounds.y+menuBounds.height<=width-20&&menuBounds.x>=0&&menuBounds.x+menuBounds.width<=height,`Track menu stays in the usable landscape area: ${JSON.stringify(menuBounds)}`);
        assert.ok(await menu.getByRole('menuitem').evaluateAll(nodes=>nodes.every(el=>el.getBoundingClientRect().height>=43.5)),'Menu actions do not shrink on touch devices');
        await page.setViewportSize({width,height});
        await page.evaluate(({height,top,bottom})=>{window.__visual(height);document.documentElement.style.setProperty('--safe-top',`${top}px`);document.documentElement.style.setProperty('--safe-bottom',`${bottom}px`);document.documentElement.style.setProperty('--safe-left','0px');document.documentElement.style.setProperty('--safe-right','0px');},{height,top,bottom});
        await menu.waitFor({state:'detached'});
        assert.deepEqual(errors,[]);
        result.push({engine:engine.name(),width,height,keyboard:'overlaid viewport simulated',firstTap:true,rotation:true,trackMenu:true,passed:true});
        console.log(`PASS ${engine.name()} ${width}x${height}: settings, library, keyboard dialog, search, lyrics/queue and rotation`);
        await context.close();
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync(`${root}/results.json`,JSON.stringify(result,null,2));
}finally{server.kill();}
