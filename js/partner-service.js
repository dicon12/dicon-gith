/**
 * DICON GITH — Partnership Requests Service
 * Public "Partner with us" submissions + admin review.
 *
 * Live mode  : Cloud Firestore collection `partnerRequests`
 *              (anyone may create a valid request; only admins may read / update).
 * Local mode : localStorage fallback so the page works before Firebase is connected,
 *              matching the rest of the app's offline-first behaviour.
 */

import { GITH_CATEGORIES, NIGERIAN_STATES } from './data.js';
import { firebaseService } from './firebase-config.js';

export const PARTNER_COLLECTION = 'partnerRequests';
const LOCAL_KEY = 'dicon_gith_partner_requests';
const COOLDOWN_KEY = 'dicon_gith_partner_last_submit';
const COOLDOWN_MS = 60 * 1000;

export const ORG_TYPES = [
  'Corporate / Company',
  'Foundation / NGO',
  'Government agency',
  'Academic / Research institution',
  'Financial institution / Investor',
  'Individual sponsor'
];

export const OFFER_TYPES = [
  'Funding / Grants',
  'Mentorship',
  'Manufacturing / Prototyping',
  'Equipment & Tools',
  'Market Access',
  'Training & Capacity Building',
  'Logistics & Infrastructure',
  'Other'
];

export const COMMITMENT_OPTIONS = [
  'Exploratory conversation',
  'One-off support',
  'Annual / recurring support',
  'Multi-year partnership'
];

export const PARTNER_STATUSES = [
  { key: 'new', label: 'New', pill: 'pill-submitted' },
  { key: 'contacted', label: 'Contacted', pill: 'pill-screening' },
  { key: 'in_discussion', label: 'In discussion', pill: 'pill-assessment' },
  { key: 'partnered', label: 'Partnered', pill: 'pill-selected' },
  { key: 'declined', label: 'Declined', pill: 'pill-rejected' }
];

