/**
 * DICON GITH — Sponsor Matching Service (admin only)
 *
 * Lets an admin:
 *   1. tag an innovation as "ready for sponsors" (with a short pitch),
 *   2. see which partners are interested in it (category + state match), and
 *   3. log introductions between an innovation and a partner.
 *
 * Live mode  : Cloud Firestore collections `sponsorReady` (doc id = innovationId) and
 *              `introductions`. Both are admin-only (see firestore.rules). Nothing is ever
 *              written to the innovation document itself, so innovators cannot touch it.
 * Local mode : localStorage fallback, like the rest of the app.
 */

import { firebaseService } from './firebase-config.js';

export const READY_COLLECTION = 'sponsorReady';
export const INTRO_COLLECTION = 'introductions';
const READY_KEY = 'dicon_gith_sponsor_ready';
const INTRO_KEY = 'dicon_gith_introductions';

/** Only innovations an admin has already recommended (or further along) can be put in front of sponsors. */
export const READY_STATUSES = ['shortlisted', 'selected', 'mentorship', 'incubation'];

export const INTRO_METHODS = ['Email', 'Phone call', 'Video call', 'In-person meeting', 'Other'];

export const INTRO_OUTCOMES = [
  { key: 'introduced', label: 'Introduced', pill: 'pill-submitted' },
  { key: 'in_talks', label: 'In talks', pill: 'pill-assessment' },
  { key: 'support_agreed', label: 'Support agreed', pill: 'pill-selected' },
  { key: 'no_fit', label: 'Not a fit', pill: 'pill-rejected' }
];

export const MATCH_LIMITS = { summary: 500, note: 1000 };

const clean = (v) => String(v == null ? '' : v).trim();
const isLive = () => !!(firebaseService.isLiveConnected && firebaseService.db);

/* ------------------------------------------------------------------ */
/* Pure helpers (no storage) — unit-tested                            */
/* ------------------------------------------------------------------ */

export function canBeReadyForSponsors(innovation) {
  return !!innovation && READY_STATUSES.includes(innovation.status);
}

/**
 * Which partners are interested in this innovation?
 * A partner is interested when its categories (or "All categories") include the innovation's
 * category and/or its states (or "Nationwide") include the innovation's state.
 * Declined partners are left out. Result is sorted: full matches first, then partial ones;
 * partners already in discussion or partnered come before brand-new ones within a group.
 */
export function matchPartners(innovation, partners) {
  if (!innovation) return [];
  const rank = { partnered: 0, in_discussion: 1, contacted: 2, new: 3 };
  return (Array.isArray(partners) ? partners : [])
    .filter(p => (p.status || 'new') !== 'declined')
    .map(p => {
      const categoryMatch = !!p.allCategories || (p.categories || []).includes(innovation.category);
      const stateMatch = !!p.allStates || (p.states || []).includes(innovation.state);
      return { partner: p, categoryMatch, stateMatch, full: categoryMatch && stateMatch };
    })
    .filter(m => m.categoryMatch || m.stateMatch)
    .sort((a, b) =>
      (Number(b.full) - Number(a.full)) ||
      ((rank[a.partner.status || 'new'] ?? 9) - (rank[b.partner.status || 'new'] ?? 9)) ||
      String(a.partner.organisationName).localeCompare(String(b.partner.organisationName)));
}

export function normalizeIntroduction(raw = {}) {
  return {
    innovationId: clean(raw.innovationId),
    partnerId: clean(raw.partnerId),
    method: clean(raw.method),
    outcome: clean(raw.outcome) || 'introduced',
    date: clean(raw.date),
    note: clean(raw.note)
  };
}

export function validateIntroduction(data) {
  const errors = {};
  if (!data.innovationId) errors.innovationId = 'Choose an innovation.';
  if (!data.partnerId) errors.partnerId = 'Choose a partner.';
  if (!INTRO_METHODS.includes(data.method)) errors.method = 'Choose how the introduction was made.';
  if (!INTRO_OUTCOMES.some(o => o.key === data.outcome)) errors.outcome = 'Choose an outcome.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date))) errors.date = 'Enter the date of the introduction.';
  if (data.note.length > MATCH_LIMITS.note) errors.note = `Keep the note under ${MATCH_LIMITS.note} characters.`;
  return { valid: Object.keys(errors).length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Local fallback store                                               */
/* ------------------------------------------------------------------ */

const _h = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
// Browser-only storage is for localhost and tests. On a real site a write that cannot reach Firebase must fail loudly.
const assertLocalAllowed = () => { if (_h && !['localhost', '127.0.0.1', '[::1]'].includes(_h)) throw new Error('Could not reach the server. Your change was NOT saved. Check your connection and try again.'); };
function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
}
function writeLocal(key, list) {
  assertLocalAllowed();
  localStorage.setItem(key, JSON.stringify(list));
}
const newId = () => 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toPlain(id, d) {
  const iso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : (v || ''));
  return { ...d, id, markedAt: iso(d.markedAt), createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt) };
}

