import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { bytesFromBase64, colorsFromPixels, pixelsFromPng } from './cover-colors';

export async function readCoverPixels(uri:string){
 const cached=await Image.getCachePathAsync(uri).catch(()=>null);
 const context=ImageManipulator.manipulate(cached??uri,{maxWidth:16,maxHeight:16});
 try{
  context.resize({width:16,height:16});const image=await context.renderAsync();
  try{const result=await image.saveAsync({format:SaveFormat.PNG,base64:true});if(!result.base64)throw Error('No pixels');const pixels=pixelsFromPng(bytesFromBase64(result.base64));if(result.uri.startsWith(Paths.cache.uri)){try{new File(result.uri).delete();}catch{/* Cache cleanup is best effort. */}}return pixels;}finally{image.release();}
 }finally{context.release();}
}

export async function extractCover(uri:string){return colorsFromPixels(await readCoverPixels(uri));}
