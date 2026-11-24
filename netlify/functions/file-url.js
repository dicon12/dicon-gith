/**
 * Netlify entry point. The implementation is shared with Vercel: see api/_lib/file-url.js.
 */
exports.handler = require('../../api/_lib/file-url.js').handler;