class MatchingService {
  constructor() {
    this._unsubs = [];
  }

  /**
   * Streams both collections. `onReady(list)` / `onIntros(list)` fire on every change.
   * Resolves true when live listeners are attached, false in local mode.
   */
  async watchAll({ onReady, onIntros }, onError = () => {}) {
    this.stop();
    const sendLocal = () => {
      onReady(readLocal(READY_KEY).map(r => toPlain(r.id, r)));
      onIntros(readLocal(INTRO_KEY).map(r => toPlain(r.id, r)));
    };

    if (!isLive() || !firebaseService.auth) { sendLocal(); return false; }

    const fbUser = await new Promise(resolve => {
      let off = null, done = false;
      off = firebaseService.auth.onAuthStateChanged(u => {
        if (done) return;
        done = true;
        if (off) off();
        resolve(u);
      });
    });
    if (!fbUser) { sendLocal(); return false; }

    const db = firebaseService.db;
    this._unsubs.push(db.collection(READY_COLLECTION).onSnapshot(
      snap => onReady(snap.docs.map(d => toPlain(d.id, d.data()))), onError));
    this._unsubs.push(db.collection(INTRO_COLLECTION).orderBy('createdAt', 'desc').onSnapshot(
      snap => onIntros(snap.docs.map(d => toPlain(d.id, d.data()))), onError));
    return true;
  }

  stop() {
    this._unsubs.forEach(off => off());
    this._unsubs = [];
  }

  /**
   * Tags (ready = true) or un-tags (ready = false) an innovation. The innovation's own details are
   * copied into the tag so lists keep working even if the innovation list is not loaded.
   */
  async setReady(innovation, { ready, summary }, admin = {}) {
    if (!innovation || !innovation.innovationId) throw new Error('Innovation not found');
    if (ready && !canBeReadyForSponsors(innovation)) {
      throw new Error('Only recommended or approved innovations can be put forward to sponsors.');
    }
    const record = {
      innovationId: innovation.innovationId,
      referenceNumber: innovation.referenceNumber || '',
      innovationName: innovation.innovationName || innovation.title || '',
      category: innovation.category || '',
      state: innovation.state || '',
      ready: !!ready,
      summary: clean(summary).slice(0, MATCH_LIMITS.summary),
      markedBy: admin.uid || null,
      markedByName: admin.name || null
    };

    if (isLive()) {
      const FV = window.firebase.firestore.FieldValue;
      await firebaseService.db.collection(READY_COLLECTION).doc(record.innovationId)
        .set({ ...record, markedAt: FV.serverTimestamp() });
      return record;
    }

    const list = readLocal(READY_KEY).filter(r => r.id !== record.innovationId);
    list.push({ id: record.innovationId, ...record, markedAt: new Date().toISOString() });
    writeLocal(READY_KEY, list);
    return record;
  }

  /** Logs an introduction. `context` carries display names so the log stays readable. */
  async logIntroduction(raw, context = {}, admin = {}) {
    const data = normalizeIntroduction(raw);
    const { valid, errors } = validateIntroduction(data);
    if (!valid) return { ok: false, errors };

    const record = {
      ...data,
      referenceNumber: clean(context.referenceNumber),
      innovationName: clean(context.innovationName),
      partnerReference: clean(context.partnerReference),
      organisationName: clean(context.organisationName),
      loggedBy: admin.uid || null,
      loggedByName: admin.name || null
    };

    let id;
    if (isLive()) {
      const FV = window.firebase.firestore.FieldValue;
      const ref = await firebaseService.db.collection(INTRO_COLLECTION).add({
        ...record, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
      });
      id = ref.id;
    } else {
      id = newId();
      const list = readLocal(INTRO_KEY);
      const now = new Date().toISOString();
      list.unshift({ id, ...record, createdAt: now, updatedAt: now });
      writeLocal(INTRO_KEY, list);
    }
    return { ok: true, id };
  }

  /** Updates the outcome (and optionally the note) of an existing introduction. */
  async updateOutcome(id, { outcome, note }, admin = {}) {
    if (!INTRO_OUTCOMES.some(o => o.key === outcome)) throw new Error('Invalid outcome');
    const patch = { outcome };
    if (note !== undefined) patch.note = clean(note).slice(0, MATCH_LIMITS.note);

    if (isLive() && !String(id).startsWith('local-')) {
      const FV = window.firebase.firestore.FieldValue;
      await firebaseService.db.collection(INTRO_COLLECTION).doc(id).update({
        ...patch, updatedBy: admin.uid || null, updatedAt: FV.serverTimestamp()
      });
      return;
    }
    const list = readLocal(INTRO_KEY);
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Introduction not found');
    list[idx] = { ...list[idx], ...patch, updatedBy: admin.uid || null, updatedAt: new Date().toISOString() };
    writeLocal(INTRO_KEY, list);
  }
}

export const matchingService = new MatchingService();
