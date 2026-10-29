import {build} from 'esbuild';
import fs from 'node:fs';
fs.mkdirSync('android/app/src/androidTest/assets',{recursive:true});
await build({entryPoints:['scripts/account-storage-probe.mjs'],outfile:'android/app/src/androidTest/assets/account-storage-probe.js',bundle:true,format:'iife',globalName:'LullAccountStorageProbe',platform:'browser',target:'es2022'});
