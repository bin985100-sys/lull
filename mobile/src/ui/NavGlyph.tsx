import { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Rounded monochrome silhouettes; active tabs fill rather than change hue. */
export const NavGlyph=memo(function NavGlyph({name,filled,color,size=25}:{name:'listen'|'wave'|'search'|'collection';filled:boolean;color:string;size?:number}){
 return <Svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
  {name==='listen'?filled?<Path fill={color} strokeWidth={0} fillRule="evenodd" d="M3.5 11.3 12 4a3 3 0 0 1 4 0l8.5 7.3a2 2 0 0 1 .7 1.5v10a2.7 2.7 0 0 1-2.7 2.7h-5.3v-7a3.2 3.2 0 0 0-6.4 0v7H5.5a2.7 2.7 0 0 1-2.7-2.7v-10a2 2 0 0 1 .7-1.5Z"/>:<Path d="m3.5 12 9-7.7a2.3 2.3 0 0 1 3 0l9 7.7M5.5 10.5v12a2 2 0 0 0 2 2H11v-6a3 3 0 0 1 6 0v6h3.5a2 2 0 0 0 2-2v-12"/>:null}
  {name==='wave'?<>{[7,14,21].map((x,i)=><Rect key={x} x={x-2.5} y={[9,4,7][i]} width={5} height={[12,22,16][i]} rx={2.5} fill={filled?color:'none'} strokeWidth={filled?1:2.4}/>)}</>:null}
  {name==='search'?<><Circle cx={12} cy={12} r={8} strokeWidth={filled?4.8:2.6}/><Path d="m18.5 18.5 6 6" strokeWidth={filled?4.5:2.8}/></>:null}
  {name==='collection'?<><Rect x={4} y={4} width={8} height={21} rx={2.8} fill={filled?color:'none'}/><Rect x={16} y={7} width={8} height={18} rx={2.8} fill={filled?color:'none'}/></>:null}
 </Svg>;
});
