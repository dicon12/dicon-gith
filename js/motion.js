/* DICON GITH — liquid, movable-screen motion layer v2. Safe to load on every page (no dependencies). */
(function () {
  if (window.__ghMotion) return; window.__ghMotion = true;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.querySelector('link[href*="motion.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/motion.css'; document.head.appendChild(l); }
  if (reduce) return;
  var lite = /\/(dashboard|admin|app|evaluator|mentor)(\.html)?$/.test(location.pathname);
  var coarse = matchMedia('(pointer: coarse)').matches;
  var root = document.documentElement;
  var store = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} } };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  function start() {
    root.classList.add('mv-on'); if (lite) { root.classList.add('mv-lite'); document.body.classList.add('mv-lite'); } else root.classList.add('mv-full');
    var W = innerWidth, H = innerHeight;

    /* 1. liquid background blobs that follow finger / mouse / phone tilt */
    var bg = document.createElement('div'); bg.className = 'lq-bg'; bg.setAttribute('aria-hidden', 'true');
    var n = coarse ? 3 : 4; for (var i = 1; i <= n; i++) bg.insertAdjacentHTML('beforeend', '<div class="lq-blob lq-b' + i + '"><i></i></div>');
    document.body.appendChild(bg);


    /* 1b. looping background video (soft, muted, behind everything). falls back to the blobs if it can't play */
    var saver = navigator.connection && navigator.connection.saveData;
    if (!saver) {
      var v = document.createElement('video'); v.className = 'lq-video'; v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1; v.disablePictureInPicture = true; v.preload = 'auto'; v.src = '/assets/bg-loop.mp4';
      document.body.insertBefore(v, bg);
      var ok = v.play(); var good = function () { root.classList.add('mv-vid'); };
      v.addEventListener('playing', good, { once: true });
      if (ok && ok.catch) ok.catch(function () { v.remove(); });
      v.addEventListener('error', function () { v.remove(); root.classList.remove('mv-vid'); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) v.pause(); else v.play().catch(function () {}); });
    }
    var tx = 0, ty = 0, cx = 0, cy = 0, mxp = W / 2, myp = H / 2;
    function aim(x, y) { mxp = x; myp = y; tx = (x / W - .5) * 150; ty = (y / H - .5) * 150; }
    addEventListener('mousemove', function (e) { aim(e.clientX, e.clientY); }, { passive: true });
    addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t) aim(t.clientX, t.clientY); }, { passive: true });
    addEventListener('resize', function () { W = innerWidth; H = innerHeight; });
    addEventListener('deviceorientation', function (e) { if (e.gamma == null) return; tx = clamp(e.gamma / 35, -1, 1) * 110; ty = clamp((e.beta - 40) / 35, -1, 1) * 110; }, { passive: true });

    /* scroll velocity -> liquid skew / stretch */
    var lastY = scrollY, vel = 0, skew = 0;
    addEventListener('scroll', function () {
      var y = scrollY; vel += (y - lastY); lastY = y;
      bg.style.setProperty('--sy', ((y / Math.max(1, document.body.scrollHeight - H)) * 90 - 45).toFixed(1) + 'px');
    }, { passive: true });

    /* 2. liquid (gooey) cursor trail — fine pointers only */
    var trail = [];
    if (false) {
      document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="lq-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"/></filter></defs></svg><div class="lq-cursor" aria-hidden="true"></div>');
      var cur = document.querySelector('.lq-cursor');
      for (var k = 0; k < 9; k++) { var d = document.createElement('i'); var s = 22 - k * 1.7; d.style.width = d.style.height = s + 'px'; d.style.margin = (-s / 2) + 'px 0 0 ' + (-s / 2) + 'px'; d.style.background = k % 2 ? '#C9A227' : '#0A5C36'; cur.appendChild(d); trail.push({ el: d, x: -100, y: -100, f: .34 - k * .028 }); }
      document.addEventListener('mouseover', function (e) { cur.classList.toggle('lq-big', !!e.target.closest('a,button,[role=button],input,select,textarea,label,summary')); });
      document.addEventListener('mouseleave', function () { cur.style.opacity = 0; }); document.addEventListener('mouseenter', function () { cur.style.opacity = 1; });
    }

    /* animation loop: background drift, cursor trail, scroll skew, parallax vars */
    (function loop() {
      cx += (tx - cx) * .06; cy += (ty - cy) * .06;
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > .3) { bg.style.setProperty('--mx', cx.toFixed(1) + 'px'); bg.style.setProperty('--my', cy.toFixed(1) + 'px'); }
      
      var px = mxp, py = myp; for (var j = 0; j < trail.length; j++) { var t = trail[j]; t.x += (px - t.x) * t.f; t.y += (py - t.y) * t.f; t.el.style.transform = 'translate3d(' + t.x.toFixed(1) + 'px,' + t.y.toFixed(1) + 'px,0)'; px = t.x; py = t.y; }
      if (!document.hidden) requestAnimationFrame(loop); else document.addEventListener('visibilitychange', function f() { document.removeEventListener('visibilitychange', f); loop(); });
    })();

    /* 3. tap ripple removed (no circle on tap) */

    /* 4. split headline text into animated words / letters */
    function splitWords(el) { if (!el || el.dataset.mvSplit) return; el.dataset.mvSplit = 1; var txt = el.textContent; el.setAttribute('aria-label', txt); el.textContent = ''; txt.split(/(\s+)/).forEach(function (w, i) { if (/^\s+$/.test(w) || !w) { el.appendChild(document.createTextNode(' ')); return; } var s = document.createElement('span'); s.className = 'mv-word'; s.setAttribute('aria-hidden', 'true'); s.textContent = w; s.style.setProperty('--w', i); el.appendChild(s); }); }
    function splitLetters(el) { if (!el || el.dataset.mvSplit) return; el.dataset.mvSplit = 1; var txt = el.textContent; el.setAttribute('aria-label', txt); el.textContent = ''; var idx = 0; txt.split(/(\s+)/).forEach(function (w) { if (/^\s+$/.test(w) || !w) { el.appendChild(document.createTextNode(' ')); return; } var word = document.createElement('span'); word.className = 'mv-nowrap'; word.setAttribute('aria-hidden', 'true'); w.split('').forEach(function (ch) { var s = document.createElement('span'); s.className = 'mv-letter'; s.textContent = ch; s.style.setProperty('--w', idx++); word.appendChild(s); }); el.appendChild(word); }); }
    

    /* 5. stagger form fields on sign-up / sign-in */
    document.querySelectorAll('.form-group,.auth-form-container>*').forEach(function (el, i) { el.style.setProperty('--i', Math.min(i, 12)); });
    // fields inside a freshly shown step re-stagger
    document.querySelectorAll('.reg-step-panel').forEach(function (p) {
      new MutationObserver(function () { if (!p.classList.contains('active')) return; p.querySelectorAll('.form-group,button').forEach(function (el, i) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; el.style.setProperty('--i', i); }); }).observe(p, { attributes: true, attributeFilter: ['class'] });
    });

    /* 6. rising bubbles in the brand panel (sign-up / sign-in) */
    document.querySelectorAll('.auth-brand-panel').forEach(function (p) {
      var wrap = document.createElement('div'); wrap.className = 'lq-bubbles'; wrap.setAttribute('aria-hidden', 'true');
      for (var b = 0; b < 6; b++) { var s = 10 + Math.random() * 46; wrap.insertAdjacentHTML('beforeend', '<i style="left:' + (Math.random() * 100).toFixed(0) + '%;width:' + s.toFixed(0) + 'px;height:' + s.toFixed(0) + 'px;animation-duration:' + (9 + Math.random() * 11).toFixed(1) + 's;animation-delay:-' + (Math.random() * 14).toFixed(1) + 's"></i>'); }
      p.insertBefore(wrap, p.firstChild);
    });

    /* 7. 3D tilt + glare on cards, magnetic buttons */
    var tiltSel = lite ? '.auth-brand-photo-card' : '.auth-brand-photo-card,.area-card,.journey-step-card,.participant-card,.partner-card,.partner-flagship-card,.spotlight-card,.content-card,.stat-card,.innovation-card';
    if (false) {
      document.querySelectorAll(tiltSel).forEach(function (el) {
        el.classList.add('mv-tilt');
        el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.setProperty('--ry', (x * 12).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-y * 12).toFixed(2) + 'deg'); el.style.setProperty('--gx', ((x + .5) * 100).toFixed(0) + '%'); el.style.setProperty('--gy', ((y + .5) * 100).toFixed(0) + '%'); });
        el.addEventListener('pointerleave', function () { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
      });
      var mags = [].slice.call(document.querySelectorAll('.btn-primary-action,.btn-secondary-action,.google-btn'));
      addEventListener('mousemove', function (e) { mags.forEach(function (b) { var r = b.getBoundingClientRect(); var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); var near = Math.abs(dx) < r.width / 2 + 40 && Math.abs(dy) < r.height / 2 + 40; b.style.translate = near ? (dx * .14).toFixed(1) + 'px ' + (dy * .22).toFixed(1) + 'px' : ''; }); }, { passive: true });
    }

    /* 8. success burst of liquid droplets (sign-up / sign-in / submit buttons) */
    function burst(el) {
      var r = el.getBoundingClientRect(), ox = r.left + r.width / 2, oy = r.top + r.height / 2, cols = ['#0A5C36', '#C9A227', '#2fb7a0', '#7bd88f', '#e4b93c'];
      for (var q = 0; q < 26; q++) { var d = document.createElement('span'); d.className = 'lq-drop'; var a = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 130, s = 7 + Math.random() * 11; d.style.cssText = 'left:' + ox + 'px;top:' + oy + 'px;width:' + s + 'px;height:' + s + 'px;background:' + cols[q % 5] + ';--dx:' + (Math.cos(a) * dist).toFixed(0) + 'px;--dy:' + (Math.sin(a) * dist - 40).toFixed(0) + 'px'; document.body.appendChild(d); setTimeout((function (x) { return function () { x.remove(); }; })(d), 1100); }
    }
    var bt = document.getElementById('btn-text');
    if (bt) new MutationObserver(function () { if (/created|welcome|redirect|success|signed in/i.test(bt.textContent)) { var b = bt.closest('button'); if (b) { b.classList.add('mv-success'); burst(b); } } }).observe(bt, { childList: true, characterData: true, subtree: true });
    window.ghBurst = burst;

    /* 9. scroll-reveal sections and cards */
    var sel = 'main section,section,.content-card,[class*="card"],.reg-step-actions,footer,h2,.partner-form-section';
    var items = [].slice.call(document.querySelectorAll(sel)).filter(function (el) { return !el.closest('.lq-bg,.gh-consent,.sidebar,aside,nav,[class*="modal"]') && !el.closest('.mv-reveal'); }).slice(0, 220);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('mv-in'); io.unobserve(e.target); } }); }, { threshold: .08, rootMargin: '0px 0px -6% 0px' });
      items.forEach(function (el, i) { var r = el.getBoundingClientRect(); if (r.top < H && r.bottom > 0 && lite) return; el.classList.add('mv-reveal'); el.style.setProperty('--mvd', (i % 4) * 90 + 'ms'); io.observe(el); });
    }

    /* 10. liquid page transitions between pages */
    var cv = document.createElement('div'); cv.className = 'lq-curtain'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv);
    var from = store.get('mv-tr'); store.del('mv-tr');
    if (from) { var p = from.split(','); cv.style.setProperty('--cx', p[0] + 'px'); cv.style.setProperty('--cy', p[1] + 'px'); cv.className = 'lq-curtain lq-open'; setTimeout(function () { cv.className = 'lq-curtain lq-out'; }, 650); }
    addEventListener('pageshow', function (e) { if (e.persisted) cv.className = 'lq-curtain'; });
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-legal')) return;
      var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
      if (u.origin !== location.origin || /^(mailto|tel):/.test(a.getAttribute('href')) || (u.pathname === location.pathname && u.search === location.search)) return;
      e.preventDefault(); var x = e.clientX || W / 2, y = e.clientY || H / 2;
      cv.style.setProperty('--cx', x + 'px'); cv.style.setProperty('--cy', y + 'px'); cv.className = 'lq-curtain lq-in'; store.set('mv-tr', x + ',' + y);
      setTimeout(function () { location.href = u.href; }, 560);
    });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
