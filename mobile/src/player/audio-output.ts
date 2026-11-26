import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
export type { OutputDevice } from './output-types';
export const selectedOutput=()=>'';
export const outputSupport=()=>({choices:false,picker:Platform.OS==='android',airplay:false});
export async function listOutputs(){return [{id:'',label:'Системный аудиовыход'}];}
export async function selectOutput(_id:string){void _id;await openOutputPicker();}
export async function openOutputPicker(){
 if(Platform.OS!=='android')throw Error('Выбери AirPlay или наушники в Пункте управления');
 try{await IntentLauncher.startActivityAsync(Number(Platform.Version)>=29?IntentLauncher.ActivityAction.PANEL_VOLUME:IntentLauncher.ActivityAction.BLUETOOTH_SETTINGS);}
 catch{await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.BLUETOOTH_SETTINGS);}
}
export async function openBluetooth(){if(Platform.OS==='android')await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.BLUETOOTH_SETTINGS);}
