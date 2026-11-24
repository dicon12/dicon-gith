/**
 * DICON GITH App - Storage & State Management
 * Handles local persistence, offline-first drafts, and sync-ready state.
 */

import { firebaseService } from './firebase-config.js';

// Support types an innovator can ask for on the submission form
export const SUPPORT_OPTIONS = ['Funding', 'Mentorship', 'Manufacturing', 'Market', 'Partner'];

// Fields the "correct and resubmit" wizard may change on a returned application.
const RESUBMIT_FIELDS = ['innovationName', 'category', 'developmentStage', 'state', 'lga', 'teamName',
  'problemDescription', 'targetUsers', 'problemImportance', 'solutionDescription', 'howItWorks',
  'uniqueness', 'ipStatus', 'requiresIpSupport', 'supportNeeded', 'supportNote',
  'imageUrls', 'documentUrls', 'videoUrls'];

const STORAGE_KEYS = {
  USER: 'dicon_gith_user',
  ONBOARDING: 'dicon_gith_onboarding_seen',
  INNOVATIONS: 'dicon_gith_innovations',
  DRAFT: 'dicon_gith_draft',
  NOTIFICATIONS: 'dicon_gith_notifications',
  REFERENCE_NUMBERS: 'dicon_gith_ref_registry'
};

class StorageService {
  constructor() {
    this.init();
  }

