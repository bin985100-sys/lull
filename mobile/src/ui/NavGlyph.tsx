import { memo } from 'react';
import { SvgXml } from 'react-native-svg';
import { ICON_XML, type IconName } from './icon-xml';
const glyphs:Record<'listen'|'wave'|'search'|'collection',[IconName,IconName]>={listen:['navListen','navHomeFill'],wave:['nowBars','navWaveFill'],search:['search','navSearchFill'],collection:['navCollection','navLibraryFill']};
export const NavGlyph=memo(function NavGlyph({name,filled,color,size=30}:{name:keyof typeof glyphs;filled:boolean;color:string;size?:number}){return <SvgXml xml={ICON_XML[glyphs[name][filled?1:0]]} width={size} height={size} color={color}/>;});
