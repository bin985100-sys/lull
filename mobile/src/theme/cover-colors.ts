import { unzlibSync } from 'fflate';
export type CoverColors={deep:string;main:string;accent:string;light:string};
export function bytesFromBase64(text:string){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',out=new Uint8Array(Math.floor(text.length*3/4));let bits=0,value=0,pos=0;
 for(const c of text){if(c==='=')break;const n=alphabet.indexOf(c);if(n<0)throw Error('Invalid base64');value=((value<<6)|n)&0xffffff;bits+=6;if(bits>=8){bits-=8;out[pos++]=(value>>bits)&255;}}
 return out.slice(0,pos);
}
const hex=(r:number,g:number,b:number)=>'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const tint=(c:number[],factor:number,offset=0)=>hex(c[0]*factor+offset,c[1]*factor+offset,c[2]*factor+offset);
const vivid=(c:number[])=>{const low=Math.min(...c),range=Math.max(...c)-low;return range>35?c.map(v=>35+(v-low)/range*180):c;};
export function colorsFromPixels(rgba:Uint8Array):CoverColors{
 const bins=new Map<number,{rgb:number[];n:number;score:number}>();
 for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]<160)continue;const c=[rgba[i],rgba[i+1],rgba[i+2]],max=Math.max(...c),min=Math.min(...c);if(max<20||min>240)continue;const id=(c[0]>>5)*64+(c[1]>>5)*8+(c[2]>>5),v=bins.get(id)??{rgb:[0,0,0],n:0,score:0};v.n++;v.score+=1+(max-min)/90;for(let j=0;j<3;j++)v.rgb[j]+=c[j];bins.set(id,v);}
 const all=[...bins.values()],chromatic=all.filter(v=>Math.max(...v.rgb)-Math.min(...v.rgb)>v.n*35);
 const ranked=(chromatic.reduce((n,v)=>n+v.n,0)>=6?chromatic:all).sort((a,b)=>b.score-a.score),a=ranked[0]?.rgb.map(v=>v/ranked[0].n)??[80,85,105];
 const second=ranked.find(v=>v.rgb.reduce((n,c,i)=>n+Math.abs(c/v.n-a[i]),0)>110),b=second?.rgb.map(v=>v/second.n)??a.map((v,i)=>v+(i===2?35:5));
 return {deep:tint(a,.16,6),main:tint(vivid(a),.95,12),accent:tint(vivid(b),.98,12),light:tint(a,.25,180)};
}
export function fallbackColors(seed:string):CoverColors{
 let hash=0;for(const c of seed)hash=(hash*31+c.charCodeAt(0))>>>0;
 const hue=(hash%360)/60,saturation=.4+((hash>>>8)%40)/100,value=.55+((hash>>>16)%30)/100;
 const x=value*(1-saturation*Math.abs(hue%2-1)),m=value*(1-saturation),v=value;
 const c=([ [v,x,m],[x,v,m],[m,v,x],[m,x,v],[x,m,v],[v,m,x] ][Math.floor(hue)]).map(n=>n*255);
 return {deep:tint(c,.16,6),main:tint(c,.6,10),accent:tint(c,.9,20),light:tint(c,.25,180)};
}
/** Bounded 16px PNG output from ImageManipulator; all standard 8-bit row filters. */
export function pixelsFromPng(bytes:Uint8Array):Uint8Array{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint32(0)!==0x89504e47)throw Error('Not PNG');
 let w=0,h=0,channels=0;const chunks:Uint8Array[]=[];
 for(let p=8;p+12<=bytes.length;){const n=view.getUint32(p),tag=String.fromCharCode(...bytes.slice(p+4,p+8));if(p+12+n>bytes.length)throw Error('Invalid PNG');if(tag==='IHDR'){w=view.getUint32(p+8);h=view.getUint32(p+12);if(bytes[p+16]!==8||bytes[p+20]!==0||w*h>4096)throw Error('Unsupported PNG');channels=({0:1,2:3,4:2,6:4} as Record<number,number>)[bytes[p+17]]??0;}if(tag==='IDAT')chunks.push(bytes.slice(p+8,p+8+n));p+=n+12;}
 if(!channels||!w||!h)throw Error('Unsupported PNG');
 const compressed=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let pos=0;for(const c of chunks){compressed.set(c,pos);pos+=c.length;}
 const raw=unzlibSync(compressed),stride=w*channels,data=new Uint8Array(stride*h),rgba=new Uint8Array(w*h*4);
 if(raw.length!==(stride+1)*h)throw Error('Invalid PNG rows');
 for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?data[i-channels]:0,b=y?data[i-stride]:0,c=y&&x>=channels?data[i-stride-channels]:0;let extra=0;if(filter===1)extra=a;else if(filter===2)extra=b;else if(filter===3)extra=Math.floor((a+b)/2);else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);extra=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}else if(filter!==0)throw Error('Unsupported filter');data[i]=(raw[y*(stride+1)+1+x]+extra)&255;}}
 for(let p=0;p<w*h;p++){const i=p*channels,o=p*4;rgba[o]=data[i];rgba[o+1]=channels<3?data[i]:data[i+1];rgba[o+2]=channels<3?data[i]:data[i+2];rgba[o+3]=channels===2?data[i+1]:channels===4?data[i+3]:255;}
 return rgba;
}
