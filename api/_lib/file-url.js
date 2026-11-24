/**
 * DICON GITH - private file links.
 * The browser sends the signed-in user's Firebase ID token and the stored file links.
 * If the user may see the file, this function returns a short-lived signed link (1 hour):
 *   - the owner (the file path starts with their uid) and admins / super admins: always;
 *   - anyone else (evaluators, mentors): only for files listed on the innovation named by `innovationId`,
 *     and only if Firestore rules let them read that innovation (i.e. an admin assigned it to them).
 * Anyone else gets nothing.
 *
 * Environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET (private bucket, default "gith-uploads")
 * Request body: { urls: ["<stored file link>", ...] (max 20), innovationId?: "<id>" }
 * Reply: { urls: { "<stored link>": "<signed link>" } }
 */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDt6XAfRlLZa0VkR6HqAc5tgkSsfQv9_mE';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'dicon-gith-e7c7e';
const clean = (v) => String(v == null ? '' : v).trim().replace(/^[\"']+|[\"']+$/g, '').trim();
const SUPABASE_URL = () => clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
const SERVICE_KEY = () => clean(process.env.SUPABASE_SERVICE_KEY);
const BUCKET = () => clean(process.env.SUPABASE_BUCKET) || 'gith-uploads';
const ADMINS = ['admin', 'super_admin'];
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const keyHeaders = () => { const k = SERVICE_KEY(); const h = { apikey: k, 'Content-Type': 'application/json' }; if (!k.startsWith('sb_')) h.Authorization = `Bearer ${k}`; return h; };

async function whoAmI(token) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.users && d.users[0] && d.users[0].localId) || null;
}
async function roleOf(uid, token) {
  // Read the user's own profile with their own token, so Firestore rules decide.
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return '';
  const d = await r.json();
  return (d.fields && d.fields.role && d.fields.role.stringValue) || '';
}
// Reads the innovation with the caller's own token, so Firestore rules decide whether they may see it
// (owner, admin, or an evaluator/mentor an admin assigned). Returns the bucket paths of its files, or null.
async function innovationFilePaths(innovationId, token) {
  if (!innovationId || !/^[A-Za-z0-9_-]{1,128}$/.test(innovationId)) return null;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/innovations/${innovationId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const f = (await r.json()).fields || {};
  const links = [];
  ['imageUrls', 'documentUrls', 'videoUrls'].forEach((k) => {
    ((f[k] && f[k].arrayValue && f[k].arrayValue.values) || []).forEach((v) => {
      const s = v.stringValue || (v.mapValue && v.mapValue.fields && v.mapValue.fields.url && v.mapValue.fields.url.stringValue);
      if (s) links.push(s);
    });
  });
  return new Set(links.map(pathOf).filter(Boolean));
}
// Accepts the stored link in public or signed form and returns the object path inside our private bucket.
function pathOf(url) {
  const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/);
  if (!m || m[1] !== BUCKET()) return null;
  try { return decodeURIComponent(m[2]); } catch (e) { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
  if (!SUPABASE_URL() || !SERVICE_KEY()) return reply(503, { error: 'File storage is not set up yet.' });
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return reply(401, { error: 'Sign in required.' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Bad request.' }); }
  const list = Array.isArray(body.urls) ? body.urls.slice(0, 20) : [];
  try {
    const uid = await whoAmI(token);
    if (!uid) return reply(401, { error: 'Sign in again.' });
    const admin = ADMINS.includes(await roleOf(uid, token));
    // Evaluators and mentors only get files that belong to an innovation they are allowed to read.
    const allowed = admin ? null : await innovationFilePaths(String(body.innovationId || ''), token);
    const out = {};
    await Promise.all(list.map(async (u) => {
      const p = pathOf(u);
      if (!p || !(admin || p.startsWith(uid + '/') || (allowed && allowed.has(p)))) return;
      const r = await fetch(`${SUPABASE_URL()}/storage/v1/object/sign/${BUCKET()}/${p.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: keyHeaders(), body: JSON.stringify({ expiresIn: 3600 }) });
      if (!r.ok) return;
      const d = await r.json();
      if (d.signedURL) out[u] = `${SUPABASE_URL()}/storage/v1${d.signedURL.startsWith('/') ? '' : '/'}${d.signedURL}`;
    }));
    return reply(200, { urls: out });
  } catch (e) {
    console.error('file-url failed:', e.message);
    return reply(502, { error: 'Could not prepare the file link.' });
  }
};
