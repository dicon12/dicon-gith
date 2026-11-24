/**
 * DICON GITH - file upload helper (serverless function + Supabase Storage).
 * Replaces Firebase Storage, so the Firebase Blaze plan is not needed.
 *
 * Flow:
 *   1. The browser sends the signed-in user's Firebase ID token + file details.
 *   2. This function verifies the token with Firebase, checks the file type and size,
 *      and asks Supabase for a one-time signed upload URL (using the secret service key).
 *   3. The browser uploads the file straight to Supabase with that URL and stores the
 *      returned public link in Firestore (a short text, not the file itself).
 * The Supabase service key never reaches the browser.
 *
 * Environment variables (Netlify: Site configuration -> Environment variables; Vercel: Project -> Settings -> Environment Variables):
 *   SUPABASE_URL           e.g. https://abcdxyz.supabase.co
 *   SUPABASE_SERVICE_KEY   Supabase -> Project Settings -> API Keys -> Secret key (sb_secret_...) (SECRET)
 *   SUPABASE_BUCKET        optional, default "gith-uploads" (create it as a PRIVATE bucket: innovation photos/documents)
 *   SUPABASE_PUBLIC_BUCKET optional, default "gith-public" (create it as a PUBLIC bucket: profile photos only)
 *   FIREBASE_API_KEY       optional, defaults to the dicon-gith-e7c7e project
 *
 * Request body: { kind: 'profile' | 'innovation-photo' | 'innovation-doc', filename, contentType, size }
 */
const crypto = require('crypto');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDt6XAfRlLZa0VkR6HqAc5tgkSsfQv9_mE';
const clean = (v) => String(v == null ? '' : v).trim().replace(/^[\"']+|[\"']+$/g, '').trim();
const SUPABASE_URL = () => clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
const SERVICE_KEY = () => clean(process.env.SUPABASE_SERVICE_KEY);
const BUCKET = () => clean(process.env.SUPABASE_BUCKET) || 'gith-uploads';            // PRIVATE: innovation photos and documents
const PUBLIC_BUCKET = () => clean(process.env.SUPABASE_PUBLIC_BUCKET) || 'gith-public'; // PUBLIC: profile photos only
const bucketFor = (kind) => (kind === 'profile' ? PUBLIC_BUCKET() : BUCKET());

const MB = 1024 * 1024;
const DOC_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const RULES = {
  'profile': { max: 5 * MB, ok: (t) => /^image\/(jpeg|png|webp|gif)$/.test(t) },
  'innovation-photo': { max: 10 * MB, ok: (t) => /^image\/(jpeg|png|webp|gif)$/.test(t) },
  'innovation-video': { max: 50 * MB, ok: (t) => /^video\/(mp4|webm|quicktime)$/.test(t) },
  'innovation-doc': { max: 15 * MB, ok: (t) => DOC_TYPES.includes(t) },
};

// New-style keys (sb_secret_...) are not JWTs: send them in `apikey` only. Legacy service_role JWT keys also need Authorization.
const keyHeaders = () => {
  const k = SERVICE_KEY();
  const h = { apikey: k, 'Content-Type': 'application/json' };
  if (!k.startsWith('sb_')) h.Authorization = `Bearer ${k}`;
  return h;
};

const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function firebaseUid(token) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  return (data.users && data.users[0] && data.users[0].localId) || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
  if (!SUPABASE_URL() || !SERVICE_KEY()) return reply(503, { error: 'File storage is not set up yet (SUPABASE_URL / SUPABASE_SERVICE_KEY missing in the host settings).' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return reply(401, { error: 'Sign in required.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Bad request.' }); }

  const rule = RULES[body.kind];
  const contentType = String(body.contentType || '').toLowerCase();
  const size = Number(body.size) || 0;
  if (!rule) return reply(400, { error: 'Unknown upload type.' });
  if (!rule.ok(contentType)) return reply(400, { error: 'That file type is not allowed.' });
  if (size <= 0 || size > rule.max) return reply(400, { error: `File is too large (max ${Math.round(rule.max / MB)} MB).` });

  try {
    const uid = await firebaseUid(token);
    if (!uid) return reply(401, { error: 'Could not verify your sign-in. Sign in again.' });

    // Unguessable path: <uid>/<kind>/<random>-<clean name>
    const safeName = String(body.filename || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
    const path = `${uid}/${body.kind}/${crypto.randomBytes(16).toString('hex')}-${safeName}`;

    const r = await fetch(`${SUPABASE_URL()}/storage/v1/object/upload/sign/${bucketFor(body.kind)}/${path}`, {
      method: 'POST',
      headers: keyHeaders(),
      body: '{}',
    });
    if (!r.ok) {
      console.error('supabase sign failed', r.status, (await r.text()).slice(0, 200));
      return reply(502, { error: 'Storage service refused the request. Check the bucket name and service key.' });
    }
    const data = await r.json(); // { url: '/object/upload/sign/<bucket>/<path>?token=...' }
    const rel = String(data.url || '');
    if (!rel) return reply(502, { error: 'Storage service gave no upload link.' });

    return reply(200, {
      uploadUrl: `${SUPABASE_URL()}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`,
      publicUrl: `${SUPABASE_URL()}/storage/v1/object/public/${bucketFor(body.kind)}/${path}`,
      path,
    });
  } catch (e) {
    console.error('upload-url failed:', e.message);
    return reply(502, { error: 'Could not prepare the upload. Try again.' });
  }
};
