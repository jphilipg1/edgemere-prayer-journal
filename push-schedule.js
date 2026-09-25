'use strict';
// Pure local projection: person IDs only enter localMapping, never the remote schedule.
window.EPJPushSchedule = (people,previous={},now=new Date(),hour=9,minute=0) => {
 const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const current=day(now),groups=new Map();for(const p of people){if(p.followUp&&p.followUp>=current){if(!groups.has(p.followUp))groups.set(p.followUp,[]);groups.get(p.followUp).push(p.id);}}
 const localMapping={},reminders=[];
 for(const [date,personIds] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  const scheduled=new Date(date+`T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`);const end=new Date(date+'T00:00:00');end.setDate(end.getDate()+1);
  if(scheduled-now>730*86400000)throw Error('future_date');
  if(now.getTime()+5000>=end.getTime())continue;
  const opaqueId=previous[date]?.id||crypto.randomUUID();localMapping[date]={id:opaqueId,personIds};
  reminders.push({id:opaqueId,day:date,at:Math.max(scheduled.getTime(),now.getTime()+5000),expiresAt:end.getTime()});
 }
 return {localMapping,reminders};
};
