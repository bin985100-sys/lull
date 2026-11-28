import assert from 'node:assert/strict';import {build} from 'esbuild';
const built=await build({entryPoints:['src/ui/ambient-geometry.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {ambientGeometry}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
let count=0;for(const w of [32,56,72,280,390,500,840,1440,3000])for(const h of [32,56,72,280,650,1000,2200])for(const cover of [false,true])for(let phase=0;phase<=1.001;phase+=.05){
 const g=ambientGeometry(w,h,cover),angle=(-g.angle+2*g.angle*phase)*Math.PI/180,dx=-g.x+2*g.x*phase,dy=g.y-2*g.y*phase;
 for(const x of [-w/2,w/2])for(const y of [-h/2,h/2]){
  const a=x-dx,b=y-dy,localX=(a*Math.cos(angle)+b*Math.sin(angle))/g.scale,localY=(-a*Math.sin(angle)+b*Math.cos(angle))/g.scale;
  assert.ok(Math.abs(localX)<=w/2+.001&&Math.abs(localY)<=h/2+.001,`Exposed edge ${w}×${h}, cover=${cover}, phase=${phase}`);
 }count++;
}console.log(`${count} ambient frames cover every viewport corner, including wide capsules and full-screen waves`);
