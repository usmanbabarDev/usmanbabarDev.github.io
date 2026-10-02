/* Blog: topic filter on the index, reading progress bar on posts. */
(function () {
  'use strict';
  var bar = document.querySelector('[data-cat-filter]');
  if (bar) {
    var cards = document.querySelectorAll('[data-posts] .post-card');
    bar.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.dataset.cat;
        bar.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        cards.forEach(function (card) { card.hidden = !!c && card.dataset.cat !== c; });
      });
    });
  }
  var progress = document.querySelector('[data-progress]');
  if (progress) {
    var update = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      progress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }
})();
