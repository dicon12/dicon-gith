/**
 * Runs a Netlify-style handler ({ httpMethod, headers, body } -> { statusCode, headers, body })
 * as a Vercel Node function ((req, res) => void), so both hosts share one implementation.
 *
 * Files under api/_lib are not deployed as functions by Vercel (leading underscore).
 */
function rawBody(req) {
  // Vercel parses JSON bodies into req.body; reading it throws if the JSON is malformed.
  let body;
  try { body = req.body; } catch (e) { return '{'; } // let the handler answer 400 "Bad request."
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return JSON.stringify(body);
}

module.exports = function fromNetlify(handler) {
  return async (req, res) => {
    let out;
    try {
      out = await handler({ httpMethod: req.method, headers: req.headers || {}, body: rawBody(req) });
    } catch (e) {
      console.error('function failed:', e && e.message);
      out = { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server error.' }) };
    }
    res.statusCode = out.statusCode || 200;
    Object.entries(out.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader('Cache-Control', 'no-store');
    res.end(out.body || '');
  };
};
