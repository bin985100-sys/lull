import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { finishLogin, useSession } from '@/api/session';
import { cancelLogin, login, openAuthUrl, useAuthWait, type Provider } from '@/api/auth';
import { useLibrary } from '@/store/library';
import { Icon, type IconName } from '@/ui/Icon';
import { Press, T } from '@/ui/kit';
import { F } from '@/theme/tokens';
import { toast } from '@/ui/overlay';
import { WelcomeProviderButton, WelcomeScene } from '@/components/WelcomeScene';

// Account restoration still precedes artist selection for returning listeners.
export const afterLogin=()=>finishLogin();
function AuthAction({label,icon,onPress}:{label:string;icon?:IconName;onPress:()=>void}){
 return <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{minHeight:52,borderRadius:26,borderWidth:.8,borderColor:'#ffffff35',paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12}}><T style={{flex:1,color:'#fff',fontFamily:F.semi,fontSize:14,lineHeight:20}}>{label}</T>{icon?<Icon name={icon} size={22} color="#fff"/>:null}</Press>;
}
function StatusCard({loading,title,hint}:{loading?:boolean;title:string;hint:string}){
 return <View style={{flexDirection:'row',alignItems:'center',gap:14,padding:18,borderRadius:26,borderWidth:.8,borderColor:'#ffffff26',backgroundColor:'#000'}}>{loading?<ActivityIndicator color="#fff"/>:null}<View style={{flex:1,gap:6}}><T style={{color:'#fff',fontFamily:F.semi,fontSize:15,lineHeight:22}}>{title}</T><T style={{color:'#ffffff99',fontSize:12,lineHeight:18}}>{hint}</T></View></View>;
}
export default function Welcome(){
 const {wait,error}=useAuthWait(),session=useSession(),signedIn=useLibrary(s=>!!s.account.token),[busy,setBusy]=useState<Provider|null>(null),reduced=useReducedMotion();
 useEffect(()=>{if(error)toast(error,'info');},[error]);
 const go=async(provider:Provider)=>{if(busy)return;setBusy(provider);try{await login(provider,afterLogin);}catch(e:unknown){toast(e instanceof Error?e.message:'Не получилось начать вход','info');}finally{setBusy(null);}};
 const recovering=signedIn&&(session.loading||session.error);
 return <WelcomeScene pending={!!wait||recovering}>
  {recovering?<View style={{gap:12}} accessibilityLiveRegion="polite">
   <StatusCard loading={session.loading} title={session.loading?'Загружаем твою библиотеку':'Не получилось загрузить библиотеку'} hint={session.loading?'Любимые треки, плейлисты и исполнители':'Проверь интернет и попробуй ещё раз'}/>
   {session.error?<AuthAction label="Повторить" icon="refresh" onPress={()=>void finishLogin()}/>:null}
   {session.error?<AuthAction label="Войти в другой аккаунт" icon="user" onPress={()=>{useSession.setState({error:false});useLibrary.getState().setAccount({provider:null,token:undefined,userId:undefined,youtube:null});}}/>:null}
  </View>:wait?<Animated.View entering={reduced?undefined:FadeIn.duration(420)} style={{gap:12}} accessibilityLiveRegion="polite">
   <StatusCard loading title={wait.provider==='telegram'?'Ждём подтверждения в Telegram':'Ждём подтверждения в Google'} hint={wait.provider==='telegram'?'Нажми «Старт» в боте и вернись сюда':'Выбери аккаунт и вернись сюда'}/>
   <AuthAction label={wait.provider==='telegram'?'Открыть Telegram ещё раз':'Открыть Google ещё раз'} icon={wait.provider==='telegram'?'telegram':'google'} onPress={()=>void openAuthUrl(wait.url,wait.provider)}/>
   <AuthAction label="Отмена" onPress={cancelLogin}/>
  </Animated.View>:<>
   <WelcomeProviderButton provider="google" busy={busy==='google'} disabled={!!busy} onPress={()=>void go('google')}/>
   <WelcomeProviderButton provider="telegram" busy={busy==='telegram'} disabled={!!busy} onPress={()=>void go('telegram')}/>
  </>}
 </WelcomeScene>;
}
