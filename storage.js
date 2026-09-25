'use strict';
// Journal persistence adapter. No network APIs. Preserve the original storage key.
window.JournalStore = (() => {
  const key = 'edgemere.prayer-journal.v1';
  const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+'T12:00:00')) && new Date(v+'T12:00:00').getDate() === Number(v.slice(8));
  const optionalDate = v => v === undefined || v === null || date(v);
  const unique = list => new Set(list.map(x => x?.id)).size === list.length;
  const str = v => typeof v === 'string';
  function valid(d) {
    return d && d.version === 1 && typeof d.privacyAccepted === 'boolean' && Array.isArray(d.people) && unique(d.people) && d.people.every(p => p && str(p.id) && str(p.name) && optionalDate(p.followUp) &&
      Array.isArray(p.prayers) && unique(p.prayers) && p.prayers.every(r => r && str(r.id) && str(r.text) && typeof r.answered === 'boolean' && optionalDate(r.added) && optionalDate(r.answeredOn) &&
      (r.history === undefined || (Array.isArray(r.history) && r.history.every(h => h && date(h.date) && ['answered','reopened'].includes(h.action)))) && Array.isArray(r.updates) && r.updates.every(u => u && str(u.text) && date(u.date))) &&
      Array.isArray(p.meetings) && p.meetings.every(m => m && date(m.date) && str(m.location) && str(m.notes)));
  }
  function load() { const raw = localStorage.getItem(key); const data = raw === null ? {version:1,privacyAccepted:false,people:[]} : JSON.parse(raw); if (!valid(data)) throw Error('unreadable'); return {raw,data}; }
  function write(data, expected) { if (localStorage.getItem(key) !== expected) throw Error('conflict'); if (!valid(data)) throw Error('invalid'); const raw = JSON.stringify(data); localStorage.setItem(key,raw); return raw; }
  return {key,date,load,write};
})();
