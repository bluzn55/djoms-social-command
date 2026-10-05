/* Website Analytics presentation module.
   Uses the existing authenticated local-status response. Does not change login,
   credentials, posting, or Wix content. Research notes stay in this browser. */
(function () {
  'use strict';
  const VERSION = '2026-10-05.1';
  const ZONE = 'America/Chicago';
  const NOTE_KEY = 'djoms:website-research:v1';
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value === null || value === undefined || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const count = value => number(value) === null ? 'Not available' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(number(value));
  const percent = value => number(value) === null || number(value) < 0 || number(value) > 1 ? 'Not available' : (number(value) * 100).toFixed(0) + '%';
  function duration(value) {
    const n = number(value);
    if (n === null || n < 0) return 'Not measured';
    const seconds = Math.round(n);
    return seconds < 60 ? seconds + ' sec' : Math.floor(seconds / 60) + 'm ' + seconds % 60 + 's';
  }
  const list = value => Array.isArray(value) ? value : [];
  function ymd(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return null;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
    return p.year + '-' + p.month + '-' + p.day;
  }
  function shiftDay(value, days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const d = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function pageName(path) {
    const known = { '/':'Home', '/kjak-24-7':'KJAK 24.7', '/trading-post-1':'Trading Post', '/ember-hall':'Ember Hall', '/back-porch-rebellion':'Back Porch Rebellion' };
    if (known[path]) return known[path];
    return String(path || 'Unknown page').replace(/^\//, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function weekInfo(site) {
    const today = ymd(site.checkedAt || new Date());
    // The current backend requests 28 days, ending on the same date as its
    // seven-day summary. A boundary bucket may contain only part of a week.
    const windowStart = shiftDay(site.range?.start, -21);
    const windowEnd = site.range?.end;
    return list(site.weekly).map(row => {
      const start = ymd(row.start);
      const end = shiftDay(start, 7);
      const complete = !!(start && end && today && windowStart && windowEnd && start >= windowStart && end <= today && end <= windowEnd);
      return { ...row, weekStart: start, weekEnd: end, complete, weekLabel: (start || row.label || 'Unknown week') + (complete ? '' : ' · partial') };
    });
  }
  function insights(site, weeks) {
    const out = ['Owner testing is included. Jay reports that most current activity is layout testing, so these are observations, not proof of customer demand.'];
    const full = weeks.filter(w => w.complete && number(w.sessions) !== null).sort((a,b) => a.weekStart.localeCompare(b.weekStart));
    const a = full.at(-2), b = full.at(-1);
    if (a && b && a.weekEnd === b.weekStart && number(a.sessions) > 0) {
      const change = (number(b.sessions) - number(a.sessions)) / number(a.sessions) * 100;
      out.push('Completed weeks only: ' + count(a.sessions) + ' → ' + count(b.sessions) + ' sessions (' + (change >= 0 ? '+' : '') + change.toFixed(0) + '%). Partial weeks are excluded from this comparison.');
    } else out.push('Weekly growth: waiting for two consecutive complete weeks. Partial weeks are shown, but not compared as full weeks.');
    const top = list(site.topPages)[0];
    if (top) out.push('Most-viewed page in the returned ranking: ' + pageName(top.path) + ', ' + count(top.views) + ' views and ' + count(top.visitors) + ' tracked visitors. Next test: make its next step easy to find.');
    const source = list(site.trafficSources)[0];
    if (source) out.push('Largest reported source: ' + String(source.source || source.category || 'Unknown').replace(/_/g, ' ') + ', ' + count(source.sessions) + ' sessions. This does not identify which visits were yours.');
    if (list(site.topPages).some(row => number(row.avgTimeSeconds) === null)) out.push('Some page times were not measured. They stay marked “Not measured”, rather than being treated as zero-second visits.');
    out.push('Next-page journeys are not connected yet. Page bounce is not being presented as the percentage who continued to another page.');
    return out;
  }
  function weeklyChart(rows, key, title) {
    const max = Math.max(1, ...rows.map(r => number(r[key]) ?? 0));
    return '<article class="wda-chart"><h4>' + html(title) + '</h4><div class="wda-column-chart">' + rows.map(r => {
      const n = number(r[key]);
      return '<div class="wda-column"><strong>' + html(count(n)) + '</strong><div class="wda-track"><i style="height:' + (n === null ? 0 : Math.max(0, n) / max * 100).toFixed(2) + '%"></i></div><small>' + html(r.weekStart || r.label || '') + (r.complete ? '' : '<br><b>Partial week</b>') + '</small></div>';
    }).join('') + '</div></article>';
  }
  function table(headers, rows, caption) {
    return '<div class="wda-table-wrap"><table><caption>' + html(caption) + '</caption><thead><tr>' + headers.map(h => '<th scope="col">' + html(h) + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.map(cells => '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '">No rows returned for this report.</td></tr>') + '</tbody></table></div>';
  }
  function section(title, body, note) {
    return '<section class="wda-panel"><h3>' + html(title) + '</h3>' + (note ? '<p class="wda-note">' + html(note) + '</p>' : '') + body + '</section>';
  }
  function breakdown(title, rows, label, metric, unit) {
    return section(title, rows.length ? '<div class="wda-list">' + rows.map(row => '<div><span>' + html(label(row)) + '</span><strong>' + html(count(row[metric])) + ' ' + html(unit) + '</strong></div>').join('') + '</div>' : '<p>No rows returned for this report.</p>');
  }
  const CSS = `
.wda{padding:0!important;display:grid;gap:20px;font:17px/1.5 Arial,sans-serif;color:#302719;min-width:0}
.wda *{box-sizing:border-box}.wda h2{font:700 30px/1.2 Georgia,serif;margin:6px 0 12px}.wda h3{font:700 23px/1.3 Georgia,serif;margin:0 0 14px}.wda h4{font-size:18px;margin:0 0 14px}
.wda p{font-size:17px;line-height:1.5;margin:10px 0}.wda small{font-size:14px;line-height:1.4}.wda-head,.wda-panel{padding:22px!important;background:#fffaf0;border:1px solid #cbb994;border-radius:10px;min-width:0}
.wda-head{border-left:6px solid #9c742e}.wda .wda-note{color:#625238;font-size:15px}.wda .wda-caution{background:#fff1c9;border:1px solid #bc8932;border-radius:8px;padding:14px;font-size:17px}
.wda-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.wda-kpi{background:#fffaf0;border:1px solid #cbb994;border-radius:8px;padding:18px}.wda-kpi small,.wda-kpi strong{display:block}.wda-kpi strong{font-size:29px;line-height:1.2;margin-top:7px}
.wda-nuggets{display:grid;grid-template-columns:1fr 1fr;gap:12px}.wda-nuggets p{background:#f8efdc;border-left:4px solid #a27c36;padding:15px;margin:0}.wda-charts{display:grid;grid-template-columns:1fr;gap:18px}
.wda-chart{border:1px solid #d5c4a2;padding:16px;border-radius:8px}.wda-column-chart{display:flex;gap:15px;align-items:stretch}.wda-column{flex:1;min-width:0;text-align:center}.wda-column strong{display:block;font-size:20px}.wda-track{height:145px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #8e7c5f;margin:10px 0}.wda-track i{display:block;width:65%;background:#9c742e;min-width:8px}.wda-column small{overflow-wrap:anywhere;display:block}
.wda-ranking{display:grid;gap:15px}.wda-rank-line{display:grid;grid-template-columns:minmax(160px,1fr) 2fr auto;align-items:center;gap:14px}.wda-rank-line small{display:block}.wda-horizontal-track{height:18px;background:#eee0c7;border-radius:6px;overflow:hidden}.wda-horizontal-track i{height:100%;display:block;background:#9c742e}
.wda-table-wrap{overflow-x:auto;margin-top:20px}.wda table{border-collapse:collapse;width:100%;font-size:16px}.wda caption{text-align:left;color:#625238;padding:0 0 10px;font-size:15px}.wda th,.wda td{padding:13px 12px;text-align:left;border-bottom:1px solid #dfd0b5;vertical-align:top}.wda th{font-weight:700;background:#f1e4ca;white-space:nowrap}.wda td:first-child{min-width:165px}.wda td small{display:block;overflow-wrap:anywhere}
.wda-two{display:grid;grid-template-columns:1fr 1fr;gap:18px;min-width:0}.wda-list>div{display:flex;justify-content:space-between;gap:15px;padding:12px 0;border-bottom:1px solid #dfd0b5}.wda-list strong{white-space:nowrap}.wda-list span{overflow-wrap:anywhere}
.wda button{font-size:17px;padding:12px 18px;border:1px solid #80602b;border-radius:6px;background:#f4e5c7;color:#302719;cursor:pointer}.wda button:focus-visible,.wda textarea:focus-visible{outline:3px solid #4e695c;outline-offset:3px}.wda textarea{width:100%;font:17px/1.5 Arial,sans-serif;min-height:150px;padding:12px;background:white;color:#302719;border:1px solid #80602b;margin:10px 0;resize:vertical}.wda label{font-size:17px;font-weight:bold;display:block}.wda .wda-notes-status{min-height:1.5em}
@media(max-width:850px){.wda-two,.wda-nuggets{grid-template-columns:1fr}.wda-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.wda-head,.wda-panel{padding:17px!important}.wda-rank-line{grid-template-columns:1fr auto}.wda-horizontal-track{grid-column:1/-1;grid-row:2}.wda-column-chart{gap:8px}.wda-column small{font-size:13px}}
`;
  function renderWebsiteAnalytics() {
    const data = typeof localData !== 'undefined' ? localData : {};
    const site = data.website || {};
    const weeks = weekInfo(site);
    const pages = list(site.topPages);
    const connected = !!site.connected;
    const money = number(site.sales) === null ? 'Not available' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(number(site.sales));
    const metrics = [['Sessions',site.sessions],['Tracked visitors',site.visitors],['Page views',site.pageViews],['Average stay',duration(site.avgTimeSeconds)],['Pages / session',site.pagesPerSession],['Site bounce rate',percent(site.bounceRate)],['Contact-click sessions',site.contactClicks],['Forms submitted',site.formsSubmitted],['Reported sales',money]];
    const kpis = '<div class="wda-kpis">' + metrics.map(([label,value]) => '<div class="wda-kpi"><small>' + html(label) + '</small><strong>' + html(typeof value === 'string' ? value : count(value)) + '</strong></div>').join('') + '</div>';
    const max = Math.max(1,...pages.map(p => number(p.views) ?? 0));
    const ranking = '<div class="wda-ranking">' + pages.map((p,i) => '<div class="wda-rank-line"><span><b>' + (i+1) + '. ' + html(pageName(p.path)) + '</b><small>' + html(p.path) + '</small></span><span class="wda-horizontal-track"><i style="width:' + ((number(p.views) ?? 0) / max * 100).toFixed(2) + '%"></i></span><strong>' + html(count(p.views)) + ' views</strong></div>').join('') + '</div>';
    const pageTable = table(['Page','Views','Visitors','Sessions','Average time','Wix page bounce'],pages.map(p => ['<b>'+html(pageName(p.path))+'</b><small>'+html(p.path)+'</small>',html(count(p.views)),html(count(p.visitors)),html(count(p.sessions)),html(duration(p.avgTimeSeconds)),html(percent(p.bounceRate))]),'Current returned ranking, not a complete inventory of every site page.');
    const weekTable = table(['Week starts','Coverage','Sessions','Visitors','Views','Average stay','Pages / session'],weeks.map(w => [html(w.weekStart || w.label),w.complete?'Complete':'Partial',html(count(w.sessions)),html(count(w.visitors)),html(count(w.views)),html(duration(w.avgTimeSeconds)),html(count(w.pagesPerSession))]),'Unique visitors are reported per week. Do not add weekly visitors to get a unique monthly total.');
    let saved = '';
    try { saved = localStorage.getItem(NOTE_KEY) || ''; } catch (_) {}
    const output = '<div class="wda" data-version="'+VERSION+'">' +
      '<div class="wda-head"><small>DOC JAKS · WEBSITE RESEARCH</small><h2>Website Analytics</h2><p>What people visit, how long they stay, and what we should test next.</p><p><b>'+(connected?(site.partial?'Data connection: partial':'Data connection: available'):'Data connection: needs attention')+'</b> · '+html(site.message || 'Awaiting website data')+'</p><p class="wda-note">Summary dates: '+html(site.range?.start || 'Not available')+' through '+html(shiftDay(site.range?.end,-1) || 'Not available')+'. Time zone: Central. Last checked: '+html(site.checkedAt ? new Date(site.checkedAt).toLocaleString('en-US',{timeZone:ZONE}) : 'Not checked')+'.</p><div class="wda-caution"><b>Testing traffic is included.</b> Most current activity may be your own page checks. No owner-traffic exclusion has been applied. A healthy connection does not mean marketing performance is healthy.</div></div>' + kpis +
      section('Gold nuggets: observations and next tests','<div class="wda-nuggets">'+insights(site,weeks).map(t=>'<p>'+html(t)+'</p>').join('')+'</div>','Small samples and owner testing limit conclusions. These are prompts for investigation, not proven causes.') +
      section('Top pages, ranked by views',ranking+pageTable,'Last seven days, including today so far. Average time can be unmeasured. Bounce does not identify a visitor’s next page.') +
      section('Week by week','<div class="wda-charts">'+weeklyChart(weeks,'sessions','Sessions')+weeklyChart(weeks,'visitors','Tracked visitors')+weeklyChart(weeks,'views','Page views')+'</div>'+weekTable,'The first and current week may be partial. Growth observations compare only consecutive complete weeks.') +
      '<div class="wda-two">'+breakdown('Where visits came from',list(site.trafficSources),r=>String(r.source||r.category||'Unknown').replace(/_/g,' '),'sessions','sessions')+breakdown('Devices',list(site.devices),r=>r.device||'Unknown','sessions','sessions')+'</div>' +
      '<div class="wda-two">'+breakdown('New and returning visitors',list(site.visitorTypes),r=>r.type==='first_time_visitor'?'New':r.type==='returning_visitor'?'Returning':r.type,'visitors','visitors')+breakdown('Reported visitor locations',list(site.geography),r=>[r.city,r.region,r.country].filter(Boolean).join(', ')||'Unknown','visitors','visitors')+'</div>' +
      '<div class="wda-two">'+breakdown('Entry pages',list(site.landingPages),r=>pageName(r.path),'sessions','sessions')+breakdown('Exit pages',list(site.exitPages),r=>pageName(r.path),'sessions','sessions')+'</div>' +
      section('Contact and commerce','<p>Contact-click sessions: <b>'+html(count(site.contactClicks))+'</b>. Form submissions: <b>'+html(count(site.formsSubmitted))+'</b>.</p><p>These remain separate action counts, not a count of unique leads.</p><p>Reported sales: <b>'+html(money)+'</b>. Orders and conversion rates need reconciliation with the order records before we use them for decisions.</p>') +
      section('Research notes','<label for="wdaNotes">What changed, what happened, and what to test next</label><textarea id="wdaNotes" maxlength="12000" placeholder="Page / observation / change made / date / result">'+html(saved)+'</textarea><button type="button" id="wdaSaveNotes">Save notes in this browser</button><p class="wda-notes-status" id="wdaNotesStatus" role="status"></p>','Notes are stored only in this browser. They do not sync to Wix or another device.') +
      section('Expansion queue','<p><b>Not connected yet:</b> next-page journeys, per-page weekly history, individual button clicks, Google search terms, cart-to-checkout funnel, and site-speed diagnostics.</p><p>The page is ready for these additions. Missing data will stay marked as missing instead of being filled with invented numbers.</p>') + '</div>';
    const target = document.getElementById('content');
    if (target) target.innerHTML = output;
    const save = document.getElementById('wdaSaveNotes');
    if (save) save.addEventListener('click', function () {
      const text = document.getElementById('wdaNotes');
      const status = document.getElementById('wdaNotesStatus');
      try { localStorage.setItem(NOTE_KEY,text.value); status.textContent='Saved in this browser.'; }
      catch (_) { status.textContent='Could not save here. Copy your notes before leaving this page.'; }
    });
  }
  const style = document.createElement('style');
  style.id='wdaStyles'; style.textContent=CSS; document.head.appendChild(style);
  // app.js declares this as a global function, so its existing navigation and
  // Refresh button use this renderer without changing the main app.
  window.renderWebsiteAnalytics=renderWebsiteAnalytics;
  if (typeof activeView!=='undefined' && activeView==='Website Analytics') renderWebsiteAnalytics();
})();
