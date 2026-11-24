/**
 * Vercel entry point for /api/send-email (also reachable as /.netlify/functions/send-email, see vercel.json).
 * The implementation is shared with Netlify: see api/_lib/send-email.js.
 */
module.exports = require('./_lib/vercel-adapter.js')(require('./_lib/send-email.js').handler);
