/** DICON GITH — Evaluator workspace: my assignments, read-only review, score sheet. */
import { authService } from './auth-service.js';
import { storage } from './storage.js';
import { firebaseService } from './firebase-config.js';
import { renderAttachments } from './file-viewer.js';
import { phase2, CRITERIA, RECOMMENDATIONS, validateAssessment, weightedScore, DEFAULT_WEIGHTS } from './phase2-service.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => /^https?:\/\//i.test(u) ? u : '#';
let me = null, weights = DEFAULT_WEIGHTS;

function toast(text, err) { const m = $('msg'); m.textContent = text; m.className = err ? 'err' : ''; m.style.display = 'block'; setTimeout(() => m.style.display = 'none', 3500); }

async function loadInnovation(id) {
  if (firebaseService.isLiveConnected && firebaseService.db) {
    const d = await firebaseService.db.collection('innovations').doc(id).get();
    return d.exists ? { id, ...d.data() } : null;
  }
  return storage.getInnovationById(id) || null;
}

async function showList() {
  location.hash = '';
  const [assigns, assessments] = await Promise.all([phase2.getAssignments(me.uid), phase2.getAssessments(me.uid)]);
  const rows = await Promise.all(assigns.map(async a => ({ a, inno: await loadInnovation(a.innovationId).catch(() => null), s: assessments.find(x => x.innovationId === a.innovationId) })));
  $('app').innerHTML = `<div class="card"><h2>My assignments</h2><div class="mut">${rows.length} innovation(s) assigned to you.</div></div>` +
    (rows.map(({ a, inno, s }) => `<div class="card row"><div><b>${esc(inno?.innovationName || inno?.title || a.innovationId)}</b>
      <div class="mut">${esc(inno?.category || '')}${inno?.state ? ' · ' + esc(inno.state) : ''}${a.dueDate ? ' · Due ' + esc(a.dueDate) : ''}</div></div>
      <div class="row"><span class="pill ${s?.submitted ? 'ok' : ''}">${s?.submitted ? 'Submitted' : s ? 'Draft saved' : 'Not started'}</span>
      <button class="${s?.submitted ? 'sec' : 'pri'}" data-open="${esc(a.innovationId)}">${s?.submitted ? 'View' : 'Review'}</button></div></div>`).join('') ||
      '<div class="card mut">Nothing assigned yet. An administrator will assign innovations to you.</div>');
  $('app').querySelectorAll('[data-open]').forEach(b => b.onclick = () => showReview(b.dataset.open));
}

async function showReview(id) {
  const inno = await loadInnovation(id);
  if (!inno) return toast('Could not open this innovation.', true);
  const existing = (await phase2.getAssessments(me.uid)).find(x => x.innovationId === id) || { scores: {}, comments: {}, recommendation: '', overallComment: '', submitted: false };
  const locked = existing.submitted;
  const kv = (l, v) => v ? `<div class="kv"><b>${l}</b>${esc(v)}</div>` : '';
  // Evaluators see name/location only: no contact details are rendered.
  $('app').innerHTML = `<button class="sec" id="back">← My assignments</button>
    <div class="card"><h2>${esc(inno.innovationName || inno.title)}</h2><div class="mut">${esc(inno.referenceNumber || '')} · ${esc(inno.category || '')} · ${esc(inno.state || '')}</div>
      ${kv('Innovator', inno.innovatorName)}${kv('Team', inno.teamName)}${kv('Problem', inno.problemDescription || inno.problem)}${kv('Target users', inno.targetUsers)}
      ${kv('Why it matters', inno.problemImportance)}${kv('Solution', inno.solutionDescription || inno.solution)}${kv('How it works', inno.howItWorks)}
      ${kv('What makes it unique', inno.uniqueness)}${kv('Stage', inno.developmentStage)}<div class="kv"><b>Photos, documents and videos</b><div id="att"></div></div></div>
    <div class="card"><h2>Score sheet</h2><div class="mut">${locked ? 'Submitted and locked.' : 'Score 1 (weak) to 5 (excellent) and add a comment for each criterion.'}</div>
      ${CRITERIA.map(c => `<label>${c.label}</label><select data-s="${c.key}" ${locked ? 'disabled' : ''}><option value="">Select…</option>${[1, 2, 3, 4, 5].map(n => `<option ${Number(existing.scores?.[c.key]) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <textarea data-c="${c.key}" placeholder="Comment" ${locked ? 'disabled' : ''}>${esc(existing.comments?.[c.key] || '')}</textarea>`).join('')}
      <label>Recommendation</label><select id="rec" ${locked ? 'disabled' : ''}><option value="">Select…</option>${RECOMMENDATIONS.map(r => `<option ${existing.recommendation === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <label>Overall comment</label><textarea id="overall" ${locked ? 'disabled' : ''}>${esc(existing.overallComment || '')}</textarea>
      ${locked ? '' : '<div class="row" style="margin-top:14px"><button class="sec" id="draft">Save draft</button><button class="pri" id="submit">Submit assessment</button></div>'}</div>`;
  renderAttachments($('att'), inno);
  $('back').onclick = showList;
  if (locked) return;
  const collect = (submitted) => {
    const scores = {}, comments = {};
    document.querySelectorAll('[data-s]').forEach(s => { if (s.value) scores[s.dataset.s] = Number(s.value); });
    document.querySelectorAll('[data-c]').forEach(t => { comments[t.dataset.c] = t.value.trim().slice(0, 1000); });
    return { innovationId: id, evaluatorId: me.uid, scores, comments, recommendation: $('rec').value, overallComment: $('overall').value.trim().slice(0, 2000), submitted };
  };
  $('draft').onclick = async () => { try { await phase2.saveAssessment(collect(false)); toast('Draft saved.'); } catch (e) { toast('Could not save: ' + e.message, true); } };
  $('submit').onclick = async () => {
    const a = collect(true); const err = validateAssessment(a);
    if (err) return toast(err, true);
    if (!confirm(`Submit this assessment? Weighted score: ${weightedScore(a.scores, weights).toFixed(2)} / 5. It cannot be edited afterwards.`)) return;
    try { await phase2.saveAssessment(a); toast('Assessment submitted.'); showList(); } catch (e) { toast('Could not submit: ' + e.message, true); }
  };
}

async function init() {
  const user = await authService.verifyRole();
  if (!user || !user.uid) { location.href = '/login?redirect=/evaluator'; return; }
  if (user.role !== 'evaluator') { location.href = (user.role === 'admin' || user.role === 'super_admin') ? '/admin' : '/dashboard'; return; }
  me = user;
  $('logout').onclick = async () => { await authService.logout(); location.href = '/login'; };
  weights = await phase2.getWeights();
  showList();
}
init();
