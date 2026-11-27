import { type CoverColors } from './cover-colors';
const presets=[['#ed518a','#ffbe92','#28101e'],['#6099fa','#bc7bed','#111b36'],['#49c6b7','#b8e89b','#102e2a'],['#ef9850','#ef6077','#301b16'],['#8b87ee','#70d2ec','#181c37'],['#d071b4','#edcaa4','#291a2c']];
export function moodColors(tone:number):CoverColors{const [main,accent,deep]=presets[((Math.round(tone)%presets.length)+presets.length)%presets.length];return {main,accent,deep,light:'#f7eee8'};}
