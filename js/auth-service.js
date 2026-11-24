/**
 * DICON GITH - Central Authentication & RBAC Service
 * Supports Firebase Live Auth, Firestore user profiles, and resilient secure local storage.
 */

import { firebaseService, firebaseConfig } from './firebase-config.js';
import { storage } from './storage.js';

// Password hashing utility (SHA-256 with salt)
export async function hashPassword(password, salt = 'dicon_gith_salt_2026') {
  const combined = String(password || '') + salt;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback
    }
  }
  // Fallback for non-subtle crypto environments (e.g. older testing tools)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

// Local (browser-only) mode exists for development on localhost and for the automated tests.
// On a real domain it is never used: if Firebase cannot be reached, sign-in and registration
// fail with a clear message instead of quietly creating browser-only accounts.
const _host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
export const LOCAL_MODE_ENABLED = !_host || ['localhost', '127.0.0.1', '[::1]'].includes(_host);
const UNAVAILABLE = "The sign-in service could not be reached. Check your internet connection and try again.";
const isLive = () => !!(firebaseService.isLiveConnected && firebaseService.auth);


class AuthService {
  constructor() {
    this.currentUser = null;
    this.initialized = false;
    this.init();
  }

  async init() {
    if (this.initialized) return;
    await firebaseService.initLive();

    // Check existing stored user session (do NOT auto-login if empty)
    const stored = storage.getUser();
    if (stored && stored.uid && stored.email) {
      this.currentUser = stored;
    } else {
      this.currentUser = null;
    }

    // Listen for live Firebase auth changes if connected
    if (firebaseService.isLiveConnected && firebaseService.auth) {
      firebaseService.auth.onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
          // Fetch user document from Firestore to get role and profile data
          try {
            const ref = firebaseService.db.collection('users').doc(firebaseUser.uid);
            let userDoc = await ref.get();
            if (!userDoc.exists) {
              // Safety net for an account without a profile. register() and loginWithGoogle() may be
              // writing the full profile at the same moment; ensureUserDoc lets whichever comes first win.
              const email = String(firebaseUser.email || '').toLowerCase();
              await firebaseService.ensureUserDoc(firebaseUser.uid, {
                uid: firebaseUser.uid,
                id: firebaseUser.uid,
                email,
                fullName: firebaseUser.displayName || email.split('@')[0],
                role: 'innovator',
                isActive: true,
                createdAt: new Date().toISOString()
              });
              userDoc = await ref.get();
            }
            this.currentUser = { uid: firebaseUser.uid, ...userDoc.data() };
            storage.setUser(this.currentUser);
          } catch (e) {
            console.warn("Error fetching Firestore user profile:", e);
          }
        }
      });
    }

    this.initialized = true;
  }

  getCurrentUser() {
    if (this.currentUser) return this.currentUser;
    const stored = storage.getUser();
    if (stored && stored.uid && stored.email) {
      this.currentUser = stored;
      return this.currentUser;
    }
    return null;
  }

  /**
   * Server-verified identity. The role kept in localStorage can be edited by anyone, so
   * privileged screens call this instead of trusting it:
   *  - live Firebase: the signed-in user's role is re-read from Firestore (users/{uid});
   *    deactivated accounts and users without a real Firebase session are refused.
   *  - local mode: only honoured on localhost / in tests (LOCAL_MODE_ENABLED).
   * Returns the verified user, or null.
   */
  async verifyRole() {
    await this.init();
    if (firebaseService.isLiveConnected && firebaseService.auth) {
      const fbUser = await new Promise((resolve) => {
        const off = firebaseService.auth.onAuthStateChanged((u) => { off(); resolve(u); });
      });
      if (fbUser) {
        try {
          const snap = await firebaseService.db.collection('users').doc(fbUser.uid).get();
          if (!snap.exists || snap.data().isActive === false) return null;
          this.currentUser = { uid: fbUser.uid, ...snap.data() };
          storage.setUser(this.currentUser);
          return this.currentUser;
        } catch (e) {
          console.warn('Role verification failed:', e && e.message);
          return null;
        }
      }
      // No Firebase session: nobody is signed in.
      return null;
    }
    return LOCAL_MODE_ENABLED ? this.getCurrentUser() : null;
  }

  isAuthenticated() {
    const user = this.getCurrentUser();
    return !!(user && user.uid && user.email);
  }

  isAdmin() {
    const user = this.getCurrentUser();
    return !!(user && (user.role === 'admin' || user.role === 'super_admin'));
  }

  isInnovator() {
    const user = this.getCurrentUser();
    return !!(user && user.role === 'innovator');
  }

  /**
   * Log in with Email and Password
   */
  async login(email, password, remember = true) {
    await this.init();

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Email address is required.");
    }
    if (!password) {
      throw new Error("Password is required.");
    }

    // 2. Try Live Firebase Auth if live connected
    if (firebaseService.isLiveConnected && firebaseService.auth) {
      try {
        const liveUser = await firebaseService.login(normalizedEmail, password);
        if (liveUser) {
          let profile = null;
          try {
            const doc = await firebaseService.db.collection('users').doc(liveUser.uid).get();
            if (doc.exists) {
              profile = doc.data();
            }
          } catch (err) {
            console.warn("Could not fetch user document:", err);
          }

          this.currentUser = {
            uid: liveUser.uid,
            email: liveUser.email,
            fullName: (profile && profile.fullName) || liveUser.displayName || normalizedEmail.split('@')[0],
            role: (profile && profile.role) || 'innovator',
            isActive: profile ? profile.isActive !== false : true,
            ...(profile || {})
          };

          if (this.currentUser.isActive === false) {
            throw new Error("This account has been deactivated. Please contact DICON administration.");
          }

          storage.setUser(this.currentUser);
          return { success: true, user: this.currentUser, role: this.currentUser.role };
        }
      } catch (fbErr) {
        if (['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(fbErr.code)) {
          throw new Error("Invalid email or password. Please try again.");
        }
        if (fbErr.code === 'auth/invalid-email') {
          throw new Error("The email address is improperly formatted.");
        }
        if (fbErr.code === 'auth/too-many-requests') {
          throw new Error("Too many attempts. Please wait a few minutes or reset your password.");
        }
        if (fbErr.code === 'auth/user-disabled') {
          throw new Error("This account has been deactivated. Please contact DICON administration.");
        }
        if (fbErr.message && fbErr.message.includes("deactivated")) {
          throw fbErr;
        }
        throw new Error(UNAVAILABLE);
      }
    }

    if (!LOCAL_MODE_ENABLED) throw new Error(UNAVAILABLE);

    // 3. Local-mode accounts (localhost and tests only)
    const usersRegistry = JSON.parse(localStorage.getItem('dicon_gith_users_registry') || '[]');
    const match = usersRegistry.find(u => u.email.toLowerCase() === normalizedEmail);

    if (match) {
      if (match.isActive === false) {
        throw new Error("This account has been deactivated. Please contact DICON administration.");
      }

      const passHash = await hashPassword(password);
      const isMatch = (match.passwordHash && match.passwordHash === passHash) ||
                      (match.password && match.password === password);

      if (isMatch) {
        // Safe copy without password or hash
        const { password: _p, passwordHash: _ph, ...userSafe } = match;
        this.currentUser = userSafe;
        storage.setUser(this.currentUser);
        return { success: true, user: this.currentUser, role: this.currentUser.role };
      } else {
        throw new Error("Invalid email or password. Please try again.");
      }
    }

    throw new Error("No account found matching this email. Please register first.");
  }

  /**
   * Register a new Innovator account
   * Note: Public registration ALWAYS assigns role: 'innovator'
   */
  async register({ fullName, email, phoneNumber, phone, password, state, lga, postcode }) {
    await this.init();

    const normalizedEmail = (email || '').trim().toLowerCase();

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new Error("A valid email address is required.");
    }

    // Prevent privilege escalation / registration with reserved administrative addresses
    if (normalizedEmail.endsWith('@dicon.gov.ng')) {
      throw new Error("Registration with this domain or email is reserved for official DICON administration. Public accounts cannot register with administrative emails.");
    }

    // Password strength check (min 8 characters)
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    // Phone number validation
    const rawPhone = phoneNumber || phone || '';
    const cleanPhone = rawPhone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new Error("Please enter a valid phone number (at least 10 digits).");
    }

    // Check duplicate (local mode only; Firebase checks duplicates itself)
    const usersRegistry = JSON.parse(localStorage.getItem('dicon_gith_users_registry') || '[]');
    if (!isLive() && !LOCAL_MODE_ENABLED) throw new Error(UNAVAILABLE);
    if (!isLive() && usersRegistry.some(u => u.email.toLowerCase() === normalizedEmail)) {
      throw new Error("An account with this email address already exists.");
    }

    let uid = `user-${Date.now()}`;

    // Try Live Firebase Auth
    if (firebaseService.isLiveConnected && firebaseService.auth) {
      try {
        const liveUser = await firebaseService.register(normalizedEmail, password);
        if (liveUser) {
          uid = liveUser.uid;
        }
      } catch (fbErr) {
        if (fbErr.code === 'auth/email-already-in-use') {
          throw new Error("An account with this email address is already registered in Firebase.");
        }
        if (fbErr.code === 'auth/weak-password') throw new Error("Password is too weak. Use at least 8 characters.");
        if (fbErr.code === 'auth/invalid-email') throw new Error("The email address is improperly formatted.");
        console.warn("Firebase registration failed:", fbErr.message);
        throw new Error("We could not create your account right now. Please check your connection and try again.");
      }
    }

    const newUser = {
      uid,
      id: uid,
      email: normalizedEmail,
      fullName: (fullName || '').trim(),
      phoneNumber: (phoneNumber || phone || '').trim(),
      state: state || '',
      lga: lga || '',
      postcode: postcode || '',
      community: '',
      role: 'innovator', // Strictly enforced
      isActive: true,
      bio: '',
      occupation: '',
      institution: '',
      skills: [],
      photoUrl: 'assets/innovator_main.jpg',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Local mode only: keep a hashed copy in the browser. Live accounts live in Firebase Auth,
    // so no password hash is ever stored on the device.
    if (!isLive()) {
      const passwordHash = await hashPassword(password);
      usersRegistry.push({ ...newUser, passwordHash });
      localStorage.setItem('dicon_gith_users_registry', JSON.stringify(usersRegistry));
    }

    // Set active session
    this.currentUser = newUser;
    storage.setUser(newUser);

    // Save the profile in Firestore. The auth listener may already have created a minimal one;
    // ensureUserDoc then fills in the details (phone, state, ...) instead of failing.
    if (firebaseService.isLiveConnected && firebaseService.db) {
      try {
        await firebaseService.ensureUserDoc(uid, newUser);
      } catch (err) {
        console.warn("Firestore profile save failed:", err);
      }
    }

    // Add welcome notification for this specific user
    storage.addNotification({
      title: "Welcome to DICON GITH",
      message: `Your account has been created successfully. Complete your profile and submit your first grassroots innovation!`,
      type: "announcement",
      targetUserId: uid
    });

    return { success: true, user: newUser };
  }

  /**
   * Password recovery: Firebase emails a real reset link. Nothing is generated or stored locally.
   */
  async sendPasswordReset(email) {
    await this.init();
    const normalizedEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new Error("Please enter a valid email address.");
    }
    if (!isLive()) throw new Error("Password reset emails can only be sent on the live site.");
    try {
      await firebaseService.auth.sendPasswordResetEmail(normalizedEmail);
    } catch (fbErr) {
      // Unknown address: answer the same way so the form cannot be used to discover accounts.
      if (fbErr.code !== 'auth/user-not-found') {
        if (fbErr.code === 'auth/invalid-email') throw new Error("The email address is improperly formatted.");
        if (fbErr.code === 'auth/too-many-requests') throw new Error("Too many requests. Please wait a few minutes and try again.");
        throw new Error("We could not send the reset email right now. Please try again shortly.");
      }
    }
    return {
      success: true,
      message: `If an account exists for ${normalizedEmail}, a password reset link has been emailed. Check your inbox and spam folder.`
    };
  }

  /** Check the code from a Firebase reset-email link; returns the account email. */
  async checkResetCode(oobCode) {
    await this.init();
    if (!isLive()) throw new Error(UNAVAILABLE);
    try {
      return await firebaseService.auth.verifyPasswordResetCode(oobCode);
    } catch (e) {
      throw new Error("This reset link is invalid or has expired. Please request a new one.");
    }
  }

  /** Set the new password using the code from the reset email. */
  async confirmReset(oobCode, newPassword) {
    await this.init();
    if (!isLive()) throw new Error(UNAVAILABLE);
    if (!newPassword || newPassword.length < 8) throw new Error("New password must be at least 8 characters long.");
    try {
      await firebaseService.auth.confirmPasswordReset(oobCode, newPassword);
    } catch (e) {
      if (e.code === 'auth/weak-password') throw new Error("Password is too weak. Use at least 8 characters.");
      throw new Error("This reset link is invalid or has expired. Please request a new one.");
    }
    return { success: true, message: "Password has been reset. You can now sign in with your new password." };
  }

  /**
   * Get safe list of registered innovators (for admin view)
   */
  getUsers() {
    const list = JSON.parse(localStorage.getItem('dicon_gith_users_registry') || '[]');
    return list.map(u => {
      const { password, passwordHash, ...safe } = u;
      return safe;
    });
  }

  /**
   * Save profile edits for real: Firestore first (so they survive sign-out and other devices),
   * then the local copy. Only editable profile fields are sent; role/uid/isActive are never touched.
   */
  async saveProfile(profileData) {
    const FIELDS = ['fullName', 'phoneNumber', 'occupation', 'state', 'lga', 'community', 'institution', 'bio', 'photoUrl', 'skills', 'postcode'];
    const clean = {};
    for (const k of FIELDS) if (profileData[k] !== undefined) clean[k] = profileData[k];
    clean.updatedAt = new Date().toISOString();
    if (isLive() && firebaseService.auth.currentUser) {
      try {
        await firebaseService.db.collection('users').doc(firebaseService.auth.currentUser.uid).set(clean, { merge: true });
      } catch (e) {
        throw new Error('Your changes could not be saved (' + ((e && e.code) || 'network error') + '). Please try again.');
      }
    } else if (!LOCAL_MODE_ENABLED) {
      throw new Error(UNAVAILABLE);
    }
    return this.updateProfile(clean);
  }

  /**
   * Update Profile Details (local copy only; use saveProfile to persist)
   */
  updateProfile(profileData) {
    const updated = storage.updateProfile(profileData);
    if (updated) {
      this.currentUser = updated;
    }
    return updated;
  }

  /**
   * Set user status (e.g. active, suspended)
   */
  setUserStatus(uid, status) {
    const list = JSON.parse(localStorage.getItem('dicon_gith_users_registry') || '[]');
    const match = list.find(u => (u.uid === uid || u.id === uid));
    if (match) {
      match.isActive = status === 'active';
      match.status = status;
      match.updatedAt = new Date().toISOString();
      localStorage.setItem('dicon_gith_users_registry', JSON.stringify(list));
      return match;
    }
    return null;
  }

  /**
   * Logout current session
   */
  async logout() {
    if (firebaseService.isLiveConnected && firebaseService.auth) {
      await firebaseService.logout().catch(e => console.warn("Firebase logout error:", e));
    }
    this.currentUser = null;
    storage.setUser(null);
  }

  /** Sign in / sign up with Google (live site). New Google users always become innovators. */
  async loginWithGoogle() {
    await this.init();
    const fbUser = await firebaseService.signInWithGoogle();
    const ref = firebaseService.db.collection('users').doc(fbUser.uid);
    let snap = await ref.get();
    if (!snap.exists) {
      const now = new Date().toISOString();
      // ensureUserDoc, not set(): the auth listener may be creating the profile at the same moment.
      await firebaseService.ensureUserDoc(fbUser.uid, { uid: fbUser.uid, id: fbUser.uid, email: String(fbUser.email || '').toLowerCase(), fullName: fbUser.displayName || '', phoneNumber: '', state: '', lga: '',
        postcode: '', community: '', role: 'innovator', isActive: true, bio: '', occupation: '', institution: '', skills: [], photoUrl: fbUser.photoURL || 'assets/innovator_main.jpg', createdAt: now, updatedAt: now });
      snap = await ref.get();
    }
    const profile = snap.data();
    if (profile.isActive === false) { await firebaseService.logout(); throw new Error('This account has been deactivated.'); }
    this.currentUser = { uid: fbUser.uid, ...profile };
    storage.setUser(this.currentUser);
    return { success: true, user: this.currentUser, role: this.currentUser.role };
  }

  /**
   * Guard for Protected Dashboard Views
   */
  requireAuth(allowedRoles = ['innovator', 'admin', 'super_admin'], redirectUrl = '/login') {
    const user = this.getCurrentUser();
    if (!user || !user.uid) {
      window.location.href = `${redirectUrl}?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }

    if (!allowedRoles.includes(user.role)) {
      if (user.role === 'innovator') {
        window.location.href = '/dashboard';
      } else if (user.role === 'evaluator') {
        window.location.href = '/evaluator';
      } else if (user.role === 'mentor') {
        window.location.href = '/mentor';
      } else {
        window.location.href = '/admin';
      }
      return false;
    }

    return true;
  }
}

export const authService = new AuthService();