  init() {
    // Start empty. No sample innovations or notifications are ever created.
    if (!localStorage.getItem(STORAGE_KEYS.INNOVATIONS)) {
      localStorage.setItem(STORAGE_KEYS.INNOVATIONS, '[]');
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, '[]');
      localStorage.setItem(STORAGE_KEYS.REFERENCE_NUMBERS, '[]');
    }
  }

  // ---- ONBOARDING ----
  isOnboardingSeen() {
    return localStorage.getItem(STORAGE_KEYS.ONBOARDING) === 'true';
  }

  setOnboardingSeen(value = true) {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING, value ? 'true' : 'false');
  }

  // ---- USER AUTH & PROFILE ----
  getUser() {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  }

  setUser(user) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.USER);
    } else {
      // Local session copy only. Firestore profile writes go through authService.saveProfile()
      // (editable fields only) and firebaseService.ensureUserDoc() (first creation), never this copy.
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    }
  }

  updateProfile(partialData) {
    const user = this.getUser();
    if (!user) return null;
    
    // Prevent modification of role or UID directly by standard innovator
    const updated = {
      ...user,
      ...partialData,
      role: user.role || 'innovator',
      uid: user.uid,
      updatedAt: new Date().toISOString()
    };
    this.setUser(updated);
    return updated;
  }

  calculateProfileCompletion(user = this.getUser()) {
    if (!user) return 0;
    const fields = [
      user.fullName,
      user.photoUrl,
      user.phoneNumber,
      user.state,
      user.lga,
      user.community,
      user.occupation,
      user.institution,
      user.bio,
      user.skills && user.skills.length > 0 ? 'yes' : null
    ];
    const filled = fields.filter(val => val && String(val).trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }

  // ---- REFERENCE NUMBER GENERATOR ----
  generateReferenceNumber() {
    const registry = JSON.parse(localStorage.getItem(STORAGE_KEYS.REFERENCE_NUMBERS) || '[]');
    const year = new Date().getFullYear();
    let ref = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 50) {
      attempts++;
      // Format: GITH-2026-XXXXXX (6 digits)
      const rand = Math.floor(100000 + Math.random() * 900000);
      ref = `GITH-${year}-${rand}`;
      if (!registry.includes(ref)) {
        isUnique = true;
      }
    }

    registry.push(ref);
    localStorage.setItem(STORAGE_KEYS.REFERENCE_NUMBERS, JSON.stringify(registry));
    return ref;
  }

  // ---- CLOUD SYNC (Firestore is the source of truth when live) ----
  // The sync getters below read a localStorage cache. In live mode this cache is kept
  // current by Firestore listeners, so an admin sees every innovator's submissions and an
  // innovator sees status changes made by an admin, from any device.
  _isoTime(v) {
    if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
    if (v && typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
    return v;
  }

  _fromCloud(id, data) {
    const out = { ...data };
    ['createdAt', 'updatedAt', 'submittedAt', 'verifiedAt'].forEach(k => {
      if (out[k] !== undefined) out[k] = this._isoTime(out[k]);
    });
    if (Array.isArray(out.statusHistory)) {
      out.statusHistory = out.statusHistory.map(h => ({ ...h, timestamp: this._isoTime(h.timestamp) }));
    }
    out.innovationId = out.innovationId || id;
    out.id = out.id || id;
    return out;
  }

  _reportSyncError(err, action) {
    console.warn('Firestore sync failed:', action, err);
    const code = err && err.code;
    const message = code === 'permission-denied'
      ? 'Could not save to the server: permission denied. Please sign in again.'
      : 'Could not reach the server. Your changes are saved on this device only.';
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('gith-sync-error', { detail: { message, action } }));
    }
  }

  stopCloudSync() {
    (this._unsubs || []).forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
    this._unsubs = [];
  }

  /**
   * Start live listeners for the signed-in user.
   *  - admin / super_admin: every innovation + all innovator accounts
   *  - innovator: only their own innovations + their notifications
   * onChange() fires after each cache refresh so the page can re-render.
   * Returns true when listeners were attached (live Firebase session), else false.
   */
  async startCloudSync(user, onChange = () => {}) {
    this.stopCloudSync();
    if (!user || !firebaseService.isLiveConnected || !firebaseService.db || !firebaseService.auth) return false;

    const fbUser = await new Promise(resolve => {
      let off = null, done = false;
      off = firebaseService.auth.onAuthStateChanged(u => {
        if (done) return;
        done = true;
        if (off) off();
        resolve(u);
      });
      if (done && off) off();
    });
    if (!fbUser) return false; // no Firebase session: nothing to sync

    const db = firebaseService.db;
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const notify = () => { try { onChange(); } catch (e) { console.warn(e); } };
    const onErr = (what) => (err) => this._reportSyncError(err, what);

    // Innovations
    const innoQuery = isAdmin
      ? db.collection('innovations')
      : db.collection('innovations').where('userId', '==', fbUser.uid);
    this._unsubs.push(innoQuery.onSnapshot(snap => {
      const list = snap.docs.map(d => this._fromCloud(d.id, d.data()))
        .filter(i => i.status !== 'draft')
        .sort((a, b) => String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || '')));
      localStorage.setItem(STORAGE_KEYS.INNOVATIONS, JSON.stringify(list));
      notify();
    }, onErr('innovations')));

    // Notifications (innovator's own; created by Cloud Functions and the client)
    if (!isAdmin) {
      this._unsubs.push(db.collection('notifications').where('userId', '==', fbUser.uid).onSnapshot(snap => {
        const cloud = snap.docs.map(d => {
          const n = d.data();
          return { ...n, notificationId: d.id, createdAt: this._isoTime(n.createdAt) || new Date().toISOString() };
        });
        const localOnly = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]')
          .filter(n => String(n.notificationId || '').startsWith('notif-'));
        const merged = [...cloud, ...localOnly]
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(merged));
        notify();
      }, onErr('notifications')));
    }

    // Innovator accounts (admin directory)
    if (isAdmin) {
      this._unsubs.push(db.collection('users').where('role', '==', 'innovator').onSnapshot(snap => {
        const users = snap.docs.map(d => this._fromCloud(d.id, { uid: d.id, ...d.data() }));
        localStorage.setItem('dicon_gith_cloud_users', JSON.stringify(users));
        notify();
      }, onErr('users')));
    }
    return true;
  }


  // ---- ADMIN: DELETE (permanent) ----
  _requireLiveAdmin() {
    return !!(firebaseService.isLiveConnected && firebaseService.db && firebaseService.auth && firebaseService.auth.currentUser);
  }

  async _auditDelete(action, targetId, note) {
    try {
      await firebaseService.db.collection('auditLogs').add({
        userId: firebaseService.auth.currentUser.uid, action, targetId, note: note || '',
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { console.warn('Audit log write failed:', e && e.message); }
  }

  /** Admin: permanently delete one application and the review records attached to it. */
  async adminDeleteInnovation(inno, admin = null, extraDocCols = []) {
    const user = this.getUser();
    if (user && !this._isAdminUser(user)) throw new Error('Only administrators can delete applications.');
    const id = inno.innovationId || inno.id;
    if (!id) throw new Error('Application not found.');
    if (this._requireLiveAdmin()) {
      const db = firebaseService.db;
      try {
        await db.collection('innovations').doc(id).delete();
      } catch (e) {
        throw new Error('Could not delete (' + ((e && e.code) || 'network error') + '). Publish the latest firestore.rules and try again.');
      }
      // Attached records: best effort, one by one so a single refusal never blocks the rest.
      for (const col of ['assignments', 'assessments', 'mentorships', 'mentorNotes']) {
        try { const q = await db.collection(col).where('innovationId', '==', id).get(); for (const d of q.docs) await d.ref.delete(); } catch (e) { /* ignore */ }
      }
      for (const col of ['verifications', 'showcase', ...extraDocCols]) {
        try { await db.collection(col).doc(id).delete(); } catch (e) { /* ignore */ }
      }
      await this._auditDelete('innovation_deleted', id, `${inno.referenceNumber || ''} ${inno.innovationName || ''} deleted by ${(admin && (admin.email || admin.fullName)) || 'admin'}`);
    }
    const list = this._allInnovations().filter(i => (i.innovationId || i.id) !== id);
    localStorage.setItem(STORAGE_KEYS.INNOVATIONS, JSON.stringify(list));
    return true;
  }

  /** Admin: permanently remove an account from the list, with all of its applications and notifications. */
  async adminDeleteUser(target, admin = null, extraDocCols = []) {
    const user = this.getUser();
    if (user && !this._isAdminUser(user)) throw new Error('Only administrators can delete accounts.');
    const uid = target.uid || target.id;
    if (!uid) throw new Error('Account not found.');
    if (user && (user.uid === uid)) throw new Error('You cannot delete your own account.');
    if (this._requireLiveAdmin()) {
      const db = firebaseService.db;
      const apps = await db.collection('innovations').where('userId', '==', uid).get();
      for (const d of apps.docs) await this.adminDeleteInnovation({ ...d.data(), innovationId: d.id }, admin, extraDocCols);
      try { const n = await db.collection('notifications').where('userId', '==', uid).get(); for (const d of n.docs) await d.ref.delete(); } catch (e) { /* ignore */ }
      try {
        await db.collection('users').doc(uid).delete();
      } catch (e) {
        throw new Error('Could not delete the account (' + ((e && e.code) || 'network error') + '). Publish the latest firestore.rules and try again.');
      }
      await this._auditDelete('user_deleted', uid, `${target.email || ''} removed by ${(admin && (admin.email || admin.fullName)) || 'admin'}`);
    } else {
      const reg = JSON.parse(localStorage.getItem('dicon_gith_users_registry') || '[]').filter(u => (u.uid || u.id) !== uid);
      localStorage.setItem('dicon_gith_users_registry', JSON.stringify(reg));
      localStorage.setItem(STORAGE_KEYS.INNOVATIONS, JSON.stringify(this._allInnovations().filter(i => i.userId !== uid)));
    }
    // Drop the row from the cached directory straight away (the live listener confirms it).
    const cached = this.getCloudUsers();
    if (cached) localStorage.setItem('dicon_gith_cloud_users', JSON.stringify(cached.filter(u => (u.uid || u.id) !== uid)));
    return true;
  }

  /** Admin: activate / deactivate an account. Live mode writes to Firestore (the old code only changed the browser). */
  async adminSetUserActive(target, isActive) {
    if (this._requireLiveAdmin()) {
      try {
        await firebaseService.db.collection('users').doc(target.uid || target.id).update({ isActive, updatedAt: new Date().toISOString() });
      } catch (e) { throw new Error('Could not change the account status (' + ((e && e.code) || 'network error') + ').'); }
    }
    return true;
  }

  getCloudUsers() {
    try { return JSON.parse(localStorage.getItem('dicon_gith_cloud_users') || 'null'); } catch (e) { return null; }
  }

  /** Admin: persist a status change, its history entry and an audit log to Firestore. */
  async pushStatusChange(inno, nextStatus, note, admin) {
    if (!firebaseService.isLiveConnected || !firebaseService.db || !firebaseService.auth || !firebaseService.auth.currentUser) return false;
    const db = firebaseService.db;
    const FV = window.firebase.firestore.FieldValue;
    const adminUid = firebaseService.auth.currentUser.uid;
    const now = new Date().toISOString();
    const entry = { prevStatus: inno.status, newStatus: nextStatus, note: note || '', timestamp: now, by: (admin && (admin.fullName || admin.email)) || 'Admin' };
    const history = [...(inno.statusHistory || []), entry];
    const update = {
      status: nextStatus,
      statusHistory: history,
      updatedAt: now,
      lastReviewedBy: entry.by
    };
    if (nextStatus === 'returned') update.returnReason = note || '';
    try {
      await db.collection('innovations').doc(inno.innovationId).update(update);
      await db.collection('auditLogs').add({
        userId: adminUid,
        action: 'status_change',
        targetId: inno.innovationId,
        from: entry.prevStatus,
        to: nextStatus,
        note: note || '',
        createdAt: FV.serverTimestamp()
      });
      try {
        // In-app notification for the innovator (admins may create notifications; see firestore.rules).
        await db.collection('notifications').add({
          userId: inno.userId,
          title: 'Application status changed',
          message: `${inno.innovationName} (${inno.referenceNumber}) is now: ${nextStatus}.`,
          type: 'status_changed',
          isRead: false,
          createdAt: FV.serverTimestamp()
        });
      } catch (e) { /* the status change itself already succeeded */ }
      return true;
    } catch (err) {
      this._reportSyncError(err, 'status_change');
      return false;
    }
  }

  // ---- INNOVATIONS & DRAFT ----
  /** Every cached innovation, unfiltered. Internal: used only to read-modify-write the whole list. */
  _allInnovations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INNOVATIONS);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  _isAdminUser(user) {
    return !!user && (user.role === 'admin' || user.role === 'super_admin');
  }

  /**
   * Innovations the signed-in user may see: admins see all of them, an innovator sees only
   * the ones they submitted, and with no signed-in user nothing is returned. This mirrors the
   * Firestore rules, so the pages behave the same whether or not Firebase is connected.
   */
  getInnovations(userId = null) {
    const user = this.getUser();
    let list = this._allInnovations();
    if (!user) return [];
    if (!this._isAdminUser(user)) {
      const me = user.uid || user.id;
      list = list.filter(item => item.userId === me);
    }
    if (userId) list = list.filter(item => item.userId === userId);
    return list;
  }

  getInnovationById(id) {
    const list = this.getInnovations();
    return list.find(item => item.innovationId === id || item.referenceNumber === id) || null;
  }

  _getDraftKey(userId = null) {
    const uid = userId || (this.getUser() ? this.getUser().uid : 'anon');
    return `${STORAGE_KEYS.DRAFT}_${uid}`;
  }

  getDraft(userId = null) {
    const key = this._getDraftKey(userId);
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    // Legacy fallback only if same user
    const legacy = localStorage.getItem(STORAGE_KEYS.DRAFT);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        const activeUid = userId || (this.getUser() ? this.getUser().uid : 'anon');
        if (parsed.userId === activeUid) return parsed;
      } catch (e) {}
    }
    return null;
  }

  saveDraft(draftData, userId = null) {
    const user = this.getUser();
    const uid = userId || (user ? user.uid : 'anon');
    const existing = this.getDraft(uid) || {};
    const updated = {
      ...existing,
      ...draftData,
      status: 'draft',
      userId: uid,
      innovatorName: user ? user.fullName : '',
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(this._getDraftKey(uid), JSON.stringify(updated));
    return updated;
  }

  clearDraft(userId = null) {
    const key = this._getDraftKey(userId);
    localStorage.removeItem(key);
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
  }

  submitInnovation(data, overrideUser = null) {
    const user = overrideUser || this.getUser();
    if (!user) throw new Error("Authentication required.");

    const refNumber = this.generateReferenceNumber();
    const innovationId = `inno-${Date.now()}`;
    const now = new Date().toISOString();

    const innovation = {
      id: innovationId,
      innovationId,
      referenceNumber: refNumber,
      userId: user.uid || user.id,
      innovatorName: user.fullName || "GITH Innovator",
      title: data.title || data.innovationName || "Untitled Innovation",
      innovationName: data.innovationName || data.title || "Untitled Innovation",
      category: data.category || "Other",
      state: data.state || user.state || "",
      lga: data.lga || user.lga || "",
      community: data.community || user.community || "",
      teamName: data.teamName || "",
      problemDescription: data.problemDescription || data.problem || "",
      problem: data.problem || data.problemDescription || "",
      targetUsers: data.targetUsers || "",
      problemImportance: data.problemImportance || "",
      solutionDescription: data.solutionDescription || data.solution || "",
      solution: data.solution || data.solutionDescription || "",
      howItWorks: data.howItWorks || "",
      uniqueness: data.uniqueness || "",
      developmentStage: data.developmentStage || "Prototype",
      ipStatus: data.ipStatus || "Not Yet",
      requiresIpSupport: !!data.requiresIpSupport,
      supportNeeded: Array.isArray(data.supportNeeded)
        ? data.supportNeeded.filter(v => SUPPORT_OPTIONS.includes(v))
        : [],
      supportNote: String(data.supportNote || "").slice(0, 300),
      imageUrls: data.imageUrls || [],
      videoUrls: data.videoUrls || [],
      documentUrls: data.documentUrls || [],
      status: "submitted",
      statusHistory: [
        {
          prevStatus: null,
          newStatus: 'submitted',
          note: 'Application submitted into the GITH registry.',
          timestamp: now
        }
      ],
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const list = this._allInnovations();
    list.unshift(innovation);
    localStorage.setItem(STORAGE_KEYS.INNOVATIONS, JSON.stringify(list));

    // Clear active draft
    this.clearDraft(user.uid || user.id);

    // Sync to live Firestore if connected
    this._pushSubmission(innovation).catch(err => this._reportSyncError(err, "submit"));

    // Create success notification
    this.addNotification({
      title: "Innovation Submitted Successfully",
      message: `Your application '${innovation.innovationName}' has been submitted. Reference: ${refNumber}`,
      type: "submission_success",
      targetUserId: user.uid || user.id
    });

    return innovation;
  }

  addInnovation(data) {
    const user = this.getUser() || {
      uid: data.userId || 'user-auto',
      id: data.userId || 'user-auto',
      fullName: data.creatorName || data.innovatorName || 'Innovator'
    };
    return this.submitInnovation(data, user);
  }

  getUserInnovations(userId) {
    return this.getInnovations(userId);
  }

  /** Innovator edits one of their own returned innovations and resubmits it. */
  /** Sends a new submission to Firestore; if its reference number is already taken, picks a new one (max 3 tries). */
  async _pushSubmission(innovation) {
    for (let attempt = 1; ; attempt++) {
      try {
        await firebaseService.saveSubmittedInnovation(innovation);
        return;
      } catch (err) {
        if (!(err && err.code === 'permission-denied') || attempt >= 3) throw err;
        innovation.referenceNumber = this.generateReferenceNumber();
        const list = this._allInnovations();
        const i = list.findIndex(x => x.innovationId === innovation.innovationId);
        if (i !== -1) {
          list[i].referenceNumber = innovation.referenceNumber;
          localStorage.setItem(STORAGE_KEYS.INNOVATIONS, JSON.stringify(list));
        }
      }
    }
  }

  resubmitOwnInnovation(id, patch) {
    const user = this.getUser();
    if (!user) return null;
    const list = this._allInnovations();
    const idx = list.findIndex(i => i.innovationId === id && i.userId === (user.uid || user.id));
    if (idx === -1) return null;
    const current = list[idx];
    const now = new Date().toISOString();

    // Only the fields the wizard edits; aliases kept in step with what submitInnovation writes.
    const changes = {};
    RESUBMIT_FIELDS.forEach(k => { if (patch[k] !== undefined) changes[k] = patch[k]; });
    if (changes.innovationName !== undefined) changes.title = changes.innovationName;
    if (changes.problemDescription !== undefined) changes.problem = changes.problemDescription;
    if (changes.solutionDescription !== undefined) changes.solution = changes.solutionDescription;
    if (Array.isArray(changes.supportNeeded)) changes.supportNeeded = changes.supportNeeded.filter(v => SUPPORT_OPTIONS.includes(v));
    if (changes.supportNote !== undefined) changes.supportNote = String(changes.supportNote || '').slice(0, 300);
    // The correction form does not reload existing files, so an empty list means "keep what was attached".
    ['imageUrls', 'documentUrls', 'videoUrls'].forEach(k => {
      if (!(Array.isArray(changes[k]) && changes[k].length)) delete changes[k];
    });
    changes.status = 'submitted';
    changes.updatedAt = now;

    const entry = { prevStatus: current.status, newStatus: 'submitted', note: 'Corrected and resubmitted by the innovator.', timestamp: now };
    list[idx] = { ...current, ...changes, statusHistory: [...(current.statusHistory || []), entry] };
    localStorage.setItem(STORAGE_KEYS.INNOVATIONS, JSON.stringify(list));

    // Live mode: Firestore is the source of truth (the listener would otherwise undo the local change).
    firebaseService.resubmitInnovationDoc(current, changes, entry).catch(err => this._reportSyncError(err, 'resubmit'));
    return list[idx];
  }

  updateInnovationStatus(id, nextStatus, note = '', adminUser = null) {
    const current = this.getUser();
    if (current && !this._isAdminUser(current)) return null; // only admins change an innovation's status
    const list = this._allInnovations();
    const item = list.find(i => i.innovationId === id || i.id === id || i.referenceNumber === id);
    if (!item) return null;

    const prevStatus = item.status;
    const now = new Date().toISOString();
    item.status = nextStatus;
    item.updatedAt = now;
    if (!item.statusHistory) item.statusHistory = [];
    item.statusHistory.push({
      prevStatus,
      newStatus: nextStatus,
      note,
      timestamp: now,
      by: adminUser ? adminUser.fullName || adminUser.email : 'Admin'
    });

    localStorage.setItem(STORAGE_KEYS.INNOVATIONS, JSON.stringify(list));

    // Record audit log
    const auditLogs = JSON.parse(localStorage.getItem('dicon_gith_audit_logs') || '[]');
    auditLogs.unshift({
      logId: `audit-${Date.now()}`,
      referenceNumber: item.referenceNumber,
      innovationId: item.innovationId,
      prevStatus,
      newStatus: nextStatus,
      note,
      timestamp: now
    });
    localStorage.setItem('dicon_gith_audit_logs', JSON.stringify(auditLogs));

    // Notify user
    this.addNotification({
      title: `Application Status Updated: ${nextStatus.toUpperCase()}`,
      message: `Your innovation '${item.innovationName || item.title}' (${item.referenceNumber}) has moved to '${nextStatus}'. ${note ? 'Note: ' + note : ''}`,
      type: "status_update",
      targetUserId: item.userId
    });

    return item;
  }

  setNotifications(list) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
  }

  // ---- NOTIFICATIONS ----
  getNotifications(userId = null) {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const list = raw ? JSON.parse(raw) : [];
    const activeUid = userId || (this.getUser() ? this.getUser().uid : null);
    if (activeUid) {
      return list.filter(n => n.userId === activeUid || n.userId === 'global');
    }
    return list;
  }

  getUnreadCount(userId = null) {
    return this.getNotifications(userId).filter(n => !n.isRead).length;
  }

  addNotification({ title, message, type = "announcement", targetUserId = null }) {
    const user = this.getUser();
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
    const notif = {
      notificationId: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: targetUserId || (user ? user.uid : "global"),
      title,
      message,
      type,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    list.unshift(notif);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
    return notif;
  }

  markNotificationRead(id) {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const list = raw ? JSON.parse(raw) : [];
    const found = list.find(n => n.notificationId === id);
    if (found) {
      found.isRead = true;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
      if (firebaseService.isLiveConnected && firebaseService.db && !String(id).startsWith('notif-')) {
        firebaseService.db.collection('notifications').doc(id).update({ isRead: true }).catch(() => {});
      }
    }
  }

  markAllNotificationsRead(userId = null) {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const list = raw ? JSON.parse(raw) : [];
    const activeUid = userId || (this.getUser() ? this.getUser().uid : null);
    list.forEach(n => {
      if (!activeUid || n.userId === activeUid || n.userId === 'global') {
        n.isRead = true;
      }
    });
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
  }
}

export const storage = new StorageService();
export const storageService = storage;
