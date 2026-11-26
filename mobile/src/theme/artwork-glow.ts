import { zlibSync } from 'fflate';

const N=64;
/** Preserve where the cover's colours actually occur. Bright/saturated areas emit more light. */
export function glowPixels(source:Uint8Array){
 if(source.length!==16*16*4)throw Error('Expected a 16px artwork');
 let pixels=new Float32Array(N*N*4);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const i=((y>>1)*16+(x>>1))*4,o=((y+16)*N+x+16)*4;
  const r=source[i]/255,g=source[i+1]/255,b=source[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b);
  const alpha=(source[i+3]/255)*Math.max(0,max-.08)*(.3+(max-min)*.85);
  pixels[o]=r*alpha;pixels[o+1]=g*alpha;pixels[o+2]=b*alpha;pixels[o+3]=alpha;
 }
 // Three separable box passes approximate a Gaussian on this tiny texture only once.
 for(let pass=0;pass<3;pass++)for(const vertical of [false,true]){
  const next=new Float32Array(pixels.length);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)for(let c=0;c<4;c++){
   let sum=0;for(let k=-5;k<=5;k++){const xx=vertical?x:x+k,yy=vertical?y+k:y;if(xx>=0&&xx<N&&yy>=0&&yy<N)sum+=pixels[(yy*N+xx)*4+c];}
   next[(y*N+x)*4+c]=sum/11;
  }pixels=next;
 }
 const out=new Uint8Array(pixels.length);
 for(let i=0;i<out.length;i+=4){const alpha=pixels[i+3];if(alpha<.0005)continue;for(let c=0;c<3;c++)out[i+c]=Math.round(255*pixels[i+c]/alpha);out[i+3]=Math.round(255*Math.min(1,alpha*2));}
 return out;
}
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name:string,data:Uint8Array){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);for(let i=0;i<4;i++)out[4+i]=name.charCodeAt(i);out.set(data,8);v.setUint32(data.length+8,crc32(out.subarray(4,data.length+8)));return out;}
export function glowPng(source:Uint8Array){
 const rgba=glowPixels(source),rows=new Uint8Array(N*(N*4+1));for(let y=0;y<N;y++)rows.set(rgba.subarray(y*N*4,(y+1)*N*4),y*(N*4+1)+1);
 const head=new Uint8Array(13),view=new DataView(head.buffer);view.setUint32(0,N);view.setUint32(4,N);head[8]=8;head[9]=6;
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlibSync(rows,{level:3})),chunk('IEND',new Uint8Array())],out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
}
export function pngDataUrl(bytes:Uint8Array){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',parts:string[]=[];for(let i=0;i<bytes.length;i+=3){const v=(bytes[i]<<16)|((bytes[i+1]??0)<<8)|(bytes[i+2]??0);parts.push(abc[v>>>18],abc[(v>>>12)&63],i+1<bytes.length?abc[(v>>>6)&63]:'=',i+2<bytes.length?abc[v&63]:'=');}return 'data:image/png;base64,'+parts.join('');}
