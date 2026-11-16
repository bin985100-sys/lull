import { create } from 'zustand';

export const useChrome=create<{collapsed:boolean;query:string;focusRequest:number}>(()=>({collapsed:false,query:'',focusRequest:0}));
export const setChromeCollapsed=(collapsed:boolean)=>{if(useChrome.getState().collapsed!==collapsed)useChrome.setState({collapsed});};
export const setSearchQuery=(query:string)=>useChrome.setState({query});
export const requestSearchFocus=()=>useChrome.setState(s=>({focusRequest:s.focusRequest+1}));
