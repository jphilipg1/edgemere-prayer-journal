'use strict';
const $ = id => document.getElementById(id);
let data = {version:1,privacyAccepted:false,people:[]};
let selected = null, locked = false, lastRaw = null, lastDueDay = '';
function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const today = () => localDate(new Date());
const dateLabel = d => new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const person = () => data.people.find(p => p.id === selected);
const id = () => crypto.randomUUID();
function el(tag,text,className) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(className)n.className=className; return n; }
function button(text,fn,style='secondary') { const n=el('button',text,style); n.type='button'; n.onclick=fn; return n; }
let toastTimer;
function clearToast(){ clearTimeout(toastTimer); $('toast').textContent=''; }
function notice(text,success=false) {
 if(success){ clearToast(); $('message').textContent=''; $('toast').textContent=text; toastTimer=setTimeout(clearToast,4500); }
 else { $('message').textContent=text; if(!text)clearToast(); }
}
window.addEventListener('scroll',clearToast,{passive:true});
function moreMenu(label,action){const menu=el('details',undefined,'more-menu');const summary=el('summary','More');summary.setAttribute('aria-label',label);menu.append(summary,action);action.classList.add('danger-text');return menu;}
function compactText(parent,text){if(text.length>200){const detail=el('details',undefined,'long-note');detail.append(el('summary',text.slice(0,110)+'… Read more'),el('p',text));parent.append(detail);}else parent.append(el('p',text));}

