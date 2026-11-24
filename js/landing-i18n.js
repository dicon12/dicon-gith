/**
 * DICON GITH — landing page extras: language switcher (EN / Hausa / Yorùbá / Igbo),
 * light/dark theme, and the live "innovations submitted" counter.
 * NOTE: Hausa, Yoruba and Igbo strings are first-pass translations and should be
 * reviewed by native speakers before launch.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // ---------- Theme ----------
  const root = document.documentElement;
  const applyTheme = t => { root.setAttribute('data-theme', t); const b = $('.theme-toggle'); if (b) { b.textContent = t === 'dark' ? '☀️' : '🌙'; b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); } };
  const preferred = get('gith_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(preferred);

  // ---------- Translations (selector -> [en, ha, yo, ig]); English is read from the page ----------
  const T = {
    '.nav-links li:nth-child(1) a, #mobile-drawer a:nth-child(1)': ['Home', 'Gida', 'Ilé', 'Ụlọ'],
    '.nav-links li:nth-child(2) a, #mobile-drawer a:nth-child(2)': ['Innovation Areas', 'Fannonin Kirkire-kirkire', 'Àwọn Agbègbè Ìṣẹ̀dá', 'Ebe Ihe Ọhụrụ'],
    '.nav-links li:nth-child(3) a, #mobile-drawer a:nth-child(3)': ['How It Works', 'Yadda Take Aiki', 'Bí Ó Ṣe Ń Ṣiṣẹ́', 'Otú Ọ Si Arụ Ọrụ'],
    '.nav-links li:nth-child(4) a, #mobile-drawer a:nth-child(4)': ['Partners', 'Abokan Hulɗa', 'Àwọn Alájọṣepọ̀', 'Ndị Mmekọ'],
    '.nav-links li:nth-child(5) a, #mobile-drawer a:nth-child(5)': ['Opportunities', 'Dama', 'Àwọn Àǹfààní', 'Ohere'],
    '.nav-links li:nth-child(6) a': ['FAQ', 'Tambayoyi', 'Àwọn Ìbéèrè', 'Ajụjụ'],
    '.nav-links li:nth-child(7) a, #mobile-drawer a:nth-child(6)': ['Contact', 'Tuntuɓe Mu', 'Kàn Sí Wa', 'Kpọtụrụ Anyị'],
    '.header-login-link': ['Login', 'Shiga', 'Wọlé', 'Banye'],
    '.hero-headline': ['Great ideas can come from anywhere.', 'Manyan ra’ayoyi na iya fitowa daga ko’ina.', 'Àwọn èrò ńlá lè wá láti ibikíbi.', 'Echiche ukwu nwere ike si ebe ọ bụla.'],
    '.hero-cta-group .btn-landing-primary span': ['Submit Your Innovation', 'Aika Kirkirarka', 'Fi Ìṣẹ̀dá Rẹ Ránṣẹ́', 'Zipu Ihe Mepụtara Gị'],
    '.rot-label': ['Calling all Nigerian', 'Muna kiran duk ’yan Najeriya', 'Ẹ̀ pè gbogbo ará Nàìjíríà', 'Na-akpọ ndị Naịjirịa niile'],
    '.impact-item:nth-child(1) .impact-label': ['States & FCT', 'Jihohi da FCT', 'Àwọn Ìpínlẹ̀ àti FCT', 'Steeti na FCT'],
    '.impact-item:nth-child(2) .impact-label': ['Local Governments', 'Kananan Hukumomi', 'Àwọn Ìjọba Ìbílẹ̀', 'Ọchịchị Obodo'],
    '.cta-headline': ['Your idea deserves to be seen.', 'Ra’ayinka ya cancanci a gani.', 'Èrò rẹ yẹ kí a rí i.', 'Echiche gị kwesịrị ka a hụ ya.'],
    '.section-faq .section-title': ['Questions, answered.', 'Amsoshin tambayoyi.', 'Àwọn ìdáhùn sí ìbéèrè.', 'Azịza ajụjụ.'],
  };
  const LANGS = { en: 0, ha: 1, yo: 2, ig: 3 };
  const names = { en: 'English', ha: 'Hausa', yo: 'Yorùbá', ig: 'Igbo' };
  const originals = new Map();
  Object.keys(T).forEach(sel => $$(sel).forEach(el => originals.set(el, el.textContent)));

  function setLang(code) {
    const i = LANGS[code] ?? 0;
    Object.entries(T).forEach(([sel, arr]) => $$(sel).forEach(el => {
      // keep an SVG/icon child intact: only swap when the element is a pure-text node holder
      el.textContent = i === 0 ? (originals.get(el) ?? arr[0]) : arr[i];
    }));
    root.lang = code;
    set('gith_lang', code);
    const sel = $('.lang-select'); if (sel) sel.value = code;
  }

  // ---------- Header controls ----------
  const actions = $('.header-actions');
  if (actions && !$('.header-tools')) {
    const tools = document.createElement('div');
    tools.className = 'header-tools';
    tools.innerHTML = `<select class="lang-select" aria-label="Language">${Object.keys(LANGS).map(c => `<option value="${c}">${names[c]}</option>`).join('')}</select>` +
      `<button class="theme-toggle" type="button"></button>`;
    actions.prepend(tools);
    $('.lang-select', tools).addEventListener('change', e => setLang(e.target.value));
    $('.theme-toggle', tools).addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next); set('gith_theme', next);
    });
    applyTheme(root.getAttribute('data-theme'));
    // phone drawer copy
    const drawer = $('#mobile-drawer');
    if (drawer) {
      const d = document.createElement('div'); d.className = 'drawer-tools';
      d.innerHTML = `<select class="lang-select drawer-lang" aria-label="Language">${Object.keys(LANGS).map(c => `<option value="${c}">${names[c]}</option>`).join('')}</select><button class="theme-toggle drawer-theme" type="button">🌙</button>`;
      drawer.appendChild(d);
      $('.drawer-lang', d).addEventListener('change', e => setLang(e.target.value));
      $('.drawer-theme', d).addEventListener('click', () => $('.header-tools .theme-toggle').click());
    }
  }
  const savedLang = get('gith_lang');
  if (savedLang && LANGS[savedLang]) setLang(savedLang);

  // ---------- Live submissions counter (publicStats/summary, kept current by the admin dashboard) ----------
  const grid = $('.impact-grid');
  if (grid) {
    const url = 'https://firestore.googleapis.com/v1/projects/dicon-gith-e7c7e/databases/(default)/documents/publicStats/summary';
    fetch(url).then(r => r.ok ? r.json() : null).then(doc => {
      const n = doc && doc.fields && Number(doc.fields.submissions && doc.fields.submissions.integerValue);
      if (!n || n < 1) return;
      const item = document.createElement('div');
      item.className = 'impact-item fx-reveal is-visible';
      item.innerHTML = `<div class="impact-number" data-count="${n}">0</div><div class="impact-label">Innovations Submitted</div>`;
      grid.prepend(item);
      // animate
      const el = $('.impact-number', item); const t0 = performance.now();
      const tick = now => { const p = Math.min((now - t0) / 1400, 1); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }).catch(() => {});
  }
})();
