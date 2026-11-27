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
 const native=path.join(root,'android/src/main/java/expo/modules/audio');
 const patches=[
  ['AudioRecords.kt','  @Field val name: String? = null\n','  @Field val name: String? = null,\n  @Field val metadata: Metadata? = null\n'],
  ['AudioPlaylist.kt','    val currentIndex = ref.currentMediaItemIndex\n','    val currentIndex = ref.currentMediaItemIndex\n    // Lull: each queued item owns metadata even when JavaScript is suspended.\n    if (mediaItem != null) {\n      sources.getOrNull(currentIndex)?.metadata?.let { nextMetadata ->\n        metadata = nextMetadata\n        if (isActiveForLockScreen) {\n          serviceConnection.playbackServiceBinder?.service?.setPlayableMetadata(this, nextMetadata)\n        }\n      }\n    }\n'],
  ['service/AudioControlsService.kt','    sessionMetadataPlayer?.updateMetadata(metadata)\n    updateArtwork(metadata)','    sessionMetadataPlayer?.updateMetadata(metadata)\n    // Lull: title changes must not wait for an image or a changed artwork URL.\n    if (metadata?.artworkUrl != currentArtworkUrl) currentArtwork = null\n    postOrStartForegroundNotification(startInForeground = false)\n    updateArtwork(metadata)'],
  ['service/AudioControlsService.kt','          val bitmap = url.openConnection().getInputStream().use {','          val connection = url.openConnection().apply { connectTimeout = 8000; readTimeout = 8000 }\n          val bitmap = connection.getInputStream().use {'],
 ];
 for(const [relative,anchor,replacement] of patches){
  const target=path.join(native,relative),text=fs.readFileSync(target,'utf8');
  if(text.includes(replacement))continue;
  if(text.split(anchor).length!==2)throw Error('expo-audio '+relative+' changed; review per-track media metadata patch');
  fs.writeFileSync(target,text.replace(anchor,replacement));
 }
}
function patchCategory(manifest){AndroidConfig.Manifest.getMainApplicationOrThrow(manifest).$['android:appCategory']='audio';return manifest;}
module.exports=config=>{config=withAndroidManifest(config,config=>{config.modResults=patchCategory(config.modResults);return config;});return withDangerousMod(config,['android',async config=>{apply(config.modRequest.projectRoot);return config;}]);};
module.exports.patchCategory=patchCategory;
module.exports.apply=apply;module.exports.patchMusicMetadata=patchMusicMetadata;
