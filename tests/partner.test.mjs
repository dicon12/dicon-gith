import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupTestEnvironment } from './test-helper.mjs';

setupTestEnvironment();

const {
  partnerService,
  normalizePartnerRequest,
  validatePartnerRequest,
  referenceFor,
  ORG_TYPES,
  OFFER_TYPES,
  PARTNER_STATUSES
} = await import('../js/partner-service.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function goodInput(overrides = {}) {
  return {
    organisationName: 'Northern Solar Ltd',
    orgType: ORG_TYPES[0],
    contactName: 'Amina Yusuf',
    contactRole: 'Head of CSR',
    email: 'Amina@NorthernSolar.ng',
    phone: '+234 803 000 0000',
    website: 'https://northernsolar.ng',
    offerTypes: [OFFER_TYPES[0], OFFER_TYPES[1]],
    offerDescription: 'We can provide seed grants and a mentor for solar innovators.',
    commitment: 'One-off support',
    allCategories: false,
    categories: ['Renewable Energy', 'Agriculture'],
    allStates: false,
    states: ['Kano', 'Kaduna'],
    consent: true,
    ...overrides
  };
}

const check = (input) => validatePartnerRequest(normalizePartnerRequest(input));

// ---------------------------------------------------------------- validation

test('Partner validation: a complete request is valid and email is lower-cased', () => {
  const data = normalizePartnerRequest(goodInput());
  assert.equal(data.email, 'amina@northernsolar.ng');
  assert.equal(validatePartnerRequest(data).valid, true);
});

test('Partner validation: required fields are reported individually', () => {
  const { valid, errors } = check({});
  assert.equal(valid, false);
  for (const f of ['organisationName', 'orgType', 'contactName', 'email', 'offerTypes',
                   'offerDescription', 'categories', 'states', 'consent']) {
    assert.ok(errors[f], `expected an error for ${f}`);
  }
});

test('Partner validation: bad email, short description and bad website are rejected', () => {
  assert.ok(check(goodInput({ email: 'not-an-email' })).errors.email);
  assert.ok(check(goodInput({ offerDescription: 'too short' })).errors.offerDescription);
  assert.ok(check(goodInput({ website: 'javascript:alert(1)' })).errors.website);
  assert.ok(check(goodInput({ website: 'ftp://example.com' })).errors.website);
});

test('Partner validation: "All categories" / "Nationwide" replace specific picks', () => {
  const data = normalizePartnerRequest(goodInput({ allCategories: true, allStates: true }));
  assert.deepEqual(data.categories, []);
  assert.deepEqual(data.states, []);
  assert.equal(validatePartnerRequest(data).valid, true);
});

test('Partner validation: unknown categories, states and offers are dropped', () => {
  const data = normalizePartnerRequest(goodInput({
    categories: ['Renewable Energy', 'Made Up Category'],
    states: ['Kano', 'Atlantis'],
    offerTypes: ['Mentorship', '<script>']
  }));
  assert.deepEqual(data.categories, ['Renewable Energy']);
  assert.deepEqual(data.states, ['Kano']);
  assert.deepEqual(data.offerTypes, ['Mentorship']);
});

test('Partner validation: a selection made only of unknown values counts as nothing selected', () => {
  const { errors } = check(goodInput({ categories: ['Nope'] }));
  assert.ok(errors.categories);
});

test('Partner validation: consent must be exactly true', () => {
  assert.ok(check(goodInput({ consent: 'yes' })).errors.consent);
  assert.ok(check(goodInput({ consent: false })).errors.consent);
});

// ---------------------------------------------------------------- service (local mode)

test('Partner service: submit stores the request and returns a reference; admin can list and review it', async () => {
  setupTestEnvironment();

  const result = await partnerService.submit(goodInput());
  assert.equal(result.ok, true);
  assert.match(result.reference, /^PRT-[A-Z0-9]{8}$/);
  assert.equal(result.reference, referenceFor(result.id));

  let seen = null;
  const live = await partnerService.watchAll(list => { seen = list; });
  assert.equal(live, false, 'no Firebase in tests: local mode');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].organisationName, 'Northern Solar Ltd');
  assert.equal(seen[0].status, 'new');
  assert.deepEqual(seen[0].states, ['Kano', 'Kaduna']);

  await partnerService.updateReview(
    result.id,
    { status: 'contacted', adminNote: 'Called on Monday.' },
    { uid: 'admin-1', name: 'Col. Danjuma' }
  );
  await partnerService.watchAll(list => { seen = list; });
  assert.equal(seen[0].status, 'contacted');
  assert.equal(seen[0].adminNote, 'Called on Monday.');
  assert.equal(seen[0].reviewedByName, 'Col. Danjuma');
});

test('Partner service: invalid input is rejected without storing anything', async () => {
  setupTestEnvironment();
  const res = await partnerService.submit(goodInput({ email: 'bad' }));
  assert.equal(res.ok, false);
  assert.ok(res.errors.email);

  let seen = null;
  await partnerService.watchAll(list => { seen = list; });
  assert.equal(seen.length, 0);
});

test('Partner service: a second submission inside the cooldown is refused', async () => {
  setupTestEnvironment();
  assert.equal((await partnerService.submit(goodInput())).ok, true);
  const second = await partnerService.submit(goodInput({ organisationName: 'Another Co' }));
  assert.equal(second.ok, false);
  assert.ok(second.errors.form);
  assert.ok(partnerService.cooldownRemaining() > 0);
});

