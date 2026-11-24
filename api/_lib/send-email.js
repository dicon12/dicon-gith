/**
 * DICON GITH - email sender (serverless function + Brevo). Replaces the Firebase "Trigger Email" setup.
 *
 * The browser calls this with the signed-in admin's Firebase ID token. The function:
 *   1. verifies the token with Firebase and checks users/{uid}.role is admin / super_admin,
 *   2. reads the real data it needs from Firestore (using that admin's own token, so the
 *      Firestore security rules still apply), and
 *   3. sends the email through Brevo using a secret key kept in the host's environment variables.
 * The browser never sees the Brevo key and cannot choose the recipient address of a status email.
 *
 * Environment variables (Netlify: Site configuration -> Environment variables; Vercel: Project -> Settings -> Environment Variables):
 *   BREVO_API_KEY   (required)  Brevo -> SMTP & API -> API keys
 *   SENDER_EMAIL    (required)  a sender address verified in Brevo
 *   SENDER_NAME     (optional)  default "DICON GITH"
 *   FIREBASE_API_KEY, FIREBASE_PROJECT_ID (optional, default to the dicon-gith-e7c7e project)
 *
 * Request body:
 *   { type: 'status', innovationId }
 *   { type: 'announcement', title, message, recipientIds: [uid, ...] }   (max 300)
 */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDt6XAfRlLZa0VkR6HqAc5tgkSsfQv9_mE';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'dicon-gith-e7c7e';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const ADMIN_ROLES = ['admin', 'super_admin'];
const MAX_RECIPIENTS = 300;

// Host values are sometimes saved with stray spaces or quotes; clean them before use.
const clean = (v) => String(v == null ? '' : v).trim().replace(/^["']+|["']+$/g, '').trim();
const SENDER_EMAIL = () => clean(process.env.SENDER_EMAIL);
const BREVO_KEY = () => clean(process.env.BREVO_API_KEY);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

const STATUS_LABELS = {
  returned: 'Returned for correction', screening: 'Under screening', verification: 'Under verification',
  assessment: 'Under assessment', shortlisted: 'Recommended', selected: 'Approved',
  mentorship: 'In mentorship', incubation: 'In incubation', rejected: 'Not selected',
};

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const str = (doc, k) => (doc && doc.fields && doc.fields[k] && doc.fields[k].stringValue) || '';

async function fsGet(path, token) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

async function verifyAdmin(token) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const uid = data.users && data.users[0] && data.users[0].localId;
  if (!uid) return null;
  const me = await fsGet(`users/${uid}`, token);
  return me && ADMIN_ROLES.includes(str(me, 'role')) ? uid : null;
}

async function brevo(payload) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY(), 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: clean(process.env.SENDER_NAME) || 'DICON GITH', email: SENDER_EMAIL() }, ...payload }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
  if (!BREVO_KEY() || !SENDER_EMAIL()) return reply(503, { error: 'Email is not configured yet.' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return reply(401, { error: 'Sign in required.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Bad request.' }); }

  let verified = false;
  try {
    if (!(await verifyAdmin(token))) return reply(403, { error: 'Admins only.' });
    verified = true;
    if (!EMAIL_RE.test(SENDER_EMAIL())) return reply(502, { error: `SENDER_EMAIL in the host settings is not a valid email: "${SENDER_EMAIL()}". Re-enter it exactly as verified in Brevo.` });

    if (body.type === 'status') {
      const inno = await fsGet(`innovations/${encodeURIComponent(String(body.innovationId || ''))}`, token);
      if (!inno) return reply(404, { error: 'Innovation not found.' });
      const user = await fsGet(`users/${encodeURIComponent(str(inno, 'userId'))}`, token);
      const to = str(user, 'email');
      if (!to) return reply(200, { sent: 0 });
      const status = str(inno, 'status');
      if (!status || status === 'draft' || status === 'submitted') return reply(200, { sent: 0 });
      const label = STATUS_LABELS[status] || status;
      const ref = str(inno, 'referenceNumber');
      await brevo({
        to: [{ email: to, name: str(user, 'fullName') || undefined }],
        subject: `GITH update: ${label}${ref ? ` (${ref})` : ''}`,
        htmlContent: `<p>Hello ${esc(str(user, 'fullName'))},</p>` +
          `<p>Your innovation <strong>${esc(str(inno, 'innovationName'))}</strong>${ref ? ` (${esc(ref)})` : ''} is now: <strong>${esc(label)}</strong>.</p>` +
          (status === 'returned' && str(inno, 'returnReason') ? `<p>Reason: ${esc(str(inno, 'returnReason'))}</p>` : '') +
          '<p>Sign in to your dashboard for details.</p><p>DICON GITH</p>',
      });
      return reply(200, { sent: 1 });
    }

    if (body.type === 'announcement') {
      const title = String(body.title || '').slice(0, 100);
      const message = String(body.message || '').slice(0, 2000);
      const ids = Array.isArray(body.recipientIds) ? [...new Set(body.recipientIds.map(String))].slice(0, MAX_RECIPIENTS) : [];
      if (!title || !message || !ids.length) return reply(400, { error: 'Title, message and recipients are required.' });

      const people = [];
      for (let i = 0; i < ids.length; i += 100) {
        const r = await fetch(`${FS}:batchGet`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents: ids.slice(i, i + 100).map((id) => `projects/${PROJECT_ID}/databases/(default)/documents/users/${id}`) }),
        });
        if (!r.ok) continue;
        (await r.json()).forEach((row) => { if (row.found && str(row.found, 'email')) people.push({ email: str(row.found, 'email'), name: str(row.found, 'fullName') }); });
      }
      if (!people.length) return reply(200, { sent: 0 });

      await brevo({
        subject: `GITH announcement: ${title}`,
        htmlContent: `<p>Hello {{params.name}},</p><p><strong>${esc(title)}</strong></p><p>${esc(message)}</p>` +
          '<p>Sign in to your dashboard for details.</p><p>DICON GITH</p>',
        messageVersions: people.map((p) => ({ to: [{ email: p.email, name: p.name || undefined }], params: { name: p.name || '' } })),
      });
      return reply(200, { sent: people.length });
    }

    return reply(400, { error: 'Unknown type.' });
  } catch (e) {
    console.error('send-email failed:', e.message);
    // Only a verified admin sees the technical reason (e.g. Brevo's message about the sender).
    return reply(502, { error: verified ? String(e.message || 'unknown error').slice(0, 240) : 'Could not verify your sign-in with Firebase.' });
  }
};
