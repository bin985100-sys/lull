import {_electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const executable=process.argv[2];assert.ok(executable,'Pass the packaged executable');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'lull-signin-ui-'));
let app;
try {
  app=await _electron.launch({executablePath:executable,args:[`--user-data-dir=${profile}`],timeout:45000,env:{...process.env,ELECTRON_ENABLE_LOGGING:'1'}});
  // Stop at the provider boundary. Never log in to a real account in this test.
  await app.evaluate(({shell})=>{globalThis.__signinUrls=[];shell.openExternal=async url=>{globalThis.__signinUrls.push(url);};});
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'Настройки',exact:true}).click({timeout:45000});
  await page.getByRole('button',{name:'Аккаунт Lull',exact:true}).click();
  for(const [index,provider] of ['Google','Discord'].entries()) {
    await page.getByRole('button',{name:`Продолжить с ${provider}`,exact:true}).click();
    for(let n=0;n<50;n++){
      if(await app.evaluate(()=>globalThis.__signinUrls.length)>index)break;
      const alerts=await page.getByRole('alert').allTextContents();
      assert.deepEqual(alerts,[],`Native ${provider} sign-in failed`);
      await page.waitForTimeout(100);
    }
    assert.equal(await app.evaluate(()=>globalThis.__signinUrls.length),index+1,`${provider} did not reach the external provider`);
  }
  const requests=await app.evaluate(()=>globalThis.__signinUrls.map(raw=>{
    const url=new URL(raw);return {provider:url.searchParams.get('provider'),method:url.searchParams.get('code_challenge_method'),redirect:url.searchParams.get('redirect_to')};
  }));
  assert.deepEqual(requests.map(r=>r.provider),['google','discord']);
  assert.ok(requests.every(r=>r.method==='s256'&&r.redirect==='lull://auth/callback'));
  const slots=fs.readdirSync(path.join(profile,'account')).filter(name=>/^lull-account-flow-[a-zA-Z0-9_-]{8,64}-code-verifier\.bin$/.test(name));
  assert.equal(slots.length,2,'Both actual button clicks must persist independent native verifier slots');
  assert.deepEqual(await page.getByRole('alert').allTextContents(),[]);
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/native-signin.png'});
  const result={platform:process.platform,arch:process.arch,actualButtonClicks:['Google','Discord'],providerBoundary:true,pkce:'s256',encryptedVerifierSlots:slots.length,realProviderConsent:false};
  fs.writeFileSync('test-results/native-signin.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {
  await app?.close().catch(()=>{});
  assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(profile).startsWith('lull-signin-ui-'));
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
