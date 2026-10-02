/* Shared behaviour for every page: search suggestions, preferences,
 * personalised verdicts, offline support and the install prompt. */
(function () {
  'use strict';

  var PROFILE_KEY = 'hw-profile';
  var DEFAULT = { madhab: 'general', strict: false, insects: 'avoid' };
  var STATUS = {
    halal: ['✓', 'Halal'], mushbooh: ['?', 'Doubtful'], haram: ['✕', 'Haram'], unknown: ['–', 'Not listed'],
    depends: ['≈', 'It depends'], disputed: ['⚖', 'Scholars differ'], makruh: ['!', 'Makruh'],
  };

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function getProfile() { return Object.assign({}, DEFAULT, store(PROFILE_KEY) || {}); }
  function setProfile(p) { store(PROFILE_KEY, p); }
  function isDefault(p) { return p.madhab === DEFAULT.madhab && p.strict === DEFAULT.strict && p.insects === DEFAULT.insects; }
  function profileLabel(p) {
    return (p.madhab === 'hanafi' ? 'Hanafi' : 'General') + ' · ' + (p.strict ? 'Strict' : 'Standard') + (p.insects === 'allow' ? ' · Insects permitted' : '');
  }
  function effectiveStatus(e, p) {
    var s = e.status;
    if (e.disputed === 'insect') s = p.insects === 'allow' ? 'halal' : 'haram';
    if (e.hanafi && p.madhab === 'hanafi') s = e.hanafi;
    if (e.strict && p.strict && s === 'halal') s = 'mushbooh';
    return s;
  }
  function tag(e, p) {
    if (e.verdict === 'info' || e.t === 'b' || e.t === 'f') return '<span class="badge badge-unknown">' + esc(e.cat) + '</span>';
    // Products are ingredient checks, never a halal certification.
    if (e.t === 'p' && e.status === 'halal') return '<span class="badge badge-halal"><span aria-hidden="true">✓</span> No issues</span>';
    return badge(e.verdict || effectiveStatus(e, p));
  }
  function badge(status, big) {
    var s = STATUS[status] || STATUS.unknown;
    return '<span class="badge badge-' + status + (big ? ' badge-lg' : '') + '"><span aria-hidden="true">' + s[0] + '</span> ' + s[1] + '</span>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var dbPromise;
  function loadDb() {
    if (!dbPromise) dbPromise = fetch('/data/db.json').then(function (r) { return r.json(); });
    return dbPromise;
  }

  // Rank entries for a search query.
  function search(db, q, limit) {
    q = q.toLowerCase().trim().replace(/^(?:e|ins)[\s-]?(\d)/, 'e$1');
    if (!q) return [];
    var scored = [];
    db.forEach(function (e) {
      if (e.cat === 'Label word') return;
      var code = (e.code || '').toLowerCase(), name = e.name.toLowerCase(), score = 0;
      if (code && code === q) score = 100;
      else if (code && code.indexOf(q) === 0) score = 80 - code.length;
      else if (name === q) score = 90;
      else if (name.indexOf(q) === 0) score = 60;
      else if (e.terms.some(function (t) { return t === q; })) score = 70;
      else if (e.terms.some(function (t) { return t.indexOf(q) === 0; })) score = 40;
      else if (name.indexOf(q) > -1) score = 30;
      else if (e.terms.some(function (t) { return t.indexOf(q) > -1; })) score = 20;
      if (score) scored.push([score, e]);
    });
    scored.sort(function (a, b) { return b[0] - a[0]; });
    return scored.slice(0, limit || 8).map(function (s) { return s[1]; });
  }

  window.HW = { tag: tag, getProfile: getProfile, setProfile: setProfile, profileLabel: profileLabel, effectiveStatus: effectiveStatus, badge: badge, esc: esc, loadDb: loadDb, search: search, store: store };

  // ── search suggestions ──────────────────────────────────
  var inEmbed = document.body.classList.contains('embed');
  document.querySelectorAll('[data-search]').forEach(function (form) {
    var input = form.querySelector('[data-search-input]');
    var list = form.querySelector('[data-suggest]');
    var results = [], active = -1;

    function render() {
      var p = getProfile();
      if (!results.length) { list.hidden = true; return; }
      list.innerHTML = results.map(function (e, n) {
        var label = e.code ? '<strong>' + esc(e.code) + '</strong> ' + esc(e.name) : '<strong>' + esc(e.name) + '</strong>';
        return '<li role="option" aria-selected="' + (n === active) + '"><a href="' + e.url + '"' + (inEmbed ? ' target="_blank" rel="noopener"' : '') + '><span>' + label + '</span>' + tag(e, p) + '</a></li>';
      }).join('');
      list.hidden = false;
    }
    input.addEventListener('input', function () {
      var q = input.value;
      loadDb().then(function (db) { results = search(db, q); active = -1; render(); });
    });
    input.addEventListener('keydown', function (ev) {
      if (list.hidden) return;
      if (ev.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); render(); ev.preventDefault(); }
      if (ev.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); ev.preventDefault(); }
      if (ev.key === 'Escape') { list.hidden = true; }
    });
    form.addEventListener('submit', function (ev) {
      var pick = results[active >= 0 ? active : 0];
      if (pick && input.value.trim()) {
        ev.preventDefault();
        if (inEmbed) window.open(pick.url, '_blank', 'noopener'); else location.href = pick.url;
      } else if (inEmbed) { ev.preventDefault(); }
    });
    document.addEventListener('click', function (ev) { if (!form.contains(ev.target)) list.hidden = true; });
  });

  // ── personalise verdict cards on entry pages ────────────
  var card = document.querySelector('[data-entry]');
  var profile = getProfile();
  if (card && !isDefault(profile)) {
    loadDb().then(function (db) {
      var e = db.find(function (d) { return d.id === card.getAttribute('data-entry'); });
      if (!e) return;
      var s = effectiveStatus(e, profile);
      if (s === e.status) return;
      card.className = 'verdict-card verdict-' + s;
      card.querySelector('.badge').outerHTML = badge(s, true);
      var note = card.querySelector('[data-profile-note]');
      note.innerHTML = 'Shown for your preferences (' + esc(profileLabel(profile)) + '). The general view is: ' + e.status + '. <a href="/settings/">Change</a>';
      note.hidden = false;
    });
  }
  document.querySelectorAll('[data-profile-summary]').forEach(function (el) { el.textContent = profileLabel(profile); });

  // ── settings form ───────────────────────────────────────
  var form = document.querySelector('[data-settings]');
  if (form) {
    form.madhab.value = profile.madhab;
    form.insects.value = profile.insects;
    form.strict.checked = profile.strict;
    form.addEventListener('change', function () {
      setProfile({ madhab: form.madhab.value, insects: form.insects.value, strict: form.strict.checked });
      form.querySelector('[data-saved]').textContent = 'Saved. The checker and every page now use: ' + profileLabel(getProfile()) + '.';
    });
  }

  // ── copy buttons ────────────────────────────────────────
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () { b.textContent = 'Copied'; });
    });
  });

  // ── language (Google website translator, loaded on demand) ──
  // The "googtrans" cookie tells Google's script which language to show.
  var RTL = ['ar', 'ur', 'fa', 'ps'];
  var langSel = document.querySelector('[data-lang]');
  function currentLang() {
    var m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/;]+\/([^;]+)/);
    return m ? decodeURIComponent(m[1]) : 'en';
  }
  function cookieDomain() {
    var h = location.hostname;
    return h.indexOf('.') > -1 && !/^[\d.]+$/.test(h) ? '.' + h.replace(/^www\./, '') : '';
  }
  function setLang(code) {
    var gone = '; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    var d = cookieDomain();
    document.cookie = 'googtrans=' + gone;
    if (d) document.cookie = 'googtrans=' + gone + '; domain=' + d;
    if (code !== 'en') {
      document.cookie = 'googtrans=/en/' + code + '; path=/; max-age=31536000';
      if (d) document.cookie = 'googtrans=/en/' + code + '; path=/; max-age=31536000; domain=' + d;
    }
    store('hw-lang', code);
    location.reload();
  }
  var lang = currentLang();
  if (langSel) {
    langSel.value = lang;
    langSel.addEventListener('change', function () { setLang(langSel.value); });
  }
  if (lang !== 'en') {
    document.documentElement.lang = lang;
    if (RTL.indexOf(lang) > -1) document.documentElement.dir = 'rtl';
    window.hwGt = function () {
      new window.google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'gt-el');
    };
    var gt = document.createElement('script');
    gt.src = 'https://translate.google.com/translate_a/element.js?cb=hwGt';
    document.head.appendChild(gt);
  } else if (langSel && !store('hw-lang')) {
    // First visit: offer the visitor's browser language if we support it.
    var want = (navigator.language || '').slice(0, 2).toLowerCase();
    var opt = langSel.querySelector('option[value="' + want + '"]');
    var box = document.querySelector('[data-lang-suggest]');
    if (want !== 'en' && opt && box) {
      box.innerHTML = '<div class="wrap row between"><span>Read this site in <strong>' + esc(opt.textContent) + '</strong>?</span><span class="row"><button class="btn" type="button" data-yes>' + esc(opt.textContent) + '</button><button class="btn btn-ghost" type="button" data-no>English</button></span></div>';
      box.hidden = false;
      box.querySelector('[data-yes]').addEventListener('click', function () { setLang(want); });
      box.querySelector('[data-no]').addEventListener('click', function () { store('hw-lang', 'en'); box.hidden = true; });
    }
  }

  // ── voice search & dictation (Web Speech API) ───────────
  var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  var VOICE_LANG = { en: 'en-GB', ar: 'ar-SA', ur: 'ur-PK', tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', ms: 'ms-MY', id: 'id-ID', bn: 'bn-BD', hi: 'hi-IN', fa: 'fa-IR', ps: 'ps-AF', so: 'so-SO', sw: 'sw-KE', ru: 'ru-RU', sq: 'sq-AL', bs: 'bs-BA' };
  function listen(opts) {
    var rec = new Speech();
    rec.lang = VOICE_LANG[lang] || 'en-GB';
    rec.interimResults = !!opts.interim;
    rec.continuous = !!opts.continuous;
    rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) opts.onText(e.results[i][0].transcript, e.results[i].isFinal);
    };
    rec.onerror = function (e) {
      var why = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Allow microphone access to use voice.'
        : e.error === 'network' ? 'Voice needs an internet connection.'
        : e.error === 'no-speech' ? 'Didn\'t catch that — try again.' : '';
      if (why && opts.onError) opts.onError(why);
    };
    rec.onend = function () { if (opts.onEnd) opts.onEnd(); };
    rec.start();
    return rec;
  }
  // "E four seven one" / "E number 471" / "E-471" -> "E471"
  function tidySpoken(t) {
    return t.trim().replace(/[.?!]+$/, '').replace(/\be[\s-]*numbers?\s*/i, 'E').replace(/^e[\s-]+(?=\d)/i, 'E').replace(/(\d)\s+(?=\d)/g, '$1');
  }
  if (Speech) {
    document.querySelectorAll('[data-voice]').forEach(function (btn) {
      var form = btn.closest('[data-search]');
      var input = form.querySelector('[data-search-input]');
      var rec = null;
      btn.hidden = false;
      btn.addEventListener('click', function () {
        if (rec) { rec.stop(); return; }
        var ph = input.placeholder;
        input.placeholder = 'Listening…';
        btn.classList.add('listening');
        rec = listen({
          interim: true,
          onText: function (text, final) {
            input.value = tidySpoken(text);
            input.dispatchEvent(new Event('input'));
            if (final && input.value) {
              var url = '/search/?q=' + encodeURIComponent(input.value);
              if (inEmbed) window.open(url, '_blank', 'noopener'); else setTimeout(function () { location.href = url; }, 350);
            }
          },
          onError: function (msg) { input.value = ''; input.placeholder = msg; },
          onEnd: function () { rec = null; btn.classList.remove('listening'); setTimeout(function () { if (!input.value) input.placeholder = ph; }, 2500); },
        });
      });
    });

    var dictate = document.querySelector('[data-dictate]');
    var area = document.getElementById('ingredients');
    if (dictate && area) {
      var drec = null;
      var label = dictate.innerHTML;
      dictate.hidden = false;
      dictate.addEventListener('click', function () {
        if (drec) { drec.stop(); return; }
        dictate.classList.add('listening');
        dictate.innerHTML = '■ Stop';
        drec = listen({
          continuous: true,
          onText: function (text, final) {
            if (!final) return;
            var add = tidySpoken(text);
            area.value = area.value.trim() ? area.value.replace(/[,\s]*$/, '') + ', ' + add : add;
            area.dispatchEvent(new Event('input'));
          },
          onError: function (msg) { area.placeholder = msg; },
          onEnd: function () { drec = null; dictate.classList.remove('listening'); dictate.innerHTML = label; },
        });
      });
    }
  }

  // ── day / night mode ────────────────────────────────────
  // Modes: 'time' (default — night from sunset to sunrise), 'auto' (match the
  // phone's setting), 'light', 'dark'. Remembered on this device.
  var THEME = 'hw-theme';
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function themeMode() {
    var t = null;
    try {
      // A quick toggle from the header expires at the next sunrise/sunset.
      var until = +localStorage.getItem('hw-theme-until');
      if (until && Date.now() > until) { localStorage.removeItem(THEME); localStorage.removeItem('hw-theme-until'); }
      t = localStorage.getItem(THEME);
    } catch (e) {}
    return t === 'light' || t === 'dark' || t === 'auto' ? t : 'time';
  }
  // Sunrise and sunset (ms) for today, at the visitor's last prayer-times city or London.
  function sunToday() {
    var loc = store('hw-loc') || { lat: 51.5074, lon: -0.1278 };
    var now = new Date(), key = now.toDateString();
    var cached = store('hw-sun');
    if (cached && cached.d === key && cached.lat === loc.lat) return cached;
    var r = Math.PI / 180, y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + 2 - A + Math.floor(A / 4) - 1524.5 + 0.5;
    var D = jd - 2451545, g = (357.529 + 0.98560028 * D) % 360, q = (280.459 + 0.98564736 * D) % 360;
    var L = q + 1.915 * Math.sin(g * r) + 0.020 * Math.sin(2 * g * r), e = 23.439 - 0.00000036 * D;
    var RA = Math.atan2(Math.cos(e * r) * Math.sin(L * r), Math.cos(L * r)) / r / 15;
    var decl = Math.asin(Math.sin(e * r) * Math.sin(L * r)) / r;
    var eqt = q / 15 - ((RA % 24) + 24) % 24; eqt = ((eqt + 12) % 24 + 24) % 24 - 12;
    var noon = 12 - loc.lon / 15 - eqt;
    var x = (-Math.sin(0.833 * r) - Math.sin(decl * r) * Math.sin(loc.lat * r)) / (Math.cos(decl * r) * Math.cos(loc.lat * r));
    var h = Math.acos(Math.max(-1, Math.min(1, x))) / r / 15;
    var base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    var sun = { d: key, lat: loc.lat, r: Math.round(base + (noon - h) * 3600000), s: Math.round(base + (noon + h) * 3600000) };
    store('hw-sun', sun);
    return sun;
  }
  function isDark() {
    var m = themeMode();
    if (m === 'dark') return true;
    if (m === 'light') return false;
    if (m === 'auto') return darkQuery.matches;
    var sun = sunToday(), now = Date.now();
    return now < sun.r || now >= sun.s;
  }
  var themeTimer;
  function nextSunChange() {
    var sun = sunToday(), now = Date.now();
    return now < sun.r ? sun.r : now < sun.s ? sun.s : sun.r + 864e5;
  }
  // temporary: true for the header button (lasts until the next sunrise/sunset).
  function applyTheme(mode, temporary) {
    document.documentElement.classList.add('theme-fade');
    setTimeout(function () { document.documentElement.classList.remove('theme-fade'); }, 400);
    try {
      if (mode === 'time') localStorage.removeItem(THEME); else localStorage.setItem(THEME, mode);
      if (temporary) localStorage.setItem('hw-theme-until', String(nextSunChange())); else localStorage.removeItem('hw-theme-until');
    } catch (e) {}
    syncTheme();
  }
  function syncTheme() {
    var dark = isDark(), mode = themeMode();
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    // In sunset mode, switch again at the next sunrise/sunset while the page is open.
    clearTimeout(themeTimer);
    var until = 0; try { until = +localStorage.getItem('hw-theme-until'); } catch (e) {}
    if (mode === 'time' || until) {
      var next = until || nextSunChange();
      themeTimer = setTimeout(syncTheme, Math.max(1000, Math.min(next - Date.now() + 1000, 36e5)));
    }
    document.documentElement.classList.toggle('is-dark', dark);
    var meta = document.querySelector('[data-theme-color]');
    if (meta) meta.setAttribute('content', dark ? '#07130e' : '#0d6b4f');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
    });
    document.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-theme-set') === mode);
    });
  }
  document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(isDark() ? 'light' : 'dark', true); });
  });
  document.querySelectorAll('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(b.getAttribute('data-theme-set')); });
  });
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', syncTheme);
  syncTheme();

  // ── mobile sheets: full-screen search and menu drawer ───
  var backdrop = document.querySelector('[data-sheet-backdrop]');
  var openSheet = null;
  function closeSheet(fromHistory) {
    if (!openSheet) return;
    openSheet.classList.remove('open');
    var el = openSheet;
    setTimeout(function () { el.hidden = true; }, 220);
    if (backdrop) { backdrop.classList.remove('open'); setTimeout(function () { backdrop.hidden = true; }, 220); }
    document.documentElement.classList.remove('sheet-lock');
    openSheet = null;
    if (!fromHistory && history.state && history.state.sheet) history.back();
  }
  function showSheet(name) {
    var el = document.querySelector('[data-sheet="' + name + '"]');
    if (!el) return;
    if (openSheet) closeSheet(true);
    el.hidden = false; if (backdrop) backdrop.hidden = false;
    setTimeout(function () { el.classList.add('open'); if (backdrop) backdrop.classList.add('open'); }, 16);
    document.documentElement.classList.add('sheet-lock');
    openSheet = el;
    history.pushState({ sheet: name }, ''); // the phone's back button closes the sheet
    if (name === 'search') {
      var inp = el.querySelector('[data-search-input]');
      setTimeout(function () { inp.focus(); }, 60);
      renderRecent();
    }
  }
  document.querySelectorAll('[data-open-sheet]').forEach(function (b) {
    b.addEventListener('click', function () { showSheet(b.getAttribute('data-open-sheet')); });
  });
  document.querySelectorAll('[data-close-sheet]').forEach(function (b) { b.addEventListener('click', function () { closeSheet(); }); });
  if (backdrop) backdrop.addEventListener('click', function () { closeSheet(); });
  window.addEventListener('popstate', function () { closeSheet(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  // Recent searches (this device only).
  var RECENT_Q = 'hw-recent-q';
  function renderRecent() {
    var box = document.querySelector('[data-recent-searches]');
    if (!box) return;
    var list = store(RECENT_Q) || [];
    box.hidden = !list.length;
    box.querySelector('[data-recent-list]').innerHTML = list.map(function (r) { return '<li><a class="chip" href="' + esc(r.url) + '">' + esc(r.name) + '</a></li>'; }).join('');
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.suggest a');
    if (!a) return;
    var name = a.querySelector('span') ? a.querySelector('span').textContent : a.textContent;
    var list = (store(RECENT_Q) || []).filter(function (r) { return r.url !== a.getAttribute('href'); });
    list.unshift({ name: name.slice(0, 40), url: a.getAttribute('href') });
    store(RECENT_Q, list.slice(0, 6));
  });

  // Topic chips on the Q&A hub drive the topic filter.
  var chips = document.querySelector('[data-qcat-chips]');
  var catSel = document.querySelector('[data-filter-cat]');
  if (chips && catSel) chips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qcat]'); if (!b) return;
    chips.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    catSel.value = b.getAttribute('data-qcat'); catSel.dispatchEvent(new Event('change'));
  });

  // Back to top.
  var top = document.querySelector('[data-to-top]');
  if (top) {
    window.addEventListener('scroll', function () { top.hidden = window.scrollY < 900; }, { passive: true });
    top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  // Share buttons (native share sheet on phones, copy link elsewhere).
  document.querySelectorAll('[data-share-page]').forEach(function (b) {
    b.addEventListener('click', function () {
      var data = { title: document.title, text: b.getAttribute('data-share-text') || document.title, url: location.href };
      if (navigator.share) navigator.share(data).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { b.textContent = 'Link copied'; });
    });
  });

  // ── offline + install ───────────────────────────────────
  // Offline mode runs on the live (https) site only. On your laptop (localhost)
  // the live server is always there, so any old offline worker is removed to
  // avoid stale pages or "You're offline" while developing.
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if ('serviceWorker' in navigator) {
    if (isLocal) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        if (!regs.length) return;
        Promise.all(regs.map(function (r) { return r.unregister(); }))
          .then(function () { return window.caches ? caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.delete(n); })); }) : null; })
          .then(function () { if (navigator.serviceWorker.controller) location.reload(); });
      }).catch(function () {});
    } else if (location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
  }
  // The installed app keeps a full offline copy automatically (once).
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function autoOffline() {
    if (!('serviceWorker' in navigator) || !('caches' in window) || !navigator.onLine) return;
    caches.open('hw-meta').then(function (c) { return c.match('/__offline-all'); }).then(function (flag) {
      if (flag) return;
      navigator.serviceWorker.ready.then(function (reg) { if (reg.active) reg.active.postMessage('offline-save'); });
    });
  }
  if (standalone) autoOffline();
  window.addEventListener('appinstalled', autoOffline);

  // Tell people the checker still works when the connection drops.
  var toast;
  function connection() {
    if (navigator.onLine) { if (toast) toast.remove(); toast = null; return; }
    if (toast) return;
    toast = document.createElement('div');
    toast.className = 'offline-toast notranslate';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<strong>You\'re offline.</strong> The checker and saved pages still work.';
    document.body.appendChild(toast);
  }
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);
  connection();

  var deferred;
  function showInstall(on) {
    document.querySelectorAll('[data-install], [data-install-btn]').forEach(function (el) { el.hidden = !on; });
    document.querySelectorAll('[data-install-fallback]').forEach(function (el) { el.hidden = on; });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; showInstall(true); });
  document.querySelectorAll('[data-install-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; showInstall(false); });
    });
  });

  // ── scroll reveal + count-up numbers ────────────────────
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(el) {
    var target = +el.getAttribute('data-count'), t0 = null;
    if (reduce || !target) return;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / 1100);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        en.target.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }
})();
