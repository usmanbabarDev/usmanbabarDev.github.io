/* Checker page: paste, barcode (camera or typed) and label photo (on-device OCR). */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = HW.esc;
  var textarea = $('#ingredients');
  var resultEl = $('[data-result]');
  var productEl = $('[data-product]');
  var msg = $('[data-status-msg]');
  var indexPromise = HW.loadDb().then(HalalCore.buildIndex);

  var SAMPLE = 'Sugar, glucose syrup, gelatine, dextrose, citric acid, acidity regulator (sodium citrate), flavourings, colours (E120, E100), glazing agent (carnauba wax), E471.';
  var ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';
  var TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  function say(t) { msg.textContent = t || ''; }
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { fail(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ── tabs (with sliding indicator) ───────────────────────
  var tabs = document.querySelectorAll('[data-tab]');
  var glider = $('.tab-glider');
  function showTab(name) {
    tabs.forEach(function (t, n) {
      var on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on);
      document.getElementById('panel-' + t.dataset.tab).hidden = !on;
      if (on && glider) glider.style.setProperty('--i', n);
    });
    if (name !== 'scan') stopCamera();
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { showTab(t.dataset.tab); history.replaceState(null, '', '#' + t.dataset.tab); }); });

  // ── run a check and render it ───────────────────────────
  var VERDICT = {
    haram: ['Contains haram ingredients', 'At least one ingredient is haram under your settings.'],
    mushbooh: ['Doubtful — check the source', 'Some ingredients can come from halal or non-halal sources. Look for a halal logo or a vegan label, or ask the maker.'],
    clear: ['No haram or doubtful ingredients found', 'Nothing in this list is flagged under your settings.'],
  };
  var ICON = {
    haram: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" d="M7 7l10 10M17 7 7 17"/></svg>',
    mushbooh: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" d="M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V14"/><circle cx="12" cy="18" r="1.6" fill="currentColor"/></svg>',
    halal: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  };

  function run(text, opts) {
    opts = opts || {};
    return indexPromise.then(function (index) {
      var checkOpts = { profile: HW.getProfile(), extraCodes: opts.codes, vegan: opts.vegan };
      var r = HalalCore.check(text, index, checkOpts);
      if (r.empty && !r.items.length) { resultEl.innerHTML = ''; if (!opts.quiet) say('Add some ingredients to check.'); return r; }
      var parts = HalalCore.labelParts(text, index, { profile: checkOpts.profile, vegan: opts.vegan });
      render(r, parts, opts);
      if (!opts.quiet) saveRecent(opts.label || text.slice(0, 60), r.verdict, opts.barcode ? { barcode: opts.barcode } : { text: text });
      return r;
    });
  }

  function render(r, parts, opts) {
    var v = VERDICT[r.verdict];
    var cls = r.verdict === 'clear' ? 'halal' : r.verdict;
    var bad = r.items.filter(function (i) { return i.status !== 'halal'; });
    var ok = r.items.filter(function (i) { return i.status === 'halal'; });
    var li = function (i, n) {
      var e = i.entry;
      var label = e.code ? e.code + ' · ' + e.name : e.name;
      return '<li class="item st-' + i.status + '" style="animation-delay:' + (n * 60) + 'ms">' + HW.badge(i.status) + '<a href="' + e.url + '">' + esc(label) + ' <span class="matched">(' + esc(i.matched.join(', ')) + ')</span></a><p>' + esc(i.reason) + '</p></li>';
    };
    var tally = { haram: 0, mushbooh: 0, halal: 0, neutral: 0 };
    parts.forEach(function (p) { tally[p.status]++; });
    var tallyHtml = [['haram', 'haram'], ['mushbooh', 'doubtful'], ['halal', 'fine'], ['neutral', 'no concern found']]
      .filter(function (t) { return tally[t[0]]; })
      .map(function (t) { return '<span class="t-' + t[0] + '">' + tally[t[0]] + ' ' + t[1] + '</span>'; }).join('');

    var extras = [];
    if (opts.halalLabel) extras.push('<p class="note">✓ The pack is labelled <strong>halal</strong> on Open Food Facts. Check the certifier logo on the pack itself.</p>');
    if (r.hasMeat) extras.push('<p class="note">This contains meat. Meat is only halal if slaughtered according to Islamic law — the ingredient list cannot show that, so look for a recognised halal certification logo.</p>');

    resultEl.innerHTML =
      '<div class="result">' +
      '<div class="verdict-card verdict-' + cls + '">' +
        '<div class="result-hero rh-' + cls + '">' +
          '<div class="ring"><svg viewBox="0 0 84 84" width="84" height="84"><circle class="track" cx="42" cy="42" r="36"/><circle class="bar" cx="42" cy="42" r="36"/></svg><span class="ring-icon">' + ICON[cls] + '</span></div>' +
          '<div><h2>' + v[0] + '</h2><p class="small">' + v[1] + '</p>' + (tallyHtml ? '<div class="tally">' + tallyHtml + '</div>' : '') + '</div>' +
        '</div>' +
        '<p class="tiny muted" style="margin:12px 0 0">Checked with <a href="/settings/">' + esc(HW.profileLabel(HW.getProfile())) + '</a>' + (r.verdict === 'clear' ? ' · Not a halal certification: cross-contamination and recipe changes cannot be seen on a label.' : '') + '</p>' +
      '</div>' +
      extras.join('') +
      (parts.length > 1 ? '<h2 class="h3">Your label, colour-coded</h2><div class="label-map">' + parts.map(function (p, n) { return '<span class="lm-' + p.status + '" style="animation-delay:' + (n * 35) + 'ms">' + esc(p.text) + '</span>'; }).join('') + '</div>' +
        '<div class="legend"><span><i style="background:var(--haram)"></i>Haram</span><span><i style="background:var(--mushbooh)"></i>Doubtful</span><span><i style="background:var(--halal)"></i>Fine</span><span><i style="background:var(--border)"></i>No concern found</span></div>' : '') +
      (bad.length ? '<h2 class="h3">Needs attention (' + bad.length + ')</h2><ul class="items">' + bad.map(li).join('') + '</ul>' : '') +
      (ok.length ? '<details><summary class="small">' + ok.length + ' recognised ingredient' + (ok.length > 1 ? 's' : '') + ' with no concern</summary><ul class="items">' + ok.map(li).join('') + '</ul></details>' : '') +
      (r.unknown.length ? '<p class="small muted">Not in our database yet: ' + r.unknown.map(esc).join(', ') + '.</p>' : '') +
      '<div class="row gap" style="margin-top:14px"><button class="btn btn-ghost" type="button" data-share>Share result</button><a class="btn btn-ghost" href="/settings/">Change standard</a></div>' +
      '</div>';
    say('');
    var share = resultEl.querySelector('[data-share]');
    share.addEventListener('click', function () {
      var url = location.origin + '/check/' + (opts.barcode ? '?barcode=' + opts.barcode : '?q=' + encodeURIComponent(textarea.value.slice(0, 1500)));
      var data = { title: v[0], text: (opts.label ? opts.label + ': ' : '') + v[0], url: url };
      if (navigator.share) navigator.share(data).catch(function () {});
      else navigator.clipboard.writeText(url).then(function () { share.textContent = 'Link copied'; });
    });
    if (!opts.quiet) resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Live checking as you type.
  var liveTimer;
  textarea.addEventListener('input', function () {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () {
      productEl.innerHTML = '';
      if (textarea.value.trim().length > 2) run(textarea.value, { quiet: true }); else resultEl.innerHTML = '';
    }, 450);
  });
  $('[data-run]').addEventListener('click', function () { productEl.innerHTML = ''; run(textarea.value); });
  $('[data-sample]').addEventListener('click', function () { textarea.value = SAMPLE; productEl.innerHTML = ''; run(SAMPLE, { label: 'Example: jelly sweets' }); });


  // ── barcode lookup (Open Food Facts) ────────────────────
  // Popular UK products are bundled with the site, so these barcodes work
  // offline. Everything else is looked up live on Open Food Facts.
  var localProducts = fetch('/data/products-min.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });

  function showProduct(p) {
    productEl.innerHTML = '<div class="product">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '') +
      '<div><strong>' + esc(p.name) + '</strong><div class="small muted">' + esc(p.brand || '') + ' · ' + esc(p.code) + (p.offline ? ' · <span class="badge badge-halal">Saved offline</span>' : '') + '</div>' +
      (p.url ? '<a class="small" href="' + p.url + '">Full product page →</a>' : '') + '</div></div>' +
      (p.ingredients ? '<details class="small"><summary>Ingredients</summary><p>' + esc(p.ingredients) + '</p></details>' : '');
    textarea.value = p.ingredients;
    if (!p.ingredients && !(p.codes || []).length) {
      say('This product has no ingredient list in the database. Take a photo of the label to check it.');
      return;
    }
    run(p.ingredients, { codes: p.codes || [], vegan: p.labels.indexOf('en:vegan') > -1, halalLabel: p.labels.indexOf('en:halal') > -1, label: p.name, barcode: p.code });
  }
  function fromLocal(x) {
    return { code: x.c, name: x.n, brand: x.b, ingredients: x.i, labels: x.l || [], url: x.u, offline: true };
  }

  function lookup(code) {
    code = String(code).replace(/\D/g, '');
    if (code.length < 6) { say('That barcode looks too short.'); return; }
    stopCamera();
    say('Looking up ' + code + '…');
    productEl.innerHTML = ''; resultEl.innerHTML = '';
    localProducts.then(function (list) {
      var hit = list.find(function (x) { return x.c === code; });
      if (hit && !navigator.onLine) { say(''); showProduct(fromLocal(hit)); return; }
      var fields = 'product_name,product_name_en,brands,ingredients_text,ingredients_text_en,image_front_small_url,labels_tags,additives_tags';
      fetch('https://world.openfoodfacts.org/api/v2/product/' + code + '.json?fields=' + fields)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          say('');
          if (!d || d.status !== 1 || !d.product) {
            if (hit) { showProduct(fromLocal(hit)); return; }
            productEl.innerHTML = '<div class="card"><p><strong>Product ' + esc(code) + ' is not in the database yet.</strong></p><p class="small">Take a photo of the ingredients instead, and help others by <a href="https://world.openfoodfacts.org/cgi/product.pl?type=add&code=' + esc(code) + '" rel="noopener" target="_blank">adding it to Open Food Facts</a>.</p><button class="btn" type="button" data-go-photo>Photo of label</button></div>';
            productEl.querySelector('[data-go-photo]').addEventListener('click', function () { showTab('photo'); $('[data-photo]').click(); });
            return;
          }
          var p = d.product;
          showProduct({
            code: code,
            name: p.product_name_en || p.product_name || 'Unnamed product',
            brand: p.brands || '',
            image: p.image_front_small_url,
            ingredients: p.ingredients_text_en || p.ingredients_text || '',
            labels: p.labels_tags || [],
            codes: p.additives_tags || [],
            url: hit ? hit.u : '',
          });
        })
        .catch(function () {
          if (hit) { say(''); showProduct(fromLocal(hit)); return; }
          say('You seem to be offline and this product isn\'t saved on your device. Take a photo of the ingredients or paste them instead — that works offline.');
        });
    });
  }
  $('[data-barcode-form]').addEventListener('submit', function (ev) { ev.preventDefault(); lookup($('#barcode').value); });

  // ── camera scanning ─────────────────────────────────────
  var video = $('[data-video]');
  var scannerBox = $('[data-scanner]');
  var stream = null, zxingControls = null, scanning = false;

  function stopCamera() {
    scanning = false;
    if (zxingControls) { try { zxingControls.stop(); } catch (e) {} zxingControls = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    scannerBox.classList.remove('live');
  }
  function found(code) {
    if (!scanning) return;
    scanning = false;
    if (navigator.vibrate) navigator.vibrate(60);
    $('#barcode').value = code;
    lookup(code);
  }

  $('[data-start-scan]').addEventListener('click', function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('Camera not available here — type the barcode number instead.'); return; }
    say('Starting camera…');
    scanning = true;
    if ('BarcodeDetector' in window) {
      var detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
        stream = s; video.srcObject = s; video.play(); scannerBox.classList.add('live'); say('Point the camera at the barcode.');
        (function tick() {
          if (!scanning) return;
          detector.detect(video).then(function (codes) {
            if (codes.length) found(codes[0].rawValue); else requestAnimationFrame(tick);
          }).catch(function () { requestAnimationFrame(tick); });
        })();
      }).catch(camError);
    } else {
      loadScript(ZXING).then(function () {
        var reader = new window.ZXingBrowser.BrowserMultiFormatReader();
        scannerBox.classList.add('live'); say('Point the camera at the barcode.');
        return reader.decodeFromVideoDevice(undefined, video, function (result) { if (result) found(result.getText()); });
      }).then(function (controls) { zxingControls = controls; if (!scanning) stopCamera(); }).catch(camError);
    }
  });
  function camError() { stopCamera(); say('Could not open the camera. Allow camera access, or type the barcode number.'); }

  // ── photo → text (Tesseract, on device) ─────────────────
  var bar = $('[data-ocr-progress]');
  $('[data-photo]').addEventListener('change', function (ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    productEl.innerHTML = ''; resultEl.innerHTML = '';
    bar.hidden = false; bar.firstElementChild.style.width = '5%';
    say('Reading the label… (first time takes a few seconds)');
    loadScript(TESSERACT).then(function () {
      return window.Tesseract.recognize(file, 'eng', {
        logger: function (m) { if (m.status === 'recognizing text') bar.firstElementChild.style.width = Math.round(10 + m.progress * 90) + '%'; },
      });
    }).then(function (res) {
      bar.hidden = true;
      var text = res.data.text.replace(/\s+/g, ' ').trim();
      // Keep only what follows "Ingredients" when the photo includes other text.
      var at = text.toLowerCase().indexOf('ingredients');
      if (at > -1) text = text.slice(at + 11).replace(/^[\s:.-]+/, '');
      textarea.value = text;
      showTab('paste');
      if (!text) { say('No text found. Try a sharper, closer photo in good light.'); return; }
      say('Check the text below matches the label, then edit if needed.');
      run(text, { label: 'Photo of label' });
    }).catch(function () { bar.hidden = true; say('Could not read the photo. Try again, or type the ingredients.'); });
    ev.target.value = '';
  });

  // ── recent checks ───────────────────────────────────────
  var RECENT = 'hw-recent';
  function saveRecent(label, verdict, payload) {
    var list = (HW.store(RECENT) || []).filter(function (x) { return x.label !== label; });
    list.unshift(Object.assign({ label: label, verdict: verdict }, payload));
    HW.store(RECENT, list.slice(0, 8));
    showRecent();
  }
  function showRecent() {
    var list = HW.store(RECENT) || [];
    var box = $('[data-recent]');
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    box.querySelector('ul').innerHTML = list.map(function (x, n) {
      return '<li><button type="button" data-recent-i="' + n + '"><span>' + esc(x.label) + '</span>' + HW.badge(x.verdict === 'clear' ? 'halal' : x.verdict) + '</button></li>';
    }).join('');
    box.querySelectorAll('[data-recent-i]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = list[+b.dataset.recentI];
        if (x.barcode) { showTab('scan'); $('#barcode').value = x.barcode; lookup(x.barcode); }
        else { showTab('paste'); textarea.value = x.text; productEl.innerHTML = ''; run(x.text, { label: x.label }); }
      });
    });
  }
  showRecent();

  // ── deep links: /check/?q=…, ?barcode=…, #scan, #photo ──
  var params = new URLSearchParams(location.search);
  var hash = location.hash.slice(1);
  if (params.get('barcode')) { showTab('scan'); $('#barcode').value = params.get('barcode'); lookup(params.get('barcode')); }
  else if (params.get('q')) { textarea.value = params.get('q'); run(textarea.value); }
  else if (hash === 'scan' || hash === 'photo' || hash === 'paste') showTab(hash);
})();
