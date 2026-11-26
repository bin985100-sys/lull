import Constants from 'expo-constants';
import { Toggle as Switch } from '@/ui/Toggle';
import { useAppearance, useTheme } from '@/theme/state';
import { router } from 'expo-router';
import { resetTo } from '@/nav';
import { Linking, Pressable, View } from 'react-native';

import { transferPlayback } from '@/api/playback';
import { deleteAccountServer, logoutServer } from '@/api/auth';
import { forgetAccount, signOutSync } from '@/api/sync';
import { linkYouTube } from '@/api/youtube';
import { askBattery, canMix, openAppSettings } from '@/player/background';
import { player } from '@/player/player';
import { lastError, useCrash } from '@/ui/Crash';
import { useLibrary } from '@/store/library';
import { F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { Cover, Screen, T, TopBar } from '@/ui/kit';
import { confirm, toast } from '@/ui/overlay';
import { Surface } from '@/ui/Surface';
import { ThemeChoices } from '@/components/ThemeChoices';
import { WaveArt } from '@/ui/WaveArt';
import { useCoverColors } from '@/theme/useCoverColors';

function Row({ icon, label, sub, onPress, right }: { icon: IconName; label: string; sub?: string; onPress?: () => void; right?: React.ReactNode }) {
  const {colors:C}=useTheme();
  const Wrapper=onPress ? Pressable : View;
  return <Wrapper onPress={onPress} accessibilityRole={onPress?'button':undefined} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:70,paddingVertical:12,borderBottomWidth:.5,borderBottomColor:C.line}}>
    <View style={{width:34,height:34,borderRadius:12,backgroundColor:C.s2,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={19} color={icon==='trash'?C.danger:C.tx2}/></View>
    <View style={{flex:1,minWidth:0}}><T style={{fontSize:14,fontFamily:F.semi}}>{label}</T>{sub?<T style={{fontSize:11,lineHeight:17,color:C.tx3,marginTop:4}}>{sub}</T>:null}</View>{right??(onPress?<Icon name="chev" size={17} color={C.tx3}/>:null)}
  </Wrapper>;
}
function Group({title,children}:{title:string;children:React.ReactNode}){
 const {colors:C}=useTheme();return <View style={{marginTop:26}}><T style={{fontSize:10,letterSpacing:1.8,color:C.tx3,fontFamily:F.bold,marginBottom:10,paddingLeft:4}}>{title.toLocaleUpperCase('ru')}</T><Surface radius={22} style={{paddingHorizontal:16,paddingVertical:2}}>{children}</Surface></View>;
}

export default function Settings() {
  const {colors:C}=useTheme();
  const appearance=useAppearance();
  const lib = useLibrary();
  const mix = !!lib.settings.mixAudio;
  const colors=useCoverColors(lib.history[0]?.track.artwork,lib.account.name||'profile');
  function toggleMix(v: boolean) {
    if (!canMix) return toast('На iPhone Safari сам останавливает звук сайта, когда играет другое приложение. Это ограничение iOS', 'info');
    player.setMix(v);
    if (!v) return toast('Lull снова ставится на паузу, когда играет другое приложение', 'check');
    toast('Готово: Lull не будет останавливать другие приложения — они станут тише', 'check');
    /* при первом включении просим разрешить работу в фоне — иначе Samsung может усыпить плеер */
    if (!lib.settings.bgAsked) {
      lib.setSetting('bgAsked', true);
      confirm({ icon: 'shield', title: 'Разрешить работу в фоне?', text: 'Чтобы Samsung не выгружал Lull, пока ты в других приложениях, разреши ему работать без ограничений батареи. Если музыка всё равно остановится: Настройки → Батарея → Ограничения фоновой работы → убери Lull из «Спящих приложений».', safe: 'Позже', danger: 'Разрешить', onDanger: () => { askBattery(); } });
    }
  }
  return (
    <Screen>
      <TopBar title="Твой Lull"/>
      <View style={{flexDirection:'row',alignItems:'center',gap:16,marginTop:30,marginBottom:24}}>
       {lib.account.avatar?<Cover uri={lib.account.avatar} size={66} radius={33}/>:<View style={{width:66,height:66,borderRadius:33,backgroundColor:C.tx,alignItems:'center',justifyContent:'center'}}><T style={{fontSize:27,color:C.inverse,fontFamily:F.bold}}>{Array.from(lib.account.name||'L')[0].toUpperCase()}</T></View>}
       <View style={{flex:1,minWidth:0}}><T style={{fontSize:10,letterSpacing:2,color:C.tx3}}>ТВОЙ ПРОФИЛЬ</T><T numberOfLines={2} style={{fontSize:27,lineHeight:35,fontFamily:F.bold,letterSpacing:-.8,marginTop:5}}>{lib.account.name||'Твой ритм'}</T><T v="small" style={{marginTop:4}}>{lib.account.provider?'Синхронизация подключена':'Музыка остаётся с тобой'}</T></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Настроить рекомендации и волну" onPress={()=>router.push('/prefs')} style={{height:112,borderRadius:24,overflow:'hidden',marginBottom:16}}><WaveArt colors={colors}/><View style={{flex:1,padding:20,flexDirection:'row',alignItems:'center',gap:14}}><View style={{flex:1}}><T style={{fontSize:20,color:'#fff',fontFamily:F.bold}}>Сделай волну своей</T><T style={{fontSize:11,color:'rgba(255,255,255,.7)',marginTop:6}}>Твой вкус. Твой характер музыки.</T></View><View style={{width:36,height:36,borderRadius:18,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'}}><Icon name="arrowUR" size={19} color="#111"/></View></View></Pressable>
      <View style={{flexDirection:'row',gap:9}}>{([{icon:'heart',label:'Любимое',path:'/favorites'},{icon:'clock',label:'История',path:'/history'},{icon:'download',label:'Перенос',path:'/import'}] as const).map(item=><Pressable key={item.path} accessibilityRole="button" onPress={()=>router.push(item.path)} style={{flex:1,minWidth:0,height:80,borderRadius:20,backgroundColor:C.s1,alignItems:'center',justifyContent:'center',gap:9}}><Icon name={item.icon} size={22} color={C.tx}/><T style={{fontSize:11,fontFamily:F.semi}}>{item.label}</T></Pressable>)}</View>
      <Group title="Как выглядит Lull"><ThemeChoices/><Row icon="waves" label="Живые фоны" sub="Движение останавливается на скрытых экранах" right={<Switch value={appearance.motion} onValueChange={v=>useAppearance.setState({motion:v})} accessibilityLabel="Живые фоны"/>}/></Group>
      <Group title="Музыка">
        <Row icon="chart" label="Итоги месяца" onPress={() => router.push('/month')} />
        <Row icon="heart" label={`Любимые исполнители · ${lib.favArtists.length}`} onPress={() => router.push('/onboarding')} />
        <Row icon="clock" label="Сохранять историю" right={<Switch value={lib.settings.saveHistory} onValueChange={(v) => lib.setSetting('saveHistory', v)}   accessibilityLabel="Сохранять историю" />} />
      </Group>
      <Group title="Продолжить на другом устройстве">
        <Row icon="queue" label="Передать очередь" sub="Сохранить трек и позицию в аккаунте Lull" onPress={() => transferPlayback(true).then(() => toast('Очередь передана','check')).catch(e => toast(e.message,'info'))}/>
        <Row icon="playNext" label="Продолжить здесь" onPress={() => transferPlayback(false).catch(e => toast(e.message,'info'))}/>
      </Group>
      <Group title="Воспроизведение">
        <Row icon="stack" label="Играть поверх других приложений" sub={canMix ? 'Lull не останавливает другие приложения, а приглушает их. Если другое приложение само забирает звук, Android поставит Lull на паузу' : 'Недоступно на iPhone: iOS сама останавливает звук сайта'}
          right={<Switch value={mix && canMix} disabled={!canMix} onValueChange={toggleMix}   accessibilityLabel="Играть поверх других приложений" />} />
        {canMix ? <Row icon="shield" label="Работа в фоне" sub="Разрешить Lull играть без ограничений батареи" onPress={() => askBattery().catch(openAppSettings)} /> : null}
      </Group>
      <Group title="Перенос музыки">
        <Row icon="download" label="Из Spotify, Apple Music и других" onPress={() => router.push('/import')} />
        {lib.account.youtube
          ? <Row icon="download" label={`Перенести лайки и плейлисты · ${lib.account.youtube}`} onPress={() => router.push('/youtube')} />
          : <Row icon="google" label="Подключить YouTube Music" onPress={() => {
              if (!lib.account.token) return toast('Сначала войди в Lull через Google или Telegram', 'info');
              linkYouTube(() => { toast('YouTube Music подключён', 'check'); router.push('/youtube'); }).catch((e) => toast(e.message, 'info'));
            }} />}
      </Group>
      <Group title="Данные">
        <Row icon="eraser" label="Очистить историю" onPress={() => confirm({ icon: 'eraser', title: 'Очистить историю?', text: 'Любимые треки и плейлисты останутся.', safe: 'Отмена', danger: 'Очистить историю', onDanger: () => { lib.clearHistory(); toast('История очищена', 'check'); } })} />
        <Row icon="logout" label="Выйти" onPress={() => confirm({ icon: 'logout', title: 'Выйти из аккаунта?', text: 'Любимое, плейлисты и статистика сохранены в аккаунте и вернутся, когда войдёшь снова.', safe: 'Остаться', danger: 'Выйти', onDanger: async () => { player.stop(); await signOutSync(); logoutServer(); lib.setAccount({ provider: null, token: undefined, userId: undefined, youtube: null }); resetTo('/welcome'); } })} />
      </Group>
      {lib.account.token ? (
        <Group title="Аккаунт">
          <Row icon="trash" label="Удалить аккаунт" sub="Профиль, любимое, плейлисты и статистика будут удалены навсегда" onPress={() => confirm({ icon: 'trash', title: 'Удалить аккаунт навсегда?', text: 'Любимые треки, плейлисты, исполнители и статистика удалятся с сервера Lull. Отменить это нельзя.', safe: 'Оставить', danger: 'Удалить', onDanger: async () => {
            try { await deleteAccountServer(); } catch (e) { return toast((e as Error).message || 'Не получилось удалить. Проверь интернет', 'info'); }
            player.stop(); forgetAccount(); lib.setAccount({ provider: null, name: '', avatar: undefined, token: undefined, userId: undefined, youtube: null }); toast('Аккаунт удалён', 'check'); resetTo('/welcome');
          } })} />
        </Group>
      ) : null}
      <Group title="О приложении">
        <Row icon="doc" label="Политика конфиденциальности" onPress={() => Linking.openURL('https://lull.website/privacy.html')} />
        <Row icon="info" label="Музыка — каталог Lull и Audius" />
        <Row icon="doc" label={`Версия ${Constants.expoConfig?.version ?? '0.3.0'}`} />
        <Row icon="doc" label="Журнал — отправить разработчику" onPress={() => router.push('/log')} />
        <Row icon="info" label="Показать последнюю ошибку" onPress={async () => { const e = await lastError(); if (e) useCrash.setState({ error: e }); else toast('Ошибок не было', 'check'); }} />
      </Group>
    </Screen>
  );
}
