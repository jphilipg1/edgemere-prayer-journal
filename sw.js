'use strict';
// Static shell only. This worker never reads the journal or contacts push services.
const BASE = new URL('./',self.location.href).href;
const PREFIX = 'edgemere-shell-' + new URL(BASE).pathname + '-';
const CACHE = PREFIX + 'v5-person-workflow';
const ASSETS = ['./','index.html','styles.css','storage.js','guide.js','app.js','pwa.js','manifest.webmanifest','edgemere-logo.webp','icon-192.png','icon-512.png'].map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 // Exact static allowlist. No query strings, form submissions, or private payloads.
 if(event.request.method!=='GET'||!ASSETS.includes(event.request.url)){event.respondWith(Promise.resolve(new Response('Not available',{status:404})));return;}
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});const tab=tabs.find(tab=>tab.url===BASE||tab.url===new URL('index.html',BASE).href);if(tab)return tab.focus();return self.clients.openWindow(BASE);})());
});
