export function coverBackdrop(uri:string){return new Promise<string>((resolve,reject)=>{
 const image=new window.Image(),timer=setTimeout(()=>{image.src='';reject(Error('Cover timeout'));},4000);image.crossOrigin='anonymous';
 image.onerror=()=>{clearTimeout(timer);reject(Error('Cover unavailable'));};
 image.onload=()=>{clearTimeout(timer);try{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;const ctx=canvas.getContext('2d');if(!ctx)throw Error('No canvas');ctx.drawImage(image,0,0,96,96);resolve(canvas.toDataURL('image/jpeg',.7));}catch(e){reject(e);}};image.src=uri;
});}
