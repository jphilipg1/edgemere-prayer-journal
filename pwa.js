'use strict';
window.JournalPWA = (() => {
 let registration=null, installPrompt=null, sending=false;
 const supported=()=>!!registration?.active && 'Notification' in window && 'showNotification' in registration;
 function status(text){$('notification-status').textContent=text;}
 function controls(){
  const enabled=supported()&&Notification.permission==='granted'&&!!data.notificationsEnabled;
  $('enable-notifications').hidden=enabled;$('enable-notifications').disabled=!supported()||locked;
  $('test-notification').hidden=!enabled;$('disable-notifications').hidden=!data.notificationsEnabled;
  if(!supported())status('Device alerts are unavailable here. Try an installed app in a supported browser. In-app follow-ups still work.');
  else if(Notification.permission==='denied')status('Notifications are blocked in your browser settings. In-app follow-ups still work.');
  else status(enabled?'Device alerts enabled while the journal is active. Closed-app delivery is not supported.':'Device alerts are off. Enabling is optional.');
 }
 async function show(test=false){
  if(!supported()||Notification.permission!=='granted'||!data.notificationsEnabled||sending)return false;sending=true;
  try{
   // Fixed text only. No names, notes, IDs, dates, or other journal fields.
   await registration.showNotification('Edgemere Prayer Journal',{
    body:test?'Test alert. Your private journal details are never included.':'You planned to reconnect. Open your journal to see follow-ups.',
    tag:test?'edgemere-test':'edgemere-follow-up',icon:'icon-192.png'
   });return true;
  }catch{status('This browser could not display a device alert. Check system settings; in-app follow-ups still work.');return false;}
  finally{sending=false;}
 }
 $('enable-notifications').onclick=async()=>{if(!supported())return;try{const permission=await Notification.requestPermission();if(permission==='granted'){if(save(d=>{d.notificationsEnabled=true;})){controls();await checkDue();}}else controls();}catch{status('Notification permission is unavailable here. In-app follow-ups still work.');}};
 $('disable-notifications').onclick=async()=>{if(save(d=>{d.notificationsEnabled=false;})){controls();if(registration&&'getNotifications' in registration)(await registration.getNotifications()).forEach(n=>n.close());}};
 $('test-notification').onclick=async()=>{if(await show(true))status('Test alert sent to your device. System settings control whether it is visible.');};
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install-app').hidden=false;});
 $('install-app').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install-app').hidden=true;}};
 window.addEventListener('appinstalled',()=>{$('install-app').hidden=true;});
 if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).then(async reg=>{
   registration=reg;
   if(reg.waiting)$('offline-status').textContent='An update is ready. Close all journal tabs and reopen to use it. Your journal stays on this device.';
   else{await navigator.serviceWorker.ready;$('offline-status').textContent='Offline app files are ready on this device. Browser storage removal can still erase the journal.';}
   reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',()=>{if(reg.waiting)$('offline-status').textContent='An update is ready. Close all journal tabs and reopen to use it.';});});
   controls();checkDue();
  }).catch(()=>{$('offline-status').textContent='Offline access could not be prepared. You can still use the journal online.';controls();});
 }else{$('offline-status').textContent='Offline installation is unavailable in this browser.';}
 controls();return {notifyDue:()=>show(false)};
})();
