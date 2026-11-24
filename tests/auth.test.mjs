import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, seedTestAdmin, TEST_ADMIN } from './test-helper.mjs';

// Setup environment before importing auth-service
setupTestEnvironment();

const { authService } = await import('../js/auth-service.js');

test('AuthService: no built-in demo accounts exist', async () => {
  setupTestEnvironment();
  await authService.init();
  for (const [email, pw] of [['admin@dicon.gov.ng', 'DiconAdmin2026!'], ['aminu.bello@example.com', 'Innovator2026!']]) {
    await assert.rejects(async () => await authService.login(email, pw), /no account|invalid/i);
  }
});

test('AuthService: seeded local admin logs in and no secrets leak', async () => {
  setupTestEnvironment();
  await authService.init();
  await seedTestAdmin();
  const res = await authService.login(TEST_ADMIN.email, TEST_ADMIN.password);
  assert.equal(res.success, true);
  assert.ok(['admin', 'super_admin'].includes(res.user.role));
  assert.equal(res.user.password, undefined);
  assert.equal(res.user.passwordHash, undefined);
  await assert.rejects(async () => await authService.login(TEST_ADMIN.email, 'admin123'), /invalid/i);
});

test('AuthService: Registration validation rejects invalid payloads', async () => {
  setupTestEnvironment();
  await authService.init();

  // Missing fields
  await assert.rejects(
    async () => await authService.register({}),
    /required|valid email/i
  );

  // Invalid email
  await assert.rejects(
    async () => await authService.register({
      fullName: 'Jane Doe',
      email: 'not-an-email',
      phone: '08012345678',
      password: 'Password123!',
      agreeTerms: true
    }),
    /valid email/i
  );

  // Short password (< 8 chars)
  await assert.rejects(
    async () => await authService.register({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '08012345678',
      password: '123',
      agreeTerms: true
    }),
    /8 characters/i
  );

  // Short phone (< 10 digits)
  await assert.rejects(
    async () => await authService.register({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '1234',
      password: 'StrongPassword123!',
      agreeTerms: true
    }),
    /phone number/i
  );
});

test('AuthService: Prevents privilege escalation to admin via public registration', async () => {
  setupTestEnvironment();
  await authService.init();

  await assert.rejects(
    async () => await authService.register({
      fullName: 'Malicious Actor',
      email: 'fakeadmin@dicon.gov.ng',
      phone: '08012345678',
      password: 'SuperSecretPassword2026!',
      agreeTerms: true
    }),
    /reserved|administrative/i
  );
});

test('AuthService: Successful registration creates innovator with hashed password', async () => {
  setupTestEnvironment();
  authService.init();

  const regRes = await authService.register({
    fullName: 'Fatima Abubakar',
    email: 'fatima@example.com',
    phone: '08023456789',
    state: 'Kano',
    category: 'Renewable Energy',
    password: 'FatimaSecurePass2026!',
    agreeTerms: true
  });

  assert.equal(regRes.success, true);
  assert.equal(regRes.user.role, 'innovator');
  assert.equal(regRes.user.email, 'fatima@example.com');
  assert.equal(regRes.user.password, undefined);
  assert.equal(regRes.user.passwordHash, undefined);

  // Duplicate registration must fail
  await assert.rejects(
    async () => await authService.register({
      fullName: 'Fatima Abubakar',
      email: 'fatima@example.com',
      phone: '08023456789',
      password: 'AnotherPassword2026!',
      agreeTerms: true
    }),
    /already exists/i
  );

  // Login with new user
  const loginRes = await authService.login('fatima@example.com', 'FatimaSecurePass2026!');
  assert.equal(loginRes.success, true);
  assert.equal(loginRes.user.fullName, 'Fatima Abubakar');
});

test('AuthService: password reset sends no local token and needs a live Firebase connection', async () => {
  setupTestEnvironment();
  await authService.init();
  await assert.rejects(async () => await authService.sendPasswordReset('not-an-email'), /valid email/i);
  await assert.rejects(async () => await authService.sendPasswordReset('someone@example.com'), /live site/i);
  assert.equal(localStorage.getItem('dicon_gith_reset_tokens'), null, 'no fake token may be stored');
  assert.equal(typeof authService.resetPassword, 'undefined', 'local-only resetPassword must not exist');
  await assert.rejects(async () => await authService.confirmReset('code', 'LongEnoughPass1'), /could not be reached/i);
});

test('AuthService: requireAuth guard rejects unauthenticated sessions and redirects to /login', async () => {
  setupTestEnvironment();
  await authService.init();

  // Ensure logged out
  await authService.logout();
  assert.equal(authService.isAuthenticated(), false);
  assert.equal(authService.getCurrentUser(), null);

  // Mock window.location
  let redirectedTo = null;
  globalThis.window.location = {
    pathname: '/dashboard',
    href: '',
    replace: (url) => { redirectedTo = url; }
  };

  const isAllowed = authService.requireAuth(['innovator']);
  assert.equal(isAllowed, false);
  assert.match(globalThis.window.location.href, /\/login\?redirect=%2Fdashboard/);
});


test('AuthService: saveProfile updates the profile and never changes role or uid', async () => {
  setupTestEnvironment();
  await authService.init();
  await authService.register({ fullName: 'Pic Person', email: 'pic@example.com', phoneNumber: '08012345678', password: 'LongEnoughPass1', state: 'Niger', lga: 'Minna' });
  const updated = await authService.saveProfile({ fullName: 'New Name', photoUrl: 'https://example.com/me.jpg', role: 'super_admin', uid: 'hacked' });
  assert.equal(updated.fullName, 'New Name');
  assert.equal(updated.photoUrl, 'https://example.com/me.jpg');
  assert.equal(updated.role, 'innovator');
  assert.notEqual(updated.uid, 'hacked');
});