test('Partner service: updateReview rejects unknown statuses and unknown ids', async () => {
  setupTestEnvironment();
  await assert.rejects(() => partnerService.updateReview('local-x', { status: 'bogus' }), /Invalid status/);
  await assert.rejects(() => partnerService.updateReview('local-missing', { status: 'contacted' }), /not found/i);
});

test('Partner service: every admin status has a pill class', () => {
  assert.deepEqual(PARTNER_STATUSES.map(s => s.key),
    ['new', 'contacted', 'in_discussion', 'partnered', 'declined']);
  PARTNER_STATUSES.forEach(s => assert.match(s.pill, /^pill-/));
});

// ---------------------------------------------------------------- routing

test('Server: /partner serves the Partner With Us page', async (t) => {
  const { default: server } = await import('../server.js');
  const port = 3097;
  await new Promise(resolve => server.listen(port, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const res = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/partner' }, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => resolve({ status: r.statusCode, body }));
    }).on('error', reject);
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /Partner With Us/);
  assert.match(res.body, /id="partner-form-el"/);
});

// ---------------------------------------------------------------- security rules (static)

test('Firestore rules: partnerRequests is create-only for the public and admin-only otherwise', () => {
  const rules = read('firestore.rules');
  const block = rules.match(/match \/partnerRequests\/\{id\} \{([\s\S]*?)\n    \}/);
  assert.ok(block, 'partnerRequests block exists');
  assert.match(block[1], /allow create: if validPartnerRequest\(request\.resource\.data\)/);
  assert.match(block[1], /allow read, update, delete: if isAdmin\(\)/);
  assert.doesNotMatch(block[1], /allow (read|list|get|update|delete)[^:]*: if true/);
});

test('Firestore rules: the validator pins status, consent, size limits and the website scheme', () => {
  const rules = read('firestore.rules');
  const fn = rules.match(/function validPartnerRequest\(d\) \{([\s\S]*?)\n    \}/);
  assert.ok(fn, 'validator exists');
  const body = fn[1];
  assert.match(body, /d\.status == 'new'/);
  assert.match(body, /d\.consent == true/);
  assert.match(body, /d\.createdAt == request\.time/);
  assert.match(body, /hasOnly\(/);
  assert.match(body, /offerDescription\.size\(\) <= 2000/);
  assert.match(body, /https\?:\/\//);
});

test('Firestore rules: the form fields the service writes match the fields the rules allow', () => {
  const rules = read('firestore.rules');
  const allowed = rules.match(/hasOnly\(\[([\s\S]*?)\]\)/g)
    .find(m => m.includes('organisationName'))
    .match(/'([A-Za-z]+)'/g).map(s => s.replace(/'/g, ''));
  // fields the service adds on top of the normalised form data
  const written = [...Object.keys(normalizePartnerRequest(goodInput())), 'status', 'createdAt'];
  assert.deepEqual([...written].sort(), [...allowed].sort());
});

test('Firestore rules: the orgType and commitment values in the rules match the form options', async () => {
  const rules = read('firestore.rules');
  const { ORG_TYPES: orgs, COMMITMENT_OPTIONS: commits } = await import('../js/partner-service.js');
  orgs.forEach(o => assert.ok(rules.includes(`'${o}'`), `rules missing orgType "${o}"`));
  commits.forEach(c => assert.ok(rules.includes(`'${c}'`), `rules missing commitment "${c}"`));
});

// ---------------------------------------------------------------- admin markup

test('Admin: every element the partner code looks up exists in admin.html', () => {
  const html = read('admin.html');
  const ids = [
    'admin-view-partners', 'admin-badge-partners', 'admin-partners-tbody', 'admin-partners-search',
    'admin-partners-cat-filter', 'admin-partners-state-filter', 'admin-partners-status-filter',
    'partner-drawer-backdrop', 'partner-drawer-title', 'partner-drawer-close', 'pd-cancel-btn',
    'pd-save-btn', 'pd-ref', 'pd-type', 'pd-received', 'pd-contact', 'pd-email', 'pd-phone',
    'pd-website', 'pd-offer-types', 'pd-offer-desc', 'pd-commitment', 'pd-categories', 'pd-states',
    'pd-status-pill', 'pd-status-select', 'pd-admin-note', 'pd-reviewed-by'
  ];
  ids.forEach(id => assert.ok(html.includes(`id="${id}"`), `admin.html is missing #${id}`));
  assert.match(html, /href="#admin-partners"/);

  // and the JS really does reference them (guards against the markup drifting from the code)
  const js = ['js/admin-app.js', 'js/admin-matching.js', 'js/admin-partners.js', 'js/admin-policy.js'].map(read).join(String.fromCharCode(10));
  ['admin-partners-tbody', 'partner-drawer-backdrop', 'pd-save-btn', 'admin-badge-partners']
    .forEach(id => assert.ok(js.includes(id), `admin-app.js never references ${id}`));
});

test('Admin: public partner data is never injected as raw HTML in the drawer', () => {
  const js = ['js/admin-app.js', 'js/admin-matching.js', 'js/admin-partners.js', 'js/admin-policy.js'].map(read).join(String.fromCharCode(10));
  const drawer = js.slice(js.indexOf('openPartnerDrawer(id)'), js.indexOf('async savePartnerReview()'));
  assert.ok(drawer.length > 200);
  assert.doesNotMatch(drawer, /innerHTML\s*=\s*`?[^;]*\$\{/, 'drawer must use textContent, not templated innerHTML');
});

test('Public page: nav, footer and landing page link to /partner', () => {
  ['partner.html', 'index.html', 'about.html'].forEach(f => {
    assert.ok(read(f).includes('href="/partner"'), `${f} has no link to /partner`);
  });
});
