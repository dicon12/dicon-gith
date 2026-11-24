import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('role changes are restricted to super admins in the rules', () => {
  const r = read('firestore.rules');
  assert.match(r, /function isSuperAdmin\(\)/);
  assert.match(r, /isAdmin\(\) && untouched\(\['role'\]\)/);
  assert.match(r, /isSuperAdmin\(\)\s*&& request\.auth\.uid != uid/);
});

test('setRole no longer needs Cloud Functions', () => {
  const s = read('js/phase2-service.js');
  assert.doesNotMatch(s, /httpsCallable|firebase\.functions/);
  assert.match(s, /collection\('users'\)\.doc\(uid\)\.update\(\{ role/);
  assert.equal(existsSync(new URL('../functions/index.js', import.meta.url)), false);
});

test('tap ripple circle is gone', () => {
  assert.doesNotMatch(read('js/motion.js'), /lq-ripple/);
  assert.doesNotMatch(read('css/motion.css'), /lq-ripple/);
  assert.doesNotMatch(read('js/landing-fx.js'), /fx-ripple/);
});

test('upload function validates and keeps the service key server-side', () => {
  const f = read('api/_lib/upload-url.js');
  assert.match(f, /SUPABASE_SERVICE_KEY/);
  assert.match(f, /accounts:lookup/);
  assert.match(f, /innovation-doc/);
  for (const file of ['js/dashboard-app.js', 'js/file-upload.js', 'js/firebase-config.js'])
    assert.doesNotMatch(read(file), /service_role|SUPABASE_SERVICE_KEY/);
  assert.match(read('js/dashboard-app.js'), /uploadToCloud/);
});

test('public counter is written by admins', () => {
  assert.match(read('firestore.rules'), /match \/publicStats\/\{id\}[\s\S]*allow write: if isAdmin\(\)/);
  assert.match(read('js/admin-app.js'), /syncPublicCounter/);
});
