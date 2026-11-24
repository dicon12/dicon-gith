/**
 * DICON GITH — Admin Phase 2 workspace (injected into admin.html):
 * evaluator assignment, assessment results, shortlisting/selection, verification notes,
 * events, announcements, evaluators & scoring weights.
 */
import { authService } from './auth-service.js';
import { storage } from './storage.js';
import { firebaseService } from './firebase-config.js';
import { phase2, CRITERIA, MIN_EVALUATORS, DEFAULT_WEIGHTS, summarize, rankInnovations, downloadCsv, conflictReason } from './phase2-service.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = [['assign', 'Assign evaluators'], ['results', 'Results & shortlist'], ['verify', 'Verification'], ['events', 'Events'], ['announce', 'Announcements'], ['mentors', 'Mentors'], ['showcase', 'Showcase'], ['people', 'Evaluators & weights']];
let me = null, tab = 'assign', root = null;

const innos = () => storage.getInnovations().filter(i => i.status !== 'draft');
const users = () => (storage.getCloudUsers() || []);
const evaluators = () => users().filter(u => u.role === 'evaluator');
const nameOf = (id) => { const i = innos().find(x => (x.id || x.innovationId) === id); return i ? (i.innovationName || i.title) : id; };
const evalName = (id) => { const u = users().find(x => (x.uid || x.id) === id); return u ? (u.fullName || u.email) : id; };
const idOf = (i) => i.id || i.innovationId;
function toast(msg) { const t = document.createElement('div'); t.textContent = msg; t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0A3323;color:#fff;padding:10px 16px;border-radius:10px;z-index:9999'; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
async function setStatus(inno, next, note) {
  storage.updateInnovationStatus(idOf(inno), next, note, me);
  await storage.pushStatusChange({ ...inno, innovationId: idOf(inno) }, next, note, me);
}

const views = {
  async assign() {
    const [assigns, evs, list] = [await phase2.getAssignments(), evaluators(), innos().filter(i => ['verification', 'assessment'].includes(i.status))];
    if (!evs.length) return '<p>No evaluators yet. Open the <b>Evaluators & weights</b> tab to give someone the evaluator role.</p>';
    return `<p class="mut">Innovations in <b>verification</b> or <b>assessment</b>. Assign at least ${MIN_EVALUATORS} evaluators each.</p>` + (list.map(i => {
      const mine = assigns.filter(a => a.innovationId === idOf(i));
      return `<div class="p2-card"><b>${esc(i.innovationName || i.title)}</b> <span class="mut">${esc(i.referenceNumber)} · ${esc(i.status)}</span>
        <div>${mine.map(a => `<span class="p2-pill">${esc(evalName(a.evaluatorId))} <a href="#" data-un="${esc(a.id || a.innovationId + '_' + a.evaluatorId)}">✕</a></span>`).join('') || '<span class="mut">No evaluators assigned</span>'}
        <span class="${mine.length >= MIN_EVALUATORS ? 'p2-ok' : 'p2-warn'}">${mine.length}/${MIN_EVALUATORS}</span></div>
        <div class="p2-row"><select data-ev="${esc(idOf(i))}"><option value="">Add evaluator…</option>${evs.filter(e => !mine.some(a => a.evaluatorId === (e.uid || e.id))).map(e => `<option value="${esc(e.uid || e.id)}">${esc(e.fullName || e.email)}${conflictReason(e, i) ? ' ⚠ ' + conflictReason(e, i) : ''}</option>`).join('')}</select>
        <input type="date" data-due="${esc(idOf(i))}"><button data-add="${esc(idOf(i))}">Assign</button>
        ${i.status === 'verification' && mine.length >= MIN_EVALUATORS ? `<button data-go="${esc(idOf(i))}">Move to assessment</button>` : ''}</div></div>`;
    }).join('') || '<p class="mut">Nothing in verification or assessment right now.</p>');
  },
  async results() {
    const [as, w] = [await phase2.getAssessments(), await phase2.getWeights()];
    const ranked = rankInnovations(innos().filter(i => ['assessment', 'shortlisted', 'selected'].includes(i.status)), as, w);
    return `<p class="mut">Ranked by weighted average of submitted assessments. Shortlisting needs at least ${MIN_EVALUATORS} submitted.</p>` +
      `<table class="data-table"><thead><tr><th></th><th>Innovation</th><th>Status</th><th>Avg</th><th>Spread</th><th>Submitted</th><th>Sheets</th></tr></thead><tbody>` +
      (ranked.map(r => { const id = idOf(r.inno); const sheets = as.filter(a => a.innovationId === id);
        return `<tr><td><input type="checkbox" data-pick="${esc(id)}" ${r.count < MIN_EVALUATORS ? 'disabled' : ''}></td><td>${esc(r.inno.innovationName || r.inno.title)}</td><td>${esc(r.inno.status)}</td>
        <td><b>${r.avg.toFixed(2)}</b></td><td>${r.spread.toFixed(2)}</td><td>${r.count}</td>
        <td>${sheets.map(s => `${esc(evalName(s.evaluatorId))}: ${s.submitted ? 'submitted (' + esc(s.recommendation) + ')' : 'draft'} ${s.submitted ? `<a href="#" data-reopen="${esc(s.id || id + '_' + s.evaluatorId)}">reopen</a>` : ''}`).join('<br>') || '—'}</td></tr>`; }).join('') || '<tr><td colspan="7" class="mut">No innovations in assessment yet.</td></tr>') +
      `</tbody></table><div class="p2-row"><button data-bulk="shortlisted">Shortlist selected</button><button data-bulk="selected">Select (final)</button><button data-export="ranking">Export ranking (CSV)</button><button data-export="apps">Export all applications (CSV)</button></div>`;
  },
  async verify() {
    const list = innos().filter(i => i.status === 'verification');
    const notes = await Promise.all(list.map(i => phase2.getVerification(idOf(i))));
    return '<p class="mut">Record contact / site-visit notes. Notes are private to administrators.</p>' + (list.map((i, n) => `<div class="p2-card"><b>${esc(i.innovationName || i.title)}</b> <span class="mut">${esc(i.referenceNumber)}</span>
      <textarea data-note="${esc(idOf(i))}" placeholder="Verification notes">${esc(notes[n]?.verificationNotes || '')}</textarea>
      <div class="p2-row"><button data-savenote="${esc(idOf(i))}">Save notes</button><button data-verified="${esc(idOf(i))}">Save & move to assessment</button></div></div>`).join('') || '<p class="mut">No innovations awaiting verification.</p>');
  },
  async events() {
    const ev = await phase2.getEvents();
    return `<div class="p2-card"><b>New event</b><input id="ev-title" placeholder="Title"><input id="ev-date" type="date"><input id="ev-loc" placeholder="Location"><textarea id="ev-desc" placeholder="Description"></textarea>
      <label><input type="checkbox" id="ev-pub"> Published (visible to innovators)</label><div class="p2-row"><button id="ev-save">Save event</button></div></div>` +
      ev.map(e => `<div class="p2-card"><b>${esc(e.title)}</b> <span class="mut">${esc(e.date)} · ${esc(e.location)}</span> ${e.isPublished ? '<span class="p2-ok">published</span>' : '<span class="p2-warn">draft</span>'}
      <div class="p2-row"><button data-evpub="${esc(e.id)}">${e.isPublished ? 'Unpublish' : 'Publish'}</button><button data-evdel="${esc(e.id)}">Delete</button></div></div>`).join('');
  },
  async announce() {
    return `<div class="p2-card"><b>Send announcement</b><input id="an-title" placeholder="Title" maxlength="100"><textarea id="an-msg" placeholder="Message" maxlength="500"></textarea>
      <select id="an-aud"><option value="all">All innovators</option><option value="submitted">Innovators with submissions</option><option value="shortlisted">Shortlisted innovators</option><option value="selected">Selected innovators</option></select>
      <div class="p2-row"><button id="an-send">Send</button></div><p class="mut">${phase2.isLive() ? 'Creates an in-app notification for each recipient.' : 'Not connected to Firebase: this only adds a notification on this device (local testing).'}</p></div>`;
  },
  async mentors() {
    const [ms, mentors, list] = [await phase2.getMentorships(), users().filter(u => u.role === 'mentor'), innos().filter(i => ['selected', 'mentorship', 'incubation'].includes(i.status))];
    if (!mentors.length) return '<p>No mentors yet. Give someone the <b>mentor</b> role in the Evaluators & weights tab.</p>';
    return '<p class="mut">Selected, mentorship and incubation innovations. Mentors see only the innovations assigned to them.</p>' + (list.map(i => {
      const mine = ms.filter(m => m.innovationId === idOf(i));
      return `<div class="p2-card"><b>${esc(i.innovationName || i.title)}</b> <span class="mut">${esc(i.referenceNumber)} · ${esc(i.status)}</span>
        <div>${mine.map(m => `<span class="p2-pill">${esc(evalName(m.mentorId))} <a href="#" data-mun="${esc(m.id || m.innovationId + '_' + m.mentorId)}">✕</a></span>`).join('') || '<span class="mut">No mentor assigned</span>'}</div>
        <div class="p2-row"><select data-mm="${esc(idOf(i))}"><option value="">Add mentor…</option>${mentors.filter(m => !mine.some(x => x.mentorId === (m.uid || m.id))).map(m => `<option value="${esc(m.uid || m.id)}">${esc(m.fullName || m.email)}${conflictReason(m, i) ? ' ⚠ ' + conflictReason(m, i) : ''}</option>`).join('')}</select><button data-madd="${esc(idOf(i))}">Assign mentor</button></div></div>`;
    }).join('') || '<p class="mut">No selected innovations yet.</p>');
  },
  async showcase() {
    const [sc, list] = [await phase2.getShowcase(false), innos().filter(i => ['selected', 'mentorship', 'incubation'].includes(i.status))];
    return '<p class="mut">Publish to the public Showcase page. Only publish after the innovator has given consent. Do not include contact details.</p>' + (list.map(i => {
      const id = idOf(i), cur = sc.find(x => (x.id || x.innovationId) === id);
      return `<div class="p2-card"><b>${esc(i.innovationName || i.title)}</b> <span class="mut">${esc(i.category)} · ${esc(i.state)}</span> ${cur?.isPublished ? '<span class="p2-ok">on show</span>' : ''}
        <textarea data-sum="${esc(id)}" maxlength="400" placeholder="Short public summary (max 400 characters)">${esc(cur?.summary || String(i.solutionDescription || i.solution || '').slice(0, 300))}</textarea>
        <label><input type="checkbox" data-consent="${esc(id)}" ${cur?.consentConfirmed ? 'checked' : ''}> The innovator has given consent to be shown publicly</label>
        <div class="p2-row"><button data-scpub="${esc(id)}">${cur?.isPublished ? 'Update' : 'Publish'}</button>${cur?.isPublished ? `<button data-scoff="${esc(id)}">Remove from showcase</button>` : ''}</div></div>`;
    }).join('') || '<p class="mut">No selected innovations yet.</p>');
  },
  async people() {
    const w = await phase2.getWeights();
    return `<div class="p2-card"><b>Give a role</b><p class="mut">Super admin only. Enter the person's registered email.</p><input id="role-email" placeholder="email@example.com"><select id="role-pick"><option>evaluator</option><option>mentor</option><option>innovator</option><option>admin</option></select>
      <div class="p2-row"><button id="role-save">Set role</button></div></div>
      <div class="p2-card"><b>Current evaluators</b><p>${evaluators().map(e => esc(e.fullName || e.email)).join(', ') || '<span class="mut">None</span>'}</p></div>
      <div class="p2-card"><b>Scoring weights</b><p class="mut">Agree these with the GITH panel. Higher weight counts more in the average.</p>
      ${CRITERIA.map(c => `<label>${c.label} <input type="number" min="0" max="10" step="0.5" data-w="${c.key}" value="${w[c.key]}"></label>`).join('')}<div class="p2-row"><button id="w-save">Save weights</button></div></div>`;
  }
};

async function render() {
  root.querySelector('.p2-tabs').innerHTML = TABS.map(([k, l]) => `<button class="p2-tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
  const body = root.querySelector('.p2-body');
  body.innerHTML = '<p class="mut">Loading…</p>';
  try { body.innerHTML = await views[tab](); } catch (e) { body.innerHTML = `<p class="p2-warn">Could not load: ${esc(e.message)}</p>`; }
}

async function onClick(e) {
  const t = e.target.closest('button, a'); if (!t) return;
  const d = t.dataset; const q = (s) => root.querySelector(s);
  try {
    if (d.tab) { tab = d.tab; return render(); }
    if (d.un) { e.preventDefault(); await phase2.unassign(d.un); return render(); }
    if (d.add) {
      const ev = q(`[data-ev="${d.add}"]`).value; if (!ev) return toast('Pick an evaluator.');
      const why = conflictReason(users().find(u => (u.uid || u.id) === ev), innos().find(i => idOf(i) === d.add));
      if (why && !confirm(`Conflict of interest: this evaluator ${why}. Assign anyway?`)) return;
      await phase2.assign(d.add, ev, q(`[data-due="${d.add}"]`).value, me.uid); toast('Assigned.'); return render();
    }
    if (d.go) { const i = innos().find(x => idOf(x) === d.go); await setStatus(i, 'assessment', 'Evaluators assigned.'); toast('Moved to assessment.'); return render(); }
    if (d.reopen) { e.preventDefault(); await phase2.reopenAssessment(d.reopen); toast('Assessment reopened.'); return render(); }
    if (d.mun) { e.preventDefault(); await phase2.unassignMentor(d.mun); return render(); }
    if (d.madd) {
      const m = q(`[data-mm="${d.madd}"]`).value; if (!m) return toast('Pick a mentor.');
      const why = conflictReason(users().find(u => (u.uid || u.id) === m), innos().find(i => idOf(i) === d.madd));
      if (why && !confirm(`Conflict of interest: this mentor ${why}. Assign anyway?`)) return;
      await phase2.assignMentor(d.madd, m, me.uid); toast('Mentor assigned.'); return render();
    }
    if (d.scpub || d.scoff) {
      const id = d.scpub || d.scoff; const i = innos().find(x => idOf(x) === id);
      if (d.scoff) { await phase2.saveShowcase(id, { title: i.innovationName || i.title, consentConfirmed: true, isPublished: false }); toast('Removed.'); return render(); }
      if (!q(`[data-consent="${id}"]`).checked) return toast('Tick the consent box first.');
      const summary = q(`[data-sum="${id}"]`).value.trim(); if (summary.length < 20) return toast('Write a summary of at least 20 characters.');
      await phase2.saveShowcase(id, { title: i.innovationName || i.title, category: i.category, state: i.state, stage: i.developmentStage, summary, supportNeeded: i.supportNeeded, consentConfirmed: true, isPublished: true });
      toast('Published to the Showcase.'); return render();
    }
    if (d.export) {
      const as = await phase2.getAssessments(), w = await phase2.getWeights(), stamp = new Date().toISOString().slice(0, 10);
      if (d.export === 'ranking') {
        const rk = rankInnovations(innos().filter(i => ['assessment', 'shortlisted', 'selected'].includes(i.status)), as, w);
        downloadCsv(`gith-ranking-${stamp}.csv`, [['Rank', 'Reference', 'Innovation', 'Category', 'State', 'Status', 'Weighted average', 'Spread', 'Assessments submitted'],
          ...rk.map((r, n) => [n + 1, r.inno.referenceNumber, r.inno.innovationName || r.inno.title, r.inno.category, r.inno.state, r.inno.status, r.avg.toFixed(2), r.spread.toFixed(2), r.count])]);
      } else {
        downloadCsv(`gith-applications-${stamp}.csv`, [['Reference', 'Innovation', 'Innovator', 'Category', 'State', 'Stage', 'Status', 'Submitted'],
          ...innos().map(i => [i.referenceNumber, i.innovationName || i.title, i.innovatorName, i.category, i.state, i.developmentStage, i.status, String(i.submittedAt || '').slice(0, 10)])]);
      }
      return toast('Export downloaded.');
    }
    if (d.bulk) {
      const picks = [...root.querySelectorAll('[data-pick]:checked')].map(c => c.dataset.pick);
      const need = d.bulk === 'shortlisted' ? 'assessment' : 'shortlisted';
      const targets = picks.map(id => innos().find(i => idOf(i) === id)).filter(i => i && i.status === need);
      if (!targets.length) return toast(`Tick innovations currently in "${need}".`);
      if (!confirm(`Move ${targets.length} innovation(s) to ${d.bulk}? Innovators will be notified.`)) return;
      for (const i of targets) await setStatus(i, d.bulk, 'Based on evaluator assessments.');
      toast('Done.'); return render();
    }
    if (d.savenote || d.verified) {
      const id = d.savenote || d.verified; await phase2.saveVerification(id, q(`[data-note="${id}"]`).value.trim().slice(0, 3000), me.uid);
      if (d.verified) { const i = innos().find(x => idOf(x) === id); await setStatus(i, 'assessment', 'Verification completed.'); }
      toast('Saved.'); return render();
    }
    if (t.id === 'ev-save') {
      const title = q('#ev-title').value.trim(), date = q('#ev-date').value; if (!title || !date) return toast('Title and date are required.');
      await phase2.saveEvent({ title, date, location: q('#ev-loc').value.trim(), description: q('#ev-desc').value.trim(), isPublished: q('#ev-pub').checked }); toast('Event saved.'); return render();
    }
    if (d.evpub || d.evdel) {
      if (d.evdel) { if (!confirm('Delete this event?')) return; await phase2.deleteEvent(d.evdel); }
      else { const ev = (await phase2.getEvents()).find(x => x.id === d.evpub); await phase2.saveEvent({ ...ev, isPublished: !ev.isPublished }); }
      return render();
    }
    if (t.id === 'an-send') {
      const title = q('#an-title').value.trim(), msg = q('#an-msg').value.trim(); if (!title || !msg) return toast('Title and message are required.');
      const aud = q('#an-aud').value; const inn = innos();
      let ids = users().filter(u => u.role === 'innovator').map(u => u.uid || u.id);
      if (aud !== 'all') { const owners = new Set(inn.filter(i => aud === 'submitted' || i.status === aud).map(i => i.userId)); ids = ids.filter(id => owners.has(id)); }
      if (!confirm(`Send to ${phase2.isLive() ? ids.length : 'this device'} recipient(s)?`)) return;
      if (phase2.isLive()) toast(`Sent to ${await phase2.announce(title, msg, ids)} innovator(s).`);
      else { storage.addNotification({ title, message: msg, type: 'announcement' }); toast('Added on this device only (not connected to Firebase).'); }
      return;
    }
    if (t.id === 'role-save') {
      if (me.role !== 'super_admin') return toast('Only a super admin can change roles.');
      const email = q('#role-email').value.trim().toLowerCase(); const u = users().find(x => (x.email || '').toLowerCase() === email);
      if (!u) return toast('No registered user with that email.');
      await phase2.setRole(u.uid || u.id, q('#role-pick').value); toast('Role updated. They must sign in again.'); return render();
    }
    if (t.id === 'w-save') {
      const w = {}; root.querySelectorAll('[data-w]').forEach(i => { w[i.dataset.w] = Math.max(0, Math.min(10, Number(i.value) || 0)); });
      if (!Object.values(w).some(v => v > 0)) return toast('At least one weight must be above zero.');
      await phase2.saveWeights(w); toast('Weights saved.');
    }
  } catch (err) { toast('Error: ' + err.message); }
}

async function init() {
  const user = await authService.verifyRole();
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return;
  me = user;
  const nav = document.querySelector('.sidebar-scroll');
  const main = document.getElementById('admin-view-overview')?.parentElement;
  if (!nav || !main) return;
  nav.insertAdjacentHTML('afterbegin', `<div class="sidebar-section-label">Evaluation (Phase 2)</div><ul class="sidebar-nav-list"><li class="sidebar-nav-item" data-view="admin-view-phase2"><a href="#admin-phase2"><span>Evaluation Workspace</span></a></li></ul>`);
  const st = document.createElement('style');
  st.textContent = `.p2-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}.p2-tab,#admin-view-phase2 button{border:1px solid #0A3323;background:#fff;color:#0A3323;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:600}
  .p2-tab.on,#admin-view-phase2 .p2-row button{background:#0A3323;color:#fff}.p2-card{border:1px solid #dfe5e2;border-radius:12px;padding:14px;margin-bottom:12px;background:#fff}
  .p2-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}#admin-view-phase2 input:not([type=checkbox]),#admin-view-phase2 select,#admin-view-phase2 textarea{width:100%;padding:9px;border:1px solid #dfe5e2;border-radius:8px;margin-top:8px;font:inherit}
  .p2-row select,.p2-row input{width:auto!important;margin:0!important}.p2-pill{display:inline-block;background:#eef3f0;border-radius:99px;padding:3px 10px;margin:6px 6px 0 0;font-size:13px}.p2-ok{color:#0A5C36;font-weight:700}.p2-warn{color:#a15c00;font-weight:700}.mut{color:#5f6f68;font-size:13px}`;
  document.head.appendChild(st);
  main.insertAdjacentHTML('beforeend', '<section class="dashboard-view" id="admin-view-phase2"><div class="content-card" style="padding:18px"><div class="p2-tabs"></div><div class="p2-body"></div></div></section>');
  root = document.getElementById('admin-view-phase2');
  root.addEventListener('click', onClick);
  window.addEventListener('hashchange', () => { if (location.hash === '#admin-phase2') render(); });
  if (location.hash === '#admin-phase2') render();
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
