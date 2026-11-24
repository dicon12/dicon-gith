import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupTestEnvironment, seedTestAdmin, TEST_ADMIN } from './test-helper.mjs';

setupTestEnvironment();
const { authService } = await import('../js/auth-service.js');
const { storageService } = await import('../js/storage.js');
const { firebaseService } = await import('../js/firebase-config.js');
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const INNOVATOR = { email: 'resub@innovate.ng', password: 'ResubmitPass2026!' };

async function returnedInnovation() {
  setupTestEnvironment();
  authService.init();
  storageService.init();
  await seedTestAdmin();
  await authService.register({ fullName: 'Amaka Eze', email: INNOVATOR.email, phone: '08011112222', state: 'Lagos',
    lga: 'Ikeja', category: 'Agriculture', password: INNOVATOR.password, agreeTerms: true });
  await authService.login(INNOVATOR.email, INNOVATOR.password);
  const inno = storageService.submitInnovation({
    innovationName: 'Solar Dryer', category: 'Agriculture', problemDescription: 'Crops spoil.',
    imageUrls: ['https://sb.example/storage/v1/object/public/gith-uploads/u/innovation-photo/a.jpg'],
    videoUrls: ['https://youtu.be/abc']
  });
  authService.logout();
  await authService.login(TEST_ADMIN.email, TEST_ADMIN.password);
  storageService.updateInnovationStatus(inno.innovationId, 'returned', 'Add a cost estimate.');
  authService.logout();
  await authService.login(INNOVATOR.email, INNOVATOR.password);
  return inno;
}

test('resubmitting a returned application keeps its files, reference and history', async () => {
  const inno = await returnedInnovation();
  const out = storageService.resubmitOwnInnovation(inno.innovationId, {
    innovationName: 'Solar Dryer v2', problemDescription: 'Crops spoil fast.', imageUrls: [], documentUrls: [], videoUrls: [],
    status: 'selected', userId: 'someone-else', lastReviewedBy: 'me'
  });
  assert.equal(out.status, 'submitted');
  assert.equal(out.innovationName, 'Solar Dryer v2');
  assert.equal(out.title, 'Solar Dryer v2');
  assert.equal(out.problem, 'Crops spoil fast.');
  assert.equal(out.referenceNumber, inno.referenceNumber);
  assert.equal(out.userId, inno.userId);
  assert.equal(out.lastReviewedBy, undefined);
  assert.deepEqual(out.imageUrls, inno.imageUrls, 'empty upload list keeps the attached photo');
  assert.deepEqual(out.videoUrls, inno.videoUrls);
  const last = out.statusHistory[out.statusHistory.length - 1];
  assert.equal(last.prevStatus, 'returned');
  assert.equal(last.newStatus, 'submitted');
  assert.equal(out.statusHistory.length, 3);
});

test('resubmission is sent to Firestore with a server-side history append', async () => {
  const inno = await returnedInnovation();
  const calls = [];
  const fakeDoc = (col, id) => ({
    set: async (d) => { calls.push(['set', col, id, d]); },
    update: async (d) => { calls.push(['update', col, id, d]); }
  });
  const saved = { live: firebaseService.isLiveConnected, db: firebaseService.db, fb: globalThis.firebase };
  globalThis.firebase = { firestore: { FieldValue: { arrayUnion: (...v) => ({ arrayUnion: v }) } } };
  firebaseService.isLiveConnected = true;
  firebaseService.db = { collection: (col) => ({ doc: (id) => fakeDoc(col, id) }) };
  try {
    storageService.resubmitOwnInnovation(inno.innovationId, { innovationName: 'Solar Dryer v2' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    firebaseService.isLiveConnected = saved.live; firebaseService.db = saved.db; globalThis.firebase = saved.fb;
  }
  const upd = calls.find((c) => c[0] === 'update');
  assert.ok(upd, 'innovation updated in Firestore');
  assert.equal(upd[1], 'innovations');
  assert.equal(upd[2], inno.innovationId);
  assert.equal(upd[3].status, 'submitted');
  assert.equal(upd[3].innovationName, 'Solar Dryer v2');
  assert.equal(upd[3].statusHistory.arrayUnion[0].prevStatus, 'returned');
  assert.equal('imageUrls' in upd[3], false);
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'referenceNumbers' && c[2] === inno.referenceNumber));
});

test('Firestore rules: an innovator may append only one own history entry on resubmit', () => {
  const rules = read('firestore.rules');
  const fn = rules.match(/function validResubmitHistory\(\) \{([\s\S]*?)\n    \}/)[1];
  assert.match(fn, /after\.size\(\) == n \+ 1/);
  assert.match(fn, /after\[0:n\] == before/);
  assert.match(fn, /after\[n\]\.prevStatus == resource\.data\.status/);
  const update = rules.match(/match \/innovations\/\{id\} \{[\s\S]*?allow update:([\s\S]*?);\n/)[1];
  assert.match(update, /hasAny\(\['statusHistory'\]\)\s*\|\| validResubmitHistory\(\)/);
});
