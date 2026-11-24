/**
 * DICON GITH App - Firebase Web SDK Bridge
 * Configurable for live Firebase Auth, Cloud Firestore, and Firebase Storage.
 *
 * TO CONNECT YOUR FIREBASE PROJECT:
 * 1. Go to https://console.firebase.google.com
 * 2. Open Project Settings -> General -> Your Apps -> Add Web App (</>)
 * 3. Copy the keys and replace the values below.
 */

export const firebaseConfig = {
  apiKey: "AIzaSyDt6XAfRlLZa0VkR6HqAc5tgkSsfQv9_mE",
  authDomain: "dicon-gith-e7c7e.firebaseapp.com",
  projectId: "dicon-gith-e7c7e",
  storageBucket: "dicon-gith-e7c7e.firebasestorage.app",
  messagingSenderId: "348454361279",
  appId: "1:348454361279:web:3582cd9a7fa2e686610e0a",
  measurementId: "G-S6JNM0YMXJ"
};

// App Check (blocks scripted abuse). Paste your reCAPTCHA v3 site key here after registering the
// app in Firebase console -> App Check. Leave empty to keep App Check off.
// (Off for now: the previous key belonged to the old Firebase project. See APP_CHECK_SETUP.md.)
export const APP_CHECK_SITE_KEY = "";

// Fields an owner may never change on their own profile (see firestore.rules, match /users/{uid}).
export const PROTECTED_USER_FIELDS = ['role', 'uid', 'isActive', 'createdAt', 'email'];
const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** The fields of `profile` that may fill blanks in an existing profile `current`, or null if none. */
export function userDocFill(current, profile) {
  const patch = {};
  for (const [k, v] of Object.entries(profile)) {
    if (PROTECTED_USER_FIELDS.includes(k) || k === 'updatedAt' || isBlank(v)) continue;
    if (isBlank(current[k])) patch[k] = v;
  }
  if (!Object.keys(patch).length) return null;
  patch.updatedAt = new Date().toISOString();
  return patch;
}

export class FirebaseService {
  constructor() {
    this.isLiveConnected = false;
    this.auth = null;
    this.db = null;
    this.storage = null;
  }

  async initLive() {
    try {
      // Check if real API key is configured (not dummy)
      const hasRealCredentials = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("DUMMY");

      if (window.firebase && window.firebase.initializeApp && hasRealCredentials) {
        if (!window.firebase.apps.length) {
          window.firebase.initializeApp(firebaseConfig);
          if (APP_CHECK_SITE_KEY && window.firebase.appCheck) {
            try { window.firebase.appCheck().activate(APP_CHECK_SITE_KEY, true); } catch (e) { console.warn('App Check not activated:', e.message); }
          }
        }
        this.auth = window.firebase.auth();
        this.db = window.firebase.firestore();
        this.storage = window.firebase.storage();
        this.isLiveConnected = true;
        console.log("Firebase Live Connected to project:", firebaseConfig.projectId);
      } else {
        console.log("Firebase initialized in Local Client Mode (ready for credentials).");
      }
    } catch (e) {
      console.warn("Firebase running in resilient offline/client mode:", e.message);
    }
  }

  // Live Auth methods
  async register(email, password) {
    if (this.isLiveConnected && this.auth) {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      await cred.user.sendEmailVerification();
      return cred.user;
    }
    return null;
  }

  async login(email, password) {
    if (this.isLiveConnected && this.auth) {
      const cred = await this.auth.signInWithEmailAndPassword(email, password);
      return cred.user;
    }
    return null;
  }

  async signInWithGoogle() {
    if (!(this.isLiveConnected && this.auth)) throw new Error('Google sign-in works on the live site only.');
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await this.auth.signInWithPopup(provider);
    return cred.user;
  }

  async logout() {
    if (this.isLiveConnected && this.auth) {
      await this.auth.signOut();
    }
  }

  // Live Firestore methods

  /**
   * Creates users/{uid} if it does not exist yet; otherwise only fills fields that are still blank.
   * Several code paths react to the same sign-in (the auth listener, register, Google sign-in), so this
   * runs in a transaction: whichever arrives second sees the profile and never overwrites the fields
   * firestore.rules forbid an owner to change (role, uid, isActive, createdAt, email).
   */
  async ensureUserDoc(uid, profile) {
    if (!(this.isLiveConnected && this.db)) return;
    const ref = this.db.collection('users').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) { tx.set(ref, profile); return; }
      const patch = userDocFill(snap.data(), profile);
      if (patch) tx.update(ref, patch);
    });
  }

  async saveInnovationDoc(innovationId, data) {
    if (this.isLiveConnected && this.db) {
      await this.db.collection('innovations').doc(innovationId).set(data, { merge: true });
    }
  }

  /**
   * Submits an innovation and reserves its reference number in one batch. firestore.rules only accept a
   * submitted innovation whose /referenceNumbers/{ref} doc belongs to the same user and innovation, and that
   * doc is create-only, so a number already taken makes the batch fail with permission-denied.
   */
  async saveSubmittedInnovation(innovation) {
    if (!(this.isLiveConnected && this.db)) return;
    const batch = this.db.batch();
    batch.set(this.db.collection('referenceNumbers').doc(innovation.referenceNumber), {
      userId: innovation.userId, innovationId: innovation.innovationId, createdAt: innovation.createdAt
    });
    batch.set(this.db.collection('innovations').doc(innovation.innovationId), innovation, { merge: true });
    await batch.commit();
  }

  /**
   * Innovator resubmits a returned application. The history entry is appended on the server
   * (arrayUnion), so a stale local copy of statusHistory can never overwrite the admin's entries.
   */
  async resubmitInnovationDoc(innovation, changes, historyEntry) {
    if (!(this.isLiveConnected && this.db)) return;
    // Applications submitted before reference numbers were reserved have no /referenceNumbers doc yet;
    // reserve it now (a create, so it fails harmlessly when it already exists).
    try {
      await this.db.collection('referenceNumbers').doc(innovation.referenceNumber).set({
        userId: innovation.userId, innovationId: innovation.innovationId,
        createdAt: innovation.createdAt || new Date().toISOString()
      });
    } catch (e) { /* already reserved */ }
    const FV = window.firebase.firestore.FieldValue;
    await this.db.collection('innovations').doc(innovation.innovationId)
      .update({ ...changes, statusHistory: FV.arrayUnion(historyEntry) });
  }

  async uploadFile(path, file) {
    if (this.isLiveConnected && this.storage) {
      const ref = this.storage.ref(path);
      const snapshot = await ref.put(file);
      return await snapshot.ref.getDownloadURL();
    }
    return null;
  }

  async getSetting(key) {
    if (this.isLiveConnected && this.db) {
      const doc = await this.db.collection('settings').doc(key).get();
      return doc.exists ? doc.data() : null;
    }
    return null;
  }

  async saveSetting(key, data) {
    if (this.isLiveConnected && this.db) {
      await this.db.collection('settings').doc(key).set({
        ...data,
        updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date().toISOString()
      }, { merge: true });
    }
  }
}

export const firebaseService = new FirebaseService();
