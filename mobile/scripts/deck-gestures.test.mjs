import assert from 'node:assert/strict';import {build} from 'esbuild';
const stubs={
 react:`const r=()=>globalThis.__deckHooks;export const memo=x=>x;export const useState=(...a)=>r().state(...a);export const useRef=(...a)=>r().ref(...a);export const useMemo=(...a)=>r().memo(...a);export const useCallback=(fn,deps)=>r().memo(()=>fn,deps);export const useEffect=(...a)=>r().effect(...a);export const useLayoutEffect=useEffect;`,
 'react/jsx-runtime':`export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment='Fragment';`,
 'react-native':`export const Platform={OS:'android'};export const View='View';export const StyleSheet={absoluteFill:{}};`,
 'expo-linear-gradient':`export const LinearGradient='Gradient';`,
 'react-native-gesture-handler':`export const GestureDetector='Detector';export const usePanGesture=c=>(globalThis.__deckHooks.pan=c);export const useLongPressGesture=c=>(globalThis.__deckHooks.hold=c);export const useTapGesture=c=>(globalThis.__deckHooks.tap=c);export const useSimultaneousGestures=(...a)=>a;`,
 'react-native-reanimated':`import {useState} from 'react';export default {View:'AnimatedView'};export const useReducedMotion=()=>false;export const useSharedValue=v=>useState(()=>({value:v,get(){return this.value},set(x){if(typeof x!=='object')this.value=x}}))[0];export const useAnimatedStyle=f=>f();export const useAnimatedReaction=()=>{};export const cancelAnimation=()=>{};export const withSpring=v=>({animation:v});export const withTiming=withSpring;export const Easing={bezier:()=>0};`,
 'react-native-worklets':`export const scheduleOnRN=(f,...a)=>globalThis.__deckHooks.queue.push(()=>f(...a));`,
 '@/theme/tokens':`export const F={};`, '@/ui/kit':`export const Cover='Cover',T='T',haptic=()=>{};`,
};
const compiled=await build({entryPoints:['src/components/WaveCoverDeck.tsx'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',plugins:[{name:'native-events',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
const {WaveCoverDeck}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
function fresh(){
 const slots=[],commits=[],previews=[],canceled=[];let cursor=0,effects=[];
 const changed=(a,b)=>!b||a.length!==b.length||a.some((x,i)=>x!==b[i]);
 const hooks={queue:[],state(init){const i=cursor++;if(!slots[i])slots[i]={value:typeof init==='function'?init():init};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},ref(init){return this.state(()=>({current:init}))[0];},memo(fn,deps){const i=cursor++;if(!slots[i]||changed(deps,slots[i].deps))slots[i]={value:fn(),deps};return slots[i].value;},effect(fn,deps){const i=cursor++;if(!slots[i]||changed(deps,slots[i].deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 globalThis.__deckHooks=hooks;
 let props={tracks:Array.from({length:10},(_,i)=>({id:'t'+i,source:'yt',title:'Track '+i,artist:'A'})),activeIndex:0,contextKey:'wave-1',enabled:true,onSelect:t=>{commits.push(t.id);return true;},onPreview:t=>previews.push(t.id),onCancel:()=>canceled.push(true)};
 const render=(next={})=>{props={...props,...next};cursor=0;effects=[];const tree=WaveCoverDeck(props);effects.forEach(f=>f());return tree;};
 const flush=()=>{while(hooks.queue.length)hooks.queue.shift()();};render();
 const begin=()=>{hooks.pan.onBegin({x:200,y:100});flush();render();};
 return {hooks,commits,previews,canceled,render,flush,begin,get props(){return props},unmount:()=>slots.forEach(s=>s?.cleanup?.())};
}
let cases=0;async function test(name,fn){const s=fresh();try{await fn(s);console.log('OK',name);cases++;}finally{s.unmount();}}
await test('A side-cover tap commits its target before the spring starts',s=>{s.begin();s.hooks.tap.onDeactivate({x:350,y:100,canceled:false});s.flush();assert.deepEqual(s.commits,['t1']);});
await test('Hold and drag survives movement beyond the old 15-point limit and commits once',s=>{s.begin();assert.ok(s.hooks.hold.maxDistance>=1000);s.hooks.hold.onActivate();s.hooks.pan.onActivate();s.hooks.pan.onUpdate({translationX:-233.6});s.hooks.hold.onDeactivate({canceled:false});s.hooks.pan.onDeactivate({canceled:false});s.flush();assert.deepEqual(s.commits,['t3']);});
await test('A held deck commits the original recording despite a queue update',s=>{s.begin();s.hooks.hold.onActivate();s.hooks.pan.onActivate();s.hooks.pan.onUpdate({translationX:-146});s.render({tracks:s.props.tracks.slice().reverse()});s.hooks.hold.onDeactivate({canceled:false});s.flush();assert.deepEqual(s.commits,['t2']);});
await test('A callback arriving after navigation cannot change playback',s=>{s.begin();s.hooks.pan.onActivate();s.hooks.pan.onUpdate({translationX:-220});s.hooks.pan.onDeactivate({canceled:false});s.render({enabled:false});s.flush();assert.deepEqual(s.commits,[]);});
await test('A callback from another wave/session cannot change the new queue',s=>{s.begin();s.hooks.pan.onActivate();s.hooks.pan.onUpdate({translationX:-220});s.hooks.pan.onDeactivate({canceled:false});s.render({contextKey:'wave-2'});s.flush();assert.deepEqual(s.commits,[]);});
await test('Unmount cancels queued selections',s=>{s.begin();s.hooks.tap.onDeactivate({x:350,y:100,canceled:false});s.unmount();s.flush();assert.deepEqual(s.commits,[]);});
await test('Canceled hold restores the sounding song rather than leaving a false preview',s=>{s.begin();s.hooks.hold.onActivate();s.hooks.pan.onActivate();s.hooks.pan.onUpdate({translationX:-146});s.hooks.hold.onDeactivate({canceled:true});s.flush();assert.deepEqual(s.commits,[]);assert.ok(s.canceled.length);});
await test('A native pointer outside the covers cannot become a tab-triggered selection',s=>{s.hooks.pan.onBegin({x:350,y:800});s.flush();s.hooks.tap.onDeactivate({x:350,y:800,canceled:false});s.flush();assert.deepEqual(s.commits,[]);});
console.log(`${cases} real deck callback sequences passed`);
