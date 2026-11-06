/* Doc Jaks Daily Maintenance: verified run records and G/Y/R. */
(function () {
  'use strict';
  var HISTORY_URL = '/daily-maintenance-history.json';
  var report = null, loadError = '', loading = false, checkedOnce = false;
  var TZ = 'America/Chicago';
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
    });
  }
  function fmt(iso) {
    if (!iso || !Number.isFinite(Date.parse(iso))) return 'Not recorded';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).format(new Date(iso)) + ' CT';
  }
  function currentResult() {
    var latest = report && report.latest;
    if (!latest || !latest.checkedAt || !Number.isFinite(Date.parse(latest.checkedAt))) {
      return {tone:'neutral',label:loadError?'UNVERIFIED':'NOT RUN',note:loadError||'First recorded daily check is pending.',run:null};
    }
    if (Date.now() - Date.parse(latest.checkedAt) > 40 * 60 * 60 * 1000) {
      return {tone:'yellow',label:'OVERDUE',note:'No completed scan has been recorded in over 40 hours.',run:latest};
    }
    var tone = ['green','yellow','red'].includes(latest.status) ? latest.status : 'neutral';
    return {tone:tone,label:tone==='green'?'GREEN':tone==='yellow'?'YELLOW':tone==='red'?'RED':'UNVERIFIED',
      note:latest.summary || '',run:latest};
  }
  function dot(tone) {
    return '<i class="dj-maint-dot dj-maint-dot-' + escapeHtml(tone) + '" aria-hidden="true"></i>';
  }
  function countIssues(run) {
    return run && Array.isArray(run.issues) ? run.issues.length : 0;
  }
  function quickHtml() {
    var state = currentResult(), run = state.run;
    return '<button type="button" class="dj-maint-quick dj-maint-tone-' + state.tone + '" data-dj-maint-open="1" ' +
      'aria-label="Open Daily Maintenance report and history">' +
      '<span class="dj-maint-quick-label">' + dot(state.tone) + '<b>DAILY MAINTENANCE</b>' +
      '<strong>' + escapeHtml(state.label) + '</strong></span>' +
      '<span class="dj-maint-quick-date">LAST RUN: ' + escapeHtml(run ? fmt(run.checkedAt) : 'Not yet recorded') +
      '</span><span class="dj-maint-quick-link">' +
      (state.tone === 'yellow' || state.tone === 'red' ? 'View fixes' : 'View history') + ' ›</span></button>';
  }
  function missionHtml() {
    var state = currentResult(), run = state.run;
    return '<button id="djMaintMissionCard" type="button" class="dj-maint-mission dj-maint-tone-' +
      state.tone + '" data-dj-maint-open="1">' +
      '<span class="dj-maint-mission-title">' + dot(state.tone) + '<b>DAILY MAINTENANCE</b>' +
      '<strong>' + escapeHtml(state.label) + '</strong></span>' +
      '<span class="dj-maint-mission-date">Last checked: ' + escapeHtml(run ? fmt(run.checkedAt) : 'Not run yet') + '</span>' +
      '<span class="dj-maint-mission-next">' +
      (state.tone==='yellow'||state.tone==='red'?countIssues(run)+' finding(s) · VIEW FIXES':'CHECK HISTORY') +
      ' ›</span></button>';
  }
  function mountMission() {
    var strip = document.getElementById('connectionStrip');
    if (!strip || strip.hidden || typeof activeView === 'undefined' || activeView !== 'Mission Control') return;
    var tile = document.getElementById('djMaintMissionCard');
    if (!tile) strip.insertAdjacentHTML('afterbegin', missionHtml());
    else tile.outerHTML = missionHtml();
  }
  function drawQuick() {
    var root = document.getElementById('djMaintenanceStrip');
    if (root) root.innerHTML = quickHtml();
  }
  function safeLink(url) {
    var value = String(url || '');
    try {
      var u = new URL(value);
      if (u.protocol === 'https:' || u.protocol === 'http:')
        return '<a href="' + escapeHtml(u.href) + '" target="_blank" rel="noopener noreferrer">Open page ↗</a>';
    } catch (_) {}
    return '';
  }
  function issuesHtml(run) {
    var list = run && Array.isArray(run.issues) ? run.issues : [];
    if (!list.length) return '<p class="dj-maint-empty">No repair items recorded for this run.</p>';
    return '<div class="dj-maint-issues">' + list.map(function (item, index) {
      var severity = item && item.severity === 'red' ? 'red' : 'yellow';
      return '<article class="dj-maint-issue dj-maint-tone-' + severity + '">' +
        '<div class="dj-maint-issue-head">' + dot(severity) + '<b>' + (index+1) + '. ' +
        escapeHtml(item.label || 'Website check finding') + '</b><small>' + severity.toUpperCase() + '</small></div>' +
        '<p>' + escapeHtml(item.problem || 'Needs review.') + '</p>' +
        (item.url ? '<code>' + escapeHtml(item.url) + '</code>' + safeLink(item.url) : '') +
        '<p><strong>WHAT TO FIX:</strong> ' + escapeHtml(item.fix || 'Review the affected page.') + '</p>' +
        '</article>';
    }).join('') + '</div>';
  }
  function historyHtml() {
    var history = report && Array.isArray(report.history) ? report.history : [];
    if (!history.length && report && report.latest) history = [report.latest];
    if (!history.length) return '<p class="dj-maint-empty">No completed checks recorded yet. The first run will appear here with its date, time, and findings.</p>';
    return history.slice(0,90).map(function (run, index) {
      var tone = ['green','yellow','red'].includes(run.status) ? run.status : 'neutral';
      var coverage = run.coverage || {};
      return '<details class="dj-maint-history-entry" ' + (index === 0 ? 'open' : '') + '>' +
        '<summary>' + dot(tone) + '<b>' + escapeHtml(fmt(run.checkedAt)) + '</b>' +
        '<strong>' + escapeHtml(tone.toUpperCase()) + '</strong>' +
        '<span>' + countIssues(run) + ' finding(s)</span></summary>' +
        '<div class="dj-maint-history-body"><p>' + escapeHtml(run.summary || 'Completed site check.') + '</p>' +
        '<p class="dj-maint-coverage">' + escapeHtml(coverage.pagesChecked || 0) + ' pages · ' +
        escapeHtml(coverage.linksChecked || 0) + ' links · ' +
        escapeHtml(coverage.browserPagesChecked || 0) + ' browser views checked' +
        (Number(coverage.unverified) ? ' · ' + escapeHtml(coverage.unverified) + ' unable to verify' : '') +
        '</p>' + issuesHtml(run) +
        (Array.isArray(run.notes) && run.notes.length ? '<p class="dj-maint-notes">' +
          run.notes.map(escapeHtml).join(' · ') + '</p>' : '') + '</div></details>';
    }).join('');
  }
  function render() {
    var host = document.getElementById('content');
    if (!host) return;
    var state = currentResult(), run = state.run, coverage = run && run.coverage || {};
    host.innerHTML = '<section class="dj-maint-page" aria-label="Daily Maintenance report">' +
      '<div class="dj-maint-page-head"><div><small>DOC JAKS · WEBSITE OPERATIONS</small>' +
      '<h2>DAILY MAINTENANCE</h2>' +
      '<p>Public website checks, recorded every morning. Actual results only.</p></div>' +
      '<span class="dj-maint-large-status dj-maint-tone-' + state.tone + '">' +
      dot(state.tone) + escapeHtml(state.label) + '</span></div>' +
      '<div class="dj-maint-stats">' +
      '<div><small>LAST RUN · LOUISIANA</small><b>' + escapeHtml(run ? fmt(run.checkedAt) : 'Not yet recorded') + '</b></div>' +
      '<div><small>PAGES CHECKED</small><b>' + escapeHtml(run ? coverage.pagesChecked || 0 : 'N/A') + '</b></div>' +
      '<div><small>LINKS CHECKED</small><b>' + escapeHtml(run ? coverage.linksChecked || 0 : 'N/A') + '</b></div>' +
      '<div><small>ISSUES TO REVIEW</small><b>' + escapeHtml(run ? countIssues(run) : 'N/A') + '</b></div></div>' +
      '<div class="dj-maint-page-note"><strong>' + escapeHtml(state.note) + '</strong>' +
      '<p>Green = tested checks passed. Yellow = needs review or check incomplete. Red = confirmed broken critical page or link. ' +
      'Gray = no verified result yet. Audio playback, protected pages, and other untested features are never marked verified.</p></div>' +
      '<div class="dj-maint-page-actions"><button type="button" data-dj-maint-refresh="1">' +
      (loading ? 'Checking for report…' : 'Refresh recorded results') + '</button>' +
      '<span>' + (loadError ? escapeHtml(loadError) :
        'Technical scan and dated record. The separate 4 AM ChatGPT review provides additional observations.') + '</span></div>' +
      '<h3>WHAT NEEDS FIXING</h3>' + (run ? issuesHtml(run) : '<p class="dj-maint-empty">No run yet. No green status is assumed.</p>') +
      '<h3>MAINTENANCE HISTORY</h3><div class="dj-maint-history">' + historyHtml() + '</div></section>';
  }
  async function load(force) {
    if (loading) return;
    if (!force && checkedOnce && Date.now() - (load.lastAt || 0) < 5 * 60 * 1000) return;
    loading = true; load.lastAt = Date.now();
    try {
      var response = await fetch(HISTORY_URL + '?v=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw new Error('History unavailable (HTTP ' + response.status + ')');
      var next = await response.json();
      if (!next || !Array.isArray(next.history)) throw new Error('Maintenance record format is invalid.');
      report = next; loadError = ''; checkedOnce = true;
    } catch (error) {
      loadError = 'Could not load the maintenance record. ' + String(error && error.message || error);
      checkedOnce = true;
    } finally {
      loading = false; drawQuick(); mountMission();
      if (typeof activeView !== 'undefined' && activeView === 'Daily Maintenance') render();
    }
  }
  function init() {
    drawQuick(); mountMission(); load(true);
    var strip = document.getElementById('connectionStrip');
    // Mission Control renders the maintenance tile directly; no mutation observer loop.
    document.addEventListener('click', function (event) {
      var refresh = event.target.closest('[data-dj-maint-refresh]');
      if (refresh) { event.preventDefault(); load(true); return; }
      var open = event.target.closest('[data-dj-maint-open]');
      if (open && typeof setView === 'function') { event.preventDefault(); setView('Daily Maintenance'); }
    });
    setInterval(function () {
      if (document.visibilityState === 'visible') load(false);
    }, 10 * 60 * 1000);
  }
  window.djomsDailyMaintenance = {render:render,missionHtml:missionHtml,refresh:function () { return load(true); }};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();