export const LIMITS = {
  name: 120,
  contact: 100,
  text: 2000,
  note: 1000
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (v) => String(v == null ? '' : v).trim();
const onlyKnown = (arr, allowed) =>
  Array.from(new Set((Array.isArray(arr) ? arr : []).filter(v => allowed.includes(v))));

/**
 * Normalises raw form values into the document shape stored in Firestore.
 * Unknown categories / states / offer types are dropped, so the stored data is always clean.
 */
export function normalizePartnerRequest(raw = {}) {
  const allCategories = !!raw.allCategories;
  const allStates = !!raw.allStates;
  return {
    organisationName: clean(raw.organisationName),
    orgType: clean(raw.orgType),
    contactName: clean(raw.contactName),
    contactRole: clean(raw.contactRole),
    email: clean(raw.email).toLowerCase(),
    phone: clean(raw.phone),
    website: clean(raw.website),
    offerTypes: onlyKnown(raw.offerTypes, OFFER_TYPES),
    offerDescription: clean(raw.offerDescription),
    commitment: clean(raw.commitment),
    allCategories,
    categories: allCategories ? [] : onlyKnown(raw.categories, GITH_CATEGORIES),
    allStates,
    states: allStates ? [] : onlyKnown(raw.states, NIGERIAN_STATES),
    consent: raw.consent === true
  };
}

/** Returns { valid, errors: { field: message } } for a normalised request. */
export function validatePartnerRequest(data) {
  const errors = {};

  if (data.organisationName.length < 2) errors.organisationName = 'Enter your organisation or company name.';
  else if (data.organisationName.length > LIMITS.name) errors.organisationName = `Keep this under ${LIMITS.name} characters.`;

  if (!ORG_TYPES.includes(data.orgType)) errors.orgType = 'Choose the option that best describes you.';

  if (data.contactName.length < 2) errors.contactName = 'Enter the name of the contact person.';
  else if (data.contactName.length > LIMITS.contact) errors.contactName = `Keep this under ${LIMITS.contact} characters.`;

  if (data.contactRole.length > LIMITS.contact) errors.contactRole = `Keep this under ${LIMITS.contact} characters.`;

  if (!EMAIL_RE.test(data.email) || data.email.length > 160) errors.email = 'Enter a valid email address.';

  if (data.phone && !/^[0-9+()\-\s]{7,20}$/.test(data.phone)) errors.phone = 'Enter a valid phone number.';

  if (data.website) {
    let ok = false;
    try {
      const u = new URL(data.website);
      ok = u.protocol === 'https:' || u.protocol === 'http:';
    } catch (_) { /* invalid */ }
    if (!ok || data.website.length > 200) errors.website = 'Enter a full web address starting with https://';
  }

  if (data.offerTypes.length === 0) errors.offerTypes = 'Select at least one thing you can offer.';

  if (data.offerDescription.length < 20) errors.offerDescription = 'Tell us a little more (at least 20 characters).';
  else if (data.offerDescription.length > LIMITS.text) errors.offerDescription = `Keep this under ${LIMITS.text} characters.`;

  if (data.commitment && !COMMITMENT_OPTIONS.includes(data.commitment)) errors.commitment = 'Choose one of the listed options.';

  if (!data.allCategories && data.categories.length === 0) errors.categories = 'Select at least one category, or choose "All categories".';
  if (!data.allStates && data.states.length === 0) errors.states = 'Select at least one state, or choose "Nationwide".';

  if (data.consent !== true) errors.consent = 'Please confirm you agree before submitting.';

  return { valid: Object.keys(errors).length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Local fallback store                                               */
/* ------------------------------------------------------------------ */

const _h = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
// Browser-only storage is for localhost and tests. On a real site a write that cannot reach Firebase must fail loudly.
const assertLocalAllowed = () => { if (_h && !['localhost', '127.0.0.1', '[::1]'].includes(_h)) throw new Error('Could not reach the server. Your change was NOT saved. Check your connection and try again.'); };
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (_) { return []; }
}
function writeLocal(list) {
  assertLocalAllowed();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}
function newLocalId() {
  return 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Display reference shown to the sponsor and admin, derived from the document id. */
export function referenceFor(id) {
  return 'PRT-' + String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
}

function isLive() {
  return !!(firebaseService.isLiveConnected && firebaseService.db);
}

class PartnerService {
  constructor() {
    this._unsub = null;
  }

  /** Seconds left before this browser may submit again (0 = free to submit). */
  cooldownRemaining() {
    try {
      const last = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
      return Math.max(0, Math.ceil((last + COOLDOWN_MS - Date.now()) / 1000));
    } catch (_) { return 0; }
  }

  /**
   * Validates and stores a new partnership request.
   * Returns { ok: true, id, reference } or { ok: false, errors }.
   */
  async submit(raw) {
    const data = normalizePartnerRequest(raw);
    const { valid, errors } = validatePartnerRequest(data);
    if (!valid) return { ok: false, errors };

    if (this.cooldownRemaining() > 0) {
      return { ok: false, errors: { form: 'Please wait a minute before sending another request.' } };
    }

    let id;
    if (isLive()) {
      const FV = window.firebase.firestore.FieldValue;
      const ref = await firebaseService.db.collection(PARTNER_COLLECTION).add({
        ...data,
        status: 'new',
        createdAt: FV.serverTimestamp()
      });
      id = ref.id;
    } else {
      id = newLocalId();
      const list = readLocal();
      list.unshift({ id, ...data, status: 'new', createdAt: new Date().toISOString() });
      writeLocal(list);
    }

    try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch (_) { /* ignore */ }
    return { ok: true, id, reference: referenceFor(id) };
  }

  /* ---------------- Admin side ---------------- */

  _toPlain(id, d) {
    const created = d.createdAt && typeof d.createdAt.toDate === 'function'
      ? d.createdAt.toDate().toISOString()
      : (d.createdAt || '');
    const reviewed = d.reviewedAt && typeof d.reviewedAt.toDate === 'function'
      ? d.reviewedAt.toDate().toISOString()
      : (d.reviewedAt || '');
    return { ...d, id, createdAt: created, reviewedAt: reviewed, reference: referenceFor(id) };
  }

  /**
   * Streams all requests to `onData(list)`; newest first.
   * Live: Firestore listener (waits for auth to settle). Local: reads the fallback store.
   * Returns a promise resolving to true when a live listener is attached.
   */
  async watchAll(onData, onError = () => {}) {
    this.stop();

    if (!isLive() || !firebaseService.auth) {
      onData(readLocal().map(r => this._toPlain(r.id, r)));
      return false;
    }

    const fbUser = await new Promise(resolve => {
      let off = null, done = false;
      off = firebaseService.auth.onAuthStateChanged(u => {
        if (done) return;
        done = true;
        if (off) off();
        resolve(u);
      });
    });

    if (!fbUser) {
      onData(readLocal().map(r => this._toPlain(r.id, r)));
      return false;
    }

    this._unsub = firebaseService.db
      .collection(PARTNER_COLLECTION)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        snap => onData(snap.docs.map(d => this._toPlain(d.id, d.data()))),
        err => onError(err)
      );
    return true;
  }

  stop() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  /** Admin: update status and internal note on a request. */
  async updateReview(id, { status, adminNote }, admin = {}) {
    if (!PARTNER_STATUSES.some(s => s.key === status)) throw new Error('Invalid status');
    const note = clean(adminNote).slice(0, LIMITS.note);

    if (isLive() && !String(id).startsWith('local-')) {
      const FV = window.firebase.firestore.FieldValue;
      await firebaseService.db.collection(PARTNER_COLLECTION).doc(id).update({
        status,
        adminNote: note,
        reviewedBy: admin.uid || null,
        reviewedByName: admin.name || null,
        reviewedAt: FV.serverTimestamp()
      });
      return;
    }

    const list = readLocal();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Request not found');
    list[idx] = {
      ...list[idx],
      status,
      adminNote: note,
      reviewedBy: admin.uid || null,
      reviewedByName: admin.name || null,
      reviewedAt: new Date().toISOString()
    };
    writeLocal(list);
  }
}

export const partnerService = new PartnerService();
