/**
 * DICON GITH — landing page motion & interactions (no dependencies).
 * Scroll progress, header state, scrollspy, reveal-on-scroll, animated counters,
 * hero keyword rotator, FAQ accordion, back-to-top, button ripple, subtle hero parallax.
 */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- Scroll progress, header, back-to-top ----------
  const bar = $('.scroll-progress');
  const header = $('.site-header');
  const toTop = $('.back-to-top');
  const pipeline = $('.pipeline');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const y = scrollY;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
      if (header) header.classList.toggle('is-scrolled', y > 12);
      if (toTop) toTop.classList.toggle('is-shown', y > 700);
      updatePipelineLine();
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  if (toTop) toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

  // ---------- Scrollspy ----------
  const links = $$('.nav-links .nav-link').filter(a => (a.getAttribute('href') || '').length > 1 && a.getAttribute('href').startsWith('#'));
  const sections = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => spy.observe(s));
  }

  // ---------- Reveal on scroll (auto-tags common blocks, staggers siblings) ----------
  const targets = [
    ['.section-header-centered', ''], ['.area-card', ''], ['.journey-step-card', ''],
    ['.participant-card', 'fx-zoom'], ['.partner-card', 'fx-zoom'], ['.partner-flagship-card', ''],
    ['.spotlight-card', ''], ['.cta-box', 'fx-zoom'], ['.about-content', 'fx-left'],
    ['.editorial-image, .about-image, .editorial-visual', 'fx-right'],
    ['.impact-item', ''], ['.pipeline-stage', ''], ['.faq-item', ''],
  ];
  const revealEls = [];
  targets.forEach(([sel, variant]) => $$(sel).forEach(el => {
    if (el.classList.contains('fx-reveal')) return;
    el.classList.add('fx-reveal');
    if (variant) el.classList.add(variant);
    const sibs = el.parentElement ? Array.from(el.parentElement.children).filter(c => c.matches(sel)) : [];
    el.style.setProperty('--fx-delay', Math.min(sibs.indexOf(el), 6) * 90 + 'ms');
    revealEls.push(el);
  }));
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries, o) => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); o.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // ---------- Animated counters ----------
  const count = el => {
    const end = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (reduce || isNaN(end)) { el.textContent = end.toLocaleString() + suffix; return; }
    const dur = 1600, t0 = performance.now();
    const tick = now => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const counters = $$('[data-count]');
  if ('IntersectionObserver' in window) {
    const co = new IntersectionObserver((es, o) => es.forEach(e => {
      if (e.isIntersecting) { count(e.target); o.unobserve(e.target); }
    }), { threshold: 0.6 });
    counters.forEach(c => co.observe(c));
  } else counters.forEach(count);

  // ---------- Pipeline progress line ----------
  function updatePipelineLine() {
    if (!pipeline) return;
    const r = pipeline.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (innerHeight * 0.8 - r.top) / (r.height + innerHeight * 0.2)));
    pipeline.style.setProperty('--line', (p * 100).toFixed(1) + '%');
  }

  // ---------- Hero keyword rotator ----------
  const rot = $('.rot-word');
  if (rot && !reduce) {
    const words = (rot.dataset.words || '').split('|').filter(Boolean);
    let i = 0;
    if (words.length > 1) setInterval(() => {
      rot.classList.add('is-out');
      setTimeout(() => { i = (i + 1) % words.length; rot.textContent = words[i]; rot.classList.remove('is-out'); }, 350);
    }, 2400);
  }

  // ---------- FAQ accordion (one open at a time, keyboard accessible) ----------
  $$('.faq-item').forEach(item => {
    const btn = $('.faq-q', item);
    btn?.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      $$('.faq-item.is-open').forEach(o => { o.classList.remove('is-open'); $('.faq-q', o)?.setAttribute('aria-expanded', 'false'); });
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  // ---------- Hero collage mouse parallax (desktop only) ----------
  const hero = $('.hero-collage-wrapper');
  if (hero && !reduce && matchMedia('(hover:hover) and (min-width: 900px)').matches) {
    const heroSection = $('#hero');
    heroSection?.addEventListener('pointermove', e => {
      const r = heroSection.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      hero.style.transform = `translate(${x * 14}px, ${y * 10}px)`;
    });
    heroSection?.addEventListener('pointerleave', () => { hero.style.transform = ''; });
    hero.style.transition = 'transform .5s ease-out';
  }

  onScroll();
})();
