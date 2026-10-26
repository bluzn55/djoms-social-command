/* DOC JAKS · Returning Visitor Intelligence
   Wix aggregate audience numbers and separately consented, anonymous browser
   journeys. These two sources must never be summed or presented as people. */
(function () {
  'use strict';
  const VERSION = '2026-10-26.1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ok = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const whole = value => ok(value) ? new Intl.NumberFormat('en-US').format(value) : 'N/A';
  const decimal = value => ok(value) ? value.toFixed(2) : 'N/A';
  const percent = value => ok(value) ? value.toFixed(1)+'%' : 'N/A';
  const reportCache = new Map();
  const busy = new Map();
  let serial = 0;

  function fmtDate(value, withTime) {
    const parsed = new Date(value || '');
    if (!Number.isFinite(parsed.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', month: '2-digit', day: '2-digit',
      year: 'numeric', ...(withTime ? {hour:'numeric',minute:'2-digit'} : {})
    }).format(parsed).replace(/\//g, '-');
  }
  function wixNumbers() {
    const site = typeof websiteSnapshot === 'function' ? websiteSnapshot() : {};
    const types = Array.isArray(site?.visitorTypes) ? site.visitorTypes : [];
    const value = type => {
      const n = types.find(row => row?.type === type)?.visitors;
      return ok(n) ? n : null;
    };
    const returning = value('returning_visitor');
    const newVisitors = value('first_time_visitor');
    const visitors = site?.connected && ok(site.visitors) ? site.visitors : null;
    const sessions = site?.connected && ok(site.sessions) ? site.sessions : null;
    return {visitors, sessions, returning, newVisitors,
      visitsPerVisitor: visitors > 0 && sessions !== null ? sessions / visitors : null,
      returningShare: site?.visitorReconciliation?.status==='reconciled' &&
        visitors > 0 && returning !== null ? returning / visitors * 100 : null,
      synced:site?.visitorReconciliation?.status==='reconciled'};
  }
  const query = () => typeof websitePeriodQuery === 'function'
    ? websitePeriodQuery() : 'range=7d';
  async function getDetails() {
    const period = query();
    const saved = reportCache.get(period);
    if (saved && Date.now() - saved.savedAt < 90000) return saved.data;
    if (busy.has(period)) return busy.get(period);
    const promise = (async () => {
      const response = await fetch('/api/meta/visitor-intelligence?' + period,
        {credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.status === 'unavailable')
        throw new Error(data?.error || 'Visitor history is not connected yet.');
      reportCache.set(period, {data,savedAt:Date.now()});
      return data;
    })().finally(() => busy.delete(period));
    busy.set(period,promise);
    return promise;
  }
  function stat(title, value, note) {
    return '<span class="rv-kpi"><small>'+escape(title)+'</small><strong>'+
      escape(value)+'</strong>'+(note?'<em>'+escape(note)+'</em>':'')+'</span>';
  }
  function boxHeader(compact) {
    const n = wixNumbers();
    return '<div class="rv-heading"><strong>RETURNING VISITOR INTELLIGENCE</strong>'+
      (compact?'<span>Wix totals + private browser-history detail</span>':
        '<p>Are people coming back to Doc Jaks? Wix counts new and returning visitors. The optional browser history below shows repeat visits after tracking began.</p>')+
      '</div><div class="rv-stat-grid">'+
      stat('Visits per visitor',decimal(n.visitsPerVisitor),'Wix · visits ÷ visitors')+
      stat('Wix returning visitors',whole(n.returning),'Distinct visitors, where reported')+
      stat('Wix return share',percent(n.returningShare),
        n.synced?'Returning ÷ total visitors':'Pending: Wix reports disagree')+
      (compact?'':stat('Wix new visitors',whole(n.newVisitors),'Selected dates'))+
      '</div>';
  }
  function readableTime(seconds) {
    if (!ok(seconds)) return 'N/A';
    const n = Math.round(seconds);
    if (n === 0) return '0s recorded';
    if (n < 60) return n+'s';
    const hours=Math.floor(n/3600), minutes=Math.floor((n%3600)/60), rest=n%60;
    return (hours?hours+'h ':'')+(minutes||hours?minutes+'m ':'')+rest+'s';
  }
  function pageLabel(path) {
    const names={
      '/':'Home',
      '/the-pit':'The Pit',
      '/the-wooden-token':'The Wooden Token',
      '/outlaw-radio-5150':'Outlaw Radio 5150',
      '/listenting-dock':'Listening Dock',
      '/trading-post':'Trading Post',
      '/ember-hall':'Ember Hall'
    };
    const value=String(path||'/');
    return names[value]||value.split('/').filter(Boolean).pop()?.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())||'Home';
  }
  function recentSessions(sessions) {
    if (!Array.isArray(sessions) || !sessions.length) return '<p class="rv-empty">No recorded visit details yet.</p>';
    return '<div class="rv-session-list">'+sessions.map((s,index) =>
      '<section class="rv-session" aria-label="Website visit details">'+
        '<div class="rv-session-heading"><strong>VISIT '+(index+1)+' · '+escape(fmtDate(s.startedAt,true))+'</strong>'+
          '<b>'+escape(readableTime(s.activeSeconds))+' recorded on pages</b></div>'+
        '<p><b>'+whole(s.views)+'</b> page views · From: '+escape(s.source||'Direct / Unknown')+
          (s.campaign?' · Campaign: '+escape(s.campaign):'')+'</p>'+
        (Array.isArray(s.pages) && s.pages.length ?
          '<div class="rv-timing-table" role="group" aria-label="Page-by-page time">'+
            '<div class="rv-timing-labels"><span>PAGE · ORDER VIEWED</span><span>TIME ON PAGE</span></div>'+
            '<ol class="rv-page-list">'+s.pages.map(p=>
              '<li><div class="rv-page-line"><b title="'+escape(p.path||'/')+'">'+
                escape(pageLabel(p.path))+'</b>'+
                '<strong>'+escape(readableTime(p.activeSeconds))+'</strong></div>'+
                '<small>Entered '+escape(fmtDate(p.at,true))+'</small></li>').join('')+
            '</ol></div>':
          '<p class="rv-empty">No individual page times have been recorded for this visit.</p>')+
      '</section>').join('')+'</div>';
  }
  function details(data) {
    const rows = Array.isArray(data?.visitors) ? data.visitors : [];
    const hasData = data?.status === 'reported' && rows.length > 0;
    const coverage = data?.partial ? '<p class="rv-warning">This selected period has more sessions than the detailed-report limit. The browser table is partial, not a full visitor count.</p>' : '';
    const intro = '<div class="rv-detail-head">'+
      stat('Tracked browsers',data?.partial?'N/A':whole(data?.trackedBrowsers),'New tracker, not the Wix visitor count')+
      stat('Tracked visits',data?.partial?'N/A':whole(data?.trackedSessions),'Wix and DJOMS tracking differ')+
      stat('Repeat browsers',data?.partial?'N/A':whole(data?.repeatBrowsers),'2+ tracked sessions')+
      '</div>'+
      '<p class="rv-caution">Estimated time on each page is measured while the browser tab is visible and recorded by the Doc Jaks tracker; it does not prove someone was reading or interacting. Short visits and blocked tracking may be undercounted. Anonymous browser IDs only, never names or IP addresses. Analytics consent is required. History begins when tracking was installed and is kept up to 180 days.</p>';
    if (!hasData) return intro+coverage+'<p class="rv-empty">No consented visitor browser history is recorded for these dates yet. Wix returning visitor totals above remain available.</p>';
    const table = '<div class="rv-scroll"><table><thead><tr><th>Anonymous browser</th><th>Tracked visits</th><th>First seen</th><th>Last seen</th><th>Page Views</th><th>Recorded Page Time</th><th>Source</th></tr></thead>'+
      '<tbody>'+rows.map(v=>'<tr><td><details class="rv-visitor"><summary><b>'+
        escape(v.label || 'Visitor')+'</b> ▾</summary><p>Last entry page: '+
        escape(v.lastEntryPage||'N/A')+'</p>'+recentSessions(v.sessions)+
        '</details></td><td><b>'+whole(v.lifetimeSessions)+'</b></td><td>'+
        escape(fmtDate(v.firstSeen,true))+'</td><td>'+escape(fmtDate(v.lastSeen,true))+
        '</td><td>'+whole(v.lifetimeViews)+'</td><td><b>'+escape(readableTime(v.lifetimeActiveSeconds))+
        '</b></td><td>'+escape(v.lastSource || 'Direct / Unknown')+'</td></tr>').join('')+
      '</tbody></table></div>';
    return intro+coverage+table;
  }
  function setPanel(panel,mode) {
    if (!panel) return;
    const selected = query(), token = ++serial;
    panel.dataset.rvPeriod = selected;
    const old = panel.querySelector('details.rv-breakdown');
    const keepOpen = !!old?.open;
    panel.innerHTML = boxHeader(mode==='mission') +
      '<details class="rv-breakdown"'+(keepOpen?' open':'')+'>'+
      '<summary>VIEW RETURNING BROWSER HISTORY ▾</summary>'+
      '<div class="rv-report" role="status">Loading verified visitor details...</div></details>';
    getDetails().then(data=>{
      if (panel.isConnected && panel.dataset.rvPeriod===selected && token<=serial) {
        const report = panel.querySelector('.rv-report');
        if (report) report.innerHTML=details(data);
      }
    }).catch(error=>{
      if (panel.isConnected && panel.dataset.rvPeriod===selected) {
        const report=panel.querySelector('.rv-report');
        if (report) report.innerHTML='<p class="rv-warning">'+escape(error.message)+
          '</p><p>Wix new and returning visitor figures above are separate and remain available.</p>';
      }
    });
  }
  function putOnMission() {
    if (typeof activeView==='undefined'||activeView!=='Mission Control') return;
    const target=document.querySelector('#missionJourneyTop .mj-arrival-website');
    if (!target) return;
    let panel = target.querySelector('.rv-mission');
    if (!panel) {
      panel=document.createElement('section');
      panel.className='rv-section rv-mission';
      panel.setAttribute('aria-label','Returning visitor intelligence');
      target.appendChild(panel);
    }
    if (panel.dataset.rvPeriod!==query()) setPanel(panel,'mission');
    else {
      const head=panel.querySelector('.rv-heading');
      if (head) {
        // Refresh the Wix aggregate counters after verified Wix data loads.
        const isOpen=panel.querySelector('details.rv-breakdown')?.open;
        const child=panel.querySelector('details.rv-breakdown');
        panel.innerHTML=boxHeader(true);
        if (child) {panel.appendChild(child);child.open=!!isOpen;}
      }
    }
  }
  const priorWebsite = window.renderWebsiteAnalytics;
  if (typeof priorWebsite === 'function') {
    window.renderWebsiteAnalytics=function() {
      priorWebsite.apply(this,arguments);
      const root=document.querySelector('#content .wda');
      if (!root) return;
      const panel=document.createElement('section');
      panel.className='wda-panel rv-section rv-website';
      panel.setAttribute('aria-label','Returning visitor intelligence');
      const kpis=root.querySelector('.wda-kpis');
      if(kpis)kpis.insertAdjacentElement('afterend',panel);
      else root.prepend(panel);
      setPanel(panel,'website');
    };
  }
  const priorStrip=window.renderConnectionStrip;
  if (typeof priorStrip==='function') {
    window.renderConnectionStrip=function() {
      const result=priorStrip.apply(this,arguments);
      putOnMission();
      return result;
    };
  }
  document.addEventListener('djoms:verified-report',()=>queueMicrotask(putOnMission));
  const css=`
.rv-section{margin:14px 0 0;padding:17px!important;border:1px solid #cbb994;border-top:4px solid #9c742e;background:#fffaf0;color:#302719;border-radius:9px;min-width:0;font-family:Arial,sans-serif}
.rv-heading{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;margin-bottom:13px}
.rv-heading>strong{font:800 19px/1.25 Arial,sans-serif;color:#302719;letter-spacing:.02em}
.rv-heading p{width:100%;font-size:15px;margin:4px 0;color:#403321}
.rv-heading>span{font-size:13px;color:#51422d;font-weight:700}
.rv-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.rv-website .rv-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.rv-kpi{display:block;background:#fffdf8;border:1px solid #dccbac;border-radius:6px;padding:10px;min-width:0}
.rv-kpi small{display:block;font:700 13px/1.3 Arial,sans-serif;color:#3b3226}
.rv-kpi strong{display:block;font:800 23px/1.25 Arial,sans-serif;color:#1f201b;margin-top:5px}
.rv-kpi em{display:block;font:12px/1.3 Arial,sans-serif;color:#61543f;font-style:normal;margin-top:2px}
.rv-breakdown{margin:12px 0 0;border:1px solid #d0bfa4;border-radius:7px;padding:9px 12px;background:#fffdf8}
.rv-breakdown>summary{font:bold 15px/1.45 Arial,sans-serif;cursor:pointer;color:#302719}
.rv-breakdown>summary:focus-visible,.rv-visitor>summary:focus-visible{outline:3px solid #3a6856}
.rv-detail-head{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:15px}
.rv-scroll{max-height:520px;overflow:auto;margin-top:12px}
.rv-scroll table{width:100%;border-collapse:collapse;font:14px/1.5 Arial,sans-serif;min-width:890px}
.rv-scroll th{position:sticky;top:0;text-align:left;background:#eedfc3;color:#332719;font-weight:800;padding:8px}
.rv-scroll td{padding:9px 8px;border-bottom:1px solid #e4d5c3;vertical-align:top}
.rv-scroll td:first-child{min-width:144px}
.rv-visitor>summary{cursor:pointer;font-weight:800;color:#2d392b}
.rv-visitor[open]{min-width:210px}
.rv-visitor p{margin:9px 0}
.rv-session{margin:10px 0;border-top:1px solid #d2bf98;padding-top:8px}
.rv-session>div{display:flex;gap:9px;flex-wrap:wrap}
.rv-session>div span{font-size:12px}
.rv-session ol{margin:6px 0 3px;padding-left:20px}
.rv-session li{line-height:1.55}
.rv-session-heading{display:flex;justify-content:space-between;align-items:baseline;gap:9px;flex-wrap:wrap}
.rv-session-heading>b{font:800 15px/1.3 Arial,sans-serif;color:#194d31}
.rv-timing-table{background:#fffaf1;border:1px solid #dec9a7;border-radius:7px;margin:10px 0;padding:8px 11px}
.rv-timing-labels{display:flex;justify-content:space-between;gap:15px;font:900 12px/1.3 Arial,sans-serif;color:#674826}
.rv-page-list{list-style:decimal;padding-left:23px;margin:6px 0!important}
.rv-page-list li{border-top:1px solid #e4d5bf;padding:7px 0 5px}
.rv-page-line{display:flex;justify-content:space-between;gap:9px;align-items:baseline;min-width:0}
.rv-page-line b{overflow-wrap:anywhere;font:800 14px Arial,sans-serif}
.rv-page-line strong{flex:none;font:900 15px Arial,sans-serif;color:#1d5937}
.rv-page-list small{display:block;font:12px Arial,sans-serif;color:#65513a}
@media(max-width:550px){.rv-session-heading{display:block}.rv-page-line{align-items:flex-start}}
.rv-caution{font-size:13px;line-height:1.5;color:#574a38}
.rv-empty{font-size:15px;color:#503d29;padding:9px 0}
.rv-warning{font-weight:bold;color:#922e27;font-size:15px}
@media(max-width:850px){.rv-stat-grid,.rv-website .rv-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rv-detail-head{grid-template-columns:1fr}.rv-section{padding:12px!important}}
`;
  const styles=document.createElement('style');
  styles.id='rvVisitorStyles';styles.textContent=css;document.head.appendChild(styles);
  if (typeof activeView!=='undefined' && activeView==='Website Analytics')
    window.renderWebsiteAnalytics?.();
  if (typeof activeView!=='undefined' && activeView==='Mission Control')
    putOnMission();
})();
