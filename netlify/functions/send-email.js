/**
 * Netlify entry point. The implementation is shared with Vercel: see api/_lib/send-email.js.
 */
exports.handler = require('../../api/_lib/send-email.js').handler;
