/**
 * DICON GITH - keeps the public site header on one line at any width and in any language.
 * Instead of guessing breakpoints, it measures: if the header does not fit, it steps down
 * until it does:
 *   1 (hf-1) tighter spacing, no "Grassroot Innovations" subtitle
 *   2 (hf-2) hide the extra "About" header link (still in the footer and the menu drawer)
 *   3 (hf-3) fold the page links into the ☰ menu drawer
 *   4 (hf-4) hide "Login" in the header too (it is in the drawer)
 * It re-checks when the window resizes, fonts load, or the language changes the link text.
 */
(function () {
  var LEVELS = ['hf-1', 'hf-2', 'hf-3', 'hf-4'];

  function init() {
    var header = document.querySelector('.site-header');
    var bar = header && header.querySelector('.header-container');
    if (!bar) return;
    var drawer = document.getElementById('mobile-drawer');
    var menuBtn = document.getElementById('btn-mobile-menu');
    var pending = false;

    function fits() {
      // Items do not shrink (see CSS), so anything that does not fit shows up as overflow.
      return bar.scrollWidth <= bar.clientWidth + 1;
    }

    function fit() {
      pending = false;
      header.classList.remove.apply(header.classList, LEVELS);
      var level = 0;
      while (!fits() && level < LEVELS.length) header.classList.add(LEVELS[level++]);
      header.classList.add('hf-ready');
      // Back to the full menu: close the drawer if it was left open.
      if (level < 3 && drawer && drawer.classList.contains('active')) {
        drawer.classList.remove('active');
        if (menuBtn) menuBtn.textContent = '☰';
      }
    }

    function later() {
      if (pending) return;
      pending = true;
      // A short timer, not requestAnimationFrame: frames are paused in background tabs, which left
      // the header in the wrong state after a resize there.
      setTimeout(fit, 30);
    }

    fit();
    window.addEventListener('resize', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(later);
      // Text changes (language switch) and the language/theme controls being added change these sizes.
      ro.observe(bar); // the bar's own width follows the window
      bar.querySelectorAll('.header-brand, .nav-links, .header-actions').forEach(function (el) { ro.observe(el); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
