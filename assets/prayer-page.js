/* Prayer-time and mosque pages: live times, next prayer, method/Asr choice,
 * monthly timetable and "near me" (location is only used on your device). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = window.HW ? HW.esc : function (s) { return String(s); };
  var KEY = 'hw-prayer';
  var LABELS = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  var ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  function settings() {
    var saved = (window.HW && HW.store(KEY)) || {};
    var hanafi = window.HW && HW.getProfile().madhab === 'hanafi';
    return { method: saved.method || 'mwl', asr: saved.asr || (hanafi ? 'hanafi' : 'standard') };
  }
  function save(s) { if (window.HW) HW.store(KEY, s); }
  var km = function (a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.pow(Math.sin(dLon / 2), 2);
    return 12742 * Math.asin(Math.sqrt(h));
  };
  function locate(status, done) {
    if (!navigator.geolocation) { status.textContent = 'Location is not available on this device.'; return; }
    status.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      status.textContent = '';
      done([pos.coords.latitude, pos.coords.longitude]);
    }, function () { status.textContent = 'Location not allowed. Pick your city from the list instead.'; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  }

  // ── a city's prayer page ─────────────────────────────────
  var place = $('[data-prayer-place]');
  if (place && window.PrayerTimes) {
    var lat = +place.getAttribute('data-lat'), lon = +place.getAttribute('data-lon');
    // Remember this city so sunset mode (day/night) uses local sunset times.
    if (window.HW) { HW.store('hw-loc', { lat: lat, lon: lon }); try { localStorage.removeItem('hw-sun'); } catch (e) {} }
    var methodSel = $('[data-p-method]', place), asrSel = $('[data-p-asr]', place);
    var s = settings();
    methodSel.value = s.method; asrSel.value = s.asr;
    var todayTimes;

    var render = function () {
      var opts = { method: methodSel.value, asr: asrSel.value };
      var now = new Date();
      todayTimes = PrayerTimes.times(now, lat, lon, opts);
      ORDER.forEach(function (k) {
        var cell = $('[data-p="' + k + '"] strong', place);
        if (cell) cell.textContent = PrayerTimes.format(todayTimes[k]);
      });
      var label = $('[data-today-label]');
      if (label) label.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      // Month timetable for the current month.
      var table = $('[data-prayer-month]');
      if (table) {
        var y = now.getFullYear(), m = now.getMonth(), days = new Date(y, m + 1, 0).getDate(), rows = '';
        for (var d = 1; d <= days; d++) {
          var t = PrayerTimes.times({ y: y, m: m + 1, d: d }, lat, lon, opts);
          rows += '<tr' + (d === now.getDate() ? ' class="today"' : '') + '><td>' + d + '</td>' + ORDER.map(function (k) { return '<td>' + PrayerTimes.format(t[k]) + '</td>'; }).join('') + '</tr>';
        }
        table.querySelector('tbody').innerHTML = rows;
        $('[data-month-label]', table).textContent = new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      }
      tick();
    };
    var tick = function () {
      var now = Date.now(), next = null;
      ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].some(function (k) {
        if (todayTimes[k] && todayTimes[k].getTime() > now) { next = k; return true; }
        return false;
      });
      place.querySelectorAll('.prayer-cell').forEach(function (c) { c.classList.toggle('is-next', c.getAttribute('data-p') === next); });
      var box = $('[data-next]', place);
      if (!next) {
        var tomorrow = PrayerTimes.times(new Date(now + 864e5), lat, lon, { method: methodSel.value, asr: asrSel.value });
        box.hidden = false;
        $('[data-next-name]', box).textContent = 'Fajr ' + PrayerTimes.format(tomorrow.fajr);
        $('[data-next-in]', box).textContent = 'tomorrow';
        return;
      }
      var mins = Math.round((todayTimes[next].getTime() - now) / 60000);
      box.hidden = false;
      $('[data-next-name]', box).textContent = LABELS[next] + ' ' + PrayerTimes.format(todayTimes[next]);
      $('[data-next-in]', box).textContent = 'in ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' : '') + (mins % 60) + ' min';
    };
    [methodSel, asrSel].forEach(function (sel) {
      sel.addEventListener('change', function () { save({ method: methodSel.value, asr: asrSel.value }); render(); });
    });
    render();
    setInterval(tick, 30000);
  }

  // ── live mini timetable on mosque pages ──────────────────
  var mini = $('[data-prayer-mini]');
  if (mini && window.PrayerTimes) {
    var ms = settings();
    var mt = PrayerTimes.times(new Date(), +mini.getAttribute('data-lat'), +mini.getAttribute('data-lon'), ms);
    mini.querySelectorAll('[data-p]').forEach(function (el) { el.querySelector('b').textContent = PrayerTimes.format(mt[el.getAttribute('data-p')]); });
  }

  // ── "use my location" on the prayer-times hub ────────────
  var nearPrayer = $('[data-near-prayer]');
  if (nearPrayer) {
    var places = JSON.parse(($('#places-data') || { textContent: '[]' }).textContent);
    nearPrayer.addEventListener('click', function () {
      locate($('[data-near-status]'), function (me) {
        var best = null, bestD = Infinity;
        places.forEach(function (p) { var d = km(me, [p[1], p[2]]); if (d < bestD) { bestD = d; best = p; } });
        if (best) location.href = '/prayer-times/' + best[0] + '/';
      });
    });
  }

  // ── "mosques near me" on the mosques hub ─────────────────
  var nearMosque = $('[data-near-mosque]');
  if (nearMosque) {
    nearMosque.addEventListener('click', function () {
      var status = $('[data-near-status]');
      locate(status, function (me) {
        status.textContent = 'Finding mosques…';
        fetch('/data/mosques-min.json').then(function (r) { return r.json(); }).then(function (list) {
          var near = list.map(function (m) { return { m: m, d: km(me, [m[1], m[2]]) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 12);
          status.textContent = '';
          $('[data-near-results]').innerHTML = '<h2>Nearest mosques</h2><div class="mosque-list">' + near.map(function (x) {
            var m = x.m;
            return '<article class="card mosque-card"><h3>' + esc(m[0]) + '</h3><p class="small">' + esc(m[3] || m[5]) + '</p><p class="small muted">' + x.d.toFixed(1) + ' km away · <a href="/mosques/' + m[4] + '/">More in ' + esc(m[5]) + '</a></p>' +
              '<a class="btn btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=' + m[1] + ',' + m[2] + '" target="_blank" rel="noopener">Directions</a></article>';
          }).join('') + '</div>';
        }).catch(function () { status.textContent = 'Could not load the mosque list. Check your connection.'; });
      });
    });
  }
})();
