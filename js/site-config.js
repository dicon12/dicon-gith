/**
 * DICON GITH - one place for the public contact email.
 * When DICON gives its official address, change contactEmail below and redeploy.
 * Every page that shows the old placeholder address is updated automatically.
 */
window.DICON_SITE = { contactEmail: 'dicongith@gmail.com' };
(function () {
  var OLD = ['dicongith@gmail.com', 'support@dicon-gith.gov.ng'], NEW = window.DICON_SITE.contactEmail;
  function swap() {
    OLD.forEach(function (o) {
      if (o === NEW) return;
      document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) { if (a.getAttribute('href').indexOf(o) > -1) a.setAttribute('href', a.getAttribute('href').split(o).join(NEW)); });
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n, list = [];
      while ((n = w.nextNode())) if (n.nodeValue.indexOf(o) > -1) list.push(n);
      list.forEach(function (t) { t.nodeValue = t.nodeValue.split(o).join(NEW); });
    });
  }
  document.addEventListener('DOMContentLoaded', function () { swap(); setTimeout(swap, 1500); });
})();
