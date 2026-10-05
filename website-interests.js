/* Audience interests: an isolated, read-only extension to Website Analytics. */
(function () {
  'use strict';
  const VERSION = '2026-10-05.interests.1';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const count = v => num(v) === null ? 'Not available' : new Intl.NumberFormat('en-US').format(v);
  const duration = v => num(v) === null ? 'Not measured' : Math.round(v) < 60 ? Math.round(v) + ' sec' : Math.floor(Math.round(v) / 60) + 'm ' + Math.round(v) % 60 + 's';
  const names = { '/': 'Home', '/kjak': 'KJAK Entertainment Network', '/kjak-24-7': 'KJAK 24.7', '/back-porch-rebellion': 'Back Porch Rebellion', '/trading-post-1': 'Trading Post', '/ember-hall': 'Ember Hall' };
  const pageName = path => names[path] || String(path || 'Unknown page').replace(/^\//, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  let days = 7, sequence = 0;
  const running = new Map();
  function dateLabel(v) {
    const d = new Date(v);
    if (!v || !Number.isFinite(d.getTime())) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function shift(v, n) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return '';
    const d = new Date(v + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function lineGraph(rows, key, title, site) {
    if (!rows.length) return '<p>No weekly data returned.</p>';
    const today = dateLabel(site.checkedAt || new Date().toISOString());
    const first = shift(site.range?.start, -21), last = site.range?.end || '';
    const data = rows.map(r => {
      const start = dateLabel(r.start), end = shift(start, 7);
      return { value: num(r[key]), start, complete: !!(start && end && first && last && start >= first && end <= today && end <= last) };
    });
    const maxValue = Math.max(1, ...data.map(r => r.value ?? 0));
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const maximum = Math.ceil(maxValue / magnitude) * magnitude;
    const width = 760, height = 265, left = 62, right = 60, top = 38, bottom = 75;
    const x = i => data.length === 1 ? width / 2 : left + i * (width - left - right) / (data.length - 1);
    const y = v => top + (1 - v / maximum) * (height - top - bottom);
    let svg = '<svg class="wi-line" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(title) + ' weekly line graph"><title>' + esc(title) + '</title><desc>Dates run from left to right. Dashed segments include a partial week. Missing values are not connected.</desc>';
    for (let i = 0; i <= 4; i++) {
      const value = maximum * i / 4, yy = y(value);
      svg += '<line class="wi-grid" x1="' + left + '" y1="' + yy + '" x2="' + (width - right) + '" y2="' + yy + '"></line><text x="' + (left - 10) + '" y="' + (yy + 5) + '" text-anchor="end">' + esc(new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)) + '</text>';
    }
    data.forEach((r, i) => {
      const previous = data[i - 1];
      if (i && r.value !== null && previous.value !== null && shift(previous.start, 7) === r.start) svg += '<line class="wi-series' + (r.complete && previous.complete ? '' : ' wi-partial') + '" x1="' + x(i - 1) + '" y1="' + y(previous.value) + '" x2="' + x(i) + '" y2="' + y(r.value) + '"></line>';
      if (r.value !== null) svg += '<circle class="wi-point" cx="' + x(i) + '" cy="' + y(r.value) + '" r="5"><title>' + esc(r.start + ': ' + count(r.value) + (r.complete ? '' : ' (partial week)')) + '</title></circle><text class="wi-value" x="' + x(i) + '" y="' + (y(r.value) - 14) + '" text-anchor="middle">' + esc(count(r.value)) + '</text>';
      svg += '<text x="' + x(i) + '" y="' + (height - 40) + '" text-anchor="middle">' + esc(r.start ? r.start.slice(5).replace('-', '/') : '?') + '</text>';
      if (!r.complete) svg += '<text x="' + x(i) + '" y="' + (height - 17) + '" text-anchor="middle">Partial</text>';
    });
    return '<div class="wi-line-scroll">' + svg + '</svg></div>';
  }
  function convertWeeklyCharts(root, site) {
    const charts = root.querySelectorAll('.wda-chart');
    [['sessions', 'Sessions'], ['visitors', 'Tracked visitors'], ['views', 'Page views']].forEach(([key, title], i) => {
      const chart = charts[i];
      if (chart?.querySelector('.wda-column-chart')) chart.innerHTML = '<h4>' + esc(title) + '</h4>' + lineGraph(Array.isArray(site.weekly) ? site.weekly : [], key, title, site);
    });
  }
  function card(g, report) {
    const pages = Array.isArray(g.pages) ? g.pages : [];
    const share = report.reconciled && num(g.views) !== null && num(report.totals?.views) > 0 ? (g.views / report.totals.views * 100).toFixed(1) + '% of page views' : 'Share not available';
    const subtitles = { book: 'The Wooden Token and book-related pages', music: 'Radio, albums and music pages', soss: 'Sauce products and Smokehouse pages', general: 'Shared, mixed-purpose or unclassified pages' };
    const rows = pages.map(p => '<tr><td><b>' + esc(pageName(p.path)) + '</b><small>' + esc(p.path || 'No page path') + '</small></td><td>' + esc(count(p.views)) + '</td><td>' + esc(count(p.visitors)) + '</td><td>' + esc(duration(p.avgTimeSeconds)) + '</td></tr>').join('');
    return '<article class="wi-card wi-' + esc(g.id) + '"><h4>' + esc(g.label) + '</h4><p class="wi-subtitle">' + esc(subtitles[g.id] || '') + '</p><strong class="wi-big">' + esc(count(g.visitors)) + '</strong><span>tracked visitors</span><div class="wi-metrics"><span><b>' + esc(count(g.views)) + '</b> page views</span><span><b>' + esc(count(g.sessions)) + '</b> sessions</span></div><p class="wi-share">' + esc(share) + '</p><details><summary>See included pages (' + pages.length + ')</summary>' + (pages.length ? '<div class="wda-table-wrap"><table><caption>Per-page visitors can overlap. Do not add them for a group total.</caption><thead><tr><th>Page</th><th>Views</th><th>Visitors</th><th>Avg time</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p>No activity returned for the mapped pages in this period.</p>') + '</details></article>';
  }
  function draw(panel, report, error) {
    let text = '<div class="wi-heading"><div><small>AUDIENCE INTERESTS</small><h3>Book. Music. Soss. What are they exploring?</h3></div><div class="wi-buttons"><button type="button" data-interest-days="7" aria-pressed="' + (days === 7) + '">7 days</button><button type="button" data-interest-days="28" aria-pressed="' + (days === 28) + '">28 days</button></div></div><p>Based on pages viewed, not a confirmed reason for visiting. People can explore more than one theme.</p>';
    if (error) text += '<p class="wi-warning" role="alert">' + esc(error) + '</p><button type="button" data-interest-retry>Retry interest data</button>';
    else if (!report) text += '<p role="status">Reading Wix audience interests...</p>';
    else {
      const range = report.range || {};
      text += '<p class="wda-note"><b>' + esc(range.start) + ' through ' + esc(shift(range.end, -1)) + '</b> · Includes today so far · ' + esc(count(report.totals?.views)) + ' site page views · ' + esc(count(report.totals?.visitors)) + ' tracked site visitors.</p>';
      if (report.partial) text += '<p class="wi-warning">Some measurements are unavailable. ' + esc((report.warnings || []).join(' ')) + '</p>';
      text += '<div class="wi-cards">' + (report.groups || []).map(g => card(g, report)).join('') + '</div><div class="wi-explain"><p><b>No double-counting within a theme:</b> Wix counts unique visitors across that theme\'s pages. The same person may appear in Book and Music, so the four visitor and session counts must not be added together.</p><p><b>General / Unknown is not "by mistake."</b> The homepage, Trading Post, KJAK lobby, Ember Hall and mixed bundles do not prove one specific interest. Unmapped new pages stay here until classified.</p><p><b>How they found us stays separate.</b> This section does not claim a recommendation, a sale, a playback, or a confirmed motive. Tagged campaigns and optional survey answers are a later addition.</p></div><p class="wda-note">Interest data checked ' + esc(new Date(report.checkedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })) + ' Central. Results may be reused for up to two minutes. Existing Wix tracking and consent limits still apply.</p>';
    }
    panel.innerHTML = text;
    panel.querySelectorAll('[data-interest-days]').forEach(button => button.addEventListener('click', () => { days = Number(button.dataset.interestDays); load(panel); }));
    panel.querySelector('[data-interest-retry]')?.addEventListener('click', () => load(panel));
  }
  async function load(panel) {
    const ticket = ++sequence, selectedDays = days;
    draw(panel, null, null);
    try {
      let job = running.get(selectedDays);
      if (!job) {
        job = (async () => {
          const response = await fetch('/api/meta/website-interests?days=' + selectedDays, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000) });
          const data = await response.json();
          if (!response.ok || !data.connected || !Array.isArray(data.groups)) throw new Error(data.error || 'Interest data is not available yet. The rest of the dashboard is unchanged.');
          return data;
        })().finally(() => running.delete(selectedDays));
        running.set(selectedDays, job);
      }
      const data = await job;
      if (ticket === sequence && panel.isConnected) draw(panel, data, null);
    } catch (e) {
      if (ticket === sequence && panel.isConnected) draw(panel, null, e.name === 'TimeoutError' ? 'Wix took too long. Please retry the interest report.' : e.message || 'Interest data could not be loaded.');
    }
  }
  const style = document.createElement('style');
  style.id = 'wiStyles';
  style.textContent = `
.wda .wi-panel{border-top:5px solid #9c742e}.wda .wi-heading{display:flex;gap:18px;justify-content:space-between;align-items:flex-start}.wda .wi-heading h3{margin-top:5px}.wda .wi-buttons{display:flex;gap:8px;flex-shrink:0}.wda .wi-buttons button[aria-pressed=true]{background:#3e513c;color:white}.wda .wi-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:18px 0}.wda .wi-card{border:1px solid #cbb994;border-radius:9px;padding:20px;background:#fffdf7;min-width:0}.wda .wi-card h4{font-size:22px;margin:0}.wda .wi-card .wi-subtitle{font-size:15px;min-height:2.6em;color:#625238}.wda .wi-big{display:block;font-size:36px;line-height:1.25;margin:10px 0 2px}.wda .wi-metrics{display:flex;gap:20px;flex-wrap:wrap;margin-top:16px;font-size:17px}.wda .wi-share{font-weight:bold;color:#625238}.wda .wi-book{border-top:5px solid #76573e}.wda .wi-music{border-top:5px solid #496b60}.wda .wi-soss{border-top:5px solid #9a5435}.wda .wi-general{border-top:5px solid #84745b}.wda .wi-card summary{font-size:16px;font-weight:bold;cursor:pointer;padding:8px 0}.wda .wi-card summary:focus-visible{outline:3px solid #4e695c}.wda .wi-card .wda-table-wrap{margin-top:8px}.wda .wi-card table{min-width:480px}.wda .wi-card caption{font-size:14px}.wda .wi-card small{display:block}.wda .wi-warning{background:#fff1c9;border:1px solid #bc8932;border-radius:7px;padding:12px}.wda .wi-explain{border-top:1px solid #dfd0b5;margin-top:16px;padding-top:8px}.wda .wi-explain p{font-size:16px}.wda .wi-line-scroll{overflow-x:auto}.wda .wi-line{display:block;width:100%;min-width:540px;max-height:320px}.wda .wi-line text{font:16px Arial,sans-serif;fill:#44351f}.wda .wi-line .wi-value{font-weight:700}.wda .wi-line .wi-grid{stroke:#ded1b8;stroke-width:1}.wda .wi-series{stroke:#806027;stroke-width:3;vector-effect:non-scaling-stroke}.wda .wi-partial{stroke-dasharray:7 5}.wda .wi-point{fill:#806027;stroke:#fffaf0;stroke-width:2}
@media(max-width:700px){.wda .wi-cards{grid-template-columns:1fr}.wda .wi-heading{display:block}.wda .wi-buttons{margin:12px 0}.wda .wi-card{padding:16px}}
`;
  document.head.appendChild(style);
  const previous = window.renderWebsiteAnalytics;
  if (typeof previous !== 'function') return;
  window.renderWebsiteAnalytics = function () {
    previous.apply(this, arguments);
    const root = document.querySelector('#content .wda');
    if (!root) return;
    const site = typeof localData !== 'undefined' ? localData.website || {} : {};
    convertWeeklyCharts(root, site);
    const caution = root.querySelector('.wda-caution');
    if (caution) caution.innerHTML = '<b>Testing traffic may be included.</b> Owner/test exclusions have not been verified. A working connection does not prove customer demand.';
    const nuggets = root.querySelector('.wda-nuggets p');
    if (nuggets?.textContent.startsWith('Owner testing is included.')) nuggets.textContent = 'Some activity may be layout testing. Owner/test exclusions have not been verified, so these are observations, not proof of customer demand.';
    const panel = document.createElement('section');
    panel.id = 'wdaInterests'; panel.className = 'wda-panel wi-panel'; panel.dataset.version = VERSION;
    const kpis = root.querySelector('.wda-kpis');
    if (kpis) kpis.insertAdjacentElement('afterend', panel); else root.appendChild(panel);
    load(panel);
  };
  if (typeof activeView !== 'undefined' && activeView === 'Website Analytics') window.renderWebsiteAnalytics();
})();
