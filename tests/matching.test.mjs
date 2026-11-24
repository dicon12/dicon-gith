import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupTestEnvironment } from './test-helper.mjs';

setupTestEnvironment();

const {
  matchingService, matchPartners, canBeReadyForSponsors,
  normalizeIntroduction, validateIntroduction, INTRO_METHODS, INTRO_OUTCOMES, READY_STATUSES
} = await import('../js/matching-service.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const inno = (o = {}) => ({
  innovationId: 'inn-1', referenceNumber: 'GITH-2026-000001', innovationName: 'Solar Dryer',
  category: 'Renewable Energy', state: 'Kano', status: 'shortlisted', ...o
});
const partner = (id, o = {}) => ({
  id, organisationName: 'Org ' + id, status: 'new',
  allCategories: false, categories: [], allStates: false, states: [], ...o
});

// ---------------------------------------------------------------- matching rules

test('Matching: full, category-only and state-only matches are found and ordered', () => {
  const partners = [
    partner('state', { states: ['Kano'] }),
    partner('cat', { categories: ['Renewable Energy'], states: ['Lagos'] }),
    partner('full', { categories: ['Renewable Energy'], states: ['Kano'] }),
    partner('none', { categories: ['Health'], states: ['Lagos'] })
  ];
  const out = matchPartners(inno(), partners);
  assert.deepEqual(out.map(m => m.partner.id), ['full', 'cat', 'state']);
  assert.deepEqual(out.map(m => m.full), [true, false, false]);
  assert.equal(out[1].categoryMatch, true);
  assert.equal(out[2].stateMatch, true);
});

test('Matching: "All categories" and "Nationwide" count as interested; declined partners are left out', () => {
  const partners = [
    partner('all', { allCategories: true, allStates: true }),
    partner('declined', { allCategories: true, allStates: true, status: 'declined' })
  ];
  const out = matchPartners(inno(), partners);
  assert.deepEqual(out.map(m => m.partner.id), ['all']);
  assert.equal(out[0].full, true);
});

test('Matching: within the same group, partnered/in-discussion partners come before new ones', () => {
  const base = { allCategories: true, allStates: true };
  const out = matchPartners(inno(), [
    partner('a-new', base), partner('b-talks', { ...base, status: 'in_discussion' }), partner('c-done', { ...base, status: 'partnered' })
  ]);
  assert.deepEqual(out.map(m => m.partner.id), ['c-done', 'b-talks', 'a-new']);
});

test('Matching: bad input does not throw', () => {
  assert.deepEqual(matchPartners(null, []), []);
  assert.deepEqual(matchPartners(inno(), undefined), []);
});

test('Ready tag: only recommended, approved or later innovations qualify', () => {
  READY_STATUSES.forEach(s => assert.equal(canBeReadyForSponsors({ status: s }), true));
  ['submitted', 'screening', 'verification', 'assessment', 'returned', 'rejected', 'draft']
    .forEach(s => assert.equal(canBeReadyForSponsors({ status: s }), false, s));
  assert.equal(canBeReadyForSponsors(null), false);
});

// ---------------------------------------------------------------- validation

const goodIntro = (o = {}) => ({
  innovationId: 'inn-1', partnerId: 'p1', method: INTRO_METHODS[0], outcome: 'introduced',
  date: '2026-11-20', note: 'Sent intro email', ...o
});

test('Introduction validation: a complete entry is valid; outcome defaults to "introduced"', () => {
  assert.equal(validateIntroduction(normalizeIntroduction(goodIntro())).valid, true);
  assert.equal(normalizeIntroduction(goodIntro({ outcome: '' })).outcome, 'introduced');
});

test('Introduction validation: missing ids, unknown method/outcome, bad date and long note are rejected', () => {
  const { valid, errors } = validateIntroduction(normalizeIntroduction(
    { method: 'Carrier pigeon', outcome: 'won', date: 'yesterday', note: 'x'.repeat(1001) }));
  assert.equal(valid, false);
  ['innovationId', 'partnerId', 'method', 'outcome', 'date', 'note'].forEach(f => assert.ok(errors[f], f));
});

// ---------------------------------------------------------------- service (local mode)

test('Service: setReady refuses an innovation that has not been recommended yet', async () => {
  await assert.rejects(() => matchingService.setReady(inno({ status: 'screening' }), { ready: true, summary: '' }), /recommended or approved/);
});

