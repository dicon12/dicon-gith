import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, weightedScore, validateAssessment, summarize, rankInnovations, DEFAULT_WEIGHTS } from '../js/phase2-service.js';

const all = (n) => Object.fromEntries(CRITERIA.map(c => [c.key, n]));
test('weightedScore: equal weights is the plain average', () => {
  assert.equal(weightedScore({ ...all(4), originality: 2 }), (4 * 5 + 2) / 6);
});
test('weightedScore: a heavier weight counts more; zero weight is ignored', () => {
  const s = { ...all(1), scalability: 5 };
  assert.ok(weightedScore(s, { ...DEFAULT_WEIGHTS, scalability: 5 }) > weightedScore(s));
  assert.equal(weightedScore({ ...all(3), scalability: 5 }, { ...DEFAULT_WEIGHTS, scalability: 0 }), 3);
});
test('validateAssessment requires all six scores and a recommendation', () => {
  assert.match(validateAssessment({ scores: { originality: 3 }, recommendation: 'advance' }), /Score every criterion/);
  assert.match(validateAssessment({ scores: all(3), recommendation: '' }), /recommendation/);
  assert.equal(validateAssessment({ scores: all(3), recommendation: 'hold' }), '');
});
test('summarize ignores drafts and reports average and spread', () => {
  const r = summarize([{ submitted: true, scores: all(4) }, { submitted: true, scores: all(2) }, { submitted: false, scores: all(5) }]);
  assert.equal(r.count, 2); assert.equal(r.avg, 3); assert.equal(r.spread, 2);
});
test('rankInnovations orders by average, highest first', () => {
  const a = [{ innovationId: 'a', submitted: true, scores: all(2) }, { innovationId: 'b', submitted: true, scores: all(5) }];
  const r = rankInnovations([{ id: 'a' }, { id: 'b' }], a);
  assert.deepEqual(r.map(x => x.inno.id), ['b', 'a']);
});

import { readFileSync } from 'node:fs';
test('rules: verifications and events are protected', () => {
  const r = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(r, /match \/verifications\/\{id\} \{\s*allow read, write: if isAdmin\(\);/);
  assert.match(r, /match \/events\/\{id\} \{\s*allow read: if resource\.data\.isPublished == true \|\| isAdmin\(\);\s*allow write: if isAdmin\(\);/);
});

import { toCsv } from '../js/phase2-service.js';
test('toCsv quotes cells and neutralises spreadsheet formulas', () => {
  const out = toCsv([['name', 'note'], ['=HYPERLINK("x")', 'He said "hi", ok']]);
  assert.ok(out.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(out.includes('"He said ""hi"", ok"'));
  assert.ok(out.startsWith('\uFEFF'));
});

import { conflictReason } from '../js/phase2-service.js';
test('conflictReason flags applicant, same state and same organisation', () => {
  assert.equal(conflictReason({ uid: 'u1', state: 'Kano' }, { userId: 'u1', state: 'Lagos' }), 'is the applicant');
  assert.equal(conflictReason({ uid: 'e1', state: 'Kano' }, { userId: 'u2', state: ' kano ' }), 'is from the same state');
  assert.equal(conflictReason({ uid: 'e1', state: 'Oyo', institution: 'UI' }, { userId: 'u2', state: 'Lagos', teamName: 'ui' }), 'is from the same organisation');
  assert.equal(conflictReason({ uid: 'e1', state: 'Oyo' }, { userId: 'u2', state: 'Lagos' }), '');
});
test('rules: mentors, notes and showcase are locked down', () => {
  const r = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(r, /isAssignedMentor\(id\)/);
  assert.match(r, /match \/mentorNotes\/\{id\} \{\s*allow read: if \(signedIn\(\) && resource\.data\.mentorId == request\.auth\.uid\) \|\| isAdmin\(\);/);
  assert.match(r, /match \/showcase\/\{id\} \{\s*allow read: if resource\.data\.isPublished == true \|\| isAdmin\(\);\s*allow write: if isAdmin\(\) && request\.resource\.data\.consentConfirmed == true;/);
  const s = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
  assert.match(s, /mentorships\//);
});
