/**
 * Vercel entry point for /api/file-url (also reachable as /.netlify/functions/file-url, see vercel.json).
 * The implementation is shared with Netlify: see api/_lib/file-url.js.
 */
module.exports = require('./_lib/vercel-adapter.js')(require('./_lib/file-url.js').handler);
