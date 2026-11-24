/* Consent-based, anonymous analytics (Google Analytics 4). Off until the visitor accepts. */
(function () {
  var ID = 'G-S6JNM0YMXJ', KEY = 'gith_analytics_consent';
  var choice; try { choice = localStorage.getItem(KEY); } catch (e) {}
  window.ghTrack = function (name, params) { if (window.gtag && choice === 'yes') window.gtag('event', name, params || {}); };
  function load() {
    window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID; document.head.appendChild(s);
  }
  function ask() {
    var b = document.createElement('div'); b.className = 'gh-consent'; b.setAttribute('role', 'dialog');
    b.innerHTML = 'We use anonymous analytics to see where visitors get stuck and improve GITH. No ads, no personal profiles. Allow it?<div><button type="button" id="gh-no">No thanks</button><button type="button" class="y" id="gh-yes">Allow</button></div>';
    document.body.appendChild(b);
    function done(v) { try { localStorage.setItem(KEY, v); } catch (e) {} choice = v; b.remove(); if (v === 'yes') { load(); window.ghTrack('page_view_after_consent'); } }
    b.querySelector('#gh-yes').onclick = function () { done('yes'); }; b.querySelector('#gh-no').onclick = function () { done('no'); };
  }
  if (choice === 'yes') load();
  else if (!choice) (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ask) : ask());
  if (/register/.test(location.pathname)) window.addEventListener('load', function () { window.ghTrack('signup_view'); });
})();
