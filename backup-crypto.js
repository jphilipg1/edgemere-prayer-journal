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
 return {encrypt,decrypt,validateJournal,MAX_FILE};
})();
