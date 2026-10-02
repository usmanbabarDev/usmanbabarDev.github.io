/* Product pages: re-check the ingredients with the visitor's own settings
 * (Hanafi, strict, insects) and update the verdict if it differs. */
(function () {
  'use strict';
  var el = document.getElementById('product-data');
  var card = document.querySelector('[data-product-card]');
  if (!el || !card) return;
  var p = JSON.parse(el.textContent);
  var profile = HW.getProfile();
  var d = HalalCore.DEFAULT_PROFILE;
  if (profile.madhab === d.madhab && profile.strict === d.strict && profile.insects === d.insects) return;

  HW.loadDb().then(function (db) {
    var r = HalalCore.check(p.i, HalalCore.buildIndex(db), { profile: profile, vegan: p.v });
    var s = r.verdict === 'clear' ? 'halal' : r.verdict;
    if (s === p.s) return;
    var TITLE = { halal: 'No haram or doubtful ingredients found', mushbooh: 'Doubtful — check the source', haram: 'Contains haram ingredients' };
    card.className = 'verdict-card verdict-' + s;
    var badge = card.querySelector('.badge');
    if (badge) badge.outerHTML = HW.badge(s);
    var h = card.querySelector('h2');
    if (h) h.textContent = TITLE[s];
    var flagged = r.items.filter(function (i) { return i.status === s; }).map(function (i) { return i.entry.code || i.entry.name; });
    var note = card.querySelector('[data-profile-note]');
    note.innerHTML = 'With your settings (' + HW.esc(HW.profileLabel(profile)) + ')' + (flagged.length ? ': ' + HW.esc(flagged.join(', ')) : '') +
      '. The general view is shown below. <a href="/settings/">Change settings</a>';
    note.hidden = false;
  });
})();
