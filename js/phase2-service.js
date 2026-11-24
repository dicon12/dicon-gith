/**
 * DICON GITH — Phase 2 data layer: assignments, assessments, events, verification notes,
 * scoring weights. Uses Firestore when live, localStorage otherwise (local testing only).
 */
import { firebaseService } from './firebase-config.js';
import { sendEmailNotice } from './email-notify.js';

export const CRITERIA = [
  { key: 'problemSignificance', label: 'Problem significance' },
  { key: 'originality', label: 'Originality' },
  { key: 'technicalFeasibility', label: 'Technical feasibility' },
  { key: 'communityImpact', label: 'Community impact' },
  { key: 'scalability', label: 'Scalability' },
  { key: 'teamCapability', label: 'Team capability' }
];
export const RECOMMENDATIONS = ['advance', 'hold', 'reject'];
export const MIN_EVALUATORS = 2;
export const DEFAULT_WEIGHTS = Object.fromEntries(CRITERIA.map(c => [c.key, 1]));

const LS = {
  assignments: 'dicon_gith_assignments', assessments: 'dicon_gith_assessments',
  events: 'dicon_gith_events', verifications: 'dicon_gith_verifications', settings: 'dicon_gith_p2_settings'
};
const live = () => !!(firebaseService.isLiveConnected && firebaseService.db);
const now = () => new Date().toISOString();
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
const _h = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
// Browser-only storage is for localhost and tests. On a real site a write that cannot reach Firebase must fail loudly.
const assertLocalAllowed = () => { if (_h && !['localhost', '127.0.0.1', '[::1]'].includes(_h)) throw new Error('Could not reach the server. Your change was NOT saved. Check your connection and try again.'); };
const lsSet = (k, v) => { assertLocalAllowed(); localStorage.setItem(k, JSON.stringify(v)); };

