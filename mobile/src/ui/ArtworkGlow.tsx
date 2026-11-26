import { memo, useEffect, useState } from 'react';
import { Image, type ImageStyle } from 'expo-image';
import { readCoverPixels } from '@/theme/extract-cover';
import { glowPng, pngDataUrl } from '@/theme/artwork-glow';

const cache=new Map<string,Promise<string>>();
/** Artwork-shaped, pre-blurred light. No generic halo, live filter or palette substitution. */
export const ArtworkGlow=memo(function ArtworkGlow({uri,style,opacity=.65}:{uri?:string;style:ImageStyle;opacity?:number}){
 const [texture,setTexture]=useState<{uri:string;data:string}|null>(null);
 useEffect(()=>{if(!uri)return;let live=true,job=cache.get(uri);if(!job){job=readCoverPixels(uri).then(p=>pngDataUrl(glowPng(p))).catch(e=>{cache.delete(uri);throw e;});cache.set(uri,job);if(cache.size>32)cache.delete(cache.keys().next().value!);}void job.then(data=>{if(live)setTexture({uri,data});},()=>{});return()=>{live=false;};},[uri]);
 if(!texture||texture.uri!==uri)return null;
 return <Image pointerEvents="none" accessibilityElementsHidden source={{uri:texture.data}} contentFit="fill" transition={700} style={[{position:'absolute',opacity},style]}/>;
});
