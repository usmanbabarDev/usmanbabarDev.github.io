/* "Halal or not?" quiz. Any element with [data-quiz] becomes a quiz.
 * Questions come from the live database, so answers always match the site. */
(function () {
  'use strict';
  var esc = HW.esc;
  var LABEL = { halal: 'Halal', mushbooh: 'Doubtful', haram: 'Haram' };
  var BEST = 'hw-quiz-best';

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // A fair mix: roughly a third of each status.
  function pickQuestions(db, n) {
    var usable = db.filter(function (e) { return (e.t === 'e' || e.t === 'i') && e.cat !== 'Label word' && !e.disputed; });
    var by = { halal: [], mushbooh: [], haram: [] };
    usable.forEach(function (e) { by[e.status].push(e); });
    Object.keys(by).forEach(function (k) { shuffle(by[k]); });
    var out = [], order = ['haram', 'mushbooh', 'halal'];
    for (var i = 0; out.length < n; i++) { var list = by[order[i % 3]]; if (list.length) out.push(list.pop()); if (i > n * 6) break; }
    return shuffle(out);
  }

  function start(root, db) {
    var len = +root.getAttribute('data-quiz-len') || 5;
    var qs = pickQuestions(db, len), i = 0, score = 0;
    var profile = HW.getProfile();

    function ask() {
      var q = qs[i];
      var answer = HW.effectiveStatus(q, profile);
      root.innerHTML =
        '<div class="quiz-top"><span>Question ' + (i + 1) + ' of ' + qs.length + '</span><span>Score ' + score + '</span></div>' +
        '<div class="quiz-bar"><span style="width:' + (i / qs.length * 100) + '%"></span></div>' +
        '<p class="quiz-q">' + esc(q.code ? q.code + ' · ' + q.name : q.name) + '</p>' +
        '<p class="quiz-sub">' + esc(q.cat) + ' — halal, doubtful or haram?</p>' +
        '<div class="quiz-opts">' + ['halal', 'mushbooh', 'haram'].map(function (s) {
          return '<button type="button" class="q-' + s + '" data-a="' + s + '">' + LABEL[s] + '</button>';
        }).join('') + '</div>';
      root.querySelectorAll('[data-a]').forEach(function (b) {
        b.addEventListener('click', function () {
          var ok = b.dataset.a === answer;
          if (ok) score++;
          if (navigator.vibrate) navigator.vibrate(ok ? 30 : [40, 40, 40]);
          root.querySelectorAll('[data-a]').forEach(function (x) {
            x.disabled = true;
            if (x.dataset.a === answer) x.classList.add('right');
            else if (x === b) x.classList.add('wrong');
          });
          var ex = document.createElement('div');
          ex.className = 'quiz-explain';
          ex.innerHTML = '<strong>' + (ok ? '✓ Correct! ' : '✕ Not quite — it\'s ' + LABEL[answer] + '. ') + '</strong>' + esc(q.note) +
            ' <a href="' + q.url + '">Read more</a>' +
            '<div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn btn-sm" type="button" data-next>' + (i + 1 < qs.length ? 'Next →' : 'See my score') + '</button></div>';
          root.appendChild(ex);
          ex.querySelector('[data-next]').addEventListener('click', function () { i++; if (i < qs.length) ask(); else finish(); });
          ex.querySelector('[data-next]').focus();
        });
      });
    }

    function finish() {
      var best = Math.max(score, +(HW.store(BEST) || 0));
      HW.store(BEST, best);
      var pct = score / qs.length;
      var msg = pct === 1 ? 'Perfect! You really know your labels.' : pct >= .7 ? 'Great work — you know your stuff.' : pct >= .4 ? 'Not bad! The doubtful ones are tricky.' : 'Tricky, right? That\'s why the checker exists.';
      var text = 'I scored ' + score + '/' + qs.length + ' on the "Halal or not?" quiz. Can you beat me?';
      var url = location.origin + '/quiz/';
      root.innerHTML =
        '<div class="quiz-score"><div class="big grad">' + score + '/' + qs.length + '</div><p><strong>' + msg + '</strong></p>' +
        '<p class="small muted">Your best: ' + best + '</p>' +
        '<div class="row gap" style="justify-content:center"><button class="btn" type="button" data-again>Play again</button>' +
        '<a class="share-btn sb-wa" href="https://wa.me/?text=' + encodeURIComponent(text + ' ' + url) + '" target="_blank" rel="noopener">Share on WhatsApp</a></div></div>';
      root.querySelector('[data-again]').addEventListener('click', function () { start(root, db); });
    }
    ask();
  }

  var roots = document.querySelectorAll('[data-quiz]');
  if (roots.length) HW.loadDb().then(function (db) { roots.forEach(function (r) { start(r, db); }); });
})();
