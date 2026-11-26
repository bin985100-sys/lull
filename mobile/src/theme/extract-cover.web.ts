import { colorsFromPixels } from './cover-colors';
export function readCoverPixels(uri:string){return new Promise<Uint8Array>((resolve,reject)=>{
 const image=new window.Image(),timer=setTimeout(()=>{image.src='';reject(Error('Cover timeout'));},4000);image.crossOrigin='anonymous';
 image.onerror=()=>{clearTimeout(timer);reject(Error('Cover unavailable'));};
 image.onload=()=>{clearTimeout(timer);try{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('No canvas');context.drawImage(image,0,0,16,16);resolve(new Uint8Array(context.getImageData(0,0,16,16).data));}catch(e){reject(e);}};image.src=uri;
});}

export async function extractCover(uri:string){return colorsFromPixels(await readCoverPixels(uri));}
