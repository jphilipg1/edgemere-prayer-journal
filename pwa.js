'use strict';
window.JournalPWA=(()=>{
 const CONFIG=EPJ_PUSH_CONFIG,KEY='edgemere.push-installation.v1';
 let registration=null,installPrompt=null,config=null,local=null,busy=false,again=false,lastFingerprint='';
 try{local=JSON.parse(localStorage.getItem(KEY)||'null');if(local&&(!/^[\w-]{43}$/.test(local.token)||typeof local.enabled!=='boolean'))local=null;}catch{}
 const status=text=>$('notification-status').textContent=text;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const apple=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const capable=()=>!!registration?.active&&'PushManager'in window&&'Notification'in window&&window.isSecureContext&&(!apple()||standalone());
 const persist=()=>localStorage.setItem(KEY,JSON.stringify(local));
 function controls(){
  $('enable-notifications').hidden=!!local?.enabled||!CONFIG.serviceUrl||!capable()||Notification.permission==='denied';
  $('test-notification').hidden=!local?.enabled||!capable()||Notification.permission!=='granted';
  $('disable-notifications').hidden=!local?.token;
  for(const id of ['enable-notifications','test-notification','disable-notifications'])$(id).disabled=busy;
 }
 async function api(path,body,token=local?.token){const response=await fetch(CONFIG.serviceUrl+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});if(!response.ok){const e=Error('service');e.code=response.status;throw e;}return response.json();}
 async function getConfig(){if(config)return config;const res=await fetch(CONFIG.serviceUrl+'/config',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('service');config=await res.json();return config;}
 function publicKey(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
 const serial=sub=>({endpoint:sub.endpoint,expirationTime:sub.expirationTime??null,keys:sub.toJSON().keys});
 function guidance(){
  controls();if(!CONFIG.serviceUrl){status('Scheduled notifications are not connected yet. Follow-up dates still work in your journal.');return;}
  if(apple()&&!standalone()){status('On iPhone: add the journal to your Home Screen, open it there, then tap Enable Follow-Up Notifications.');return;}
  if(!capable()){status('Push notifications are unavailable in this browser. Your in-app follow-ups still work.');return;}
  if(Notification.permission==='denied'){status('Notifications are blocked. You can allow them in your device settings; in-app follow-ups still work.');return;}
  if(local?.pendingDelete){status('Notifications are off on this device. Connect to the internet to finish deleting the remote reminder data.');return;}
  status(local?.enabled?'Checking notification schedule…':'Notifications are off. Enable them to receive generic follow-up reminders.');
 }
 async function sync(force=false){
  if(busy){again=true;return;}if(!local?.enabled||!capable()||Notification.permission!=='granted'||locked||!data.privacyAccepted||!CONFIG.serviceUrl)return;
  busy=true;controls();try{
   if(localStorage.getItem(JournalStore.key)!==lastRaw){status('Journal changed in another tab. Reload to sync follow-up notifications.');return;}
   let sub=await registration.pushManager.getSubscription();if(!sub||sub.expirationTime&&sub.expirationTime<=Date.now()){status('Your notification subscription expired. Tap Enable Follow-Up Notifications to reconnect.');local.enabled=false;local.needsRenewal=true;persist();return;}
   const projected=EPJPushSchedule(data.people,local.mapping||{},new Date(),CONFIG.hour,CONFIG.minute);
   // Fingerprint only locally. Device timezone changes cause UTC schedules to update on next opening.
   const fingerprint=JSON.stringify([JSON.stringify(serial(sub)),projected.reminders.map(r=>[r.id,r.day,new Date(r.day+`T${String(CONFIG.hour).padStart(2,'0')}:${String(CONFIG.minute).padStart(2,'0')}:00`).getTime()]),Intl.DateTimeFormat().resolvedOptions().timeZone]);
   if(!force&&fingerprint===lastFingerprint){status('Notifications On · around 9:00 AM on follow-up days.');return;}
   local.mapping=projected.localMapping;persist();
   await api('/sync',{subscription:serial(sub),reminders:projected.reminders});lastFingerprint=fingerprint;status('Notifications On · around 9:00 AM on follow-up days.');
  }catch(e){status(e.message==='future_date'?'Dates more than two years away cannot be scheduled yet. Your follow-ups remain saved locally.':'Your journal is saved. Notification changes are not synced yet; reconnect and reopen the journal.');}
  finally{busy=false;controls();if(again){again=false;queueMicrotask(()=>sync());}}
 }
 async function disable(){
  if(busy)return;busy=true;controls();let unsubscribed=false;
  try{if(local){local.enabled=false;local.pendingDelete=true;persist();}const sub=await registration?.pushManager.getSubscription();unsubscribed=!sub||await sub.unsubscribe();if(!unsubscribed)throw Error('unsubscribe');if(local?.token&&CONFIG.serviceUrl)await api('/delete',{});localStorage.removeItem(KEY);local=null;lastFingerprint='';status('Notifications Off. Remote reminder data deleted.');}
  catch{status(unsubscribed?'Notifications are off on this device. Remote deletion is pending; reconnect and tap Disable Notifications again.':'Notifications could not be fully disabled. Reconnect and try again.');}
  finally{busy=false;controls();}
 }
 $('enable-notifications').onclick=async()=>{
  if(busy||!capable()||!CONFIG.serviceUrl)return;busy=true;controls();
  try{
   // Permission prompt belongs directly to this explicit tap, never startup.
   const permission=await Notification.requestPermission();if(permission!=='granted'){guidance();return;}
   const conf=await getConfig();let sub=await registration.pushManager.getSubscription();
   if(sub&&(local?.needsRenewal||(sub.expirationTime&&sub.expirationTime<=Date.now()))){await sub.unsubscribe();sub=null;}
   if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey(conf.publicKey)});
   if(!local){const token=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');local={token,enabled:true,pendingDelete:false,mapping:{}};}else{local.enabled=true;local.pendingDelete=false;local.needsRenewal=false;}
   persist();
  }catch{status('Notifications could not be enabled. Check your connection and device settings, then try again.');}
  finally{busy=false;controls();if(local?.enabled)await sync(true);}
 };
 $('disable-notifications').onclick=disable;
 $('test-notification').onclick=async()=>{if(busy||!local?.enabled)return;busy=true;controls();try{await api('/test',{});status('Test push accepted by your device’s push service. Check for “Notifications are working.”');}catch(e){if(e.code===410){local.enabled=false;local.needsRenewal=true;persist();status('Your subscription expired. Enable notifications again.');}else status(e.code===429?'Please wait a minute before sending another test.':'The test push could not be sent. Check your connection and try again.');}finally{busy=false;controls();}};
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install-app').hidden=false;});
 $('install-app').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install-app').hidden=true;}};window.addEventListener('appinstalled',()=>{$('install-app').hidden=true;});
 function showDue(){if(!data.privacyAccepted)return;go(null);$('followups').scrollIntoView({block:'start'});$('followups').tabIndex=-1;$('followups').focus({preventScroll:true});}
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='OPEN_FOLLOWUPS')showDue();if(event.data?.type==='PUSH_SUBSCRIPTION_CHANGED')sync(true);});
 if(location.hash==='#followups')showDue();
 if('serviceWorker'in navigator&&isSecureContext){navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).then(async reg=>{
  registration=reg;if(reg.waiting)$('offline-status').textContent='An update is ready. Close all journal windows and reopen.';await navigator.serviceWorker.ready;
  if(!reg.waiting)$('offline-status').textContent='Offline journal access is ready.';
  reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',()=>{if(reg.waiting)$('offline-status').textContent='An update is ready. Close all journal windows and reopen.';});});
  guidance();if(local?.pendingDelete)await disable();else await sync(true);
 }).catch(()=>{status('The notification service worker is unavailable. Reopen the journal online.');controls();});}else guidance();
 new MutationObserver(()=>sync()).observe($('view'),{childList:true});
 window.addEventListener('online',()=>local?.pendingDelete?disable():sync(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){guidance();local?.pendingDelete?disable():sync(true);}});
 window.addEventListener('storage',event=>{if(event.key===KEY){try{local=JSON.parse(event.newValue||'null');}catch{local=null;}guidance();}if(event.key===JournalStore.key){status('Journal changed in another tab. Reload to sync follow-up notifications.');}});
 controls();return {notifyDue:async()=>false,sync};
})();
