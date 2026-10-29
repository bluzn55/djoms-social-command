/* Doc Jaks analytics-consented placecard page activity.
   Counts page opens and visible-tab active seconds by saved placecard link.
   No visitor IDs, IPs, fingerprinting, contacts or personal details. */
(function () {
  'use strict';
  if (window.__docjaksCardPagesV1 ||
      navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true ||
      !window.crypto || typeof crypto.randomUUID !== 'function') return;
  if (!['https://www.docjaks.com', 'https://docjaks.com'].includes(location.origin)) return;
  window.__docjaksCardPagesV1 = true;

  const api = 'https://djoms-meta-bridge.vercel.app/api/meta/sm-welcome-journey';
  const storageName = 'docjaks:attributed-card:v1';
  const maxAge = 30 * 60 * 1000;
  const tagPattern = /^docjaks_post_[a-f0-9]{32,48}_(facebook|instagram|x|youtube)$/;
  let current = null, previousLocation = '', lastFlush = Date.now();

  function savedCard() {
    let value = null;
    try { value = JSON.parse(sessionStorage.getItem(storageName) || 'null'); }
    catch (_) { return null; }
    if (value && tagPattern.test(value.id || '') &&
        typeof value.at === 'number' && Date.now() >= value.at &&
        Date.now() - value.at < maxAge &&
        value.source === value.id.split('_').pop()) return value;
    try { sessionStorage.removeItem(storageName); } catch (_) {}
    return null;
  }

  function cardForCurrentPage() {
    if (location.pathname === '/sm-welcome') {
      const q = new URLSearchParams(location.search);
      const id = q.get('utm_id') || '';
      const source = q.get('utm_source') || '';
      const campaign = q.get('utm_campaign') || '';
      const match = id.match(tagPattern);
      if (match && source === match[1] &&
          /^docjaks_(food|music|book)$/.test(campaign)) {
        const old = savedCard();
        if (old && old.id === id) return old;
        const next = { id, source, at: Date.now() };
        try { sessionStorage.setItem(storageName, JSON.stringify(next)); }
        catch (_) { return null; }
        return next;
      }
    }
    return savedCard();
  }

  function report(kind, page, seconds, card) {
    if (!card || !page) return;
    const body = {
      type: 'docjaks:card-page', version: 1, event: kind,
      trackingId: card.id, source: card.source, path: page,
      seconds: seconds || 0, eventId: crypto.randomUUID()
    };
    try {
      fetch(api, {
        method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (_) {}
  }

  function flush() {
    if (!current) return;
    const moment = performance.now();
    if (current.visible) current.elapsed += Math.max(0, moment - current.tick);
    current.tick = moment;
    current.visible = !document.hidden;
    let difference = Math.max(0, Math.floor(current.elapsed / 1000) - current.sent);
    while (difference > 0) {
      const chunk = Math.min(120, difference);
      report('active', current.path, chunk, current.card);
      current.sent += chunk;
      difference -= chunk;
    }
    lastFlush = Date.now();
  }

  function openPage() {
    const path = (location.pathname || '/').slice(0, 179);
    const marker = path + '|' + (location.pathname === '/sm-welcome'
      ? new URLSearchParams(location.search).get('utm_id') || '' : '');
    if (marker === previousLocation) return;
    flush();
    current = null;
    previousLocation = marker;
    const card = cardForCurrentPage();
    if (!card || !/^\/[a-zA-Z0-9\-._~!$&'()+,;=:@/%]{0,179}$/.test(path)) return;
    current = {
      path, card, tick: performance.now(), elapsed: 0, sent: 0,
      visible: !document.hidden
    };
    report('view', path, 0, card);
  }

  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);
  window.addEventListener('popstate', openPage);
  window.addEventListener('pageshow', openPage);
  window.setInterval(function () {
    openPage();
    if (current && !document.hidden && Date.now() - lastFlush >= 15000) flush();
  }, 1500);
  openPage();
})();
