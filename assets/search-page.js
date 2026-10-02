/* /search/?q= — full results for a query that didn't match a suggestion. */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search).get('q') || '';
  var out = document.querySelector('[data-search-results]');
  var input = document.querySelector('[data-search-input]');
  input.value = q;
  if (!q) return;
  HW.loadDb().then(function (db) {
    var p = HW.getProfile();
    var res = HW.search(db, q, 30);
    if (!res.length) {
      out.innerHTML = '<p>No match for <strong>' + HW.esc(q) + '</strong>. If this is a whole ingredient list, <a href="/check/?q=' + encodeURIComponent(q) + '">check it in the checker</a>.</p>';
      return;
    }
    out.innerHTML = res.map(function (e) {
      return '<a class="card link-card" href="' + e.url + '"><div class="row"><strong>' + HW.esc(e.code ? e.code + ' · ' + e.name : e.name) + '</strong>' + HW.tag(e, p) + '</div><p class="small muted">' + HW.esc(e.note) + '</p></a>';
    }).join('');
  });
})();
