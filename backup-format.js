'use strict';
// Portable complete-journal file format with corruption detection. No network APIs.
window.JournalBackup = (() => {
 const enc=new TextEncoder();
 const MAX_FILE=32*1024*1024, MAX_PLAIN=20*1024*1024;
 const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
 function cleanTree(root){const stack=[[root,0]];while(stack.length){const [x,depth]=stack.pop();if(depth>40)throw Error('invalid');if(x&&typeof x==='object')for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k))throw Error('invalid');stack.push([x[k],depth+1]);}}}
 function validateJournal(journal){cleanTree(journal);if(!JournalStore.valid(journal))throw Error('invalid');if(journal.notificationsEnabled!==undefined&&typeof journal.notificationsEnabled!=='boolean')throw Error('invalid');if(journal.lastNotificationDay!==undefined&&!JournalStore.date(journal.lastNotificationDay))throw Error('invalid');if(journal.lastBackupAt!==undefined&&!iso(journal.lastBackupAt))throw Error('invalid');return journal;}
 function keys(x,expected){if(!isObject(x)||Object.keys(x).sort().join('|')!==expected.slice().sort().join('|'))throw Error('invalid');}
 function counts(journal){validateJournal(journal);const prayers=journal.people.flatMap(p=>p.prayers);return {people:journal.people.length,prayerNeeds:prayers.filter(p=>!p.answered).length,pastPrayers:prayers.filter(p=>p.answered).length,meetings:journal.people.reduce((n,p)=>n+p.meetings.length,0),updates:prayers.reduce((n,p)=>n+p.updates.length,0),history:prayers.reduce((n,p)=>n+(p.history?.length||0),0),followUps:journal.people.filter(p=>p.followUp).length};}
 const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
 const payload=h=>[h.format,h.backupFormatVersion,h.createdAt,h.journalSchemaVersion,h.counts,h.journal];
 async function pack(journal){
  const original=JSON.stringify(validateJournal(journal));if(enc.encode(original).length>MAX_PLAIN)throw Error('size');
  const copied=validateJournal(JSON.parse(original));if(JSON.stringify(copied)!==original)throw Error('verification');
  const h={format:'EdgemerePrayerJournalBackup',backupFormatVersion:2,createdAt:new Date().toISOString(),journalSchemaVersion:1,counts:counts(copied),journal:copied};
  const file={...h,integrity:{algorithm:'SHA-256',digest:await digest(payload(h))}};
  const verified=await open(JSON.stringify(file));if(JSON.stringify(verified.journal)!==original||JSON.stringify(verified.counts)!==JSON.stringify(counts(journal)))throw Error('verification');return file;
 }
 async function open(text){
  if(typeof text!=='string'||enc.encode(text).length>MAX_FILE)throw Error('size');
  const h=JSON.parse(text);keys(h,['format','backupFormatVersion','createdAt','journalSchemaVersion','counts','journal','integrity']);keys(h.integrity,['algorithm','digest']);
  if(h.format!=='EdgemerePrayerJournalBackup'||h.backupFormatVersion!==2)throw Error('unsupported');
  if(h.journalSchemaVersion!==1||!iso(h.createdAt)||h.integrity.algorithm!=='SHA-256'||typeof h.integrity.digest!=='string')throw Error('invalid');
  validateJournal(h.journal);const actual=counts(h.journal);if(JSON.stringify(h.counts)!==JSON.stringify(actual)||await digest(payload(h))!==h.integrity.digest)throw Error('integrity');return {journal:h.journal,createdAt:h.createdAt,counts:actual};
 }
 function restoreRisk(current,incoming){const a=counts(current),b=counts(incoming);return {current:a,backup:b,blocked:['people','prayerNeeds','pastPrayers','meetings','updates','history'].some(k=>a[k]>0&&b[k]===0),fewer:Object.keys(a).some(k=>b[k]<a[k])};}
 return {pack,open,counts,restoreRisk,validateJournal,MAX_FILE};
})();
