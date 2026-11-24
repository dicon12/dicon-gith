import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

// Every file in the repo, as a site path ("/js/app.js").
function walk(dir = '') {
  return readdirSync(new URL(dir || '.', ROOT), { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git', '.github'].includes(e.name)) return [];
    const p = dir + e.name;
    return e.isDirectory() ? walk(p + '/') : ['/' + p];
  });
}
// Internal documents for DICON: kept in the repo, never published.
const INTERNAL = ["/approval-pack.html","/cost-note.html","/docs/DICON-GITH-Approval-Pack.pdf","/docs/DICON-GITH-Cost-Note.pdf"];
// What the public site is allowed to serve.
const isPublic = (p) => !INTERNAL.includes(p) && (/^\/[^/]+\.html$/.test(p) || /^\/(css|js|assets)\//.test(p)
  || /^\/docs\/[^/]+\.pdf$/.test(p) || p === '/manifest.webmanifest');
const privateFiles = () => walk().filter((p) => !isPublic(p));

test('Netlify _redirects blocks every private file (Netlify has no mid-path wildcards)', () => {
  const rules = read('_redirects').split('\n').filter((l) => /404!\s*$/.test(l)).map((l) => l.trim().split(/\s+/)[0]);
  assert.equal(rules.filter((r) => r.includes('*') && !r.endsWith('/*')).length, 0, 'only trailing /* splats work on Netlify');
  const blocked = (p) => rules.some((r) => (r.endsWith('/*') ? p.startsWith(r.slice(0, -1)) : p === r));
  const files = privateFiles();
  assert.ok(files.includes('/README.md') && files.includes('/netlify/functions/file-url.js'));
  const leaks = files.filter((p) => !blocked(p) && !['/_redirects', '/_headers'].includes(p)); // Netlify never serves these two
  assert.deepEqual(leaks, [], 'add these to _redirects');
});

test('Firebase Hosting ignores the functions, notes and config files', () => {
  const ignore = JSON.parse(read('firebase.json')).hosting.ignore;
  ['**/.*', '**/*.md', 'netlify/**', 'seed/**', 'tests/**', 'server.js', 'Dockerfile', 'firestore.rules', 'storage.rules']
    .forEach((g) => assert.ok(ignore.includes(g), g));
});

test('Vercel: the catch-all rewrite comes last and every page has its clean URL', () => {
  const rw = JSON.parse(read('vercel.json')).rewrites;
  assert.equal(rw[rw.length - 1].source, '/(.*)');
  ['/about', '/admin-guide', '/evaluator', '/mentor', '/showcase']
    .forEach((s) => assert.ok(rw.some((r) => r.source === s), s));
  const ignore = read('.vercelignore');
  ['netlify', '*.md', 'seed', 'tests', '.env.example'].forEach((n) => assert.match(ignore, new RegExp(`^${n.replace(/[.*]/g, '\\$&')}$`, 'm'), n));
});

test('Dockerfile does not run npm ci (no lockfile is committed and there are no dependencies)', () => {
  const d = read('Dockerfile');
  assert.doesNotMatch(d, /^RUN .*npm ci/m);
  assert.equal(JSON.parse(read('package.json')).dependencies, undefined);
});

test('the local/Docker server refuses every private file', async () => {
  const { default: server } = await import('../server.js');
  await new Promise((r) => server.listen(3097, '127.0.0.1', r));
  const status = (path) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 3097, path: encodeURI(path) }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
  });
  try {
    const served = [];
    for (const p of privateFiles()) if ((await status(p)) === 200) served.push(p);
    assert.deepEqual(served, []);
    assert.equal(await status('/js/admin-app.js'), 200);
    assert.equal(await status('/docs/DICON-GITH-Admin-Guide.pdf'), 200);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
