'use strict';
// Backups never leave this device except through the user's file-save action.
(() => {
 const ready=!!window.crypto?.subtle&&window.isSecureContext,RECOVERY='edgemere.prayer-journal.pre-restore.v1';
 let dismissed=false,shown=false;
 const summary=c=>`${c.people} people · ${c.prayerNeeds} prayer needs · ${c.pastPrayers} past prayers · ${c.meetings} meetings`;
 function refresh(){
  const time=Date.parse(data.lastBackupAt);$('last-backup').textContent=Number.isFinite(time)?`Last backup: ${new Date(time).toLocaleString()}`:'No backup recorded yet.';
  const due=data.people.length>0&&(!Number.isFinite(time)||Date.now()-time>=30*86400000);if(!shown&&!dismissed&&due&&!locked&&data.privacyAccepted){$('backup-reminder').hidden=false;shown=true;}if(!due)$('backup-reminder').hidden=true;
  $('backup-create').disabled=!ready||locked;$('backup-restore').disabled=!ready;$('backup-unavailable').hidden=ready;
 }
 $('backup-dismiss').onclick=()=>{dismissed=true;$('backup-reminder').hidden=true;};
 function dialog(title){const d=el('dialog',undefined,'backup-dialog');d.setAttribute('aria-labelledby','backup-title');d.append(el('h2',title));d.firstChild.id='backup-title';const error=el('p',undefined,'backup-error');error.setAttribute('role','alert');const progress=el('p',undefined,'meta');progress.setAttribute('role','status');d.append(progress,error);document.body.append(d);return {d,error,progress};}
 async function create(recovery=false){
  if(!ready||locked&&!recovery)return;const {d,error,progress}=dialog(recovery?'Save Pre-Restore Journal':'Back Up Journal');let closed=false,file=null,blobURL=null,snapshot=null;
  d.addEventListener('close',()=>{closed=true;file=null;snapshot=null;if(blobURL)URL.revokeObjectURL(blobURL);d.remove();});d.append(button('Close',()=>d.close()));d.showModal();progress.textContent='Checking your complete journal…';
  try{
   let current;if(recovery){const raw=localStorage.getItem(RECOVERY);if(!raw)throw Error('missing');current={raw,data:JournalBackup.validateJournal(JSON.parse(raw))};}else{
    current=JournalStore.load();if(current.raw!==lastRaw||JSON.stringify(current.data)!==JSON.stringify(data))throw Error('conflict');
   }
   if(!current.data.people.length)throw Error('empty');snapshot=current.raw;
   const result=await JournalBackup.pack(current.data);if(closed)return;
   const serialized=JSON.stringify(result),check=await JournalBackup.open(serialized);if(closed)return;
   if(JSON.stringify(check.journal)!==JSON.stringify(current.data))throw Error('verification');
   if(localStorage.getItem(recovery?RECOVERY:JournalStore.key)!==snapshot)throw Error('conflict');
   file=new File([serialized],`Edgemere-Prayer-Journal-${recovery?'Pre-Restore-':''}Backup-${result.createdAt.replace(/[:.]/g,'-')}.epjbackup`,{type:'application/octet-stream'});
   progress.textContent='Backup created';d.append(el('p',summary(check.counts).replace(/ · /g,'\n'),'backup-counts'),el('p','Your backup contains a copy of your Prayer Journal. Save it somewhere you trust, such as Files, iCloud Drive, or Google Drive.'),el('p','This file is not password-encrypted. Edgemere does not receive it.'));
   const row=el('div',undefined,'actions');const saved=button('I saved the backup',()=>{
    if(recovery){d.close();return;}
    if(localStorage.getItem(JournalStore.key)!==snapshot){error.textContent='Your journal changed after this backup was created. Make a new backup to include the latest entries.';return;}
    if(save(next=>{next.lastBackupAt=result.createdAt;})){dismissed=true;$('backup-reminder').hidden=true;refresh();d.close();notice('Backup recorded',true);}else error.textContent='The file is ready, but the last-backup date could not be saved. Your journal is unchanged.';
   });saved.hidden=true;
   function currentFile(){if(localStorage.getItem(recovery?RECOVERY:JournalStore.key)!==snapshot){error.textContent='Your journal changed. Close this window and create a fresh backup.';return false;}return true;}
   function download(){if(!currentFile())return;if(!blobURL)blobURL=URL.createObjectURL(file);const link=el('a');link.href=blobURL;link.download=file.name;document.body.append(link);link.click();link.remove();saved.hidden=false;progress.textContent='Check that the file was saved, then confirm below. The app cannot verify the destination.';}
   const fallback=button('Download instead',download);fallback.hidden=true;
   const deliver=button('Save Backup',async()=>{if(!currentFile())return;error.textContent='';let shareable=false;try{shareable=!!navigator.canShare?.({files:[file]});}catch{}
    if(shareable){deliver.disabled=true;try{await navigator.share({files:[file],title:'Prayer Journal backup'});if(closed)return;saved.hidden=false;progress.textContent='Check that the file was saved, then confirm below.';}catch(e){if(closed)return;progress.textContent=e.name==='AbortError'?'Save cancelled. You can try again.':'Sharing is unavailable. Use Download instead.';fallback.hidden=false;}finally{deliver.disabled=false;}}else download();
   },'');row.append(deliver,fallback,saved);d.append(row);deliver.focus();
  }catch(e){if(!closed){progress.textContent='';error.textContent='Backup could not be created correctly. Your journal has not been changed.';}}
 }
 function restore(){
  if(!ready)return;const {d,error,progress}=dialog('Restore Journal');d.append(el('p','Choose a backup, review its contents, then confirm replacement. Existing encrypted backups are also supported.'));
  const f=el('form'),label=el('label','Choose Backup'),input=el('input');label.htmlFor='backup-file';input.type='file';input.id='backup-file';input.accept='.epjbackup,application/octet-stream,application/json';input.required=true;f.append(label,input);
  const pwLabel=el('label','Backup Password'),pw=el('input');pwLabel.htmlFor='restore-password';pw.id='restore-password';pw.type='password';pw.maxLength=1024;pw.autocomplete='off';pwLabel.hidden=pw.hidden=true;f.append(pwLabel,pw);
  const actions=el('div',undefined,'actions'),open=el('button','Preview Backup');open.type='submit';actions.append(open,button('Cancel',()=>d.close()));f.append(actions);d.append(f);
  let candidate=null,expected=null,closed=false,busy=false,restored=false;
  d.addEventListener('close',()=>{closed=true;candidate=null;pw.value='';input.value='';d.remove();if(restored)location.reload();});
  input.onchange=()=>{pw.value='';pw.hidden=pwLabel.hidden=true;pw.required=false;error.textContent='';};
  f.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;open.disabled=true;error.textContent='';progress.textContent='Checking backup…';
   try{
    const current=JournalStore.load();expected=current.raw;const file=input.files[0];if(!file||file.size>JournalBackup.MAX_FILE)throw Error('invalid');const text=await file.text();if(closed)return;
    if(JournalBackup.inspect(text).encrypted&&!pw.value){pw.hidden=pwLabel.hidden=false;pw.required=true;progress.textContent='This is an older encrypted backup. Enter its password to preview it.';pw.focus();return;}
    let password=pw.value;pw.value='';let result;try{result=await JournalBackup.open(text,password);}finally{password='';}if(closed)return;
    if(localStorage.getItem(JournalStore.key)!==expected)throw Error('conflict');candidate=result.journal;const risk=JournalBackup.restoreRisk(current.data,candidate);f.hidden=true;progress.textContent='';
    const review=el('section',undefined,'restore-review');review.append(el('h3','Review backup contents'),el('p',`Backup created: ${new Date(result.createdAt).toLocaleString()}`),el('h4','Current journal'),el('p',summary(risk.current)),el('h4','Backup'),el('p',summary(risk.backup)));
    const row=el('div',undefined,'actions');row.append(button('Cancel',()=>d.close()));
    if(risk.blocked){review.append(el('p','Restore blocked: this backup has an empty collection where your current journal has entries. It could erase prayer needs, history or meetings. Your current journal has not changed. Choose a complete backup.','backup-error'));candidate=null;}
    else{
     review.append(el('p','Restoring replaces this device’s journal. A local pre-restore copy is saved before replacement.'));
     const consent=el('input');consent.type='checkbox';consent.id='restore-confirm';const consentLabel=el('label',risk.fewer?'This backup contains fewer entries. I understand that replacing my journal will remove entries not in this backup.':'I reviewed these counts and want to replace this device’s journal.');consentLabel.htmlFor=consent.id;review.append(consent,consentLabel);
     const commit=button('Replace Journal',()=>{
      if(!consent.checked||!candidate)return;
      try{
       JournalBackup.validateJournal(candidate);const current=JournalStore.load();if(current.raw!==expected)throw Error('conflict');if(JournalBackup.restoreRisk(current.data,candidate).blocked)throw Error('empty');
       // Checkpoint must succeed and read back correctly before any replacement.
       if(expected!==null){localStorage.setItem(RECOVERY,expected);if(localStorage.getItem(RECOVERY)!==expected)throw Error('checkpoint');}
       const raw=JournalStore.write(candidate,expected);if(localStorage.getItem(JournalStore.key)!==raw){if(localStorage.getItem(JournalStore.key)===null&&expected!==null)localStorage.setItem(JournalStore.key,expected);throw Error('verification');}
       data=candidate;lastRaw=raw;locked=false;selected=null;restored=true;candidate=null;review.hidden=true;error.textContent='';progress.textContent='Journal restored and verified. '+summary(JournalBackup.counts(data));const done=button('Open Journal',()=>d.close(),'');d.append(done);done.focus();
      }catch{error.textContent='Restore stopped. Your previous journal is preserved, including a pre-restore copy if replacement began. Close and reopen Restore Journal if another tab changed it. Check available device storage.';}
     },'');commit.disabled=true;consent.onchange=()=>{commit.disabled=!consent.checked;};row.append(commit);
    }
    review.append(row);d.append(review);review.tabIndex=-1;review.focus();
   }catch(e){if(!closed){error.textContent=e.message==='conflict'?'Your journal changed while reading the backup. Nothing was replaced. Close and try again.':'The backup could not be validated. Check the file or, for an encrypted backup, its password. Your current journal is unchanged.';progress.textContent='';}}
   finally{pw.value='';busy=false;open.disabled=false;}
  };d.showModal();
 }
 $('backup-create').onclick=()=>create();$('backup-now').onclick=()=>create();$('backup-restore').onclick=restore;
 const recoveryButton=button('Save Pre-Restore Copy',()=>create(true));$('protect-journal').append(recoveryButton);
 function recoveryVisibility(){try{recoveryButton.hidden=!localStorage.getItem(RECOVERY);}catch{recoveryButton.hidden=true;}}
 new MutationObserver(()=>{refresh();recoveryVisibility();}).observe($('view'),{childList:true});window.addEventListener('storage',()=>{refresh();recoveryVisibility();});refresh();recoveryVisibility();
})();
