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
  function recurringCount(run) {
    return run && Array.isArray(run.recurringAlerts) ? run.recurringAlerts.length : 0;
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
      (state.tone==='yellow'||state.tone==='red'?(recurringCount(run)?recurringCount(run)+' RECURRING · ':'')+countIssues(run)+' finding(s) · VIEW FIXES':'CHECK HISTORY') +
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
      return '<details id="dj-maint-record-' + index + '" class="dj-maint-history-entry" ' + (index === 0 ? 'open' : '') + '>' +
        '<summary>' + dot(tone) + '<b>' + escapeHtml(fmt(run.checkedAt)) + '</b>' +
        '<strong>' + escapeHtml(tone.toUpperCase()) + '</strong>' +
        '<span>' + countIssues(run) + ' finding(s)</span></summary>' +
        '<div class="dj-maint-history-body"><p>' + escapeHtml(run.summary || 'Completed site check.') + '</p>' +
        '<p class="dj-maint-coverage">Completed: ' + escapeHtml(fmt(run.checkedAt)) +
        (run.startedAt ? ' · Started: ' + escapeHtml(fmt(run.startedAt)) : '') +
        (Number.isFinite(Number(run.durationSeconds)) ? ' · Duration: ' + escapeHtml(run.durationSeconds) + ' sec' : '') +
        '</p>' +
        '<p class="dj-maint-coverage">' + escapeHtml(coverage.pagesChecked || 0) + ' pages · ' +
        escapeHtml(coverage.linksChecked || 0) + ' links · ' +
        escapeHtml(coverage.browserPagesChecked || 0) + ' browser views checked' +
        (Number(coverage.unverified) ? ' · ' + escapeHtml(coverage.unverified) + ' unable to verify' : '') +
        '</p>' + issuesHtml(run) +
        (Array.isArray(run.notes) && run.notes.length ? '<p class="dj-maint-notes">' +
          run.notes.map(escapeHtml).join(' · ') + '</p>' : '') + '</div></details>';
    }).join('');
  }

  function localDate(iso) {
    var date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    var p = {};
    new Intl.DateTimeFormat('en-US', {timeZone:TZ, year:'numeric',month:'2-digit',day:'2-digit'})
      .formatToParts(date).forEach(function (piece) {p[piece.type]=piece.value;});
    return p.year + '-' + p.month + '-' + p.day;
  }
  function records() {
    return report && Array.isArray(report.history) ? report.history : [];
  }
  function issueKey(item) {
    var label = String(item && item.label || '').toLowerCase();
    var family = /browser content needs verification|page appears blank/.test(label) ? 'wix-visual-content' :
      /broken website page|critical page unreachable/.test(label) ? 'page-unreachable' :
      /seo metadata/.test(label) ? 'seo-metadata' :
      /external destination/.test(label) ? 'external-link' :
      label.replace(/[^a-z0-9]+/g,'-');
    return family + '|' + String(item && item.url || '').replace(/\/$/,'').toLowerCase();
  }
  function issueLedgerHtml() {
    var history = records(), latest = report && report.latest;
    if (!history.length || !latest) return '<p class="dj-maint-empty">No inspection history yet.</p>';
    var found = new Map();
    history.slice().reverse().forEach(function (run) {
      var day = localDate(run.checkedAt), seen = new Set();
      (Array.isArray(run.issues) ? run.issues : []).forEach(function (item) {
        var key = issueKey(item);
        if (seen.has(key)) return;
        seen.add(key);
        var entry = found.get(key);
        if (!entry) {
          entry = {item:item, first:run.checkedAt, last:run.checkedAt, days:new Set()};
          found.set(key,entry);
        }
        entry.last=run.checkedAt;
        entry.item=item;
        entry.days.add(day);
      });
    });
    var current = new Set((Array.isArray(latest.issues) ? latest.issues : []).map(issueKey));
    var items = Array.from(found.entries()).map(function(pair) {
      return {key:pair[0], entry:pair[1], current:current.has(pair[0])};
    });
    items.sort(function(a,b) {
      return Number(b.current)-Number(a.current) ||
        Number(b.entry.item.severity==='red')-Number(a.entry.item.severity==='red') ||
        b.entry.days.size-a.entry.days.size;
    });
    if (!items.length) return '<p class="dj-maint-empty">No issues have been recorded in the available scans.</p>';
    return '<div class="dj-maint-register-note">Only issues found in the latest report are marked <b>REPORTED NOW</b>. '+
      'A problem disappearing from an automated scan is <b>not proof it was repaired</b>.</div>' +
      '<div class="dj-maint-register">' + items.map(function(row) {
        var item=row.entry.item, now=row.current, tone=now?(item.severity==='red'?'red':'yellow'):'neutral';
        return '<article class="dj-maint-register-entry dj-maint-tone-'+tone+'">' +
          '<div class="dj-maint-register-head"><strong>'+escapeHtml(item.label||'Website issue')+'</strong>' +
          '<span class="dj-maint-register-state">'+(row.entry.days.size >= 2 ? 'REPEATED · '+row.entry.days.size+' DAYS · ' : '')+(now?'REPORTED NOW':'NOT REPORTED IN LATEST SCAN')+'</span></div>'+
          '<p>'+escapeHtml(item.problem||'Needs review.')+'</p>' +
          '<div class="dj-maint-register-meta"><span>'+row.entry.days.size+' scan day(s) affected</span>'+
          '<span>First: '+escapeHtml(fmt(row.entry.first))+'</span>'+
          '<span>Last: '+escapeHtml(fmt(row.entry.last))+'</span></div>'+
          (item.url ? '<div class="dj-maint-register-url"><code>'+escapeHtml(item.url)+'</code>'+safeLink(item.url)+'</div>' : '')+
          '<p><b>Suggested fix:</b> '+escapeHtml(item.fix||'Inspect the affected page.')+'</p></article>';
      }).join('')+'</div>';
  }
  function repairsHtml() {
    var items = report && Array.isArray(report.repairs) ? report.repairs : [];
    if (!items.length) return '<p class="dj-maint-empty">No verified repairs are recorded. Findings alone are never treated as completed repairs.</p>';
    return '<div class="dj-maint-repair-list">' + items.slice().sort(function(a,b) {
      return Date.parse(b.appliedAt||0)-Date.parse(a.appliedAt||0);
    }).map(function(item) {
      var verified=item.status==='verified', tone=verified?'green':'yellow';
      var state=verified?'VERIFIED FIX':'APPLIED · VERIFICATION PENDING';
      return '<article class="dj-maint-repair dj-maint-tone-'+tone+'">' +
        '<div class="dj-maint-repair-title"><strong>'+escapeHtml(item.title||'Maintenance repair')+'</strong>' +
        '<span>'+state+'</span></div>' +
        (item.problem ? '<p><b>Problem:</b> '+escapeHtml(item.problem)+'</p>' : '')+
        '<p><b>Change made:</b> '+escapeHtml(item.fix||'No change description saved.')+'</p>'+
        '<p class="dj-maint-repair-dates"><b>Applied:</b> '+escapeHtml(fmt(item.appliedAt))+
        (item.verifiedAt?' · <b>Verified:</b> '+escapeHtml(fmt(item.verifiedAt)):' · Verification pending')+'</p>'+
        '<p><b>Evidence:</b> '+escapeHtml(item.verification||'Awaiting a successful follow-up test.')+
        (item.evidenceUrl?' '+safeLink(item.evidenceUrl):'')+'</p></article>';
    }).join('')+'</div>';
  }
  function dayByDayHtml() {
    var history=records();
    if (!history.length) return '<p class="dj-maint-empty">Daily maintenance records will appear here after the first completed scan.</p>';
    var first=history.reduce(function(min,run) {var d=localDate(run.checkedAt);return d && (!min||d<min)?d:min;},'');
    var today=localDate(Date.now()), perDay=new Map();
    history.forEach(function(run,index){
      var d=localDate(run.checkedAt);
      if (!perDay.has(d)) perDay.set(d,[]);
      perDay.get(d).push({run:run,index:index});
    });
    var count=0, logged=0, missing=0, lines=[];
    var start=Date.parse(today+'T12:00:00Z'), end=Date.parse(first+'T12:00:00Z');
    for(var at=start;at>=end && count<31;at-=86400000) {
      var d=new Date(at).toISOString().slice(0,10), matches=perDay.get(d)||[], row=matches[0],tone=row?row.run.status:'neutral';
      var nice=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(at));
      count++;if(row)logged++;else missing++;
      lines.push('<div class="dj-maint-day dj-maint-tone-'+escapeHtml(tone)+'"><span class="dj-maint-day-date">'+escapeHtml(nice)+'</span>'+
        '<strong>'+escapeHtml(row?String(tone||'unknown').toUpperCase():'NO SAVED REPORT')+'</strong>'+
        '<span class="dj-maint-day-count">'+(row?matches.length+' scan(s) · '+countIssues(row.run)+' finding(s)':'Run not recorded')+'</span>'+
        (row?'<button type="button" data-dj-maint-open-record="'+row.index+'">Open report</button>':'')+
        '</div>');
    }
    return '<p class="dj-maint-register-note">'+logged+' day(s) with a saved report · '+missing+
      ' day(s) without a saved report since maintenance history began. A missing record does not prove the website failed.</p>'+
      '<div class="dj-maint-day-list">'+lines.join('')+'</div>';
  }


  function rootCauseHint(item) {
    var label=String(item && item.label || '').toLowerCase();
    if (/browser content|page appears blank/.test(label))
      return 'Possible Wix rendering delay or image-led page. Compare fully loaded desktop/mobile page and DOM; cause not yet established.';
    if (/seo|robots|sitemap/.test(label))
      return 'Possible Wix SEO publishing, indexing, or sitemap settings. Compare Wix settings with public HTML; cause not confirmed.';
    if (/external/.test(label))
      return 'Possible stale outbound link or external anti-bot response. Compare manual and automated requests; cause not confirmed.';
    return 'Compare shared settings, redirects, deployments, timing and error logs across affected dates; cause not confirmed.';
  }
  function recurringHtml() {
    var history=records(),latest=report&&report.latest;
    if (!history.length) return '<p class="dj-maint-empty">Recurring problems will appear here when there are two or more affected days.</p>';
    var matched=new Map();
    history.forEach(function(run){
      var date=localDate(run.checkedAt), unique=new Set();
      var observed=(Array.isArray(run.issues)?run.issues:[]).concat(
        (Array.isArray(run.autoRecovered)?run.autoRecovered:[]).map(function(item){
          return {label:'Transient service recovered on retry',url:item.url,problem:item.trigger,
            fix:'Investigate why the same destination repeatedly needs an automatic retry.'};
        }));
      observed.forEach(function(item){
        var key=issueKey(item);
        if(unique.has(key))return;unique.add(key);
        var found=matched.get(key);
        if(!found){found={key:key,item:item,days:new Set(),first:run.checkedAt,last:run.checkedAt};matched.set(key,found);}
        found.days.add(date);
        if(Date.parse(run.checkedAt)>Date.parse(found.last)){found.last=run.checkedAt;found.item=item;}
        if(Date.parse(run.checkedAt)<Date.parse(found.first))found.first=run.checkedAt;
      });
    });
    var current=new Set((Array.isArray(latest&&latest.issues)?latest.issues:[]).map(issueKey));
    (Array.isArray(latest&&latest.autoRecovered)?latest.autoRecovered:[]).forEach(function(item){
      current.add(issueKey({label:'Transient service recovered on retry',url:item.url}));
    });
    var verified=report&&Array.isArray(report.repairs)?report.repairs.filter(function(r){
      return r.status==='verified'&&r.verifiedAt;
    }):[];
    var repeated=Array.from(matched.values()).filter(function(x){
      return x.days.size>=2&&(Date.now()-Date.parse(x.last))<=7*86400000;
    }).map(function(x){
      x.reopened=verified.some(function(r){
        return (r.issueKey===x.key||r.relatedIssueKey===x.key)&&Date.parse(x.last)>Date.parse(r.verifiedAt);
      });
      return x;
    }).sort(function(a,b){
      return Number(b.reopened)-Number(a.reopened)||Number(current.has(b.key))-Number(current.has(a.key))||
        b.days.size-a.days.size;
    });
    if(!repeated.length)return '<p class="dj-maint-empty">No repeating problem found in the past seven days of saved inspections. Continue monitoring.</p>';
    return '<p class="dj-maint-register-note"><b>Repeated faults stay visible even if they later disappear or recover on retry.</b> '+
      'A recurring signal is a reason to investigate, not proof of the suspected root cause.</p>'+
      '<div class="dj-maint-repeat-list">'+repeated.map(function(x){
        return '<article class="dj-maint-repeat-entry">'+
          '<div class="dj-maint-repeat-heading"><b>'+escapeHtml(x.item.label||'Repeated issue')+'</b>'+
          '<strong>'+x.days.size+' DAY(S) OBSERVED</strong></div>'+
          '<p>'+escapeHtml(x.item.problem||'The same issue was found more than once.')+'</p>'+
          '<p class="dj-maint-repeat-times">First: '+escapeHtml(fmt(x.first))+
          ' · Last: '+escapeHtml(fmt(x.last))+
          ' · '+(current.has(x.key)?'<b>REPORTED NOW</b>':'Not reported in latest scan')+'</p>'+
          (x.reopened?'<p class="dj-maint-reopened">REOPENED AFTER A VERIFIED REPAIR</p>':'')+
          (x.item.url?'<p><code>'+escapeHtml(x.item.url)+'</code> '+safeLink(x.item.url)+'</p>':'')+
          '<p><b>Possible trigger to investigate:</b> '+escapeHtml(rootCauseHint(x.item))+'</p></article>';
      }).join('')+'</div>';
  }
  function technicalChecksHtml(items,missingMessage) {
    if(!Array.isArray(items)||!items.length)
      return '<p class="dj-maint-empty">'+escapeHtml(missingMessage||'This check has not yet been recorded.')+'</p>';
    return '<div class="dj-maint-check-list">'+items.map(function(item){
      var state=String(item.state||'unverified');
      var tone=state==='pass'?'green':state==='needs-attention'?'yellow':'neutral';
      var label=state==='pass'?'PUBLIC CHECK PASSED':
        state==='needs-attention'?'NEEDS REVIEW':
        state==='login-required'?'SIGN-IN REQUIRED':'UNVERIFIED';
      return '<article class="dj-maint-check dj-maint-tone-'+tone+'">'+
        '<div><b>'+escapeHtml(item.label||'Connection check')+'</b><small>'+escapeHtml(label)+'</small></div>'+
        '<p>'+escapeHtml(item.detail||'No detail recorded.')+'</p>'+
        (item.url?'<p><code>'+escapeHtml(item.url)+'</code> '+safeLink(item.url)+'</p>':'')+'</article>';
    }).join('')+'</div>';
  }
  function recoveryHtml(run) {
    var items=run&&Array.isArray(run.autoRecovered)?run.autoRecovered:[];
    if(!items.length)return '<p class="dj-maint-empty">No transient request was recorded as recovered during this scan.</p>';
    return '<div class="dj-maint-check-list">'+items.map(function(item){
      return '<article class="dj-maint-check dj-maint-tone-yellow"><div><b>RECOVERED ON RETRY</b>'+
        '<small>INVESTIGATE IF REPEATED</small></div><p>'+escapeHtml(item.trigger||'Initial request failed')+
        ' · '+escapeHtml(item.outcome||'Retry succeeded')+'</p><p><code>'+escapeHtml(item.url||'')+'</code> '+
        safeLink(item.url)+'</p></article>';
    }).join('')+'</div>';
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
      '<h3>CONNECTION HEALTH · CHECK NOW</h3>' +
      (window.djomsMaintenanceConnections?.renderHtml?.() || '<p class="dj-maint-empty">The private connection checker is loading.</p>') +
      '<p class="dj-maint-register-note">' +
      'Outbound public links tested: <b>' + escapeHtml(coverage.publicExternalLinksAttempted ?? 'Not recorded') +
      '</b> of <b>' + escapeHtml(coverage.publicExternalLinksDiscovered ?? 'Not recorded') +
      '</b> relevant links · Tracking/infrastructure excluded: <b>' +
      escapeHtml(coverage.publicExternalLinksExcluded ?? 'Not recorded') +
      '</b> · Browser views: <b>' + escapeHtml(coverage.browserPagesChecked ?? 'Not recorded') +
      '</b> · Unable to verify: <b>' + escapeHtml(coverage.unverified ?? 'Not recorded') + '</b>.</p>' +
      '<div class="dj-maint-page-note"><strong>' + escapeHtml(state.note) + '</strong>' +
      '<p>Green = tested checks passed. Yellow = needs review or check incomplete. Red = confirmed broken critical page or link. ' +
      'Gray = no verified result yet. Audio playback, protected pages, and other untested features are never marked verified.</p></div>' +
      '<div class="dj-maint-page-actions"><button type="button" data-dj-maint-refresh="1">' +
      (loading ? 'Checking for report…' : 'Refresh recorded results') + '</button>' +
      '<span>' + (loadError ? escapeHtml(loadError) :
        'Technical scan and dated record. The separate 4 AM ChatGPT review provides additional observations.') + '</span></div>' +
      '<h3>LATEST REPORT · ' + escapeHtml(run?localDate(run.checkedAt):'NO DATE') + '</h3>' +
      (run ? issuesHtml(run) : '<p class="dj-maint-empty">No run yet. No green status is assumed.</p>') +
      '<h3>RECURRING PROBLEMS · WHY DO THEY KEEP HAPPENING?</h3>' + recurringHtml() +
      '<h3>PUBLIC SEO HEALTH</h3>' + technicalChecksHtml(run&&run.seoChecks,
        'No recorded public SEO audit yet. The expanded scanner now checks SEO titles, descriptions, canonicals, robots.txt, noindex, and sitemaps.') +
      '<h3>BACK-OFFICE PUBLIC REACHABILITY</h3>' + technicalChecksHtml(run&&run.backendChecks,
        'No back-office reachability check has been saved yet. Private service authorization requires a signed-in owner check.') +
      '<h3>TRANSIENT FAULTS RECOVERED ON RETRY</h3>' + recoveryHtml(run) +
      '<h3>WHAT STILL REQUIRES A HUMAN OR AUTHENTICATED TEST</h3>' +
      '<p class="dj-maint-register-note">Automatic page and link checks cannot prove that Square checkout completes, a paid order is delivered, ' +
      'Pit Krewe enrollment submits correctly, Outlaw Radio audio is audible, or that every Wix third-party widget works. ' +
      'These must remain UNVERIFIED until a safe, authorized, end-to-end test is recorded. ' +
      'The private connections above test provider authorization separately from the 4 AM public scan.</p>' +
      '<h3>ISSUE REGISTER · REPEATED & PREVIOUS FINDINGS</h3>' + issueLedgerHtml() +
      '<h3>REPAIRS MADE & VERIFICATION</h3>' + repairsHtml() +
      '<h3>DAY-BY-DAY MAINTENANCE LOG</h3>' + dayByDayHtml() +
      '<h3>FULL INSPECTION REPORT HISTORY</h3><div class="dj-maint-history">' + historyHtml() + '</div></section>';
    window.djomsMaintenanceConnections?.onPageOpen?.();
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
      // Refresh the standalone maintenance tile at the top of Needs Attention.
      if (typeof activeView !== 'undefined' && activeView === 'Needs Attention') {
        var attentionTile = document.querySelector('.dj-maint-attention-strip [data-dj-maint-open]');
        if (attentionTile) attentionTile.outerHTML = missionHtml();
      }
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
      var record = event.target.closest('[data-dj-maint-open-record]');
      if (record) {
        event.preventDefault();
        var details = document.getElementById('dj-maint-record-' + record.getAttribute('data-dj-maint-open-record'));
        if (details) {details.open=true;details.scrollIntoView({behavior:'smooth',block:'start'});}
        return;
      }
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