try { const stored=JournalStore.load(); data=stored.data; lastRaw=stored.raw; }
catch { locked=true; notice('Your saved journal could not be read. Changes are disabled to protect existing data. Reopen in the original browser; do not clear site data.'); }
function save(change) {
 if(locked) { notice('Changes are disabled to protect unreadable saved data.'); return false; }
 try { const next=structuredClone(data); change(next); const raw=JournalStore.write(next,lastRaw); data=next; lastRaw=raw; return true; }
 catch(e) { notice(e.message==='conflict'?'Your journal changed in another tab. Reload before saving. Your current form is still open.':'Could not save on this device. Your change has not been saved. Check browser storage settings or available space and try again.'); return false; }
}
function heading(title,action) { const row=el('div',undefined,'toolbar'); row.append(el('h2',title)); if(action)row.append(action); return row; }
// Session history stores only an opaque record ID, never names or notes in URLs.
function go(personId) { if(selected!==personId)history.pushState({journalPerson:personId},''); selected=personId; notice(''); render(true); }
history.replaceState({journalPerson:null},'');
window.addEventListener('popstate',e=>{document.querySelectorAll('dialog[open]').forEach(d=>{if(d.id!=='privacy')d.close();});selected=e.state?.journalPerson||null;notice('');render(true);});
const recent = p => [...p.meetings].sort((a,b)=>b.date.localeCompare(a.date))[0];
function followLabel(date) { return date<today()?`Overdue · ${dateLabel(date)}`:date===today()?'Follow up today':`Follow up ${dateLabel(date)}`; }
function renderHome(v) {
 v.append(el('h1','My Prayer Journal'));
 const actions=el('div',undefined,'actions'); actions.append(button('Add Someone',()=>editPerson(),''),button("People I'm Praying For",()=>{$('people-heading').focus();$('people-heading').scrollIntoView({block:'start'});})); v.append(actions);
 const follow=el('section',undefined,'section'); follow.id='followups'; follow.append(el('h2','Upcoming follow-ups'));
 const planned=data.people.filter(p=>p.followUp).sort((a,b)=>a.followUp.localeCompare(b.followUp));
 if(!planned.length)follow.append(el('p','No follow-ups planned.','muted'));
 for(const [label,filter] of [['Due today',p=>p.followUp===today()],['Overdue',p=>p.followUp<today()],['Upcoming',p=>p.followUp>today()]]){const group=planned.filter(filter);if(!group.length)continue;follow.append(el('h3',label,'follow-category'));group.forEach(p=>{const b=button('',()=>go(p.id),'person follow-person');b.append(el('strong',p.name),el('span',followLabel(p.followUp)));follow.append(b);});}v.append(follow);
 const section=el('section'); const title=el('h2',"People I'm Praying For");title.id='people-heading';title.tabIndex=-1;section.append(title);
 const label=el('label','Find a person');label.htmlFor='person-search';const search=el('input');search.id='person-search';search.type='search';search.autocomplete='off';const list=el('div');
 function showPeople(){list.replaceChildren();const people=data.people.filter(p=>p.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
 if(!data.people.length){const empty=el('div',undefined,'empty');empty.append(el('h3','Start with one person'),el('p','Add their name and what they would like you to pray about.'));list.append(empty);}else if(!people.length)list.append(el('p','No matching people.','muted'));
 people.forEach(p=>{const b=button('',()=>go(p.id),'person');const m=recent(p);b.append(el('strong',p.name),el('span',m?`Last meeting · ${dateLabel(m.date)}`:'No meetings recorded yet'),el('span',`${p.prayers.filter(r=>!r.answered).length} active prayer needs`));list.append(b);});}
 search.oninput=showPeople;section.append(label,search,list);showPeople();v.append(section);
}
function prayerCard(p,r){
 const c=el('article',undefined,'card prayer-card');c.append(el('span',r.answered?'Answered':'Praying','badge'));compactText(c,r.text);c.append(el('p',r.added?`Added ${dateLabel(r.added)}`:'Date added was not recorded in the earlier journal.','meta'));
 const latest=r.updates.at(-1);if(latest){const line=el('div',undefined,'update');line.append(el('span',`Latest update · ${dateLabel(latest.date)}`,'meta'));compactText(line,latest.text);c.append(line);}
 if(r.updates.length>1){const updates=el('details');updates.append(el('summary',`Earlier updates (${r.updates.length-1})`));r.updates.slice(0,-1).reverse().forEach(u=>{const line=el('div',undefined,'update');line.append(el('span',dateLabel(u.date),'meta'),el('p',u.text));updates.append(line);});c.append(updates);}
 if(r.history?.length){const history=el('details');history.append(el('summary','Answer history'));r.history.forEach(h=>history.append(el('p',`${h.action==='answered'?'Answered':'Reopened'} · ${dateLabel(h.date)}`,'meta')));c.append(history);}
 const actions=el('div',undefined,'actions compact-actions');const edit=button('Edit',()=>editPrayer(r));edit.setAttribute('aria-label','Edit prayer');const update=button('Update',()=>addUpdate(r.id));update.setAttribute('aria-label','Add update');const answered=button(r.answered?'Reopen':'Mark answered',()=>{
 if(save(d=>{const x=d.people.find(x=>x.id===p.id).prayers.find(x=>x.id===r.id);x.answered=!x.answered;x.answeredOn=x.answered?today():null;(x.history||=[]).push({action:x.answered?'answered':'reopened',date:today()});})){render();notice(r.answered?'Prayer reopened.':'Prayer marked answered.',true);}});answered.setAttribute('aria-label',r.answered?'Reopen prayer':'Mark answered');
 actions.append(edit,update,answered,moreMenu('More prayer actions',button('Delete prayer',()=>confirmDelete('Delete this prayer?','This permanently deletes this prayer, its updates, and its answer history.',()=>save(d=>{const x=d.people.find(x=>x.id===p.id);x.prayers=x.prayers.filter(x=>x.id!==r.id);}), 'Delete prayer'))));c.append(actions);return c;
}
function renderPerson(v,p){
 v.append(button('← Home / People',()=>go(null),'secondary back'),el('h1',p.name));const m=recent(p);v.append(el('p',m?`Last met ${dateLabel(m.date)}${m.location?' · '+m.location:''}`:'No meetings recorded yet','muted person-meta'));
 const follow=el('p',undefined,'follow-summary');follow.append(el('strong','Next follow-up '),el('span',p.followUp?dateLabel(p.followUp):'Not set'));v.append(follow);
 const actions=el('div',undefined,'actions compact-actions person-actions');const edit=button('Edit',()=>editPerson(p));edit.setAttribute('aria-label','Edit person');const change=button('Follow-up',()=>openFollowup(p.id));change.setAttribute('aria-label',p.followUp?'Change reminder':'Set reminder');actions.append(edit,change,moreMenu('More person actions',button('Delete person',()=>confirmDelete('Delete this person?','This permanently deletes this person and all their prayer needs, updates, meetings, and follow-up dates.',()=>save(d=>{d.people=d.people.filter(x=>x.id!==p.id);}), 'Delete person and records'))));v.append(actions);
 for(const answered of [false,true]){const section=el('section',undefined,'section');const add=button('+ Add',()=>editPrayer(),'');add.setAttribute('aria-label','Add Prayer Need');section.append(heading(answered?'Answered Prayers':'Active Prayer Needs',answered?null:add));const prayers=p.prayers.filter(r=>r.answered===answered);if(!prayers.length)section.append(el('p',answered?'No answered prayers yet.':'No active prayer needs.','muted'));prayers.forEach(r=>section.append(prayerCard(p,r)));v.append(section);}
 const meetings=el('section',undefined,'section');const record=button('+ Record',()=>addMeeting(),'');record.setAttribute('aria-label','Record Meeting');meetings.append(heading('Meeting History',record));if(!p.meetings.length)meetings.append(el('p','No meetings recorded yet.','muted'));
 [...p.meetings].sort((a,b)=>b.date.localeCompare(a.date)).forEach(m=>{const c=el('article',undefined,'card meeting-card');c.append(el('h3',dateLabel(m.date)));if(m.location)c.append(el('p',m.location,'meta'));if(m.notes)compactText(c,m.notes);meetings.append(c);});v.append(meetings);
}
function render(focus=false){const v=$('view');v.replaceChildren();const p=person();document.body.classList.toggle('person-view',!!p);if(p)renderPerson(v,p);else{selected=null;renderHome(v);}if(locked)v.querySelectorAll('button,input').forEach(n=>n.disabled=true);if(focus){const h=v.querySelector('h1');h.tabIndex=-1;h.focus();window.scrollTo(0,0);}updateDueBanner();}
function form(title,fields,commit,afterSave){
 $('form-title').textContent=title;$('fields').replaceChildren();$('form-error').textContent='';fields.forEach(f=>{const label=el('label',f.label);label.htmlFor=f.name;const n=el(f.type==='textarea'?'textarea':'input');n.id=f.name;n.name=f.name;if(f.type!=='textarea')n.type=f.type||'text';n.value=f.value||'';n.required=!!f.required;n.maxLength=f.max||5000;if(f.type==='date')n.max=today();$('fields').append(label,n);});
 $('form').onsubmit=e=>{e.preventDefault();const values={};for(const f of fields){values[f.name]=$(f.name).value.trim();if(f.required&&!values[f.name]){$('form-error').textContent='Please fill in the required fields.';$(f.name).focus();return;}}if(commit(values)){$('editor').close();render(true);notice(title==='Record Meeting'?'Meeting saved':title==='Edit prayer'?'Prayer updated':'Saved on this device.',true);afterSave?.();}else $('form-error').textContent='Not saved. Your text is still here. Resolve the storage issue shown on the page, then try again.';};$('editor').showModal();
}
function editPerson(p){const newId=id();form(p?'Edit person':'Add Someone',[{name:'person-name',label:'Name',required:true,value:p?.name,max:120}],v=>save(d=>{if(p)d.people.find(x=>x.id===p.id).name=v['person-name'];else d.people.push({id:newId,name:v['person-name'],prayers:[],meetings:[],followUp:null});}),()=>{if(!p)go(newId);});}
function editPrayer(r){form(r?'Edit prayer':'Add Prayer Need',[{name:'prayer-text',label:'What would they like prayer for?',type:'textarea',required:true,value:r?.text}],v=>save(d=>{const p=d.people.find(x=>x.id===selected);if(r)p.prayers.find(x=>x.id===r.id).text=v['prayer-text'];else p.prayers.push({id:id(),text:v['prayer-text'],added:today(),answered:false,answeredOn:null,history:[],updates:[]});}));}
function addUpdate(prayerId){form('Add prayer update',[{name:'update-text',label:'What has changed?',type:'textarea',required:true}],v=>save(d=>d.people.find(x=>x.id===selected).prayers.find(x=>x.id===prayerId).updates.push({text:v['update-text'],date:today()})));}
function addMeeting(){const personId=selected;form('Record Meeting',[{name:'meeting-date',label:'Date',type:'date',value:today(),required:true},{name:'meeting-location',label:'Location (optional)',max:200},{name:'meeting-notes',label:'Notes (optional)',type:'textarea'}],v=>save(d=>d.people.find(x=>x.id===personId).meetings.push({date:v['meeting-date'],location:v['meeting-location'],notes:v['meeting-notes']})),()=>openFollowup(personId));}
function confirmDelete(title,explanation,commit,action){$('delete-title').textContent=title;$('delete-description').textContent=explanation;$('delete-error').textContent='';$('confirm-delete').textContent=action;$('confirm-delete').onclick=()=>{if(commit()){$('delete-dialog').close();render(true);notice('Deleted from this device.',true);}else $('delete-error').textContent='Could not delete. Your saved records remain unchanged.';};$('delete-dialog').showModal();$('cancel-delete').focus();}
function relativeDate(weeks){const d=new Date(today()+'T12:00:00');if(weeks)d.setDate(d.getDate()+weeks*7);else{const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));}return localDate(d);}
function openFollowup(personId){
 const p=data.people.find(p=>p.id===personId);if(!p||locked)return;const dialog=el('dialog');dialog.setAttribute('aria-labelledby','follow-title');dialog.append(el('h2','When would you like to follow up?'));dialog.firstChild.id='follow-title';dialog.append(el('p',`Plan to reconnect with ${p.name}.`),el('p','Quick choices count from today. Your meeting is saved even if you cancel this step.','meta'));const error=el('p');error.setAttribute('role','alert');
 const finish=value=>{if(save(d=>{d.people.find(x=>x.id===personId).followUp=value;})){dialog.close();render();notice(value?'Follow-up changed':'Reminder removed.',true);checkDue();}else error.textContent='Could not save the follow-up. Your meeting and earlier reminder remain unchanged.';};
 const choices=el('div',undefined,'actions');choices.append(button('1 week',()=>finish(relativeDate(1))),button('2 weeks',()=>finish(relativeDate(2))),button('1 month',()=>finish(relativeDate(0))));dialog.append(choices);
 const formNode=el('form');const label=el('label','Choose a date');label.htmlFor='follow-date';const input=el('input');input.type='date';input.id='follow-date';input.required=true;input.min=today();input.value=p.followUp&&p.followUp>=today()?p.followUp:today();const submit=el('button','Save date');submit.type='submit';const row=el('div',undefined,'actions');row.append(submit,button('No reminder',()=>finish(null)),button('Cancel',()=>dialog.close()));formNode.append(label,input,row);formNode.onsubmit=e=>{e.preventDefault();if(formNode.reportValidity()&&JournalStore.date(input.value))finish(input.value);};dialog.append(formNode,error);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
const duePeople=()=>data.people.filter(p=>p.followUp&&p.followUp<=today());
function updateDueBanner(){const due=duePeople();$('due-banner').hidden=locked||!data.privacyAccepted||!due.length;$('due-count').textContent=`${due.length} follow-up${due.length===1?'':'s'} due. You planned to reconnect.`;}
async function checkDue(){if(locked||!data.privacyAccepted||document.hidden)return;updateDueBanner();if(lastDueDay&&lastDueDay!==today()&&!document.querySelector('dialog[open]'))render();lastDueDay=today();if(duePeople().length&&data.notificationsEnabled&&data.lastNotificationDay!==today()&&window.JournalPWA){if(await JournalPWA.notifyDue())save(d=>{d.lastNotificationDay=today();});}}
const privacyText=[
 'This is your personal prayer journal. No account is required. Your journal stays in this browser on this device; it is not uploaded to GitHub or an Edgemere database.',
 'Edgemere Church of Christ, ministers, elders, staff, and other users cannot see your entries through this app. Other devices and browsers have their own separate journals.',
 'There is no automatic sync, backup, or recovery. Clearing browser/site data, private browsing, browser storage removal, or losing the device may erase your journal.',
 'Journal storage is not encrypted. Someone who can access this device and browser may be able to read it. Use a trusted personal device and record only what you need to remember.',
 'The hosting provider serves application files and may receive ordinary website access information such as your IP address. Our app does not send it your journal entries or use analytics.'
];
document.querySelectorAll('.privacy-copy').forEach(n=>privacyText.forEach(t=>n.append(el('p',t))));
for(const row of PRAYER_GUIDE)$('guide-prompts').append(el('dt',`${row.letter} — ${row.word}`),el('dd',row.prompt));
$('cancel').onclick=()=>$('editor').close();$('cancel-delete').onclick=()=>$('delete-dialog').close();$('view-followups').onclick=()=>{go(null);$('followups').scrollIntoView({block:'start'});};
$('privacy').addEventListener('cancel',e=>e.preventDefault());$('accept').onclick=()=>{if(save(d=>{d.privacyAccepted=true;})){$('privacy').close();render(true);checkDue();}else $('privacy-error').textContent='This browser could not save your privacy preference. No changes have been saved. Enable browser storage and try again.';};
window.addEventListener('storage',e=>{if(e.key===JournalStore.key||e.key===null)notice('Your journal changed in another tab. Reload before making changes.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDue();});render();if(!data.privacyAccepted&&!locked)$('privacy').showModal();setInterval(checkDue,60000);
