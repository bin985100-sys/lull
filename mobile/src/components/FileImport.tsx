import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as Picker from 'expo-document-picker';
import { File } from 'expo-file-system';
import logos from '@/ui/music-logos.json';
import { Btn, T } from '@/ui/kit';
import { LULL_API, mapTrack } from '@/api/lull';
import { parseLibrary, type FileList } from '@/api/file-library';
import { useLibrary } from '@/store/library';
import type { Track } from '@/api/audius';

export function FileImport({google}:{google:()=>void}) {
  const [service,choose]=useState<keyof typeof logos | null>(null);
  const [lists,setLists]=useState<FileList[]>([]);
  const [selected,setSelected]=useState<number[]>([]);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const run=useRef<AbortController|null>(null);
  useEffect(()=>()=>run.current?.abort(),[]);
  async function pick() {
    try {
      const result=await Picker.getDocumentAsync({multiple:true,type:'*/*',copyToCacheDirectory:true,base64:false});
      if(result.canceled) return;
      const groups:FileList[]=[];
      for(const a of result.assets){
        if ((a.size || 0)>16*1024*1024) throw Error('Выбери файл меньше 16 МБ');
        const text=Platform.OS==='web' && a.file ? await a.file.text() : await new File(a.uri).text();
        groups.push(...parseLibrary(text,a.name));
      }
      setLists(groups); setSelected(groups.map((_,i)=>i)); setStatus('');
    }catch(e){setStatus((e as Error).message);}
  }
  async function transfer(){
    if(run.current) return;
    const ac=new AbortController(); run.current=ac; setBusy(true);
    const owner=useLibrary.getState().account.userId;
    let saved=0,missing=0;
    try {
      for(const i of selected){
        const list=lists[i], found:Track[]=[];
        for(let off=0;off<list.tracks.length;off+=12){
          setStatus(list.name+' · '+off+' / '+list.tracks.length);
          const r=await fetch(LULL_API+'/api/import/file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracks:list.tracks.slice(off,off+12)}),signal:ac.signal});
          const data=await r.json();
          if(!r.ok) throw Error(data.error || 'Ошибка переноса');
          for(const t of data.tracks) {if(t) found.push(mapTrack(t));else missing++;}
        }
        if(ac.signal.aborted || owner!==useLibrary.getState().account.userId) throw Error('Перенос остановлен');
        if(found.length){
          const lib=useLibrary.getState();
          const existing=lib.playlists.find(x=>x.name===list.name);
          if(existing){
            const ids=new Set(existing.tracks.map(t=>t.id));
            const added=found.filter(t=>!ids.has(t.id) && !!ids.add(t.id));
            lib.setPlaylistTracks(existing.id,[...existing.tracks,...added]);saved+=added.length;
          }else{lib.createPlaylist(list.name,found);saved+=found.length;}
        }
      }
      setStatus('Добавлено треков: '+saved+' · Не найдено: '+missing);
    } catch(e){setStatus(ac.signal.aborted?'Перенос остановлен':(e as Error).message);}
    finally {run.current=null;setBusy(false);}
  }
  return <View style={{gap:14}}>
    <T v="h2">Откуда перенести музыку?</T>
    <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
      {(Object.keys(logos) as (keyof typeof logos)[]).map(n=><Pressable key={n} disabled={busy} accessibilityRole="button" accessibilityLabel={n} onPress={()=>{choose(n);setLists([]);setSelected([]);setStatus('');}} style={{width:'32%',alignItems:'center',paddingVertical:12,gap:6}}>
        <SvgXml xml={logos[n]} width={36} height={36}/><T v="small">{n}</T>
      </Pressable>)}
    </View>
    {service && <><T v="h2">{service}</T>
      {service==='YouTube Music' && <Btn label="Подключить Google" onPress={google}/>}
      <T v="small">Выбери экспорт библиотеки. Подойдут CSV или TSV с названием и исполнителем, а также JSON плейлистов Spotify. Столбец Playlist разделяет плейлисты в одном файле.</T>
      <Btn label="Выбрать файлы" disabled={busy} icon="doc" onPress={pick}/>
      {lists.length>0 && <><Pressable disabled={busy} onPress={()=>setSelected(lists.map((_,i)=>i))}><T>Выбрать все</T></Pressable>
      {lists.map((l,i)=><Pressable key={i} disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:selected.includes(i)}} onPress={()=>setSelected(selected.includes(i)?selected.filter(x=>x!==i):[...selected,i])}><T>{selected.includes(i)?'✓  ':'○  '}{l.name} · {l.tracks.length}</T></Pressable>)}
      <Btn label={busy?'Переносим…':'Перенести выбранное'} disabled={busy || !selected.length} onPress={transfer}/></>}
      {busy && <Btn label="Отменить" kind="dark" onPress={()=>run.current?.abort()}/>}
      {!!status && <T v="sub">{status}</T>}
    </>}
  </View>;
}
