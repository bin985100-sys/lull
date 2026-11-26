/** Isolated adapter for the pinned Expo web playlist. Unsupported hosts stay on system output. */
type Media={setSinkId?:(id:string)=>Promise<void>;webkitShowPlaybackTargetPicker?:()=>void};
type Host={_currentMedia?:Media|null;_nextMedia?:Media|null;_createMediaElement?:(...args:unknown[])=>Media};
export function createSinkRouter(value:unknown){
 const host=value as Host|null;let selected='',attached=false;
 const supported=()=>attached&&!!host&&typeof host._currentMedia?.setSinkId==='function'&&typeof host._createMediaElement==='function';
 if(host&&typeof host._createMediaElement==='function'){
  const original=host._createMediaElement;
  try{host._createMediaElement=function(...args){const media=original.apply(this,args);if(selected&&media.setSinkId)void media.setSinkId(selected).catch(()=>{selected='';void media.setSinkId?.('').catch(()=>{});});return media;};attached=true;}catch{/* A changed library host falls back to system output. */}
 }
 return {supported,airplay:()=>typeof host?._currentMedia?.webkitShowPlaybackTargetPicker==='function',showAirplay:()=>host?._currentMedia?.webkitShowPlaybackTargetPicker?.(),
  async select(id:string){if(!supported())throw Error('Браузер использует системный аудиовыход');const previous=selected;try{await host!._currentMedia!.setSinkId!(id);if(host!._nextMedia?.setSinkId)await host!._nextMedia.setSinkId(id);selected=id;}catch(e){await Promise.allSettled([host?._currentMedia?.setSinkId?.(previous),host?._nextMedia?.setSinkId?.(previous)]);throw e;}},get selected(){return selected;}};
}
