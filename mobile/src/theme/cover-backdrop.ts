import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';

/** A small once-decoded texture; never blur or capture the live screen. */
export async function coverBackdrop(uri:string){
 const cached=await Image.getCachePathAsync(uri).catch(()=>null);
 const context=ImageManipulator.manipulate(cached??uri,{maxWidth:96,maxHeight:96});
 try{context.resize({width:96,height:96});const image=await context.renderAsync();
  try{const result=await image.saveAsync({format:SaveFormat.JPEG,compress:.7,base64:true});
   if(!result.base64)throw Error('Cover unavailable');
   const data='data:image/jpeg;base64,'+result.base64;
   if(result.uri.startsWith(Paths.cache.uri)){try{new File(result.uri).delete();}catch{/* Only the generated file is disposable. */}}
   return data;
  }finally{image.release();}
 }finally{context.release();}
}
