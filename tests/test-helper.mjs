/**
 * Test Helper: In-memory LocalStorage and DOM stub for Node.js test runner
 */

export class MemoryLocalStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(String(key)) ? this.store.get(String(key)) : null;
  }

  setItem(key, value) {
    this.store.set(String(key), String(value));
  }

  removeItem(key) {
    this.store.delete(String(key));
  }

  clear() {
    this.store.clear();
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}

export function setupTestEnvironment() {
  globalThis.localStorage = new MemoryLocalStorage();
  globalThis.window = globalThis;
  if (!globalThis.location) {
    globalThis.location = {
      href: 'http://localhost:3000/',
      pathname: '/',
      search: '',
      hash: ''
    };
  }
}

/**
 * Local-mode admin for tests. Real admins are created in Firebase; the app ships no built-in account.
 */
export async function seedTestAdmin(email = 'test.admin@dicon.gov.ng', password = 'TestAdminPass2026!') {
  const { hashPassword } = await import('../js/auth-service.js');
  const registry = JSON.parse(localStorage.getItem('dicon_gith_users_registry') || '[]');
  registry.push({
    uid: 'test-admin-uid', id: 'test-admin-uid', email, fullName: 'Test Admin', role: 'super_admin',
    isActive: true, createdAt: new Date().toISOString(), passwordHash: await hashPassword(password)
  });
  localStorage.setItem('dicon_gith_users_registry', JSON.stringify(registry));
  return { email, password };
}
export const TEST_ADMIN = { email: 'test.admin@dicon.gov.ng', password: 'TestAdminPass2026!' };
