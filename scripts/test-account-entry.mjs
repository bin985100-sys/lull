import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5202';const root='test-results/account-entry';fs.mkdirSync(root,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','web','--host','127.0.0.1','--port','5202','--strictPort'],{stdio:'ignore',env:{...process.env,VITE_ACCOUNTS_ENABLED:'false'}});
const results=[];
try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      for(const provider of ['google','discord']){
        const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true,serviceWorkers:'block'});
        const protectedRequests=[];page.on('request',r=>{if(r.url().includes('/rest/v1/lull_'))protectedRequests.push(r.url());});
        await page.route('https://api.lull.website/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
        await page.goto(base);
        await page.getByRole('button',{name:'Настройки',exact:true}).tap();
        await page.getByRole('button',{name:'Аккаунт Lull',exact:true}).tap();
        await page.getByRole('button',{name:'Продолжить с Google',exact:true}).waitFor();
        await page.getByRole('button',{name:'Продолжить с Discord',exact:true}).waitFor();
        assert.deepEqual(protectedRequests,[],'Guest must not request protected cloud tables');
        assert.equal(await page.locator('.account-section input').count(),0,'No email/password signup');
        await page.waitForFunction(()=>[...document.querySelectorAll('.account-provider')].every(el=>{const r=el.getBoundingClientRect();return r.height>=47.5&&r.x>=0&&r.right<=innerWidth;}));
        await page.screenshot({path:`${root}/${engine.name()}-${provider}.png`});
        await page.route('**/auth/v1/authorize**',r=>r.fulfill({status:200,contentType:'text/html',body:'OAuth boundary fixture'}));
        const pending=page.waitForRequest(r=>r.url().includes('/auth/v1/authorize'));
        await page.getByRole('button',{name:`Продолжить с ${provider==='google'?'Google':'Discord'}`,exact:true}).tap();
        const url=new URL((await pending).url());
        assert.equal(url.searchParams.get('provider'),provider);
        assert.equal(url.searchParams.get('redirect_to'),`${base}/auth/callback`);
        assert.equal(url.searchParams.get('code_challenge_method'),'s256');
        assert.ok(url.searchParams.get('code_challenge'));
        if(provider==='google')assert.ok(url.searchParams.get('scopes').includes('youtube.readonly'));
        else assert.equal(url.searchParams.get('scopes'),'identify email');
        results.push({engine:engine.name(),provider,availableWithoutGate:true,pkce:true,passed:true});
        console.log(`PASS ${engine.name()} ${provider}: guest account entry, correct OAuth endpoint and PKCE`);
        await page.close();
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync(`${root}/results.json`,JSON.stringify(results,null,2));
}finally{server.kill();}
