/**
 * Netlify entry point. The implementation is shared with Vercel: see api/_lib/upload-url.js.
 */
exports.handler = require('../../api/_lib/upload-url.js').handler;
