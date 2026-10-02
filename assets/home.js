/* Home page: animated phone demo and "ingredient of the day". */
(function () {
  'use strict';
  var esc = HW.esc;
  var ICON = {
    halal: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    mushbooh: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V14"/><circle cx="12" cy="18" r="1.6" fill="currentColor"/></svg>',
    haram: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M7 7l10 10M17 7 7 17"/></svg>',
  };
  var DEMOS = [
    { name: 'Jelly sweets', text: 'Glucose syrup, sugar, gelatine, citric acid, E120, carnauba wax' },
    { name: 'Sliced white bread', text: 'Wheat flour, water, yeast, salt, E471, E481, rapeseed oil, ascorbic acid' },
    { name: 'Fruit gummies', text: 'Sugar, glucose syrup, pectin, citric acid, fruit juice, E100' },
  ];
  var TITLES = { haram: ['Haram', 'Contains haram ingredients'], mushbooh: ['Doubtful', 'Check the source'], halal: ['No issues found', 'Nothing flagged'] };

  var phone = document.querySelector('[data-demo]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  HW.loadDb().then(function (db) {
    var index = HalalCore.buildIndex(db);

    // ── phone demo ──
    if (phone) {
      var nameEl = phone.querySelector('[data-demo-name]');
      var textEl = phone.querySelector('[data-demo-text]');
      var pillsEl = phone.querySelector('[data-demo-pills]');
      var verdictEl = phone.querySelector('[data-demo-verdict]');
      var n = 0;
      var play = function () {
        var d = DEMOS[n++ % DEMOS.length];
        nameEl.textContent = d.name;
        textEl.textContent = d.text;
        pillsEl.innerHTML = '';
        verdictEl.className = 'demo-verdict';
        phone.classList.remove('scanning'); void phone.offsetWidth; phone.classList.add('scanning');
        setTimeout(function () {
          var parts = d.text.split(/,\s*/);
          pillsEl.innerHTML = parts.map(function (p, i) {
            var r = HalalCore.check(p, index);
            var s = r.items.length ? (r.verdict === 'clear' ? 'halal' : r.verdict) : 'neutral';
            return '<span class="dp-' + s + '" style="animation-delay:' + (i * 90) + 'ms">' + esc(p) + '</span>';
          }).join('');
          var all = HalalCore.check(d.text, index);
          var v = all.verdict === 'clear' ? 'halal' : all.verdict;
          verdictEl.className = 'demo-verdict dv-' + v;
          verdictEl.innerHTML = '<span class="dv-icon">' + ICON[v] + '</span><span>' + TITLES[v][0] + '<small>' + TITLES[v][1] + '</small></span>';
          setTimeout(function () { verdictEl.classList.add('show'); }, parts.length * 90 + 150);
        }, reduce ? 0 : 1500);
      };
      play();
      if (!reduce) setInterval(play, 5200);
    }

    // ── ingredient of the day (changes daily, same for everyone) ──
    var box = document.querySelector('[data-daily] .daily-body');
    if (box) {
      var pool = db.filter(function (e) { return (e.t === 'e' || e.t === 'i') && e.cat !== 'Label word' && (e.status !== 'halal' || e.strict || e.t === 'i'); });
      var day = Math.floor(Date.now() / 864e5);
      var e = pool[(day * 7919) % pool.length];
      var s = HW.effectiveStatus(e, HW.getProfile());
      box.innerHTML =
        '<h3>' + esc(e.code ? e.code + ' · ' + e.name : e.name) + '</h3>' +
        HW.badge(s, true) +
        '<p style="margin-top:12px">' + esc(e.note) + '</p>' +
        '<p class="small muted"><strong>Made from:</strong> ' + esc(e.from) + '</p>' +
        '<a class="btn btn-sm" href="' + e.url + '">Learn more →</a>';
    }
  });
})();
