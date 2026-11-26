import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lull-artwork-glow-')),out=path.join(dir,'test.mjs');
try{
 await build({stdin:{contents:"export * from './src/theme/artwork-glow';export {pixelsFromPng} from './src/theme/cover-colors';",resolveDir:root},outfile:out,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {glowPixels,glowPng,pngDataUrl,pixelsFromPng}=await import(pathToFileURL(out).href);
 const cover=new Uint8Array(16*16*4);for(let y=0;y<16;y++)for(let x=0;x<16;x++)cover.set(x<8?[250,20,10,255]:[10,20,250,255],(y*16+x)*4);
 const light=glowPixels(cover),left=(32*64+22)*4,right=(32*64+42)*4;
 assert.ok(light[left]>light[left+2]*2,'Red artwork region must stay on the left');assert.ok(light[right+2]>light[right]*2,'Blue artwork region must stay on the right');
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x===0||y===0||x===63||y===63)assert.equal(light[(y*64+x)*4+3],0,'No hard rectangular edge');
 const black=new Uint8Array(16*16*4);for(let i=3;i<black.length;i+=4)black[i]=255;assert.ok(glowPixels(black).every(v=>v===0),'Dark artwork must not acquire invented light');
 const spot=black.slice();spot.set([255,200,20,255],(3*16+3)*4);const spotLight=glowPixels(spot);assert.notDeepEqual(spotLight,light,'Artwork geometry must affect the glow');assert.ok(spotLight[(22*64+22)*4+3]>spotLight[(42*64+42)*4+3]);
 const png=glowPng(cover);assert.deepEqual(pixelsFromPng(png),light);assert.deepEqual(Buffer.from(pngDataUrl(png).split(',')[1],'base64'),Buffer.from(png));assert.throws(()=>glowPixels(new Uint8Array(4)));
 console.log('Artwork glow: spatial colours, cover-shaped emission, transparent edges, dark covers and PNG roundtrip passed');
}finally{const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('lull-artwork-glow-'));fs.rmSync(target,{recursive:true,force:true});}
