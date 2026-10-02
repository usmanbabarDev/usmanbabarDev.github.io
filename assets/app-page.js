/* /app/ — install instructions for each device, and the offline library. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function show(state) {
    ['installed', 'prompt', 'ios', 'manual'].forEach(function (s) { $('[data-state-' + s + ']').hidden = s !== state; });
  }
  if (standalone) show('installed');
  else if (ios) show('ios');
  else show('manual'); // switches to the Install button when the browser offers it
  window.addEventListener('beforeinstallprompt', function () { if (!standalone) show('prompt'); });
  window.addEventListener('appinstalled', function () { show('installed'); });

  // ── offline library ─────────────────────────────────────
  var status = $('[data-offline-status]');
  var badge = $('[data-offline-badge]');
  var bar = $('[data-offline-progress]');
  var saveBtn = $('[data-offline-save]');
  var offBtn = $('[data-offline-off]');
  var sizeText = '';

  fetch('/offline-pages.json').then(function (r) { return r.json(); }).then(function (d) {
    sizeText = (d.pages.length) + ' pages, about ' + Math.max(1, Math.round(d.bytes / 1048576)) + ' MB';
    refresh();
  }).catch(function () { refresh(); });

  function refresh() {
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
      status.textContent = 'Offline mode is turned off while testing on your laptop. It works on the live https site.';
      saveBtn.hidden = true;
      return;
    }
    if (!('serviceWorker' in navigator) || !('caches' in window)) {
      status.textContent = 'This browser does not support offline use.';
      saveBtn.hidden = true;
      return;
    }
    caches.open('hw-meta').then(function (c) { return c.match('/__offline-all'); }).then(function (r) { return r ? r.json() : null; }).then(function (info) {
      if (info) {
        status.textContent = 'Saved on this device (' + info.total + ' pages) on ' + new Date(info.date).toLocaleDateString() + '. Kept up to date automatically.';
        badge.hidden = false; offBtn.hidden = false;
        saveBtn.textContent = 'Update now';
      } else {
        status.textContent = 'Not downloaded yet' + (sizeText ? ' — ' + sizeText + '.' : '.') + ' Pages you visit are saved automatically.';
        badge.hidden = true; offBtn.hidden = true;
        saveBtn.textContent = 'Download everything for offline';
      }
    });
  }

  function send(msg) {
    return navigator.serviceWorker.ready.then(function (reg) { (reg.active || navigator.serviceWorker.controller).postMessage(msg); });
  }
  saveBtn.addEventListener('click', function () {
    if (!navigator.onLine) { status.textContent = 'Connect to the internet to download.'; return; }
    saveBtn.disabled = true; bar.hidden = false; bar.firstElementChild.style.width = '2%';
    status.textContent = 'Downloading…';
    send('offline-save');
  });
  offBtn.addEventListener('click', function () { send('offline-off'); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'offline-progress') {
        bar.hidden = false;
        bar.firstElementChild.style.width = Math.round((m.done / m.total) * 100) + '%';
        status.textContent = 'Downloading… ' + m.done + ' of ' + m.total + ' pages';
      }
      if (m.type === 'offline-done') { bar.hidden = true; saveBtn.disabled = false; refresh(); }
      if (m.type === 'offline-error') { bar.hidden = true; saveBtn.disabled = false; status.textContent = 'Download stopped — check your connection and try again.'; }
      if (m.type === 'offline-off') refresh();
    });
  }
})();
