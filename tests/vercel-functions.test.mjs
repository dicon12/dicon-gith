import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const NAMES = ['upload-url', 'file-url', 'send-email'];

// Minimal stand-ins for Vercel's req/res.
function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b; },
  };
}
function fakeReq({ method = 'POST', headers = {}, body, badJson = false } = {}) {
  const req = { method, headers };
  Object.defineProperty(req, 'body', { get() { if (badJson) throw new Error('Invalid JSON'); return body; } });
  return req;
}

test('Netlify and Vercel run the same handler for every function', () => {
  for (const n of NAMES) {
    const shared = require(`../api/_lib/${n}.js`).handler;
    assert.equal(typeof shared, 'function', n);
    assert.equal(require(`../netlify/functions/${n}.js`).handler, shared, `netlify/${n}`);
    assert.equal(typeof require(`../api/${n}.js`), 'function', `api/${n}`);
  }
});

test('vercel.json sends the /.netlify/functions/* paths the browser uses to /api/*', () => {
  const rw = JSON.parse(read('vercel.json')).rewrites;
  const i = rw.findIndex((r) => r.source === '/.netlify/functions/:name' && r.destination === '/api/:name');
  assert.ok(i >= 0);
  assert.ok(i < rw.findIndex((r) => r.source === '/(.*)'), 'must come before the catch-all');
  for (const n of NAMES) assert.match(read(n === 'send-email' ? 'js/email-notify.js' : 'js/file-upload.js'), new RegExp(`/\\.netlify/functions/${n}`));
  assert.doesNotMatch(read('.vercelignore'), /^api$/m, 'api/ must be deployed');
});

test('Vercel adapter passes method, headers and parsed JSON body through, and returns the reply', async () => {
  const seen = [];
  const fn = require('../api/_lib/vercel-adapter.js')(async (event) => {
    seen.push(event);
    return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' };
  });
  const res = fakeRes();
  await fn(fakeReq({ headers: { authorization: 'Bearer t' }, body: { urls: ['a'] } }), res);
  assert.equal(seen[0].httpMethod, 'POST');
  assert.equal(seen[0].headers.authorization, 'Bearer t');
  assert.deepEqual(JSON.parse(seen[0].body), { urls: ['a'] });
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers['content-type'], 'application/json');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.body, '{"ok":true}');

  await fn(fakeReq({ body: '{"raw":1}' }), fakeRes());
  assert.equal(seen[1].body, '{"raw":1}');
  await fn(fakeReq({ body: undefined }), fakeRes());
  assert.equal(seen[2].body, '');
});

test('Vercel adapter: malformed JSON reaches the handler as a bad body, a crash becomes a 500', async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = 'https://sb.example'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
  try {
    const res = fakeRes();
    await require('../api/file-url.js')(fakeReq({ headers: { authorization: 'Bearer t' }, badJson: true }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: 'Bad request.' });
  } finally {
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  }
  const crash = require('../api/_lib/vercel-adapter.js')(async () => { throw new Error('boom'); });
  const res2 = fakeRes();
  await crash(fakeReq(), res2);
  assert.equal(res2.statusCode, 500);
});

test('real handlers answer through the adapter (method and sign-in checks)', async () => {
  process.env.SUPABASE_URL = 'https://sb.example'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.BREVO_API_KEY = 'k'; process.env.SENDER_EMAIL = 'noreply@example.com';
  try {
    for (const n of NAMES) {
      const fn = require(`../api/${n}.js`);
      const get = fakeRes(); await fn(fakeReq({ method: 'GET' }), get);
      assert.equal(get.statusCode, 405, `${n} GET`);
      const anon = fakeRes(); await fn(fakeReq({ body: { kind: 'profile', contentType: 'image/png', size: 10 } }), anon);
      assert.equal(anon.statusCode, 401, `${n} without sign-in`);
    }
  } finally {
    ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'SENDER_EMAIL'].forEach((k) => delete process.env[k]);
  }
});
