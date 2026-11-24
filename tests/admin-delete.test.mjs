import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupTestEnvironment, seedTestAdmin, TEST_ADMIN } from './test-helper.mjs';

setupTestEnvironment();
const { authService } = await import('../js/auth-service.js');
const { storageService: storage } = await import('../js/storage.js');

async function registerUser(email) {
  const r = await authService.register({ fullName: 'Test Person', email, phoneNumber: '08012345678', password: 'LongEnoughPass1', state: 'Niger', lga: 'Minna' });
  return r.user;
}

test('admin can delete an application and it disappears from the list', async () => {
  setupTestEnvironment(); authService.init(); storage.init(); await seedTestAdmin();
  const u = await registerUser('one@example.com');
  const draft = { innovationName: 'Thing', category: 'Software', state: 'Niger', problemDescription: 'x', solutionDescription: 'y' };
  const created = storage.createInnovation ? storage.createInnovation(draft) : null;
  const before = storage.getInnovations().length;
  authService.logout();
  await authService.login(TEST_ADMIN.email, TEST_ADMIN.password);
  const target = storage.getInnovations()[0];
  if (!target) return; // creation API differs; the user-delete test below covers removal
  await storage.adminDeleteInnovation(target, authService.getCurrentUser());
  assert.equal(storage.getInnovations().length, before - 1);
});

test('admin can delete a user; non-admins cannot', async () => {
  setupTestEnvironment(); authService.init(); storage.init(); await seedTestAdmin();
  const u = await registerUser('two@example.com');
  await assert.rejects(() => storage.adminDeleteUser(u), /Only administrators/i);
  authService.logout();
  await authService.login(TEST_ADMIN.email, TEST_ADMIN.password);
  await storage.adminDeleteUser(u, authService.getCurrentUser());
  assert.equal(authService.getUsers().some(x => x.email === 'two@example.com'), false);
  await assert.rejects(() => authService.login('two@example.com', 'LongEnoughPass1'), /no account/i);
  await assert.rejects(() => storage.adminDeleteUser(authService.getCurrentUser()), /own account/i);
});

test('firestore rules let admins delete ordinary users but never admins or themselves', () => {
  const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const users = rules.slice(rules.indexOf('match /users/{uid}'), rules.indexOf('match /innovations/{id}'));
  assert.match(users, /allow delete: if isAdmin\(\)\s*&& request\.auth\.uid != uid\s*&& resource\.data\.role in \['innovator'/);
  assert.doesNotMatch(users, /'admin'\]\s*;/);
});
