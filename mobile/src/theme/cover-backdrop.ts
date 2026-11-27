import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { bytesFromBase64, pixelsFromPng } from './cover-colors';
import { pngTexture, softenTexture, textureBrightness } from './raster-texture';

/** A small once-decoded texture; never blur or capture the live screen. */
export async function coverBackdrop(uri:string){
 const cached=await Image.getCachePathAsync(uri).catch(()=>null);
 const context=ImageManipulator.manipulate(cached??uri,{maxWidth:64,maxHeight:64});
 try{context.resize({width:64,height:64});const image=await context.renderAsync();
  try{const result=await image.saveAsync({format:SaveFormat.PNG,base64:true});
   if(!result.base64)throw Error('Cover unavailable');
   const pixels=pixelsFromPng(bytesFromBase64(result.base64));
   const data={data:pngTexture(softenTexture(pixels,64,64),64,64),brightness:textureBrightness(pixels)};
   if(result.uri.startsWith(Paths.cache.uri)){try{new File(result.uri).delete();}catch{/* Only the generated file is disposable. */}}
   return data;
  }finally{image.release();}
 }finally{context.release();}
}
