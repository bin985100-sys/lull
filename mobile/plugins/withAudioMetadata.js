const fs=require('node:fs');
const path=require('node:path');
const {withDangerousMod,withAndroidManifest,AndroidConfig}=require('@expo/config-plugins');
function patchMusicMetadata(source){
 const line='      .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)';
 if(source.includes(line))return source;
 const anchor='      .setArtworkData(null, null)';
 if(!source.includes(anchor))throw new Error('expo-audio metadata implementation changed; review music media type patch');
 return source.replace(anchor,anchor+'\n'+line);
}
function apply(projectRoot){
 const root=path.dirname(require.resolve('expo-audio/package.json',{paths:[projectRoot]}));
 const file=path.join(root,'android/src/main/java/expo/modules/audio/service/MetadataInjectingPlayer.kt');
 const before=fs.readFileSync(file,'utf8'),after=patchMusicMetadata(before);if(before!==after)fs.writeFileSync(file,after);
}
function patchCategory(manifest){AndroidConfig.Manifest.getMainApplicationOrThrow(manifest).$['android:appCategory']='audio';return manifest;}
module.exports=config=>{config=withAndroidManifest(config,config=>{config.modResults=patchCategory(config.modResults);return config;});return withDangerousMod(config,['android',async config=>{apply(config.modRequest.projectRoot);return config;}]);};
module.exports.patchCategory=patchCategory;
module.exports.apply=apply;module.exports.patchMusicMetadata=patchMusicMetadata;
