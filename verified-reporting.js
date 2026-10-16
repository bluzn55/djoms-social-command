/* Read-only reporting extension. Posting, scheduling, login and stored content are unchanged. */
(function () {
  'use strict';
  const VERSION = '2026-10-16.verified.1';
  const html = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const count = value => number(value) === null ? 'Not available' : new Intl.NumberFormat('en-US').format(value);
  const time = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(new Date(value)) : 'Not checked';
  const safeLink = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
  };
  const labels = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube' };
  const statusLabels = { available: 'Measurements returned', partial: 'Some measurements unavailable',
    unavailable: 'Measurements unavailable', not_connected: 'Not connected', not_entered: 'Not entered',
    manual_snapshots: 'Manual snapshots', no_posts_returned: 'No posts returned', separate_report: 'See YouTube report below' };
  let loadSequence = 0;
  const combined = new Map();
  const combinedPending = new Map();
  const combinedAttempts = new Map();

  window.loadAnalytics = async function (refresh = false) {
    const ticket = ++loadSequence;
    const range = platformMetricRange;
    let result;
    try {
      result = await api('analytics?range=' + encodeURIComponent(range) + (refresh ? '&refresh=1' : ''));
      if (result.version !== VERSION) throw new Error('The verified reporting service is not available on this deployment yet.');
    } catch (error) {
      result = { version: VERSION, range, platforms: {}, posts: [], history: [],
        warnings: [error.message || 'Statistics could not be retrieved.'], status: 'unavailable', checkedAt: null };
    }
    if (ticket === loadSequence && range === platformMetricRange) analyticsData = result;
    return result;
  };

  // Do not fall back from a missing period measurement to an unrelated lifetime counter.
  window.platformMetricData = function (info = {}, platform) {
    const row = analyticsData?.version === VERSION ? analyticsData.platforms?.[platform] || {} : {};
    return {
      audience: row.account?.followers ?? info.followers ?? info.subscribers ?? null,
      audienceChange: null, likes: row.likes ?? null, replies: row.comments ?? null,
      clicks: row.clicks ?? null, shares: row.shares ?? null, reactions: row.reactions ?? null,
      saves: row.saves ?? null, bookmarks: row.bookmarks ?? null,
      reach: row.views ?? null, interactions: row.interactions ?? null,
      watchTime: null, subscriberGain: null, topPostTitle: row.topPost?.title || null,
      topPostValue: row.topPost?.views ?? null, reportStatus: row.status || 'unavailable',
      trends: { engagement: [], clicks: [], shares: [], reach: [] }
    };
  };
  // Existing card labels are changed to Interactions by decorate() below.
  window.engagementRate = metrics => count(metrics?.interactions);

  function decorate() {
    const strip = document.getElementById('connectionStrip');
    if (strip) {
      for (const element of strip.querySelectorAll('.mission-glance-metrics small, .platform-chart-title, .platform-chart-subtitle, .platform-inline-metrics > div > span')) {
        if (element.textContent === 'Engagement') element.textContent = 'Interactions';
        if (element.textContent === 'Engagement trend') element.textContent = 'Verified trend not yet available';
        if (['Reach / views', 'Reach / Views'].includes(element.textContent)) element.textContent = 'Post views';
        if (element.textContent === 'Reach / views trend') element.textContent = 'Post-view trend';
      }
      for (const element of strip.querySelectorAll('.platform-drivers')) {
        if (element.dataset.verified !== VERSION) {
          element.dataset.verified = VERSION;
          element.innerHTML = '<span class="platform-drivers-title">POST MEASUREMENTS</span><span class="platform-drivers-empty">Open Analytics for verified per-post views, viewers and interactions. Missing values are not zero.</span>';
        }
      }
      let notice = strip.querySelector('#verifiedStatsNotice');
      if (!notice && !strip.hidden) {
        notice = document.createElement('p'); notice.id = 'verifiedStatsNotice'; notice.className = 'vr-note';
        notice.textContent = 'Green shows the account connection. It does not certify every statistic. Post views are current lifetime views of posts published in the selected dates; they are not unique people.';
        strip.appendChild(notice);
      }
    }
    const content = document.getElementById('content');
    if (content) for (const element of content.querySelectorAll('h3,h4,h5')) {
      if (element.textContent.trim() === 'Music / KJAK') element.textContent = 'Music / Outlaw Radio 5150';
    }
  }

  function metricCell(label, value, coverage) {
    let note = '';
    if (coverage && coverage.measuredPosts < coverage.expectedPosts) {
      note = `${coverage.measuredPosts} of ${coverage.expectedPosts} posts measured`;
      if (coverage.measuredSubtotal !== null) note += `; known subtotal ${count(coverage.measuredSubtotal)}`;
    }
    return '<div class="vr-metric"><span>' + html(label) + '</span><strong>' + html(count(value)) + '</strong>' + (note ? '<small>' + html(note) + '</small>' : '') + '</div>';
  }

  function platformPanel(platform, data) {
    const summary = data.platforms?.[platform] || {};
    const rows = (data.posts || []).filter(post => post.platform === platform);
    const metrics = [['Post views', 'views'], [platform === 'facebook' ? 'Reactions' : 'Likes', 'reactions'],
      ['Comments', 'comments'], ['Shares', 'shares'], [platform === 'instagram' ? 'Saves' : 'Link clicks', platform === 'instagram' ? 'saves' : 'clicks']];
    const body = rows.map(post => {
      const url = safeLink(post.permalink);
      const title = url ? '<a target="_blank" rel="noopener noreferrer" href="' + html(url) + '">' + html(post.title) + '</a>' : html(post.title);
      return '<tr><td><b>' + title + '</b><small>' + html(post.campaign) + ' · Published ' + html(time(post.publishedAt)) + '</small><small>Checked ' + html(time(post.checkedAt)) + '</small></td>' +
        ['views', 'reach', 'reactions', 'comments', 'shares', 'clicks'].map(key => '<td>' + html(count(post[key])) + '</td>').join('') +
        '</tr>' + ((post.warnings || []).length ? '<tr class="vr-warning-row"><td colspan="7"><details><summary>Why some numbers are missing</summary>' +
          post.warnings.map(warning => '<p>' + html(warning) + '</p>').join('') + '</details></td></tr>' : '');
    }).join('');
    return '<section class="box vr-platform"><h3>' + labels[platform] + '</h3><p><b>' + html(statusLabels[summary.status] || 'Not available') + '</b> · ' + rows.length + ' posts in this report</p>' +
      '<div class="vr-metrics">' + metrics.map(([label, key]) => metricCell(label, summary[key], summary.coverage?.[key])).join('') + '</div>' +
      (summary.inventory?.complete === false ? '<p class="vr-note">The full account-post inventory could not be verified. This report may not include every post.</p>' : '') +
      '<div class="vr-scroll"><table><thead><tr><th>Post</th><th>Views</th><th>Post viewers</th><th>Reactions / likes</th><th>Comments</th><th>Shares</th><th>Link clicks</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="7">No post rows returned for these dates. This is not a measurement of the whole account.</td></tr>') + '</tbody></table></div>' +
      '<p class="vr-note">Views and interactions are current lifetime counters for these posts. Post viewers are measured separately for each post and must not be added into a unique audience total.</p></section>';
  }

  function sourcePanels(report, error) {
    if (error) return '<section class="box"><h3>Other report sources</h3><p>' + html(error) + '</p></section>';
    if (!report) return '<section class="box"><h3>Other report sources</h3><p role="status">Checking Wix and YouTube; checking availability of radio and X statistics.</p></section>';
    const yt = report.youtube || {};
    const raw = report.website || {};
    const estimate = report.websiteTestingEstimate || {};
    const ytMetrics = yt.metrics || {};
    const x = report.social?.platforms?.x || {};
    return '<section class="box"><h3>Website: raw records and your testing estimate</h3><p>Website range: ' + html(raw.range?.start || 'Not available') + ' to ' + html(raw.range?.end || 'Not available') +
      ' (end boundary excluded), Central time. This website summary remains seven days when the social-post date selection changes.</p>' +
      '<div class="vr-metrics">' + metricCell('Raw Wix visitors', raw.visitors) + metricCell('Estimated after 25% testing', estimate.visitors) +
      metricCell('Raw page views', raw.pageViews) + '</div><p class="vr-note">The 25% allowance is your assumption, not a verified exclusion. Raw records stay unchanged. The remainder is not proof of customer demand.</p></section>' +
      '<section class="box"><h3>YouTube</h3><p><b>' + html(yt.status || 'Unavailable').replaceAll('_', ' ') + '</b>. ' + html(yt.message || '') + '</p>' +
      '<div class="vr-metrics">' + metricCell('Views on returned days', ytMetrics.views) + metricCell('Watch minutes', ytMetrics.estimatedMinutesWatched) +
      metricCell('Subscribers gained', ytMetrics.subscribersGained) + '</div><p class="vr-note">YouTube reports use Pacific days. Data returned through: ' + html(yt.returnedThrough || 'Not available') +
      '. Current channel subscribers: ' + html(count(yt.account?.subscribers)) + ' (not subscriber growth).</p>' +
      (yt.connectUrl ? '<a class="button" href="/api/meta/youtube-report-connect">Enable read-only YouTube statistics</a>' : '') + '</section>' +
      '<section class="box"><h3>X</h3><p>' + html(report.x?.message || '') + '</p><div class="vr-metrics">' + metricCell('Recorded posts', x.posts) +
      metricCell('Manually entered views', x.views) + '</div><p>Existing manual posts can be linked in Content Library. No paid X analytics were enabled.</p></section>' +
      '<section class="box"><h3>Outlaw Radio 5150</h3><p><b>Current listening statistics are not connected.</b> Website visits are not listening sessions.</p><p class="vr-note">Historical Radio.co export: ' +
      html(report.radio?.historicalImport?.firstDate || 'Unknown') + ' to ' + html(report.radio?.historicalImport?.lastDate || 'Unknown') +
      '. It is not used as current listening data. Individual website song previews are also not connected.</p></section>';
  }

  async function loadCombined(range, refresh = false) {
    if (combinedPending.has(range)) return combinedPending.get(range);
    combinedAttempts.set(range, Date.now());
    const job = api('report?range=' + encodeURIComponent(range) + (refresh ? '&refresh=1' : ''))
      .then(report => { combined.set(range, { report, checkedAt: Date.now() }); return report; })
      .catch(error => { combined.set(range, { error: error.message, checkedAt: Date.now() }); return null; })
      .finally(() => {
        combinedPending.delete(range);
        if (activeView === 'Analytics' && platformMetricRange === range) drawAnalytics(false);
      });
    combinedPending.set(range, job);
    return job;
  }

  function drawAnalytics(autoload = true) {
    const data = analyticsData || {};
    const range = platformMetricRange;
    const period = data.period || {};
    const selected = combined.get(range);
    const source = selected?.report;
    const campaignRows = (data.campaigns || []).map(campaign => '<tr><td><b>' + html(campaign.campaign) + '</b></td>' +
      ['facebook', 'instagram'].map(platform => '<td>' + html(count(campaign.platforms?.[platform]?.posts)) + '</td><td>' + html(count(campaign.platforms?.[platform]?.views)) + '</td>').join('') + '</tr>').join('');
    document.getElementById('content').innerHTML = '<div class="vr" data-report-version="' + VERSION + '"><section class="box"><h2>Verified social performance</h2>' +
      '<p><b>Posts published ' + html(period.startDate || 'within the selected dates') + ' to ' + html(period.endDate || 'today') + '</b>, Central time. Today is partial. Checked ' + html(time(data.checkedAt)) + '.</p>' +
      '<div class="vr-toolbar">' + [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['365d', '1 year']].map(([key, label]) =>
        '<button type="button" data-report-range="' + key + '" aria-pressed="' + (key === range) + '">' + label + '</button>').join('') +
      '<button type="button" data-report-refresh="true">Refresh report</button></div><p class="vr-note">Missing data is shown as Not available, never changed to zero. A connected account does not guarantee permission for every measurement.</p>' +
      (data.warnings || []).map(warning => '<p class="vr-note">' + html(warning) + '</p>').join('') + '</section>' +
      platformPanel('facebook', data) + platformPanel('instagram', data) +
      '<section class="box"><h3>Our three campaigns</h3><p>Only posts matched to saved DJOMS campaign records are assigned here. Other account posts remain Unassigned.</p><div class="vr-scroll"><table><thead><tr><th>Campaign</th><th>Facebook posts</th><th>Facebook post views</th><th>Instagram posts</th><th>Instagram post views</th></tr></thead><tbody>' +
      (campaignRows || '<tr><td colspan="5">Campaign measurements are unavailable.</td></tr>') + '</tbody></table></div></section>' +
      sourcePanels(source, selected?.error) + '<p class="vr-note">Reporting version ' + VERSION + '. No cross-platform unique audience or campaign-caused sales are inferred.</p></div>';
    if (autoload && (!combinedAttempts.has(range) || Date.now() - combinedAttempts.get(range) > 60000)) void loadCombined(range);
  }

  const previousRender = window.render;
  window.render = function () {
    previousRender();
    if (activeView === 'Analytics') drawAnalytics();
    decorate();
  };
  const previousStrip = window.renderConnectionStrip;
  window.renderConnectionStrip = function () { previousStrip(); decorate(); };

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-report-range],[data-report-refresh]');
    if (!button) return;
    event.preventDefault();
    if (button.dataset.reportRange) platformMetricRange = button.dataset.reportRange;
    button.disabled = true;
    await loadAnalytics(true);
    if (activeView === 'Analytics') drawAnalytics(false);
    void loadCombined(platformMetricRange, true);
  });

  const style = document.createElement('style');
  style.textContent = '.vr{font-size:18px;line-height:1.5}.vr .box{margin-bottom:20px}.vr-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}.vr-toolbar [aria-pressed="true"]{font-weight:800;text-decoration:underline}.vr-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;margin:16px 0}.vr-metric{border:1px solid var(--line,#cbbb9e);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:6px}.vr-metric strong{font-size:25px;line-height:1.2}.vr small,.vr-note{font-size:15px;line-height:1.6}.vr-note{border-left:3px solid #ae8536;padding:8px 12px;margin:14px 0}.vr-scroll{overflow-x:auto}.vr table{border-collapse:collapse;width:100%;min-width:760px}.vr th,.vr td{text-align:left;padding:12px;vertical-align:top;border-bottom:1px solid #d5c8ae}.vr td small{display:block;min-width:210px}.vr th{font-weight:800}.vr-warning-row td{padding-top:0}.vr details p{margin:5px 0}.vr a{font-weight:700}.vr button{font-size:17px;padding:10px 15px}.vr h2{font-size:30px}.vr h3{font-size:25px}';
  document.head.appendChild(style);
  const root = document.getElementById('content');
  if (root) new MutationObserver(decorate).observe(root, { childList: true, subtree: true });
  if (typeof owner !== 'undefined' && owner) window.render();
})();
