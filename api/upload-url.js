/**
 * Vercel entry point for /api/upload-url (also reachable as /.netlify/functions/upload-url, see vercel.json).
 * The implementation is shared with Netlify: see api/_lib/upload-url.js.
 */
module.exports = require('./_lib/vercel-adapter.js')(require('./_lib/upload-url.js').handler);
