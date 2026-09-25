'use strict';
// Portable authenticated file format. No network, DOM, storage, or logging APIs.
window.JournalBackup = (() => {
 const enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true});
 const MAX_FILE=32*1024*1024, MAX_PLAIN=20*1024*1024, ITERATIONS=600000;
 const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
 function cleanTree(root){const stack=[[root,0]];while(stack.length){const [x,depth]=stack.pop();if(depth>40)throw Error('invalid');if(x&&typeof x==='object')for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k))throw Error('invalid');stack.push([x[k],depth+1]);}}}
 function validateJournal(journal){cleanTree(journal);if(!JournalStore.valid(journal))throw Error('invalid');if(journal.notificationsEnabled!==undefined&&typeof journal.notificationsEnabled!=='boolean')throw Error('invalid');if(journal.lastNotificationDay!==undefined&&!JournalStore.date(journal.lastNotificationDay))throw Error('invalid');if(journal.lastBackupAt!==undefined&&!iso(journal.lastBackupAt))throw Error('invalid');return journal;}
 function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
 function unb64(text,size){if(typeof text!=='string'||!text.length||text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error('invalid');const raw=atob(text);if(size!==undefined&&raw.length!==size)throw Error('invalid');const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(b64(bytes)!==text)throw Error('invalid');return bytes;}
 function keys(x,expected){if(!isObject(x)||Object.keys(x).sort().join('|')!==expected.slice().sort().join('|'))throw Error('invalid');}
 // Fixed-order header serialization is authenticated as AES-GCM additional data.
 const aad=h=>enc.encode(JSON.stringify([h.format,h.backupFormatVersion,h.createdAt,h.journalSchemaVersion,h.encryption.name,h.encryption.keyBits,h.encryption.tagBits,h.kdf.name,h.kdf.hash,h.kdf.iterations,h.salt,h.iv]));
 async function derive(password,salt,usage){const bytes=enc.encode(password);try{const material=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,[usage]);}finally{bytes.fill(0);}}
 async function encrypt(journal,password){
 if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('password');validateJournal(journal);
 const plain=enc.encode(JSON.stringify(journal));if(plain.length>MAX_PLAIN){plain.fill(0);throw Error('size');}
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const header={format:'EdgemerePrayerJournalBackup',backupFormatVersion:1,createdAt:new Date().toISOString(),journalSchemaVersion:1,encryption:{name:'AES-GCM',keyBits:256,tagBits:128},kdf:{name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS},salt:b64(salt),iv:b64(iv)};
 try{const key=await derive(password,salt,'encrypt');const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(header),tagLength:128},key,plain);return {...header,ciphertext:b64(new Uint8Array(cipher))};}finally{plain.fill(0);}
 }
 async function decrypt(text,password){
 if(typeof text!=='string'||text.length>MAX_FILE||typeof password!=='string'||password.length>1024)throw Error('invalid');
 const h=JSON.parse(text);keys(h,['format','backupFormatVersion','createdAt','journalSchemaVersion','encryption','kdf','salt','iv','ciphertext']);
 keys(h.encryption,['name','keyBits','tagBits']);keys(h.kdf,['name','hash','iterations']);
 if(h.format!=='EdgemerePrayerJournalBackup'||h.backupFormatVersion!==1||h.journalSchemaVersion!==1||!iso(h.createdAt)||h.encryption.name!=='AES-GCM'||h.encryption.keyBits!==256||h.encryption.tagBits!==128||h.kdf.name!=='PBKDF2'||h.kdf.hash!=='SHA-256'||h.kdf.iterations!==ITERATIONS)throw Error('unsupported');
 const salt=unb64(h.salt,16),iv=unb64(h.iv,12),cipher=unb64(h.ciphertext);if(cipher.length<16||cipher.length>MAX_PLAIN+16)throw Error('invalid');
 const key=await derive(password,salt,'decrypt');const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(h),tagLength:128},key,cipher));
 try{return {journal:validateJournal(JSON.parse(dec.decode(plain))),createdAt:h.createdAt};}finally{plain.fill(0);}
 }
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
 function inspect(text){if(typeof text!=='string'||enc.encode(text).length>MAX_FILE)throw Error('size');const h=JSON.parse(text);if(h.format!=='EdgemerePrayerJournalBackup'||![1,2].includes(h.backupFormatVersion))throw Error('unsupported');return {encrypted:h.backupFormatVersion===1};}
 async function open(text,password){
  if(inspect(text).encrypted){const result=await decrypt(text,password);return {...result,counts:counts(result.journal)};}
  const h=JSON.parse(text);keys(h,['format','backupFormatVersion','createdAt','journalSchemaVersion','counts','journal','integrity']);keys(h.integrity,['algorithm','digest']);
  if(h.journalSchemaVersion!==1||!iso(h.createdAt)||h.integrity.algorithm!=='SHA-256'||typeof h.integrity.digest!=='string')throw Error('invalid');
  validateJournal(h.journal);const actual=counts(h.journal);if(JSON.stringify(h.counts)!==JSON.stringify(actual)||await digest(payload(h))!==h.integrity.digest)throw Error('integrity');return {journal:h.journal,createdAt:h.createdAt,counts:actual};
 }
 function restoreRisk(current,incoming){const a=counts(current),b=counts(incoming);return {current:a,backup:b,blocked:['people','prayerNeeds','pastPrayers','meetings','updates','history'].some(k=>a[k]>0&&b[k]===0),fewer:Object.keys(a).some(k=>b[k]<a[k])};}
 return {encrypt,decrypt,pack,open,inspect,counts,restoreRisk,validateJournal,MAX_FILE};
})();
