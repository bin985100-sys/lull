export const DARK = {
 bg:'#000000',s1:'#000000',s2:'#000000',s3:'#000000',s4:'#000000',
 line:'rgba(255,255,255,.15)',tx:'#f7f5f1',tx2:'#aaa8b0',tx3:'#787780',
 glass:'#000000',glassLine:'rgba(255,255,255,.15)',
 danger:'#ff737d',rose:'#ff617b',sky:'#f7f5f1',violet:'#bc9aff',gold:'#eac573',
 inverse:'#111114',onAccent:'#161112',shadow:'rgba(0,0,0,.22)',
};
export type ThemeColors = {[K in keyof typeof DARK]:string};
export const LIGHT:ThemeColors = {
 bg:'#f7f5f1',s1:'#ffffff',s2:'#eeebe5',s3:'#e3dfd7',s4:'#d0cac0',
 line:'rgba(40,31,25,.10)',tx:'#19181b',tx2:'#767078',tx3:'#938d93',
 glass:'#ffffff',glassLine:'rgba(40,31,25,.10)',
 danger:'#bf3448',rose:'#cf365a',sky:'#19181b',violet:'#7150a6',gold:'#8e681b',
 inverse:'#fffaf6',onAccent:'#ffffff',shadow:'rgba(40,31,25,.10)',
};