test('Service: tag, update the pitch, then remove the tag', async () => {
  let ready = [];
  await matchingService.watchAll({ onReady: l => { ready = l; }, onIntros: () => {} });
  await matchingService.setReady(inno(), { ready: true, summary: '  Great fit for grants  ' }, { uid: 'a1', name: 'Admin One' });
  await matchingService.watchAll({ onReady: l => { ready = l; }, onIntros: () => {} });
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, 'inn-1');
  assert.equal(ready[0].ready, true);
  assert.equal(ready[0].summary, 'Great fit for grants');
  assert.equal(ready[0].markedByName, 'Admin One');

  await matchingService.setReady(inno(), { ready: true, summary: 'Updated pitch' });
  await matchingService.watchAll({ onReady: l => { ready = l; }, onIntros: () => {} });
  assert.equal(ready.length, 1, 'tagging twice must not duplicate');
  assert.equal(ready[0].summary, 'Updated pitch');

  await matchingService.setReady(inno(), { ready: false, summary: '' });
  await matchingService.watchAll({ onReady: l => { ready = l; }, onIntros: () => {} });
  assert.equal(ready[0].ready, false);
});

test('Service: log an introduction, list it, and change its outcome', async () => {
  const ctx = { referenceNumber: 'GITH-2026-000001', innovationName: 'Solar Dryer', partnerReference: 'PRT-ABC12345', organisationName: 'Northern Solar Ltd' };
  const bad = await matchingService.logIntroduction(goodIntro({ method: 'nope' }), ctx);
  assert.equal(bad.ok, false);

  const res = await matchingService.logIntroduction(goodIntro(), ctx, { uid: 'a1', name: 'Admin One' });
  assert.equal(res.ok, true);

  let intros = [];
  await matchingService.watchAll({ onReady: () => {}, onIntros: l => { intros = l; } });
  const mine = intros.find(i => i.id === res.id);
  assert.ok(mine);
  assert.equal(mine.organisationName, 'Northern Solar Ltd');
  assert.equal(mine.outcome, 'introduced');
  assert.equal(mine.loggedByName, 'Admin One');

  await matchingService.updateOutcome(res.id, { outcome: 'in_talks', note: 'Call booked' }, { uid: 'a1' });
  await matchingService.watchAll({ onReady: () => {}, onIntros: l => { intros = l; } });
  const after = intros.find(i => i.id === res.id);
  assert.equal(after.outcome, 'in_talks');
  assert.equal(after.note, 'Call booked');

  await assert.rejects(() => matchingService.updateOutcome(res.id, { outcome: 'won' }), /Invalid outcome/);
  await assert.rejects(() => matchingService.updateOutcome('local-missing', { outcome: 'no_fit' }), /not found/);
});

test('Service: every outcome has a pill class', () => {
  INTRO_OUTCOMES.forEach(o => assert.match(o.pill, /^pill-/));
});

// ---------------------------------------------------------------- rules & markup

test('Firestore rules: sponsorReady and introductions are admin-only', () => {
  const rules = read('firestore.rules');
  for (const name of ['sponsorReady', 'introductions']) {
    const block = rules.match(new RegExp(`match /${name}/\\{id\\} \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(block, `${name} block exists`);
    assert.match(block[1], /allow read, write: if isAdmin\(\)/);
    assert.doesNotMatch(block[1], /if true/);
  }
});

test('Firestore rules: the innovation document gets no sponsor fields (innovators cannot self-tag)', () => {
  assert.doesNotMatch(read('js/storage.js'), /sponsorReady|sponsor_ready/);
});

test('Admin: every element the matching code looks up exists in admin.html and is used by the code', () => {
  const html = read('admin.html');
  const js = ['js/admin-app.js', 'js/admin-matching.js', 'js/admin-partners.js', 'js/admin-policy.js'].map(read).join(String.fromCharCode(10));
  const ids = [
    'admin-view-matching', 'admin-badge-matching', 'admin-matching-ready-tbody', 'admin-matching-intro-tbody',
    'ms-section', 'ms-locked-note', 'ms-controls', 'ms-state-pill', 'ms-state-line', 'ms-summary',
    'ms-toggle-btn', 'ms-remove-btn', 'ms-matches-wrap', 'ms-matches',
    'intro-modal-backdrop', 'intro-modal-subtitle', 'intro-method', 'intro-date', 'intro-outcome',
    'intro-note', 'intro-error', 'intro-close-btn', 'intro-cancel-btn', 'intro-save-btn'
  ];
  ids.forEach(id => {
    assert.ok(html.includes(`id="${id}"`), `admin.html is missing #${id}`);
    assert.ok(js.includes(id) || id === 'admin-view-matching' || id === 'ms-section', `admin-app.js never references ${id}`);
  });
  assert.match(html, /href="#admin-matching"/);
});

test('Admin: partner and innovator text in the matching code is always HTML-escaped', () => {
  const section = read('js/admin-matching.js');
  assert.ok(section.length > 1000);
  const risky = /organisationName|email|\.note|contactName|summary|innovationName|loggedByName|referenceNumber|partnerReference|\.date|\.method/;
  for (const m of section.matchAll(/\$\{([^}]*)\}/g)) {
    if (risky.test(m[1])) assert.ok(m[1].trim().startsWith('this.escapeHtml('), `unescaped interpolation: ${m[0]}`);
  }
});
