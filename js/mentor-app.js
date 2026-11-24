/** DICON GITH — Mentor workspace: my mentees, their project summary, private session notes. */
import { authService } from './auth-service.js';
import { storage } from './storage.js';
import { firebaseService } from './firebase-config.js';
import { phase2 } from './phase2-service.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null;
const toast = (t) => { const m = $('msg'); m.textContent = t; m.style.display = 'block'; setTimeout(() => m.style.display = 'none', 3000); };
async function loadInnovation(id) {
  if (firebaseService.isLiveConnected && firebaseService.db) { const d = await firebaseService.db.collection('innovations').doc(id).get(); return d.exists ? { id, ...d.data() } : null; }
  return storage.getInnovationById(id) || null;
}
async function showList() {
  const ms = await phase2.getMentorships(me.uid);
  const rows = await Promise.all(ms.map(async m => ({ m, inno: await loadInnovation(m.innovationId).catch(() => null) })));
  $('app').innerHTML = `<div class="card"><h2>My mentees</h2><div class="mut">${rows.length} innovation(s) assigned to you.</div></div>` +
    (rows.map(({ m, inno }) => `<div class="card row"><div><b>${esc(inno?.innovationName || inno?.title || m.innovationId)}</b><div class="mut">${esc(inno?.category || '')} · ${esc(inno?.state || '')} · ${esc(inno?.status || '')}</div></div>
      <button class="pri" data-open="${esc(m.innovationId)}">Open</button></div>`).join('') || '<div class="card mut">No mentees yet. An administrator will assign innovations to you.</div>');
  $('app').querySelectorAll('[data-open]').forEach(b => b.onclick = () => showMentee(b.dataset.open));
}
async function showMentee(id) {
  const inno = await loadInnovation(id); if (!inno) return toast('Could not open this innovation.');
  const notes = await phase2.getMentorNotes(me.uid, id);
  const kv = (l, v) => v ? `<div class="kv"><b>${l}</b>${esc(v)}</div>` : '';
  $('app').innerHTML = `<button class="sec" id="back">← My mentees</button>
    <div class="card"><h2>${esc(inno.innovationName || inno.title)}</h2><div class="mut">${esc(inno.referenceNumber || '')} · ${esc(inno.category || '')} · ${esc(inno.state || '')}</div>
      ${kv('Innovator', inno.innovatorName)}${kv('Stage', inno.developmentStage)}${kv('Problem', inno.problemDescription || inno.problem)}${kv('Solution', inno.solutionDescription || inno.solution)}
      ${kv('Support needed', (inno.supportNeeded || []).join(', '))}${kv('Support note', inno.supportNote)}</div>
    <div class="card"><h2>Session notes</h2><div class="mut">Private to you and GITH administrators. The innovator cannot see these.</div>
      <textarea id="note" maxlength="1000" placeholder="What did you discuss? Next steps?"></textarea><button class="pri" id="add">Add note</button>
      ${notes.map(n => `<div class="note"><div class="mut">${esc(String(n.createdAt || '').slice(0, 10))}</div>${esc(n.note)}</div>`).join('')}</div>`;
  $('back').onclick = showList;
  $('add').onclick = async () => { const v = $('note').value.trim(); if (!v) return toast('Write a note first.'); try { await phase2.addMentorNote(id, me.uid, v); toast('Note added.'); showMentee(id); } catch (e) { toast('Could not save: ' + e.message); } };
}
async function init() {
  const user = await authService.verifyRole();
  if (!user || !user.uid) { location.href = '/login?redirect=/mentor'; return; }
  if (user.role !== 'mentor') { location.href = (user.role === 'admin' || user.role === 'super_admin') ? '/admin' : user.role === 'evaluator' ? '/evaluator' : '/dashboard'; return; }
  me = user; $('logout').onclick = async () => { await authService.logout(); location.href = '/login'; };
  showList();
}
init();
