/** Recovery stays on trusted catalogue image URLs; no extra catalogue lookup. */
export function artworkSources(uri?:string,fallbackUri?:string,trackId?:string){
 const urls=[uri,fallbackUri].filter((u):u is string=>!!u);
 if(uri){
  const proxy=uri.match(/([?&]u=)([^&]+)/);
  let raw=uri;try{if(proxy)raw=decodeURIComponent(proxy[2]);}catch{/* malformed legacy URL: use other candidates */}
  const small=raw.replace(/=w\d+-h\d+/, '=w512-h512').replace(/=s\d+(?=[-?#]|$)/,'=s512');
  if(small!==raw)urls.push(proxy?uri.replace(proxy[0],proxy[1]+encodeURIComponent(small)):small);
 }
 if(trackId&&/^[\w-]{11}$/.test(trackId)){
  const base=uri?.match(/^(https:\/\/[^/]+)\/api\/img\?/i)?.[1]??process.env.EXPO_PUBLIC_LULL_API??'https://api.lull.website';
  if(base)urls.push(base+'/api/img?u='+encodeURIComponent('https://i.ytimg.com/vi/'+trackId+'/hqdefault.jpg'));
 }
 return [...new Set(urls)];
}
export function retryArtwork(uri:string,round:number){return /\/api\/(img\?|artist-photo\/)/.test(uri)?uri+(uri.includes('?')?'&':'?')+'retry='+round:uri;}
