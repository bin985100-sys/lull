import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { useConnectivity } from '@/store/connectivity';
import { artworkSources, retryArtwork } from '@/theme/artwork-sources';

type Props=Omit<ImageProps,'source'|'onError'>&{uri?:string;fallbackUri?:string;trackId?:string};
/** A failed HD image can recover to standard artwork. One delayed retry also
 * recovers transient network errors; timers are cancelled when a row unmounts. */
export const Artwork=memo(function Artwork(props:Props){
 const epoch=useConnectivity(s=>s.epoch);
 return <ArtworkRequest key={[props.uri,props.fallbackUri,props.uri?'':props.trackId,epoch].join('|')} {...props}/>;
});
function ArtworkRequest({uri,fallbackUri,trackId,...props}:Props){
 const sources=useMemo(()=>artworkSources(uri,fallbackUri,trackId),[uri,fallbackUri,trackId]);
 const [attempt,setAttempt]=useState({index:0,round:0}),timer=useRef<ReturnType<typeof setTimeout>|null>(null),loading=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(loading.current)clearTimeout(loading.current);},[]);
 const selected=sources[attempt.index];if(!selected)return null;
 const source=attempt.round?retryArtwork(selected,attempt.round):selected;
 const fail=()=>{
  if(loading.current){clearTimeout(loading.current);loading.current=null;}
  if(attempt.index+1<sources.length){setAttempt({index:attempt.index+1,round:attempt.round});return;}
  if(attempt.round===0&&!timer.current)timer.current=setTimeout(()=>{timer.current=null;setAttempt({index:0,round:1});},900);
 };
 return <Image {...props} key={source} source={{uri:source}} cachePolicy="memory-disk" recyclingKey={source} onLoadStart={()=>{if(loading.current)clearTimeout(loading.current);loading.current=setTimeout(fail,3500);}} onLoad={()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}if(loading.current){clearTimeout(loading.current);loading.current=null;}}} onError={fail}/>;
}
