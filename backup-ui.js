'use strict';
// UI only. Passwords/decrypted imports exist temporarily in memory, never in logs or URLs.
(() => {
 const ready=!!window.crypto?.subtle&&window.isSecureContext;
 let dismissed=false,shown=false;
 function refresh(){
  const last=data.lastBackupAt;const time=Date.parse(last);
  $('last-backup').textContent=Number.isFinite(time)?`Last backup: ${new Date(time).toLocaleString()}`:'No backup recorded yet.';
  const due=data.people.length>0&&(!Number.isFinite(time)||Date.now()-time>=30*86400000);
  if(!shown&&!dismissed&&due&&!locked&&data.privacyAccepted){$('backup-reminder').hidden=false;shown=true;}
  if(!due)$('backup-reminder').hidden=true;
  $('backup-create').disabled=!ready||locked;$('backup-restore').disabled=!ready;
  $('backup-unavailable').hidden=ready;
 }
 $('backup-dismiss').onclick=()=>{dismissed=true;$('backup-reminder').hidden=true;};
 function dialog(title){const d=el('dialog',undefined,'backup-dialog');d.setAttribute('aria-labelledby','backup-title');d.append(el('h2',title));d.firstChild.id='backup-title';const error=el('p',undefined,'backup-error');error.setAttribute('role','alert');const progress=el('p',undefined,'meta');progress.setAttribute('role','status');d.append(progress,error);document.body.append(d);return {d,error,progress};}
 function passwordField(form,label,id,confirm=false){const l=el('label',label);l.htmlFor=id;const input=el('input');input.id=id;input.type='password';input.required=true;input.maxLength=1024;input.autocomplete=confirm?'new-password':'off';input.spellcheck=false;form.append(l,input);return input;}
 function create(){
 if(!ready||locked)return;
 const {d,error,progress}=dialog('Back Up Journal');d.append(el('p',"This password protects your backup. You'll need it to restore your journal."),el('p','Edgemere cannot recover this password. Use at least 12 characters; a few memorable words work well.'));
 const f=el('form');const pw=passwordField(f,'Backup Password','backup-password',true),confirm=passwordField(f,'Confirm Password','backup-confirm',true);pw.minLength=confirm.minLength=12;
 const actions=el('div',undefined,'actions');const prepare=el('button','Prepare Backup');prepare.type='submit';const cancel=button('Cancel',()=>d.close());actions.append(prepare,cancel);f.append(actions);d.append(f);
 let file=null,blobURL=null,createdAt=null,busy=false,closed=false;
 d.addEventListener('close',()=>{closed=true;pw.value=confirm.value='';file=null;if(blobURL)URL.revokeObjectURL(blobURL);d.remove();});
 f.onsubmit=async e=>{e.preventDefault();if(busy)return;error.textContent='';if(pw.value!==confirm.value){error.textContent='The passwords do not match.';confirm.focus();return;}
 busy=true;prepare.disabled=true;progress.textContent='Protecting your journal…';
 // Snapshot the entire persisted record, including unknown future-compatible settings.
 let password=pw.value;pw.value=confirm.value='';
 try{const current=JournalStore.load();const result=await JournalBackup.encrypt(current.data,password);if(closed)return;createdAt=result.createdAt;file=new File([JSON.stringify(result)],`Edgemere-Prayer-Journal-Backup-${createdAt.slice(0,10)}.epjbackup`,{type:'application/octet-stream'});f.hidden=true;progress.textContent='Your encrypted backup is ready.';
 const delivery=el('div');delivery.append(el('p','Save this file somewhere you can find it later. You can choose Files or another destination offered by your device.'));
 const row=el('div',undefined,'actions');const saved=button('I saved the backup',()=>{
 if(save(next=>{next.lastBackupAt=createdAt;})){dismissed=true;$('backup-reminder').hidden=true;refresh();d.close();notice('Backup recorded',true);}else error.textContent='The file is ready, but the last-backup date could not be saved. Your journal has not changed.';
 });saved.hidden=true;
 function download(){if(!blobURL)blobURL=URL.createObjectURL(file);const link=el('a');link.href=blobURL;link.download=file.name;document.body.append(link);link.click();link.remove();saved.hidden=false;progress.textContent='Check that the file was saved, then confirm below. Downloads cannot be verified by this app.';}
 const fallback=button('Download instead',download);fallback.hidden=true;
 const deliver=button('Save Backup',async()=>{error.textContent='';let shareable=false;try{shareable=!!navigator.canShare?.({files:[file]});}catch{}
 if(shareable){deliver.disabled=true;try{await navigator.share({files:[file],title:'Encrypted journal backup'});if(closed)return;saved.hidden=false;progress.textContent='Check that you saved the file, then confirm below.';}catch(e){if(closed)return;progress.textContent=e.name==='AbortError'?'Save cancelled. You can try again.':'Sharing is unavailable. Use Download instead.';fallback.hidden=false;}finally{deliver.disabled=false;}}
 else download();
 },'');row.append(deliver,fallback,saved,button('Close',()=>d.close()));delivery.append(row);d.append(delivery);
 }catch{if(!closed){error.textContent='The backup could not be created. Your journal is unchanged. Check available space and try again.';progress.textContent='';prepare.disabled=false;}}finally{password='';busy=false;}
 };d.showModal();pw.focus();
 }
 function restore(){
 if(!ready)return;const {d,error,progress}=dialog('Restore Journal');d.append(el('p','Choose your encrypted backup. Restoring replaces the journal on this device; it does not merge journals.'));
 const f=el('form');const label=el('label','Choose Backup');label.htmlFor='backup-file';const input=el('input');input.type='file';input.id='backup-file';input.accept='.epjbackup,application/octet-stream,application/json';input.required=true;f.append(label,input);const pw=passwordField(f,'Backup Password','restore-password');const actions=el('div',undefined,'actions');const open=el('button','Open Backup');open.type='submit';actions.append(open,button('Cancel',()=>d.close()));f.append(actions);d.append(f);
 let candidate=null,expected=null,closed=false,busy=false,restored=false;
 d.addEventListener('close',()=>{closed=true;candidate=null;pw.value='';input.value='';d.remove();if(restored)location.reload();});
 f.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;open.disabled=true;error.textContent='';progress.textContent='Opening backup…';let password=pw.value;pw.value='';
 try{expected=localStorage.getItem(JournalStore.key);const file=input.files[0];if(!file||file.size>JournalBackup.MAX_FILE)throw Error('invalid');const result=await JournalBackup.decrypt(await file.text(),password);if(closed)return;candidate=result.journal;f.hidden=true;progress.textContent='';
 const review=el('section',undefined,'restore-review');review.append(el('h3','Restore this journal?'),el('p',`Backup created: ${new Date(result.createdAt).toLocaleString()}`));
 const prayers=candidate.people.flatMap(p=>p.prayers);review.append(el('p',`${candidate.people.length} people · ${prayers.filter(r=>!r.answered).length} prayer needs · ${prayers.filter(r=>r.answered).length} past prayers · ${candidate.people.reduce((n,p)=>n+p.meetings.length,0)} meetings`),el('p','This replaces your current journal. Back up your current journal first if you want to keep both.'));
 const row=el('div',undefined,'actions');row.append(button('Cancel',()=>d.close()),button('Restore Journal',()=>{
 let raw;
 try{
  JournalBackup.validateJournal(candidate);
  // In-memory safety snapshot; one atomic setItem below is the only persistence mutation.
  const safetyRaw=localStorage.getItem(JournalStore.key);
  if(safetyRaw!==expected)throw Error('conflict');
  raw=JournalStore.write(candidate,expected); // Quota/security errors leave the old value intact.
 }catch{error.textContent='The journal could not be restored. Your current journal is unchanged. Check available storage, and close and reopen Restore Journal if another tab changed it.';return;}
  data=candidate;lastRaw=raw;locked=false;selected=null;restored=true;candidate=null;
  review.hidden=true;error.textContent='';progress.textContent='Journal restored. All records are now on this device.';const done=button('Open Journal',()=>d.close(),'');d.append(done);done.focus();
 },''));review.append(row);d.append(review);review.tabIndex=-1;review.focus();
 }catch{if(!closed){error.textContent="That backup couldn't be opened. Check your password or choose another backup file.";progress.textContent='';open.disabled=false;}}finally{password='';busy=false;}
 };d.showModal();
 }
 $('backup-create').onclick=create;$('backup-now').onclick=create;$('backup-restore').onclick=restore;
 // Observe app renders without adding any journal content to the DOM observer output.
 new MutationObserver(refresh).observe($('view'),{childList:true});window.addEventListener('storage',refresh);refresh();
})();
