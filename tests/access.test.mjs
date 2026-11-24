import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupTestEnvironment } from './test-helper.mjs';

setupTestEnvironment();
const { storageService: storage } = await import('../js/storage.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const signIn = (u) => (u ? localStorage.setItem('dicon_gith_user', JSON.stringify(u)) : localStorage.removeItem('dicon_gith_user'));

function seed() {
  setupTestEnvironment();
  storage.init();
  localStorage.setItem('dicon_gith_innovations', JSON.stringify([
    { innovationId: 'a1', referenceNumber: 'GITH-2026-000001', userId: 'ada', innovationName: 'Ada idea', status: 'submitted' },
    { innovationId: 'b1', referenceNumber: 'GITH-2026-000002', userId: 'bola', innovationName: 'Bola idea', status: 'returned' }
  ]));
}

test('Access: an innovator sees only the innovations they submitted', () => {
  seed(); signIn({ uid: 'ada', role: 'innovator' });
  assert.deepEqual(storage.getInnovations().map(i => i.innovationId), ['a1']);
});

test('Access: an innovator cannot read another innovator\'s innovation by id or reference, or by asking for their uid', () => {
  seed(); signIn({ uid: 'ada', role: 'innovator' });
  assert.equal(storage.getInnovationById('b1'), null);
  assert.equal(storage.getInnovationById('GITH-2026-000002'), null);
  assert.deepEqual(storage.getInnovations('bola'), []);
  assert.equal(storage.getInnovationById('a1').innovationName, 'Ada idea');
});

test('Access: admins and super admins see every innovation', () => {
  seed();
  for (const role of ['admin', 'super_admin']) {
    signIn({ uid: 'adm', role });
    assert.deepEqual(storage.getInnovations().map(i => i.innovationId).sort(), ['a1', 'b1']);
    assert.ok(storage.getInnovationById('b1'));
  }
});

test('Access: with nobody signed in, no innovations are returned', () => {
  seed(); signIn(null);
  assert.deepEqual(storage.getInnovations(), []);
  assert.equal(storage.getInnovationById('a1'), null);
});

test('Access: an innovator cannot change any innovation\'s status; an admin can', () => {
  seed(); signIn({ uid: 'ada', role: 'innovator' });
  assert.equal(storage.updateInnovationStatus('a1', 'selected'), null);
  assert.equal(JSON.parse(localStorage.getItem('dicon_gith_innovations'))[0].status, 'submitted');
  signIn({ uid: 'adm', role: 'admin' });
  assert.ok(storage.updateInnovationStatus('a1', 'screening'));
});

test('Access: resubmitting only works on your own innovation and keeps everyone else\'s data', () => {
  seed(); signIn({ uid: 'ada', role: 'innovator' });
  assert.equal(storage.resubmitOwnInnovation('b1', { innovationName: 'Hijacked' }), null);
  signIn({ uid: 'bola', role: 'innovator' });
  const updated = storage.resubmitOwnInnovation('b1', { innovationName: 'Bola v2' });
  assert.equal(updated.status, 'submitted');
  const all = JSON.parse(localStorage.getItem('dicon_gith_innovations'));
  assert.equal(all.length, 2, 'other innovators\' records must survive');
  assert.equal(all.find(i => i.innovationId === 'a1').innovationName, 'Ada idea');
});

test('Access: submitting adds to the list without dropping other innovators\' records', () => {
  seed(); signIn({ uid: 'cy', role: 'innovator', fullName: 'Cy' });
  storage.submitInnovation({ innovationName: 'Cy idea', category: 'Agriculture' }, { uid: 'cy', fullName: 'Cy' });
  assert.equal(JSON.parse(localStorage.getItem('dicon_gith_innovations')).length, 3);
  assert.equal(storage.getInnovations().length, 1);
});

test('Firestore rules: innovations can be read only by their owner, admins and assigned evaluators', () => {
  const rules = read('firestore.rules');
  const block = rules.match(/match \/innovations\/\{id\} \{([\s\S]*?)\n    \}/)[1];
  const readRule = block.match(/allow read:([\s\S]*?);/)[1];
  assert.match(readRule, /resource\.data\.userId == request\.auth\.uid/);
  assert.match(readRule, /isAdmin\(\)/);
  assert.match(readRule, /isAssignedEvaluator\(id\)/);
  assert.doesNotMatch(readRule, /if true/);
  assert.doesNotMatch(block, /allow (list|get)\b/);
});

test('Storage rules: innovation files can be read only by their owner, admins and assigned evaluators', () => {
  const rules = read('storage.rules');
  const block = rules.match(/match \/innovations\/\{uid\}\/\{innovationId\}\/\{file\} \{([\s\S]*?)\n    \}/)[1];
  const readRule = block.match(/allow read:([\s\S]*?);/)[1];
  assert.match(readRule, /request\.auth\.uid == uid/);
  assert.match(readRule, /isAdmin\(\)/);
  assert.match(readRule, /assignments\/\$\(innovationId \+ '_' \+ request\.auth\.uid\)/);
  assert.doesNotMatch(readRule, /if true/);
});

test('Firestore rules: the sponsor-matching collections stay admin-only', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/sponsorReady\/\{id\} \{\s*allow read, write: if isAdmin\(\);/);
  assert.match(rules, /match \/introductions\/\{id\} \{\s*allow read, write: if isAdmin\(\);/);
});

test('shipped source contains no demo accounts, demo data or fake reset tokens', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const files = ['js/auth-service.js', 'js/data.js', 'js/storage.js', 'js/admin-app.js', 'forgot-password.html', 'admin.html', 'seed/seed.js'];
  for (const f of files) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const bad of [/DiconAdmin2026/, /Innovator2026/, /aminu/i, /INITIAL_DEMO/, /resetToDemo/, /rst-/, /isDemo/, /reset_tokens/]) {
      assert.doesNotMatch(src, bad, `${f} still matches ${bad}`);
    }
  }
  assert.equal(existsSync(new URL('../app.html', import.meta.url)), false);
});
