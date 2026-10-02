/* Client-side filtering for the E-number and ingredient tables. */
(function () {
  'use strict';
  var bar = document.querySelector('[data-filters]');
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-list] tbody tr, [data-list] > [data-text]'));
  var empty = document.querySelector('[data-empty]');
  if (!bar) return;
  var text = bar.querySelector('[data-filter-text]');
  var cat = bar.querySelector('[data-filter-cat]');
  var status = '';

  function apply() {
    var q = text.value.toLowerCase().trim().replace(/^e[\s-]+(\d)/, 'e$1');
    var c = cat ? cat.value : '';
    var shown = 0;
    rows.forEach(function (r) {
      var ok = (!status || r.dataset.status === status) && (!c || r.dataset.cat === c) && (!q || r.dataset.text.indexOf(q) > -1);
      r.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
  }
  text.addEventListener('input', apply);
  if (cat) cat.addEventListener('change', apply);
  bar.querySelectorAll('[data-filter-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      status = b.dataset.filterStatus;
      bar.querySelectorAll('[data-filter-status]').forEach(function (x) { x.classList.toggle('on', x === b); });
      apply();
    });
  });
})();
