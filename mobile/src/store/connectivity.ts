import { create } from 'zustand';
export const useConnectivity=create<{offline:boolean;epoch:number}>(()=>({offline:false,epoch:0}));
export function setConnectivity(state:{isConnected?:boolean;isInternetReachable?:boolean}){
 const offline=state.isConnected===false||state.isInternetReachable===false;
 useConnectivity.setState(previous=>offline===previous.offline?previous:{offline,epoch:previous.epoch+(previous.offline&&!offline?1:0)});
}
