/**
 * DICON GITH - first-visit guide (plain script, no libraries).
 * Highlights one button at a time. Shown once per page on each device (remembered in localStorage),
 * and removed from the page completely when finished or skipped. Add ?tour=1 to a page address to see it again.
 * Visitors (not signed in) get it on the public pages; signed-in users get their own guide on their portal page.
 */
(function () {
  var KEY = 'dicon_guide_seen_v1:';
  var path = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/';
  var page = path === '/' || path === '/index' ? 'home' : path.split('/').pop();
  var S = function (id) { return '[data-view="' + id + '"]'; };
  var MENU = '#btn-mobile-menu';
  var TOURS = {
    home: [
      { t: ['#header-register-link', MENU], h: 'Create your account', x: 'Tap Register to open your free innovator account. You need one to submit an innovation.' },
      { t: ['a.header-login-link[href="/login"]', MENU], h: 'Already registered?', x: 'Use Login to come back to your dashboard and track your application.' },
      { t: ['a.nav-link[href="#how-it-works"]'], h: 'How it works', x: 'See the stages every innovation goes through, from submission to incubation.' },
      { t: ['a.nav-link[href="/partner"]'], h: 'Want to support innovators?', x: 'Organisations and sponsors can send a partnership request here.' },
      { t: ['a.nav-link[href="#faq"]'], h: 'Questions', x: 'The FAQ answers who can apply and what to prepare.' }
    ],
    login: [
      { t: ['#google-btn'], h: 'Sign in with Google', x: 'The quickest way in, if your account uses Google.' },
      { t: ['#submit-btn'], h: 'Sign in with email', x: 'Type your email and password, then tap here.' },
      { t: ['a[href="/forgot-password"]'], h: 'Forgot your password?', x: 'We will send a reset link to your email.' },
      { t: ['a[href="/register"]'], h: 'New here?', x: 'Create your account first.' }
    ],
    register: [
      { t: ['#google-btn'], h: 'Register with Google', x: 'Skip the form with your Google account.' },
      { t: ['#btn-next-step'], h: 'Fill in step by step', x: 'Complete each step, then tap Next. Your details stay private.' }
    ],
    dashboard: [
      { t: [MENU.replace('btn-mobile-menu', 'mobile-sidebar-toggle')], h: 'Menu', x: 'Open this menu to move around your portal.', mobile: true },
      { t: [S('view-profile')], side: 1, h: 'Your profile', x: 'Add your photo, skills and contact details. A complete profile helps reviewers.' },
      { t: ['#btn-quick-submit', S('view-submit')], side: 1, h: 'Submit an innovation', x: 'Start here. The form saves as you go, so you can finish later from Drafts.' },
      { t: [S('view-innovations')], side: 1, h: 'My applications', x: 'All your submissions and their reference numbers.' },
      { t: [S('view-tracking')], side: 1, h: 'Track progress', x: 'See which stage your application has reached.' },
      { t: [S('view-notifications')], side: 1, h: 'Notifications', x: 'Messages from DICON appear here, for example if something must be corrected.' },
      { t: ['#sidebar-logout-btn'], side: 1, h: 'Sign out', x: 'Always sign out when you use a shared phone or computer.' }
    ],
    admin: [
      { t: ['#mobile-sidebar-toggle'], h: 'Menu', x: 'Open this menu to reach every admin section.', mobile: true },
      { t: ['[data-filter="submitted"]'], side: 1, h: 'New submissions', x: 'Start here. Open an application to review it and move it to the next stage.' },
      { t: [S('admin-view-applications') + '[data-filter="all"]'], side: 1, h: 'All applications', x: 'Filter by stage, search, and open any application.' },
      { t: [S('admin-view-phase2')], side: 1, wait: 1, h: 'Evaluation Workspace', x: 'Assign evaluators, publish events and announcements, add mentors and showcase entries, and give roles.' },
      { t: [S('admin-view-partners')], side: 1, h: 'Partner requests', x: 'Respond to organisations that want to partner with DICON.' },
      { t: [S('admin-view-matching')], side: 1, h: 'Sponsor matching', x: 'Match recommended innovations with interested sponsors.' },
      { t: [S('admin-view-settings')], side: 1, h: 'Policies and content', x: 'Edit the public text and system policies.' },
      { t: ['#admin-logout-btn'], side: 1, h: 'Sign out', x: 'Sign out when you finish. The full Admin Guide is at /admin-guide.' }
    ],
    evaluator: [
      { t: ['#app'], h: 'Your assignments', x: 'Innovations assigned to you appear here. Open one to read it and fill the score sheet.' },
      { t: ['#logout'], h: 'Sign out', x: 'Sign out when you finish.' }
    ],
    mentor: [
      { t: ['#app'], h: 'Your mentees', x: 'Innovations assigned to you appear here. Open one to add guidance notes.' },
      { t: ['#logout'], h: 'Sign out', x: 'Sign out when you finish.' }
    ],
    partner: [
      { t: ['#pf-submit', 'form'], h: 'Send a partnership request', x: 'Fill in the form and send it. The DICON team will contact you.' }
    ]
  };

  var steps = TOURS[page];
  if (!steps) return;
  var key = KEY + page, replay = /[?&]tour=1\b/.test(location.search);
  try { if (!replay && localStorage.getItem(key)) return; } catch (e) { return; } // no storage: never nag

  var vis = function (el) { if (!el) return false; var r = el.getBoundingClientRect(); var cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  var find = function (list) { for (var i = 0; i < list.length; i++) { var el = document.querySelector(list[i]); if (vis(el)) return el; } return null; };
  var sidebar = function () { return document.getElementById('dashboard-sidebar'); };
  var isMobile = function () { var b = document.getElementById('mobile-sidebar-toggle'); return !!b && vis(b); };

  var i = -1, spot, card, block, opened = false, active = [];

  function resolve() {
    var out = [];
    steps.forEach(function (s) {
      if (s.mobile && !isMobile()) return;
      if (s.side && isMobile() && sidebar() && !sidebar().classList.contains('mobile-open')) { // open the menu so its items can be shown
        document.getElementById('mobile-sidebar-toggle').click(); opened = true;
      }
      var el = find(s.t); if (el) out.push({ el: el, s: s });
    });
    return out;
  }

  function setSidebar(open) {
    var sb = sidebar(); if (!sb || !isMobile()) return;
    var on = sb.classList.contains('mobile-open');
    if (on !== open) document.getElementById('mobile-sidebar-toggle').click();
  }

  function finish() {
    try { localStorage.setItem(key, '1'); } catch (e) {}
    if (opened) setSidebar(false);
    [spot, card, block].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    var l = document.getElementById('gt-css'); if (l && l.parentNode) l.parentNode.removeChild(l);
    document.removeEventListener('keydown', onKey);
  }

  function place() {
    var a = active[i]; if (!a) return;
    var r = a.el.getBoundingClientRect(), p = 6;
    spot.style.top = (r.top - p) + 'px'; spot.style.left = (r.left - p) + 'px';
    spot.style.width = (r.width + p * 2) + 'px'; spot.style.height = (r.height + p * 2) + 'px';
    if (window.innerWidth > 600) {
      var ch = card.offsetHeight, below = r.bottom + 14 + ch < window.innerHeight;
      card.style.top = Math.max(10, below ? r.bottom + 14 : r.top - ch - 14) + 'px';
      card.style.left = Math.min(Math.max(10, r.left), window.innerWidth - card.offsetWidth - 10) + 'px';
    }
  }

  function show(n) {
    i = n;
    if (i >= active.length) return finish();
    var a = active[i], s = a.s;
    if (s.side) setSidebar(true); else if (opened) setSidebar(false);
    a.el.scrollIntoView({ block: 'center', inline: 'nearest' });
    card.innerHTML = '<h4></h4><p></p><div class="gt-row"><span class="gt-count"></span>' +
      '<button class="gt-skip" type="button">Skip</button>' +
      (i ? '<button class="gt-btn" data-b="1" type="button">Back</button>' : '') +
      '<button class="gt-btn gt-go" data-n="1" type="button">' + (i === active.length - 1 ? 'Done' : 'Next') + '</button></div>';
    card.querySelector('h4').textContent = s.h; card.querySelector('p').textContent = s.x;
    card.querySelector('.gt-count').textContent = (i + 1) + ' of ' + active.length;
    card.querySelector('.gt-skip').onclick = finish;
    card.querySelector('[data-n]').onclick = function () { show(i + 1); };
    var b = card.querySelector('[data-b]'); if (b) b.onclick = function () { show(i - 1); };
    setTimeout(place, 60); place();
  }
  function onKey(e) { if (e.key === 'Escape') finish(); else if (e.key === 'ArrowRight') show(i + 1); else if (e.key === 'ArrowLeft' && i > 0) show(i - 1); }

  function start() {
    active = resolve(); if (!active.length) return; // nothing to point at: show nothing
    var css = document.createElement('link'); css.id = 'gt-css'; css.rel = 'stylesheet'; css.href = '/css/tour.css'; document.head.appendChild(css);
    block = document.createElement('div'); block.className = 'gt-block';
    spot = document.createElement('div'); spot.className = 'gt-spot';
    card = document.createElement('div'); card.className = 'gt-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
    document.body.appendChild(block); document.body.appendChild(spot); document.body.appendChild(card);
    try { localStorage.setItem(key, '1'); } catch (e) {} // counted as seen as soon as it appears
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('keydown', onKey);
    css.onload = function () { show(0); }; setTimeout(function () { if (i < 0) show(0); }, 400);
  }

  // Wait until the page is really ready (signed-in portals render after login check), up to 12 s.
  var tries = 0, wantLate = steps.some(function (s) { return s.wait; });
  (function wait() {
    tries++;
    var first = find(steps.filter(function (s) { return !s.mobile; })[0].t) || (isMobile() && find(steps[0].t));
    var late = !wantLate || document.querySelector(S('admin-view-phase2')) || tries > 20;
    if (first && late && !document.querySelector('.modal-open,.confirm-modal.active')) return setTimeout(start, 500);
    if (tries < 40) setTimeout(wait, 300);
  })();
})();
