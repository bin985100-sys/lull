import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='test-results/desktop-navigation';fs.mkdirSync(root,{recursive:true});
const base='http://127.0.0.1:5201';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5201','--strictPort'],{stdio:'ignore'});
const results=[];
try {
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  for(const engine of [chromium,webkit]) {
    const browser=await engine.launch();
    try {
      for(const [width,height] of [[1152,638],[1280,720],[1440,900]]) {
        const page=await browser.newPage({viewport:{width,height}});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base);await page.waitForFunction(()=>!!window.__stores);
        await page.evaluate(()=>window.__stores.useSettings.setState({waveIntro:false,waveIntroSeen:true,waveStarted:true,background:'black',animatedBg:false}));
        const rail=page.locator('.app > .rail');await rail.waitFor();
        const shape=await rail.evaluate(n=>({width:n.getBoundingClientRect().width,bg:getComputedStyle(n).backgroundColor}));
        assert.equal(shape.width,114);assert.equal(shape.bg,'rgb(0, 0, 0)');
        assert.deepEqual(await page.locator('.rail-btn').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),['Главная','Поиск','Моя волна','Библиотека']);
        assert.ok(await page.locator('.rail-btn svg').evaluateAll(ns=>ns.every(n=>!n.querySelector('[stroke]'))));
        const indicator=page.locator('.rail-active-indicator');
        const box=await indicator.boundingBox();assert.equal(box.width,76);assert.equal(box.height,70);
        for(const [label,index] of [['Поиск',1],['Моя волна',2],['Библиотека',3],['Главная',0]]) {
          await page.getByRole('link',{name:label,exact:true}).click();
          await page.waitForFunction(i=>{const b=document.querySelector('.rail-active-indicator').getBoundingClientRect();const p=document.querySelector('.rail-panel').getBoundingClientRect();return Math.abs(b.y-p.y-i*76)<.5},index);
          assert.equal(await page.getByRole('link',{name:label,exact:true}).getAttribute('aria-current'),'page');
        }
        const gear=page.getByRole('button',{name:'Настройки',exact:true});
        const gearBox=await gear.boundingBox();assert.ok(gearBox.y+gearBox.height<=height);
        await page.screenshot({path:`${root}/${engine.name()}-${width}.png`});
        await rail.screenshot({path:`${root}/${engine.name()}-${width}-rail.png`});
        await gear.click();await page.locator('.dialog[role=dialog]').waitFor();
        assert.deepEqual(errors,[]);results.push({engine:engine.name(),width,height,routes:true,settings:true});
        console.log(`PASS ${engine.name()} desktop ${width}x${height}`);await page.close();
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(`${root}/results.json`,JSON.stringify(results,null,2));
} finally { server.kill(); }