// ---------- pure helpers (unit-tested) ----------
export function weightedScore(scores = {}, weights = DEFAULT_WEIGHTS) {
  let total = 0, wsum = 0;
  for (const c of CRITERIA) {
    const s = Number(scores[c.key]);
    const w = Number(weights[c.key] ?? 1);
    if (s >= 1 && s <= 5 && w > 0) { total += s * w; wsum += w; }
  }
  return wsum ? total / wsum : 0;
}
export function validateAssessment(a) {
  const missing = CRITERIA.filter(c => !(Number(a.scores?.[c.key]) >= 1 && Number(a.scores?.[c.key]) <= 5)).map(c => c.label);
  if (missing.length) return 'Score every criterion from 1 to 5: ' + missing.join(', ');
  if (!RECOMMENDATIONS.includes(a.recommendation)) return 'Choose a recommendation.';
  return '';
}
export function summarize(assessments, weights = DEFAULT_WEIGHTS) {
  const done = assessments.filter(a => a.submitted);
  const vals = done.map(a => weightedScore(a.scores, weights));
  const avg = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
  return { count: done.length, avg, spread: vals.length ? Math.max(...vals) - Math.min(...vals) : 0 };
}
export function rankInnovations(innos, assessments, weights = DEFAULT_WEIGHTS) {
  return innos.map(i => ({ inno: i, ...summarize(assessments.filter(a => a.innovationId === (i.id || i.innovationId)), weights) }))
    .sort((a, b) => b.avg - a.avg);
}
/** CSV for Excel. Cells starting with = + - @ are prefixed so spreadsheets never run them as formulas. */
export function toCsv(rows) {
  const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  return '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
export function downloadCsv(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Conflict of interest between an evaluator/mentor (user) and an innovation. Returns a reason or ''. */
export function conflictReason(person, inno) {
  const norm = (v) => String(v || '').trim().toLowerCase();
  if (!person || !inno) return '';
  if ((person.uid || person.id) && (person.uid || person.id) === inno.userId) return 'is the applicant';
  if (norm(person.state) && norm(person.state) === norm(inno.state)) return 'is from the same state';
  if (norm(person.institution) && norm(person.institution) === norm(inno.institution || inno.teamName)) return 'is from the same organisation';
  return '';
}
export const assignmentId = (innovationId, evaluatorId) => `${innovationId}_${evaluatorId}`;

// ---------- storage ----------
async function fsAll(col, where) {
  let q = firebaseService.db.collection(col);
  if (where) q = q.where(where[0], '==', where[1]);
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
const tsStr = (v) => (v && v.toDate ? v.toDate().toISOString() : v);

export const phase2 = {
  isLive: live,

  async getAssignments(evaluatorId = null) {
    if (live()) return fsAll('assignments', evaluatorId ? ['evaluatorId', evaluatorId] : null);
    const l = lsGet(LS.assignments); return evaluatorId ? l.filter(a => a.evaluatorId === evaluatorId) : l;
  },
  async assign(innovationId, evaluatorId, dueDate, adminUid) {
    const id = assignmentId(innovationId, evaluatorId);
    const doc = { innovationId, evaluatorId, assignedBy: adminUid || '', assignedAt: now(), dueDate: dueDate || '' };
    if (live()) await firebaseService.db.collection('assignments').doc(id).set(doc);
    else { const l = lsGet(LS.assignments).filter(a => a.id !== id); l.push({ id, ...doc }); lsSet(LS.assignments, l); }
  },
  async unassign(id) {
    if (live()) await firebaseService.db.collection('assignments').doc(id).delete();
    else lsSet(LS.assignments, lsGet(LS.assignments).filter(a => a.id !== id));
  },

  async getAssessments(evaluatorId = null) {
    if (live()) return fsAll('assessments', evaluatorId ? ['evaluatorId', evaluatorId] : null);
    const l = lsGet(LS.assessments); return evaluatorId ? l.filter(a => a.evaluatorId === evaluatorId) : l;
  },
  async saveAssessment(a) {
    const id = assignmentId(a.innovationId, a.evaluatorId);
    const doc = { innovationId: a.innovationId, evaluatorId: a.evaluatorId, scores: a.scores || {}, comments: a.comments || {},
      recommendation: a.recommendation || '', overallComment: a.overallComment || '', submitted: !!a.submitted, updatedAt: now() };
    if (live()) await firebaseService.db.collection('assessments').doc(id).set(doc);
    else { const l = lsGet(LS.assessments).filter(x => x.id !== id); l.push({ id, ...doc }); lsSet(LS.assessments, l); }
  },
  async reopenAssessment(id) {
    if (live()) await firebaseService.db.collection('assessments').doc(id).update({ submitted: false, updatedAt: now() });
    else lsSet(LS.assessments, lsGet(LS.assessments).map(x => x.id === id ? { ...x, submitted: false } : x));
  },

  async getEvents(publishedOnly = false) {
    let l;
    if (live()) l = await fsAll('events', publishedOnly ? ['isPublished', true] : null);
    else { l = lsGet(LS.events); if (publishedOnly) l = l.filter(e => e.isPublished); }
    return l.map(e => ({ ...e, date: tsStr(e.date) })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  },
  async saveEvent(e) {
    const doc = { title: e.title, date: e.date, location: e.location || '', description: e.description || '', isPublished: !!e.isPublished };
    if (live()) { const col = firebaseService.db.collection('events'); await (e.id ? col.doc(e.id).set(doc) : col.add(doc)); }
    else { const l = lsGet(LS.events); if (e.id) lsSet(LS.events, l.map(x => x.id === e.id ? { id: e.id, ...doc } : x)); else { l.push({ id: 'ev-' + Date.now(), ...doc }); lsSet(LS.events, l); } }
  },
  async deleteEvent(id) {
    if (live()) await firebaseService.db.collection('events').doc(id).delete();
    else lsSet(LS.events, lsGet(LS.events).filter(x => x.id !== id));
  },

  async getVerification(innovationId) {
    if (live()) { const d = await firebaseService.db.collection('verifications').doc(innovationId).get(); return d.exists ? d.data() : null; }
    return lsGet(LS.verifications).find(v => v.id === innovationId) || null;
  },
  async saveVerification(innovationId, notes, adminUid) {
    const doc = { verificationNotes: notes, verifiedBy: adminUid || '', verifiedAt: now() };
    if (live()) await firebaseService.db.collection('verifications').doc(innovationId).set(doc);
    else { const l = lsGet(LS.verifications).filter(v => v.id !== innovationId); l.push({ id: innovationId, ...doc }); lsSet(LS.verifications, l); }
  },

  // ----- public showcase (admin-curated; shown only with the innovator's consent) -----
  async getShowcase(publishedOnly = true) {
    if (live()) return fsAll('showcase', publishedOnly ? ['isPublished', true] : null);
    const l = lsGet('dicon_gith_showcase'); return publishedOnly ? l.filter(x => x.isPublished) : l;
  },
  async saveShowcase(innovationId, data) {
    const doc = { title: data.title, category: data.category || '', state: data.state || '', stage: data.stage || '', summary: String(data.summary || '').slice(0, 400),
      supportNeeded: Array.isArray(data.supportNeeded) ? data.supportNeeded.slice(0, 5) : [], consentConfirmed: data.consentConfirmed === true, isPublished: !!data.isPublished, updatedAt: now() };
    if (live()) await firebaseService.db.collection('showcase').doc(innovationId).set(doc);
    else { const l = lsGet('dicon_gith_showcase').filter(x => x.id !== innovationId); l.push({ id: innovationId, ...doc }); lsSet('dicon_gith_showcase', l); }
  },

  // ----- mentors -----
  async getMentorships(mentorId = null) {
    if (live()) return fsAll('mentorships', mentorId ? ['mentorId', mentorId] : null);
    const l = lsGet('dicon_gith_mentorships'); return mentorId ? l.filter(a => a.mentorId === mentorId) : l;
  },
  async assignMentor(innovationId, mentorId, adminUid) {
    const id = assignmentId(innovationId, mentorId); const doc = { innovationId, mentorId, assignedBy: adminUid || '', assignedAt: now() };
    if (live()) await firebaseService.db.collection('mentorships').doc(id).set(doc);
    else { const l = lsGet('dicon_gith_mentorships').filter(a => a.id !== id); l.push({ id, ...doc }); lsSet('dicon_gith_mentorships', l); }
  },
  async unassignMentor(id) {
    if (live()) await firebaseService.db.collection('mentorships').doc(id).delete();
    else lsSet('dicon_gith_mentorships', lsGet('dicon_gith_mentorships').filter(a => a.id !== id));
  },
  async getMentorNotes(mentorId, innovationId = null) {
    let l;
    if (live()) { l = await fsAll('mentorNotes', ['mentorId', mentorId]); } else l = lsGet('dicon_gith_mentor_notes').filter(n => n.mentorId === mentorId);
    l = l.map(n => ({ ...n, createdAt: tsStr(n.createdAt) }));
    return (innovationId ? l.filter(n => n.innovationId === innovationId) : l).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },
  async addMentorNote(innovationId, mentorId, note) {
    const doc = { innovationId, mentorId, note: String(note).trim().slice(0, 1000), createdAt: live() ? window.firebase.firestore.FieldValue.serverTimestamp() : now() };
    if (live()) await firebaseService.db.collection('mentorNotes').add(doc);
    else { const l = lsGet('dicon_gith_mentor_notes'); l.push({ id: 'mn-' + Date.now(), ...doc }); lsSet('dicon_gith_mentor_notes', l); }
  },

  async getWeights() {
    try {
      if (live()) { const d = await firebaseService.db.collection('settings').doc('scoringWeights').get(); if (d.exists) return { ...DEFAULT_WEIGHTS, ...d.data().weights }; }
      else { const s = JSON.parse(localStorage.getItem(LS.settings) || '{}'); if (s.weights) return { ...DEFAULT_WEIGHTS, ...s.weights }; }
    } catch (e) { /* fall through */ }
    return { ...DEFAULT_WEIGHTS };
  },
  async saveWeights(weights) {
    if (live()) await firebaseService.db.collection('settings').doc('scoringWeights').set({ weights, updatedAt: now() });
    else { assertLocalAllowed(); localStorage.setItem(LS.settings, JSON.stringify({ weights })); }
  },

  /** Announcement: one notification per recipient (batched). Returns count. */
  async announce(title, message, recipientIds) {
    if (live()) {
      for (let i = 0; i < recipientIds.length; i += 400) {
        const batch = firebaseService.db.batch();
        recipientIds.slice(i, i + 400).forEach(uid => batch.set(firebaseService.db.collection('notifications').doc(),
          { userId: uid, title, message, type: 'announcement', isRead: false, createdAt: window.firebase.firestore.FieldValue.serverTimestamp() }));
        await batch.commit();
      }
      for (let i = 0; i < recipientIds.length; i += 300) {
        await sendEmailNotice({ type: 'announcement', title, message, recipientIds: recipientIds.slice(i, i + 300) });
      }
    }
    return recipientIds.length;
  },

  /**
   * super_admin only. Updates users/{uid}.role directly in Firestore (no Cloud Function needed).
   * The security rules (firestore.rules) are what enforce "only a super admin can change roles".
   */
  async setRole(uid, role) {
    if (!live()) throw new Error('Role changes need the live site.');
    if (!['innovator', 'evaluator', 'mentor', 'admin', 'super_admin'].includes(role)) throw new Error('Unknown role.');
    const me = firebaseService.auth && firebaseService.auth.currentUser;
    if (!me) throw new Error('Sign in again first.');
    if (me.uid === uid) throw new Error('You cannot change your own role.');
    const FV = window.firebase.firestore.FieldValue;
    try {
      await firebaseService.db.collection('users').doc(uid).update({ role, updatedAt: FV.serverTimestamp() });
    } catch (e) {
      if (e && e.code === 'permission-denied') throw new Error('Only a super admin can change roles.');
      throw e;
    }
    try {
      await firebaseService.db.collection('auditLogs').add({ userId: me.uid, action: 'set_role', targetUid: uid, detail: role, createdAt: FV.serverTimestamp() });
    } catch (e) { /* the role change already succeeded; the log is best-effort */ }
  }
};
