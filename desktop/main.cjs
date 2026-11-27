const {app,BrowserWindow,Menu,shell,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const HOME='https://app.lull.website';
const trusted=url=>{try{return new URL(url).origin===HOME;}catch{return false;}};
const external=url=>{try{return ['https:','http:'].includes(new URL(url).protocol);}catch{return false;}};
app.setName('Lull');
const lock=app.requestSingleInstanceLock();
if(!lock)app.quit();
let window;
function createWindow(){
  let bounds={};
  const state=path.join(app.getPath('userData'),'web-window.json');
  try{bounds=JSON.parse(fs.readFileSync(state,'utf8'));}catch{}
  window=new BrowserWindow({width:Math.max(360,Math.min(2400,Number(bounds.width)||1280)),height:Math.max(480,Math.min(1600,Number(bounds.height)||820)),minWidth:360,minHeight:480,icon:path.join(__dirname,'assets','icon.png'),backgroundColor:'#000000',show:false,autoHideMenuBar:true,title:'Lull',webPreferences:{partition:'persist:lull-web',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,autoplayPolicy:'no-user-gesture-required'}});
  const wc=window.webContents;
  wc.setWindowOpenHandler(({url})=>{if(external(url))void shell.openExternal(url);return {action:'deny'};});
  wc.on('will-navigate',(event,url)=>{if(!trusted(url)){event.preventDefault();if(external(url))void shell.openExternal(url);}});
  wc.on('will-attach-webview',event=>event.preventDefault());
  wc.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){window?.show();void window?.loadFile(path.join(__dirname,'offline.html'));}});
  window.once('ready-to-show',()=>window?.show());
  window.on('close',()=>{try{const b=window.getNormalBounds();fs.writeFileSync(state,JSON.stringify({width:b.width,height:b.height,maximized:window.isMaximized()}));}catch{}});
  window.on('closed',()=>{window=null;});
  if(bounds.maximized)window.maximize();
  void window.loadURL(HOME+'/listen').catch(()=>{});
}
if(lock){
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(()=>{
    const ses=session.fromPartition('persist:lull-web');
    ses.setPermissionRequestHandler((contents,permission,callback)=>callback(trusted(contents.getURL())&&permission==='mediaKeySystem'));
    ses.setPermissionCheckHandler((contents,permission)=>!!contents&&trusted(contents.getURL())&&permission==='mediaKeySystem');
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Lull',submenu:[{label:'Обновить',accelerator:'CmdOrCtrl+R',click:()=>{void window?.loadURL(HOME+'/listen');}},{role:'togglefullscreen'},{role:'quit'}]},{role:'editMenu'}]));
    createWindow();
    app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
