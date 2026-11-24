import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupTestEnvironment } from './test-helper.mjs';

setupTestEnvironment();
const { firebaseService, userDocFill, PROTECTED_USER_FIELDS } = await import('../js/firebase-config.js');
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('PROTECTED_USER_FIELDS matches what firestore.rules forbids an owner to change', () => {
  const rules = read('firestore.rules');
  const owner = rules.match(/isOwner\(uid\) && untouched\(\[([^\]]*)\]\)/)[1];
  const listed = owner.split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual([...listed].sort(), [...PROTECTED_USER_FIELDS].sort());
});

test('userDocFill only fills blank, unprotected fields', () => {
  const current = { uid: 'u1', email: 'a@x.ng', role: 'innovator', isActive: true, createdAt: 'T1', fullName: 'a', phoneNumber: '', skills: [] };
  const profile = { uid: 'u1', email: 'A@X.NG', role: 'admin', isActive: false, createdAt: 'T2', fullName: 'Amaka Eze',
    phoneNumber: '0801', state: 'Lagos', skills: ['CAD'], bio: '', updatedAt: 'T2' };
  const patch = userDocFill(current, profile);
  assert.deepEqual(Object.keys(patch).sort(), ['phoneNumber', 'skills', 'state', 'updatedAt']);
  assert.equal(patch.phoneNumber, '0801');
  assert.equal(patch.state, 'Lagos');
  assert.equal(userDocFill({ ...current, phoneNumber: '0801', state: 'Lagos', skills: ['CAD'] }, profile), null);
});

// A tiny fake Firestore with serialised transactions, to replay the sign-in race.
function fakeDb() {
  const docs = new Map();
  const writes = [];
  let chain = Promise.resolve();
  const db = {
    docs, writes,
    collection: (c) => ({ doc: (id) => ({ path: `${c}/${id}` }) }),
    runTransaction(fn) {
      const run = chain.then(() => fn({
        get: async (ref) => ({ exists: docs.has(ref.path), data: () => ({ ...docs.get(ref.path) }) }),
        set: (ref, d) => { writes.push(['create', d]); docs.set(ref.path, { ...d }); },
        update: (ref, d) => { writes.push(['update', d]); docs.set(ref.path, { ...docs.get(ref.path), ...d }); },
      }));
      chain = run.catch(() => {});
      return run;
    },
  };
  return db;
}

test('ensureUserDoc: listener and register racing never overwrite protected fields', async () => {
  const saved = { live: firebaseService.isLiveConnected, db: firebaseService.db };
  const db = fakeDb();
  firebaseService.isLiveConnected = true; firebaseService.db = db;
  try {
    const minimal = { uid: 'u1', id: 'u1', email: 'a@x.ng', fullName: 'a', role: 'innovator', isActive: true, createdAt: 'T1' };
    const full = { uid: 'u1', id: 'u1', email: 'a@x.ng', fullName: 'Amaka Eze', phoneNumber: '0801', state: 'Lagos',
      role: 'innovator', isActive: true, createdAt: 'T2', updatedAt: 'T2' };
    await Promise.all([firebaseService.ensureUserDoc('u1', minimal), firebaseService.ensureUserDoc('u1', full)]);
    assert.equal(db.writes[0][0], 'create');
    const upd = db.writes[1];
    assert.equal(upd[0], 'update');
    for (const k of PROTECTED_USER_FIELDS) assert.equal(k in upd[1], false, `update touched ${k}`);
    const doc = db.docs.get('users/u1');
    assert.equal(doc.createdAt, 'T1');
    assert.equal(doc.phoneNumber, '0801');
    assert.equal(doc.state, 'Lagos');
  } finally {
    firebaseService.isLiveConnected = saved.live; firebaseService.db = saved.db;
  }
});

test('profiles are only written through ensureUserDoc / saveProfile, never from the local session copy', () => {
  const auth = read('js/auth-service.js');
  assert.equal((auth.match(/ensureUserDoc\(/g) || []).length, 3, 'listener, register and Google sign-in');
  assert.doesNotMatch(auth, /collection\('users'\)\.doc\([^)]*\)\.set\(\{/);
  const setUser = read('js/storage.js').match(/setUser\(user\) \{([\s\S]*?)\n  \}/)[1];
  assert.doesNotMatch(setUser.replace(/\/\/.*$/gm, ''), /firebaseService/);
  assert.doesNotMatch(read('js/firebase-config.js'), /saveUserDoc/);
});
