import { create } from 'zustand';
import { type Track } from '@/api/audius';
import { currentTrack, usePlayer } from '@/player/player';

const key=(track:Track)=>track.source+':'+track.id;
/** One visual deck for every entry point. Visiting another screen is not a
 * request to reshuffle recommendations or to reset the preview selection. */
export const useWavePresentation=create<{idleTracks:Track[];previewKey:string|null}>(()=>({idleTracks:[],previewKey:null}));
export function offerWaveTracks(tracks:Track[]){
 const rows=[...new Map(tracks.filter(Boolean).map(track=>[key(track),track])).values()];
 const old=useWavePresentation.getState();
 if(!rows.length||old.idleTracks.length>1||old.idleTracks.length>=rows.length)return;
 useWavePresentation.setState({idleTracks:rows,previewKey:old.previewKey??key(rows[0])});
}
export function previewWaveTrack(track:Track){
 const next=key(track);if(useWavePresentation.getState().previewKey!==next)useWavePresentation.setState({previewKey:next});
}
usePlayer.subscribe((state,previous)=>{
 const track=currentTrack(state),old=currentTrack(previous);
 if(state.session!==previous.session||(track?key(track):null)!==(old?key(old):null))useWavePresentation.setState({previewKey:track?key(track):null});
});
