import { pngTexture, softenTexture, textureBrightness } from './raster-texture';

/** Prepare the blur once; no reliance on Canvas.filter support or live CSS blur. */
export function coverBackdrop(uri:string){return new Promise<{data:string;brightness:number}>((resolve,reject)=>{
 const image=new window.Image(),timer=setTimeout(()=>{image.src='';reject(Error('Cover timeout'));},4000);image.crossOrigin='anonymous';
 image.onerror=()=>{clearTimeout(timer);reject(Error('Cover unavailable'));};
 image.onload=()=>{clearTimeout(timer);try{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');if(!ctx)throw Error('No canvas');ctx.drawImage(image,0,0,64,64);const pixels=new Uint8Array(ctx.getImageData(0,0,64,64).data);resolve({data:pngTexture(softenTexture(pixels,64,64),64,64),brightness:textureBrightness(pixels)});}catch(e){reject(e);}};image.src=uri;
});}
