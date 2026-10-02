/* HalalVerdict prayer-time calculator. Runs in the browser (offline) and in
 * Node (for the static pages and tests). Standard astronomical formulas for
 * the sun's declination and the equation of time, with a high-latitude rule
 * for UK summer nights when the sun never reaches the Fajr/Isha angle.
 *
 * All times are computed in UTC and formatted in the place's time zone. */
(function (root) {
  'use strict';

  var METHODS = {
    mwl: { name: 'Muslim World League', fajr: 18, isha: 17 },
    isna: { name: 'ISNA (North America)', fajr: 15, isha: 15 },
    egypt: { name: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
    makkah: { name: 'Umm al-Qura (Makkah)', fajr: 18.5, ishaMinutes: 90 },
    karachi: { name: 'University of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
    moonsighting: { name: 'Fixed 18° (common in UK mosques)', fajr: 18, isha: 18 },
  };
  var DEFAULTS = { method: 'mwl', asr: 'standard', highLat: 'angle' };

  var rad = function (d) { return d * Math.PI / 180; };
  var deg = function (r) { return r * 180 / Math.PI; };
  var sin = function (d) { return Math.sin(rad(d)); };
  var cos = function (d) { return Math.cos(rad(d)); };
  var tan = function (d) { return Math.tan(rad(d)); };
  var asin = function (x) { return deg(Math.asin(x)); };
  var acos = function (x) { return deg(Math.acos(x)); };
  var atan2 = function (y, x) { return deg(Math.atan2(y, x)); };
  var acot = function (x) { return deg(Math.atan(1 / x)); };
  var fix = function (a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

  // Julian date at 0h UTC of a calendar date.
  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  // Sun declination and equation of time (hours) for a Julian date.
  function sun(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360);
    var q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    var e = 23.439 - 0.00000036 * D;
    var RA = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24);
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - RA };
  }

  // Hours from solar noon until the sun is `angle` degrees below the horizon.
  function hourAngle(angle, lat, decl) {
    var x = (-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
    return x < -1 || x > 1 ? NaN : acos(x) / 15;
  }

  /**
   * @param {Date|{y,m,d}} date   calendar date (local to the place)
   * @param {number} lat, lon     degrees
   * @param {object} [opts]       { method, asr: 'standard'|'hanafi', highLat: 'angle'|'seventh'|'middle' }
   * @returns {object} times as UTC Date objects: fajr, sunrise, dhuhr, asr, maghrib, isha
   */
  function times(date, lat, lon, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var M = METHODS[opts.method] || METHODS.mwl;
    var y, mo, d;
    if (date instanceof Date) { y = date.getFullYear(); mo = date.getMonth() + 1; d = date.getDate(); } else { y = date.y; mo = date.m; d = date.d; }
    var jd0 = julian(y, mo, d);

    // Solve each time with the sun's position at that moment (two passes).
    function solve(fn, guess) {
      var t = guess;
      for (var i = 0; i < 2; i++) { var s = sun(jd0 + t / 24); t = fn(s); if (isNaN(t)) return NaN; }
      return t;
    }
    var noonOf = function (s) { return fix(12 - lon / 15 - s.eqt, 24); };
    var dhuhr = solve(noonOf, 12);
    var below = function (angle, dir, guess) {
      return solve(function (s) { return noonOf(s) + dir * hourAngle(angle, lat, s.decl); }, guess);
    };
    var sunrise = below(0.833, -1, 6);
    var sunset = below(0.833, 1, 18);
    var fajr = below(M.fajr, -1, 5);
    var isha = M.ishaMinutes ? sunset + M.ishaMinutes / 60 : below(M.isha, 1, 18);
    var factor = opts.asr === 'hanafi' ? 2 : 1;
    var asr = solve(function (s) {
      var angle = -acot(factor + tan(Math.abs(lat - s.decl)));
      return noonOf(s) + hourAngle(angle, lat, s.decl);
    }, 15);

    // High latitudes: limit Fajr/Isha to a portion of the night.
    var night = 24 - (sunset - sunrise);
    var portion = function (angle) {
      if (opts.highLat === 'seventh') return night / 7;
      if (opts.highLat === 'middle') return night / 2;
      return (angle / 60) * night; // angle-based
    };
    if (isNaN(fajr) || sunrise - fajr > portion(M.fajr)) fajr = sunrise - portion(M.fajr);
    if (!M.ishaMinutes && (isNaN(isha) || isha - sunset > portion(M.isha))) isha = sunset + portion(M.isha);

    var base = Date.UTC(y, mo - 1, d);
    var toDate = function (h) { return isNaN(h) ? null : new Date(base + Math.round(h * 60) * 60000); };
    return {
      fajr: toDate(fajr), sunrise: toDate(sunrise), dhuhr: toDate(dhuhr + 1 / 60), // Dhuhr a minute after zenith
      asr: toDate(asr), maghrib: toDate(sunset), isha: toDate(isha),
      highLatAdjusted: night > 0 && (sunrise - fajr >= portion(M.fajr) - 1e-9),
    };
  }

  // Qibla bearing (degrees from true north) from a location.
  function qibla(lat, lon) {
    var kLat = 21.4225, kLon = 39.8262;
    var b = atan2(sin(kLon - lon), cos(lat) * tan(kLat) - sin(lat) * cos(kLon - lon));
    return fix(b, 360);
  }

  function format(date, tz) {
    if (!date) return '—';
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'Europe/London' });
  }

  var api = { times: times, qibla: qibla, format: format, METHODS: METHODS, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrayerTimes = api;
})(this);
