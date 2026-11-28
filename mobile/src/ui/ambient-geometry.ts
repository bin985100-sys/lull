/** Keep the entire viewport inside the transformed image, including narrow
 * player capsules. Rotation and drift shrink with the short dimension. */
export function ambientGeometry(width:number,height:number,cover:boolean){
 const w=Math.max(1,width),h=Math.max(1,height);
 return {angle:3*Math.min(w,h)/Math.max(w,h),x:Math.min(cover?12:10,w*.035),y:Math.min(8,h*.035),scale:cover?1.18:1.22};
}
