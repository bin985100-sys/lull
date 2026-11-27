import { zlibSync } from 'fflate';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(name:string,data:Uint8Array){
 const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);view.setUint32(0,data.length);
 for(let i=0;i<4;i++)out[i+4]=name.charCodeAt(i);out.set(data,8);
 let crc=0xffffffff;for(let i=4;i<out.length-4;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);
 view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
/** Small prepainted textures: no live RenderEffect, backdrop capture or per-frame JS. */
export function pngTexture(rgba:Uint8Array,width:number,height:number){
 if(width<1||height<1||width*height>4096||rgba.length!==width*height*4)throw Error('Invalid texture dimensions');
 const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const rows=new Uint8Array((width*4+1)*height);for(let y=0;y<height;y++)rows.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlibSync(rows,{level:3})),chunk('IEND',new Uint8Array())];
 const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}
 let encoded='';for(let i=0;i<bytes.length;i+=3){const n=(bytes[i]<<16)|((bytes[i+1]??0)<<8)|(bytes[i+2]??0);encoded+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63]+(i+1<bytes.length?alphabet[(n>>>6)&63]:'=')+(i+2<bytes.length?alphabet[n&63]:'=');}
 return 'data:image/png;base64,'+encoded;
}
export function softenTexture(input:Uint8Array,width:number,height:number,radius=4){
 if(input.length!==width*height*4||width<1||height<1||width*height>4096)throw Error('Invalid blur dimensions');
 let pixels=Float32Array.from(input);const size=radius*2+1;
 for(let pass=0;pass<3;pass++)for(let axis=0;axis<2;axis++){
  const out=new Float32Array(pixels.length),lines=axis?width:height,length=axis?height:width;
  for(let line=0;line<lines;line++)for(let channel=0;channel<4;channel++){
   const index=(p:number)=>(axis?Math.max(0,Math.min(length-1,p))*width+line:line*width+Math.max(0,Math.min(length-1,p)))*4+channel;
   let sum=0;for(let k=-radius;k<=radius;k++)sum+=pixels[index(k)];
   for(let p=0;p<length;p++){out[index(p)]=sum/size;sum+=pixels[index(p+radius+1)]-pixels[index(p-radius)];}
  }
  pixels=out;
 }
 return Uint8Array.from(pixels,v=>Math.round(v));
}

export function textureBrightness(pixels:Uint8Array){
 let light=0,weight=0;for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;light+=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)*a;weight+=a;}
 return weight?light/(weight*255):0;
}
