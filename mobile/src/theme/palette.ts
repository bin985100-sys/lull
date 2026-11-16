export const DARK = {
  bg:'#080a0e',s1:'#15171d',s2:'#20232b',s3:'#2b303a',s4:'#373d48',
  line:'rgba(255,255,255,0.09)',tx:'#f5f7fc',tx2:'#a7adba',tx3:'#79818f',
  glass:'rgba(24,28,36,0.56)',glassLine:'rgba(255,255,255,0.18)',
  danger:'#ff8d95',rose:'#ff6b91',sky:'#76c8ff',violet:'#bca5ff',gold:'#f3ca85',
  inverse:'#101216',onAccent:'#ffffff',shadow:'rgba(0,0,0,0.3)',
};
export type ThemeColors = {[K in keyof typeof DARK]:string};
export const LIGHT:ThemeColors = {
  bg:'#f8f9fc',s1:'#ffffff',s2:'#eff1f6',s3:'#e6e9f0',s4:'#d8dee9',
  line:'rgba(22,30,48,0.08)',tx:'#11151e',tx2:'#626b7b',tx3:'#8791a1',
  glass:'rgba(255,255,255,0.62)',glassLine:'rgba(255,255,255,0.9)',
  danger:'#c93349',rose:'#d63c68',sky:'#077ed8',violet:'#7959d8',gold:'#ac7628',
  inverse:'#ffffff',onAccent:'#ffffff',shadow:'rgba(20,34,62,0.12)',
};
