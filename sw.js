'use strict';
importScripts('push-config.js');
// Cache only the static shell; notification requests pass through without caching.
const BASE = new URL('./',self.location.href).href;
const PREFIX = 'edgemere-shell-' + new URL(BASE).pathname + '-';
const CACHE = PREFIX + 'v9-simple-backup';
const ASSETS = ['./','index.html','styles.css','storage.js','guide.js','app.js','pwa.js','push-config.js','push-schedule.js','backup-format.js','backup-ui.js','manifest.webmanifest','edgemere-logo.webp','icon-192.png','icon-512.png'].map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const service=self.EPJ_PUSH_CONFIG?.serviceUrl;
 if(service&&event.request.url.startsWith(service+'/')&&['/config','/sync','/test','/delete'].includes(new URL(event.request.url).pathname)){event.respondWith(fetch(event.request));return;}
 // Exact static allowlist. No query strings, form submissions, or private payloads.
 if(event.request.method!=='GET'||!ASSETS.includes(event.request.url)){event.respondWith(Promise.resolve(new Response('Not available',{status:404})));return;}
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
self.addEventListener('push',event=>{
 let type='followup';try{if(event.data?.json()?.type==='test')type='test';}catch{}
 // Never render server-supplied text, metadata or URLs.
 event.waitUntil(self.registration.showNotification('Prayer Journal',{body:type==='test'?'Notifications are working.':'You have follow-ups today.',tag:type==='test'?'epj-test':'epj-followup',icon:new URL('icon-192.png',BASE).href}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});const tab=tabs.find(t=>{const u=new URL(t.url);return u.origin===new URL(BASE).origin&&(u.pathname===new URL(BASE).pathname||u.pathname===new URL('index.html',BASE).pathname);});if(tab){await tab.focus();tab.postMessage({type:'OPEN_FOLLOWUPS'});return;}return self.clients.openWindow(BASE+'#followups');})());
});
self.addEventListener('pushsubscriptionchange',event=>event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window'});tabs.forEach(t=>t.postMessage({type:'PUSH_SUBSCRIPTION_CHANGED'}));})()));
