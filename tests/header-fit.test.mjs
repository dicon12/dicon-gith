import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('every page with the public header loads the header-fit script', () => {
  for (const page of ['index.html', 'about.html', 'partner.html']) {
    const html = read(page);
    assert.match(html, /class="site-header"/, page);
    assert.match(html, /<script src="\/js\/header-fit\.js" defer><\/script>/, page);
  }
});

test('header items do not shrink, so a header that does not fit shows up as overflow', () => {
  const css = read('css/landing.css');
  assert.match(css, /\.header-container > \* \{ flex-shrink: 0; \}/);
  for (const level of ['hf-1', 'hf-2', 'hf-3', 'hf-4']) assert.match(css, new RegExp(`\\.site-header\\.${level} `), level);
  // The old guessed breakpoints are gone (they let the logo overlap the menu at 1366px).
  assert.doesNotMatch(read('css/animations.css'), /max-width: 1360px\) \{ \.nav-links/);
});

test('header-fit steps through the levels in order and does not rely on animation frames', () => {
  const js = read('js/header-fit.js');
  assert.match(js, /var LEVELS = \['hf-1', 'hf-2', 'hf-3', 'hf-4'\];/);
  assert.match(js, /setTimeout\(fit, 30\)/);
  assert.doesNotMatch(js, /requestAnimationFrame\(/);
});
