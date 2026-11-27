import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import * as Picker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import logos from '@/ui/music-logos.json';
import { Btn, Press, T } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { LULL_API, mapTrack } from '@/api/lull';
import { parseLibrary, type FileList } from '@/api/file-library';
import { useLibrary } from '@/store/library';
import type { Track } from '@/api/audius';
import { softPush } from '@/nav';
import { IMPORT_TINTS, ImportIntro, ImportProgress, ServiceMark, type ImportVisualState } from './ImportVisuals';

export function FileImport({google,onServiceChange,onActiveChange}:{google:()=>void;onServiceChange?:(service:string)=>void;onActiveChange?:(active:boolean)=>void}) {
 const {colors:C}=useTheme();
 const [service,choose]=useState<keyof typeof logos|null>(null),[lists,setLists]=useState<FileList[]>([]),[selected,setSelected]=useState<number[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[state,setState]=useState<ImportVisualState|null>(null);
 const run=useRef<AbortController|null>(null);
 useEffect(()=>()=>run.current?.abort(),[]);
 useEffect(()=>{onActiveChange?.(!!state);},[state,onActiveChange]);
 async function pick(){
  try{
   const result=await Picker.getDocumentAsync({multiple:true,type:'*/*',copyToCacheDirectory:true,base64:false});if(result.canceled)return;
   const groups:FileList[]=[];
   for(const a of result.assets){if((a.size||0)>16*1024*1024)throw Error('Выбери файл меньше 16 МБ');const text=Platform.OS==='web'&&a.file?await a.file.text():await new File(a.uri).text();groups.push(...parseLibrary(text,a.name));}
   setLists(groups);setSelected(groups.map((_,i)=>i));setError('');setState(null);
  }catch(e){setError((e as Error).message);}
 }
 async function transfer(){
  if(run.current||!service)return;
  const ac=new AbortController();run.current=ac;setBusy(true);setError('');
  const owner=useLibrary.getState().account.userId,total=selected.reduce((n,i)=>n+lists[i].tracks.length,0);
  let saved=0,missing=0,checked=0;const artworks:Track[]=[];
  const report=(status:ImportVisualState['status'],name='')=>{if(!ac.signal.aborted)setState({status,service,name,done:checked,total,matched:status==='done'?saved:artworks.length,tracks:[...artworks]});};
  report('matching');
  try{
   for(const i of selected){
    const list=lists[i],found:Track[]=[];
    for(let off=0;off<list.tracks.length;off+=12){
     report('matching',list.name);
     const batch=list.tracks.slice(off,off+12),r=await fetch(LULL_API+'/api/import/file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracks:batch}),signal:ac.signal}),data=await r.json();
     if(!r.ok)throw Error(data.error||'Ошибка переноса');
     if(ac.signal.aborted||owner!==useLibrary.getState().account.userId)throw Error('Перенос остановлен');
     for(const t of data.tracks){if(t){const track=mapTrack(t);found.push(track);artworks.push(track);}else missing++;}
     checked+=batch.length;report('matching',list.name);
    }
    if(ac.signal.aborted||owner!==useLibrary.getState().account.userId)throw Error('Перенос остановлен');
    if(found.length){
     const lib=useLibrary.getState(),existing=lib.playlists.find(x=>x.name===list.name),ids=new Set(existing?.tracks.map(t=>t.id)??[]),added=found.filter(t=>!ids.has(t.id)&&!!ids.add(t.id));
     if(existing)lib.setPlaylistTracks(existing.id,[...existing.tracks,...added]);else lib.createPlaylist(list.name,added);
     saved+=added.length;
    }
   }
   report('done');setError(missing?`Не найдено: ${missing}. Уже сохранённые треки не дублируются.`:'Уже сохранённые треки не дублируются.');
  }catch(e){setState({status:'error',service,name:'',done:checked,total,matched:saved,tracks:artworks});setError(ac.signal.aborted?'Перенос отменён. Уже сохранённые плейлисты остались в коллекции.':(e as Error).message);}
  finally{run.current=null;setBusy(false);}
 }
 if(state)return <View style={{gap:20}}><ImportProgress state={state} file hint={error||undefined}/>{busy?<Btn borderless label="Отменить перенос" kind="dark" onPress={()=>run.current?.abort()}/>:<><Btn borderless label="Открыть коллекцию" icon="stack" onPress={()=>softPush('/collection')}/><Btn borderless label="Выбрать другую коллекцию" kind="dark" onPress={()=>{setState(null);setError('');}}/></>}</View>;
 return <View style={{gap:18}}>
  <ImportIntro/><T v="h2">Откуда твоя музыка?</T>
  <View accessibilityRole="radiogroup" accessibilityLabel="Музыкальный сервис" style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   {(Object.keys(logos) as (keyof typeof logos)[]).map(n=><Press key={n} accessibilityRole="radio" aria-checked={service===n} accessibilityState={{checked:service===n}} accessibilityLabel={n} onPress={()=>{choose(n);onServiceChange?.(n);setLists([]);setSelected([]);setError('');}} style={{flexGrow:1,flexBasis:'44%',minWidth:0,minHeight:106,borderRadius:28,overflow:'hidden',padding:17,gap:13,backgroundColor:C.bg}}>
    <LinearGradient pointerEvents="none" colors={[IMPORT_TINTS[n]+(service===n?'35':'14'),IMPORT_TINTS[n]+'04']} style={{position:'absolute',inset:0}}/><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><ServiceMark service={n}/>{service===n?<Icon name="check" size={18} color={IMPORT_TINTS[n]}/>:null}</View><T style={{fontFamily:F.semi,fontSize:12}}>{n}</T>
   </Press>)}
  </View>
  {service?<View style={{gap:16,paddingTop:8}}><T v="h2">Твоя коллекция из {service}</T><T v="small">Выбери экспорт в CSV, TSV или JSON. Плейлисты сохранят названия, а треки получат обложки из каталога Lull.</T>{service==='YouTube Music'?<Btn borderless label="Подключить Google" kind="dark" onPress={google}/>:null}<Btn borderless label="Выбрать файлы" icon="doc" onPress={pick}/>
   {lists.length?<><Press accessibilityRole="button" onPress={()=>setSelected(lists.map((_,i)=>i))} style={{minHeight:44,justifyContent:'center'}}><T v="sub">Выбрать все</T></Press>{lists.map((l,i)=><Press key={i} accessibilityRole="checkbox" accessibilityLabel={l.name} accessibilityState={{checked:selected.includes(i)}} onPress={()=>setSelected(selected.includes(i)?selected.filter(x=>x!==i):[...selected,i])} style={{minHeight:76,borderRadius:28,flexDirection:'row',alignItems:'center',gap:15,padding:12}}><View style={{width:42,height:42,borderRadius:21,backgroundColor:IMPORT_TINTS[service]+'20',alignItems:'center',justifyContent:'center'}}><Icon name={selected.includes(i)?'check':'note'} size={21} color={IMPORT_TINTS[service]}/></View><View style={{flex:1,gap:4}}><T style={{fontFamily:F.semi}}>{l.name}</T><T v="small">{l.tracks.length} треков</T></View></Press>)}<Btn borderless label="Перенести выбранное" disabled={!selected.length} onPress={transfer}/></>:null}
   {error?<T style={{color:C.danger}}>{error}</T>:null}
  </View>:null}
 </View>;
}
