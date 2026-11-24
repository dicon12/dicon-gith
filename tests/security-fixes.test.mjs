import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { safeUrl } from '../js/file-viewer.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- attachment links (stored XSS)
test('file viewer drops script and HTML links, keeps web links and inline media', () => {
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)//x.pdf', 'data:text/html,<script>x</script>',
    'vbscript:x', '//evil.example/x', '', null]) {
    assert.equal(safeUrl(bad), '', String(bad));
  }
  for (const ok of ['https://youtu.be/abc', 'http://example.com/a.pdf',
    'https://x.supabase.co/storage/v1/object/public/gith-uploads/u1/innovation-doc/a.pdf',
    'data:image/png;base64,AAAA', 'data:application/pdf;base64,AAAA']) {
    assert.equal(safeUrl(ok), ok);
  }
});

test('dashboard only accepts http(s) video links', () => {
  assert.match(read('js/dashboard-wizard.js'), /\/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(document\.getElementById\('wiz-video'\)/);
});

// ---------------------------------------------------------------- innovation rules
test('Firestore rules: innovators cannot write admin fields or borrow a reference number', () => {
  const rules = read('firestore.rules');
  const block = rules.match(/match \/innovations\/\{id\} \{([\s\S]*?)\n    \}/)[1];
  const create = block.match(/allow create:([\s\S]*?);\n/)[1];
  const update = block.match(/allow update:([\s\S]*?);\n/)[1];
  assert.match(create, /keys\(\)\.hasOnly\(innovatorFields\(\)/);
  assert.match(create, /ownsReference\(id, request\.resource\.data\.referenceNumber\)/);
  assert.match(update, /affectedKeys\(\)\.hasOnly\(innovatorFields\(\)\.concat\(\['statusHistory'\]\)\)/);
  assert.match(update, /validResubmitHistory\(\)/);
  assert.match(update, /ownsReference\(id, request\.resource\.data\.referenceNumber\)/);
  const fields = rules.match(/function innovatorFields\(\) \{([\s\S]*?)\}/)[1];
  for (const adminOnly of ['lastReviewedBy', 'returnReason', 'statusHistory']) assert.doesNotMatch(fields, new RegExp(`'${adminOnly}'`));
  assert.match(rules, /getAfter\(\/databases\/\$\(database\)\/documents\/referenceNumbers\/\$\(ref\)\)\.data\.innovationId == id/);
});

test('every field submitInnovation writes is allowed by the rules', () => {
  const src = read('js/storage.js');
  const body = src.slice(src.indexOf('submitInnovation('), src.indexOf('const list = this._allInnovations();', src.indexOf('submitInnovation(')));
  const keys = [...body.matchAll(/^\s{6}(\w+)[:,]/gm)].map((m) => m[1]);
  const fields = read('firestore.rules').match(/function innovatorFields\(\) \{([\s\S]*?)\}/)[1];
  assert.ok(keys.length > 20);
  keys.filter((k) => k !== 'statusHistory').forEach((k) => assert.match(fields, new RegExp(`'${k}'`), k));
});

test('a submission reserves its reference number in the same batch', () => {
  const fb = read('js/firebase-config.js');
  assert.match(fb, /batch\.set\(this\.db\.collection\('referenceNumbers'\)\.doc\(innovation\.referenceNumber\)/);
  assert.match(read('js/storage.js'), /this\._pushSubmission\(innovation\)/);
});

// ---------------------------------------------------------------- file-url function scoping
async function callFileUrl({ role, readable, innovationId, urls }) {
  process.env.SUPABASE_URL = 'https://sb.example';
  process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.SUPABASE_BUCKET = 'gith-uploads';
  const innoFile = 'https://sb.example/storage/v1/object/public/gith-uploads/owner1/innovation-doc/aaa-plan.pdf';
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    url = String(url);
    const json = (b, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => b, text: async () => '' });
    if (url.includes('accounts:lookup')) return json({ users: [{ localId: 'eval1' }] });
    if (url.includes('/documents/users/')) return json({ fields: { role: { stringValue: role } } });
    if (url.includes('/documents/innovations/')) {
      return readable ? json({ fields: { documentUrls: { arrayValue: { values: [{ mapValue: { fields: { url: { stringValue: innoFile } } } }] } } } }) : json({}, false);
    }
    if (url.includes('/object/sign/')) return json({ signedURL: '/object/sign/gith-uploads/x?token=t' });
    throw new Error('unexpected fetch ' + url);
  };
  try {
    delete require.cache[require.resolve('../api/_lib/file-url.js')];
    const { handler } = require('../api/_lib/file-url.js');
    const res = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ urls: urls || [innoFile, innoFile.replace('aaa-plan', 'bbb-other')], innovationId }) });
    return { innoFile, out: JSON.parse(res.body).urls };
  } finally { global.fetch = realFetch; }
}

