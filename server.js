const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

// Sensitive files and directories that should never be publicly served
const BLOCKED_PATHS = [
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/.git',
  '/.env',
  '/node_modules',
  '/tests',
  '/seed',
  '/functions',
  '/netlify',
  '/api',
  '/netlify.toml',
  '/dockerfile',
  '/vercel.json',
  '/firebase.json',
  '/firestore.rules',
  '/storage.rules',
  '/firestore.indexes.json',
  '/_redirects',
  '/_headers',
  // Internal documents for DICON (sent directly, not published). Lowercase: isBlocked compares lowercased paths.
  '/approval-pack.html',
  '/cost-note.html',
  '/docs/dicon-gith-approval-pack.pdf',
  '/docs/dicon-gith-cost-note.pdf'
];

function isBlocked(reqPath) {
  const lower = reqPath.toLowerCase();
  // Dotfiles (.env, .firebaserc, .gitignore, ...) and Markdown notes are never served.
  if (lower.split('/').some(seg => seg.startsWith('.')) || lower.endsWith('.md')) return true;
  return BLOCKED_PATHS.some(blocked => lower === blocked || lower.startsWith(blocked + '/'));
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '';
  if (rawUrl.includes('..') || rawUrl.toLowerCase().includes('%2e')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden: Traversal Attempt Detected');
    return;
  }

  // Normalize path
  // decodeURI throws on malformed escapes such as a lone "%"; answer 400 instead of crashing the server.
  let reqPath;
  try {
    reqPath = decodeURI(rawUrl.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  // Route aliases
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  } else if (reqPath === '/login') {
    reqPath = '/login.html';
  } else if (reqPath === '/register') {
    reqPath = '/register.html';
  } else if (reqPath === '/about') {
    reqPath = '/about.html';
  } else if (reqPath === '/partner') {
    reqPath = '/partner.html';
  } else if (reqPath === '/forgot-password') {
    reqPath = '/forgot-password.html';
  } else if (reqPath === '/admin-guide') {
    reqPath = reqPath + '.html';
  } else if (reqPath === '/dashboard' || reqPath.startsWith('/dashboard/')) {
    reqPath = '/dashboard.html';
  } else if (reqPath === '/admin' || reqPath.startsWith('/admin/')) {
    reqPath = '/admin.html';
  } else if (reqPath === '/app' || reqPath.startsWith('/app/')) {
    reqPath = '/dashboard.html';
  }

  // Security check: block internal source code & configs
  if (isBlocked(reqPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Access Denied');
    return;
  }

  const filePath = path.resolve(PUBLIC_DIR, '.' + reqPath);

  // Security: prevent path traversal outside project directory
  if (!filePath.toLowerCase().startsWith(PUBLIC_DIR.toLowerCase())) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routes if not an asset
      const ext = path.extname(reqPath);
      if (!ext || ext === '.html') {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (indexErr, content) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
          } else {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'SAMEORIGIN',
              'Referrer-Policy': 'strict-origin-when-cross-origin',
              'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
            });
            res.end(content);
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
              'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`DICON GITH Server running at http://localhost:${PORT}`);
  });
}

module.exports = server;
