/* HalalVerdict checker engine. Runs in the browser and in Node (for tests).
 * Given ingredient text and the database, returns every flagged item and
 * an overall verdict. It never claims a product is certified halal. */
(function (root) {
  'use strict';

  var DEFAULT_PROFILE = { madhab: 'general', strict: false, insects: 'avoid' };
  var RANK = { halal: 0, unknown: 1, mushbooh: 2, haram: 3 };

  // Words that, just before a match, mean the ingredient is absent.
  var NEG_BEFORE = /(\bno|\bnot|\bwithout|\bfree from|\bnon)[\s-]*$/;
  // Words just after a match that mean the same ("alcohol-free").
  var NEG_AFTER = /^[\s-]*(free\b|0\s?%)/;
  // A stated plant source clears a fat-source doubt ("E471 (vegetable)").
  var PLANT_SOURCE = /\b(vegetable|plant|palm|rapeseed|sunflower|soya|soy|non-animal)\b/;

  function normalise(text) {
    return (' ' + String(text || '') + ' ')
      .toLowerCase()
      .replace(/[‐-―−]/g, '-')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      // "E 471", "E-471", "INS 471", "e471(i)" -> "e471"
      .replace(/\b(?:e|ins)\s?-?\s?(\d{3,4})\s?([a-f])?(?:\s?\((?:i{1,3}|iv|v|vi)\))?(?![0-9])/g,
        function (_, n, l) { return 'e' + n + (l || ''); });
  }

  function effectiveStatus(entry, profile) {
    var p = profile || DEFAULT_PROFILE;
    var s = entry.status;
    if (entry.disputed === 'insect') s = p.insects === 'allow' ? 'halal' : 'haram';
    if (entry.hanafi && p.madhab === 'hanafi') s = entry.hanafi;
    if (entry.strict && p.strict && s === 'halal') s = 'mushbooh';
    return s;
  }

  // Build a term list once per database: longest terms first.
  function buildIndex(db) {
    var terms = [];
    var byCode = {};
    db.forEach(function (entry) {
      // Only ingredients and E-numbers are matched in labels; other entries
      // (questions, brands, products…) exist for the site search.
      if (entry.t && entry.t !== 'e' && entry.t !== 'i') return;
      if (entry.code) byCode[entry.code.toLowerCase()] = entry;
      (entry.terms || []).forEach(function (t) { terms.push({ term: t, entry: entry }); });
    });
    terms.sort(function (a, b) { return b.term.length - a.term.length; });
    return { terms: terms, byCode: byCode };
  }

  // Letters in Latin (incl. accents/Turkish), Cyrillic and Arabic scripts.
  function isWordChar(c) { return /[a-z0-9À-ɏЀ-ӿ؀-ۿ]/.test(c || ''); }

  function lookupCode(code, index) {
    var c = code.toLowerCase();
    if (index.byCode[c]) return index.byCode[c];
    var base = c.replace(/[a-f]$/, '');
    if (index.byCode[base]) return index.byCode[base];
    // Unlisted member of a listed family, e.g. e472d -> the E472 family.
    for (var k in index.byCode) {
      if (k.indexOf(base) === 0 && /[a-f]$/.test(k)) {
        var fam = index.byCode[k];
        return Object.assign({}, fam, { code: base.toUpperCase(), name: base.toUpperCase() + ' family (' + fam.name + ')' });
      }
    }
    return null;
  }

  /**
   * @param {string} text      ingredient list
   * @param {object} index     from buildIndex(db)
   * @param {object} [opts]    { profile, extraCodes: ['e322'], vegan: bool }
   */
  function check(text, index, opts) {
    opts = opts || {};
    var profile = Object.assign({}, DEFAULT_PROFILE, opts.profile || {});
    var t = normalise(text);
    var covered = new Uint8Array(t.length);
    var found = {};   // id -> result item (deduped)
    var unknown = {};

    function add(entry, matched, note) {
      var id = entry.id;
      if (found[id]) { if (found[id].matched.indexOf(matched) < 0) found[id].matched.push(matched); return; }
      var status = effectiveStatus(entry, profile);
      var reason = entry.note;
      if (opts.vegan && entry.doubt === 'animal' && status !== 'halal') {
        status = 'halal';
        reason = 'The product is labelled vegan, which rules out animal sources.';
      }
      if (note) { status = note.status; reason = note.reason; }
      found[id] = { entry: entry, status: status, reason: reason, matched: [matched] };
    }

    for (var i = 0; i < index.terms.length; i++) {
      var term = index.terms[i].term, entry = index.terms[i].entry;
      var from = 0, pos;
      while ((pos = t.indexOf(term, from)) !== -1) {
        from = pos + 1;
        var end = pos + term.length;
        if (isWordChar(t[pos - 1]) || isWordChar(t[end])) continue;
        var taken = false;
        for (var j = pos; j < end; j++) if (covered[j]) { taken = true; break; }
        if (taken) continue;
        for (j = pos; j < end; j++) covered[j] = 1;

        var before = t.slice(Math.max(0, pos - 14), pos);
        var after = t.slice(end, end + 6);
        if (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) continue;

        var note = null;
        if (entry.status === 'mushbooh' && entry.doubt === 'animal' && entry.plantPossible) {
          var tail = t.slice(end, end + 40).split(/[,;]/)[0];
          if (PLANT_SOURCE.test(tail)) note = { status: 'halal', reason: 'The label states a plant source, which clears the doubt.' };
        }
        add(entry, term, note);
      }
    }

    // E-numbers not caught by a term (e.g. family members, unlisted codes).
    var codeRe = /\be(\d{3,4}[a-f]?)\b/g, m;
    var codes = [];
    while ((m = codeRe.exec(t))) { if (!covered[m.index]) codes.push('e' + m[1]); }
    (opts.extraCodes || []).forEach(function (c) {
      var n = normalise(c.replace(/^[a-z]{2}:/, '')).trim().replace(/^(e\d{3,4}[a-f]?)(?:i{1,3}|iv|vi?)$/, '$1');
      if (/^e\d{3,4}[a-f]?$/.test(n)) codes.push(n);
    });
    codes.forEach(function (c) {
      var e = lookupCode(c, index);
      if (e) add(e, c); else unknown[c.toUpperCase()] = true;
    });

    var items = Object.keys(found).map(function (k) { return found[k]; })
      .filter(function (r) { return r.entry.cat !== 'Label word'; })
      .sort(function (a, b) { return RANK[b.status] - RANK[a.status]; });

    var worst = items.reduce(function (w, r) { return RANK[r.status] > RANK[w] ? r.status : w; }, 'halal');
    var hasMeat = items.some(function (r) { return r.entry.meat && r.status !== 'halal'; });

    return {
      verdict: worst === 'haram' ? 'haram' : worst === 'mushbooh' ? 'mushbooh' : 'clear',
      items: items,
      unknown: Object.keys(unknown),
      hasMeat: hasMeat,
      empty: t.trim().length < 3,
    };
  }

  // Split a label on commas/semicolons that are not inside brackets.
  function splitLabel(text) {
    var parts = [], cur = '', depth = 0;
    text = String(text || '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '(' || c === '[') depth++;
      if ((c === ')' || c === ']') && depth > 0) depth--;
      if ((c === ',' || c === ';' || c === '\n' || c === '،') && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    return parts.map(function (p) { return p.trim().replace(/[.:]+$/, ''); }).filter(function (p) { return p.length > 1; }).slice(0, 80);
  }

  // Each label part with its own status: 'haram' | 'mushbooh' | 'halal' | 'neutral'.
  function labelParts(text, index, opts) {
    return splitLabel(text).map(function (p) {
      var r = check(p, index, opts);
      return { text: p, status: r.items.length ? (r.verdict === 'clear' ? 'halal' : r.verdict) : 'neutral' };
    });
  }

  var api = { normalise: normalise, effectiveStatus: effectiveStatus, buildIndex: buildIndex, check: check, splitLabel: splitLabel, labelParts: labelParts, DEFAULT_PROFILE: DEFAULT_PROFILE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HalalCore = api;
})(this);