test('file-url: an evaluator gets links only for files on an innovation they can read', async () => {
  const a = await callFileUrl({ role: 'evaluator', readable: true, innovationId: 'inno-1' });
  assert.deepEqual(Object.keys(a.out), [a.innoFile]);
  const b = await callFileUrl({ role: 'evaluator', readable: false, innovationId: 'inno-1' });
  assert.deepEqual(b.out, {});
  const c = await callFileUrl({ role: 'mentor', readable: true });
  assert.deepEqual(c.out, {});
});

test('file-url: admins still get every private file', async () => {
  const r = await callFileUrl({ role: 'admin', readable: false });
  assert.equal(Object.keys(r.out).length, 2);
});

// ---------------------------------------------------------------- low-severity fixes
test('Firestore rules: users cannot change their own email; registration email must match sign-in', () => {
  const rules = read('firestore.rules');
  const users = rules.slice(rules.indexOf('match /users/{uid}'), rules.indexOf('match /innovations/{id}'));
  assert.match(users, /isOwner\(uid\) && untouched\(\['role', 'uid', 'isActive', 'createdAt', 'email'\]\)/);
  assert.match(users, /request\.resource\.data\.email\.lower\(\) == request\.auth\.token\.email\.lower\(\)/);
});

test('Firestore rules: an ordinary admin cannot edit another admin', () => {
  const rules = read('firestore.rules');
  const users = rules.slice(rules.indexOf('match /users/{uid}'), rules.indexOf('match /innovations/{id}'));
  assert.match(users, /isAdmin\(\) && untouched\(\['role'\]\)\s*&& \(request\.auth\.uid == uid \|\| isSuperAdmin\(\)\s*\|\| resource\.data\.role in \['innovator', 'scout', 'evaluator', 'mentor'\]\)/);
});

test('Firestore rules: evaluator score sheets are shape- and range-checked', async () => {
  const rules = read('firestore.rules');
  const { CRITERIA } = await import('../js/phase2-service.js');
  const list = rules.match(/function criteria\(\) \{([\s\S]*?)\}/)[1];
  CRITERIA.forEach((c) => {
    assert.match(list, new RegExp(`'${c.key}'`));
    assert.ok(rules.includes(`okScore(d.scores, '${c.key}')`), c.key);
    assert.ok(rules.includes(`okComment(d.comments, '${c.key}')`), c.key);
  });
  assert.match(rules, /s\[k\] >= 1 && s\[k\] <= 5/);
  assert.match(rules, /d\.submitted == false \|\| d\.scores\.keys\(\)\.hasAll\(criteria\(\)\)/);
  const block = rules.match(/match \/assessments\/\{id\} \{([\s\S]*?)\n    \}/)[1];
  assert.equal((block.match(/validAssessment\(request\.resource\.data\)/g) || []).length, 2);
});

test('admin history shows the admin name escaped', () => {
  assert.match(read('js/admin-app.js'), /activity-time">\$\{this\.escapeHtml\(log\.adminName\)\}/);
});

test('dev server answers 400 to a malformed URL instead of crashing', async () => {
  const { default: server } = await import('../server.js');
  const http = await import('node:http');
  await new Promise((r) => server.listen(3098, '127.0.0.1', r));
  const get = (path) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 3098, path }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
  });
  try {
    assert.equal(await get('/%'), 400);
    assert.equal(await get('/%E0%A4%A'), 400);
    assert.equal(await get('/'), 200, 'server still up afterwards');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
