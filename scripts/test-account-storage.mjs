import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
fs.mkdirSync('work',{recursive:true});
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lull-account-storage-'));
const handlers=new Map(), owner={}, encryptionKey=randomBytes(32);
globalThis.__accountElectron={
  app:{getPath:()=>directory},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
  safeStorage:{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'test-encrypted',
    encryptString:value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);},
    decryptString:value=>{const cipher=createDecipheriv('aes-256-gcm',encryptionKey,value.subarray(0,12));cipher.setAuthTag(value.subarray(-16));return Buffer.concat([cipher.update(value.subarray(12,-16)),cipher.final()]).toString('utf8');}}
};
try {
  await build({entryPoints:['electron/account.ts'],outfile:'work/account-storage-main.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'electron-boundary',setup(b){b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const {app,ipcMain,safeStorage}=globalThis.__accountElectron;'}));}}]});
  await build({entryPoints:['scripts/account-storage-probe.mjs'],outfile:'work/account-storage-probe.mjs',bundle:true,format:'esm',platform:'node'});
  const {registerAccountIpc}=await import('../work/account-storage-main.mjs');registerAccountIpc(()=>owner);
  const get=key=>Promise.resolve().then(()=>handlers.get('account:storage:get')({sender:owner},key));
  const set=(key,value)=>Promise.resolve().then(()=>handlers.get('account:storage:set')({sender:owner},key,value));
  const {runAccountStorageProbe}=await import('../work/account-storage-probe.mjs');
  const result=await runAccountStorageProbe({getItem:get,setItem:set,removeItem:key=>set(key,null)});
  const key='lull-account-flow-0123456789abcdef0123456789abcdef-code-verifier';
  await set(key,'test-only-verifier');assert.equal(await get(key),'test-only-verifier');
  assert.equal(fs.readFileSync(path.join(directory,'account',key+'.bin')).includes(Buffer.from('test-only-verifier')),false,'Verifier must not be stored as plaintext');
  assert.throws(()=>handlers.get('account:storage:get')({sender:{}},key),/Account access denied/);
  await set(key,null);
  console.log('PASS actual Supabase SDK through Electron IPC: '+JSON.stringify(result)+'; encrypted bytes and sender isolation verified');
} finally {assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('lull-account-storage-'));fs.rmSync(directory,{recursive:true,force:true});delete globalThis.__accountElectron;}
