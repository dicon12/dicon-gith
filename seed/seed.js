// Seeds the categories and states reference data.
// Usage (from the functions folder so firebase-admin resolves):
//   set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccount.json
//   node ../seed/seed.js            -> categories + states
const admin = require('firebase-admin');
const categories = require('./categories.json');
const states = require('./states.json');

admin.initializeApp();
const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

(async () => {
  const batch = db.batch();
  categories.forEach((name, i) =>
    batch.set(db.collection('categories').doc(slug(name)), { name, isActive: true, sortOrder: i }));
  states.forEach((name, i) =>
    batch.set(db.collection('states').doc(slug(name)), { name, sortOrder: i }));
  batch.set(db.collection('settings').doc('app'), { currentYear: new Date().getFullYear(), phase: 1 }, { merge: true });
  await batch.commit();
  console.log(`Seeded ${categories.length} categories and ${states.length} states.`);
})().catch((e) => { console.error(e); process.exit(1); });
