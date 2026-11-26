import { audioOutputHost } from './player';
import { createSinkRouter } from './sink-router';
import type { OutputDevice } from './output-types';
export type { OutputDevice } from './output-types';
let listening=false;
let host:unknown,router:ReturnType<typeof createSinkRouter>|undefined;
function routing(){const value=audioOutputHost();if(!router||host!==value){host=value;router=createSinkRouter(value);}if(!listening&&navigator.mediaDevices?.addEventListener){listening=true;navigator.mediaDevices.addEventListener('devicechange',()=>{if(!router?.selected)return;void navigator.mediaDevices.enumerateDevices().then(devices=>{if(router?.selected&&!devices.some(d=>d.kind==='audiooutput'&&d.deviceId===router!.selected))void router.select('').catch(()=>{});},()=>{});});}return router;}
type ChoiceDevices=MediaDevices&{selectAudioOutput?:()=>Promise<MediaDeviceInfo>};
export const selectedOutput=()=>routing().selected;
export const outputSupport=()=>({choices:routing().supported(),picker:!!(navigator.mediaDevices as ChoiceDevices|undefined)?.selectAudioOutput||routing().airplay(),airplay:routing().airplay()});
export async function listOutputs():Promise<OutputDevice[]>{
 const all=await navigator.mediaDevices?.enumerateDevices?.()??[],seen=new Set(['']);
 return [{id:'',label:'Системный аудиовыход'},...all.filter(d=>d.kind==='audiooutput'&&d.deviceId&&d.deviceId!=='default'&&!seen.has(d.deviceId)&&!!seen.add(d.deviceId)).map((d,i)=>({id:d.deviceId,label:d.label||`Аудиоустройство ${i+1}`}))];
}
export async function selectOutput(id:string){await routing().select(id);}
export async function openOutputPicker(){
 if(routing().airplay()){routing().showAirplay();return;}
 const devices=navigator.mediaDevices as ChoiceDevices|undefined;if(!devices?.selectAudioOutput)throw Error('Выбери аудиовыход в настройках системы');
 const device=await devices.selectAudioOutput();await selectOutput(device.deviceId);
}
export async function openBluetooth(){throw Error('Подключи наушники в настройках Bluetooth устройства');}
