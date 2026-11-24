import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from './test-helper.mjs';

setupTestEnvironment();
const { storageService: storage } = await import('../js/storage.js');
const { firebaseService } = await import('../js/firebase-config.js');

// Minimal fake of the Firestore/Auth surface used by storage.startCloudSync
function fakeFirebase(docs, uid) {
  const listeners = [];
  const col = (name, filter) => ({
    where: (f, op, v) => col(name, { f, v }),
    onSnapshot(cb) {
      const emit = () => cb({
        docs: (docs[name] || [])
          .filter(d => !filter || d.data[filter.f] === filter.v)
          .map(d => ({ id: d.id, data: () => d.data }))
      });
      listeners.push(emit); emit();
      return () => {};
    }
  });
  firebaseService.isLiveConnected = true;
  firebaseService.db = { collection: col };
  firebaseService.auth = { currentUser: { uid }, onAuthStateChanged: cb => { cb({ uid }); return () => {}; } };
  return listeners;
}

const cloud = {
  innovations: [
    { id: 'a1', data: { userId: 'u1', status: 'submitted', referenceNumber: 'GITH-2026-111111', innovationName: 'Solar Pump', submittedAt: '2026-11-01T10:00:00Z' } },
    { id: 'b1', data: { userId: 'u2', status: 'screening', referenceNumber: 'GITH-2026-222222', innovationName: 'Drone', submittedAt: '2026-11-02T10:00:00Z' } },
    { id: 'c1', data: { userId: 'u2', status: 'draft', innovationName: 'Hidden draft' } }
  ],
  users: [{ id: 'u1', data: { role: 'innovator', fullName: 'Ada', email: 'ada@x.ng' } }],
  notifications: [{ id: 'n1', data: { userId: 'u1', title: 'Status changed', isRead: false, createdAt: { toDate: () => new Date('2026-11-03T00:00:00Z') } } }]
};

test('admin sync: sees every innovator\'s submission (drafts excluded) and the user directory', async () => {
  setupTestEnvironment();
  fakeFirebase(cloud, 'admin1');
  localStorage.setItem('dicon_gith_user', JSON.stringify({ uid: 'admin1', role: 'admin' }));
  let changes = 0;
  const ok = await storage.startCloudSync({ uid: 'admin1', role: 'admin' }, () => changes++);
  assert.equal(ok, true);
  const list = storage.getInnovations();
  assert.deepEqual(list.map(i => i.innovationId).sort(), ['a1', 'b1']);
  assert.equal(storage.getCloudUsers().length, 1);
  assert.ok(changes >= 2);
  storage.stopCloudSync();
});

test('innovator sync: only own submissions, notifications with normalised timestamps', async () => {
  setupTestEnvironment();
  fakeFirebase(cloud, 'u1');
  localStorage.setItem('dicon_gith_user', JSON.stringify({ uid: 'u1', role: 'innovator' }));
  await storage.startCloudSync({ uid: 'u1', role: 'innovator' }, () => {});
  const mine = storage.getInnovations();
  assert.deepEqual(mine.map(i => i.innovationId), ['a1']);
  const notifs = storage.getNotifications('u1');
  assert.equal(notifs[0].createdAt, '2026-11-03T00:00:00.000Z');
  storage.stopCloudSync();
});

test('sync is skipped (returns false) without a live Firebase session', async () => {
  setupTestEnvironment();
  firebaseService.isLiveConnected = false;
  assert.equal(await storage.startCloudSync({ uid: 'u1', role: 'innovator' }), false);
});
