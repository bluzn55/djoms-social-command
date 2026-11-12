/* DOC JAKS · Website Security Watch (owner-only).
   Verified Wix behavioral patterns; no attacker or hack claims. */
(function securityWatchUi(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const number=v=>Number.isSafeInteger(v)&&v>=0?v.toLocaleString('en-US'):'N/A';
  const time=stamp=>{
    if(!stamp||!Number.isFinite(Date.parse(stamp)))return 'N/A';
    return new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Chicago',year:'numeric',month:'short',day:'numeric',
      hour:'numeric',minute:'2-digit',hour12:true
    }).format(new Date(stamp));
  };
  const duration=seconds=>{
    if(!Number.isSafeInteger(seconds)||seconds<0)return 'N/A';
    return seconds<60?seconds+' sec':Math.floor(seconds/60)+' min '+(seconds%60)+' sec';
  };
  // A separate timestamp for each recorded one-page visit. It does not
  // establish that one person followed the path through these URLs.
  const clock=stamp=>{
    if(!stamp||!Number.isFinite(Date.parse(stamp)))return 'N/A';
    return new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',
      second:'2-digit',fractionalSecondDigits:3,hour12:true
    }).format(new Date(stamp));
  };
  const interval=seconds=>{
    if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0)return 'FIRST';
    return seconds<60?seconds.toFixed(1)+' sec':
      Math.floor(seconds/60)+' min '+(seconds%60).toFixed(1)+' sec';
  };
  const wixAverage=seconds=>{
    if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0)return 'N/A';
    return seconds<60?seconds.toFixed(1)+' sec':
      Math.floor(seconds/60)+' min '+(seconds%60).toFixed(0)+' sec';
  };
  const pageTitle=path=>{
    const parts=String(path||'').split('/').filter(Boolean);
    if(!parts.length)return 'Home';
    let name=parts[parts.length-1].replace(/-/g,' ');
    try{name=decodeURIComponent(name)}catch{}
    name=name.replace(/\b\w/g,ch=>ch.toUpperCase());
    return parts.includes('product-page')?'Product: '+name:name;
  };
  const dates=range=>range?.start&&range?.endInclusive?
    range.start+' to '+range.endInclusive+' · Louisiana time':'Selected period';
  const live=()=>typeof activeView!=='undefined'&&activeView==='Website Security';
  const cache=new Map(),pending=new Map();
  let selected='7d';
  function actionButtons(){
    return [['today','Day'],['7d','Week'],['30d','Month']].map(([v,t])=>
      '<button type="button" data-security-range="'+v+'"'+
      ' aria-pressed="'+String(selected===v)+'"'+
      (selected===v?' class="active"':'')+'>'+t+'</button>').join('');
  }
  function shell(){
    const host=document.getElementById('content');
    if(!host)return;
    host.innerHTML='<section class="dj-security">'+
      '<header class="dj-security-header"><div>'+
        '<small>⚜ DOC JAKS · WEBSITE SAFETY</small>'+
        '<h2>WEBSITE SECURITY WATCH</h2>'+
        '<p>Spot unusual public-page traffic without mistaking every crawler for an attacker.</p>'+
      '</div><div class="dj-security-status">WIX ANALYTICS · READ ONLY</div></header>'+
      '<div class="dj-security-toolbar"><strong>REPORTING PERIOD</strong>'+
        '<div class="dj-security-choices">'+actionButtons()+'</div>'+
        '<button type="button" class="dj-security-refresh" data-security-refresh="1">Refresh check</button>'+
      '</div>'+
      '<div id="securityWatchResult" aria-live="polite">'+
        '<p class="dj-security-pending">Checking the available Wix traffic evidence…</p>'+
      '</div>'+
      '</section>';
    paint();
    void load();
  }
  async function load(force=false){
    if(!live())return;
    const key=selected;
    const existing=cache.get(key);
    if(!force&&existing&&Date.now()-existing.when<120000){paint();return;}
    if(pending.has(key))return;
    const host=document.getElementById('securityWatchResult');
    if(host)host.innerHTML='<p class="dj-security-pending">Checking Wix page activity…</p>';
    const task=Promise.resolve().then(()=>api('security-watch?range='+encodeURIComponent(key)))
      .then(data=>{
        if(data?.range?.selection!==key)throw new Error('Security report dates did not match.');
        cache.set(key,{when:Date.now(),data});
      }).catch(error=>{
        cache.set(key,{when:Date.now(),data:{status:'unavailable',error:
          String(error?.message||'Wix security analytics could not be reached.')}})
      }).finally(()=>{pending.delete(key);if(live()&&selected===key)paint();});
    pending.set(key,task);
    return task;
  }
  function metric(name,value,detail){
    return '<div class="dj-security-metric"><small>'+esc(name)+'</small>'+
      '<strong>'+esc(number(value))+'</strong><span>'+esc(detail)+'</span></div>';
  }
function historyPanel(history) {
    if(!history || history.status!=='saved') {
      return '<section class="dj-security-history"><h3>IP HISTORY · NOT SAVED</h3>'+
        '<p>'+esc(history?.error||'Protected network evidence history is unavailable. Do not treat this as an empty log.')+'</p></section>';
    }
    const networks=Array.isArray(history.networks)?history.networks:[];
    const rows=networks.map(network=>'<tr>'+
      '<td><code>'+esc(network.ipAddress||'N/A')+'</code></td>'+
      '<td>'+esc((network.cities||[]).join('; ')||'Unknown')+'</td>'+
      '<td>'+esc(time(network.firstSeen))+'</td>'+
      '<td>'+esc(time(network.lastSeen))+'</td>'+
      '<td>'+esc(number(network.observedSweeps))+'</td>'+
      '<td>'+esc(number(network.flaggedVisitEvents))+'</td>'+
      '</tr>').join('');
    return '<section class="dj-security-history"><div class="dj-security-history-heading">'+
      '<div><h3>IP WATCH · REPEAT VISIT HISTORY</h3>'+
      '<p>Private owner-only log of repeated automated-looking sweeps. Network IP is not a person or proof of an attack.</p></div>'+
      '<button type="button" data-security-export="1">Export recorded evidence (CSV)</button></div>'+
      '<div class="dj-security-history-metrics">'+
      '<span><b>'+esc(number(history.networkCount))+'</b> distinct network IPs</span>'+
      '<span><b>'+esc(number(history.totalSweepsStored))+'</b> stored sweeps</span>'+
      '<span><b>'+esc(number(history.newSweepsSaved))+'</b> newly saved this check</span></div>'+
      '<p class="dj-security-timeline-note">'+esc(history.note||'Records update when this owner-only report runs.')+'</p>'+
      '<div class="dj-security-timeline-scroll"><table class="dj-security-timeline-table dj-security-history-table">'+
      '<thead><tr><th>IP ADDRESS</th><th>REPORTED LOCATION(S)</th><th>FIRST SEEN</th>'+
      '<th>LAST SEEN</th><th>SWEEPS</th><th>PAGE OPENS</th></tr></thead>'+
      '<tbody>'+(rows||'<tr><td colspan="6">No qualifying recorded sweeps yet.</td></tr>')+'</tbody></table></div>'+
      '<small>History collects suspicious sweeps only when the owner opens or refreshes Website Security. '+
      'The data is encrypted in DJOMS server storage, not publicly accessible.</small></section>';
  }
  function routeMatches(rows) {
    if(!Array.isArray(rows)||!rows.length)return '';
    return '<details class="dj-security-route-matches"><summary>MATCHING PAGE ROUTES ACROSS SWEEPS · '+
      esc(number(rows.length))+' comparisons</summary>'+
      '<p class="dj-security-timeline-note">Similarity compares page order after consecutive duplicate opens are collapsed. '+
      'High similarity suggests reused automated instructions, not confirmed shared ownership.</p>'+
      '<div class="dj-security-match-list">'+rows.map(row=>
        '<p><b>Sweep '+esc(row.firstIndex)+' ↔ '+esc(row.secondIndex)+'</b> · '+
        esc(number(row.score))+'% order similarity · '+
        (row.differentNetworks?'different recorded IPs':'network comparison unavailable or same IP')+'</p>').join('')+'</div></details>';
  }
  function csvText(records) {
    const headers=['Date/time (Central source UTC)','Last seen (UTC)','IP address','Location','Traffic source','Flagged page opens',
      'Distinct sessions','Unique pages','Consecutive duplicate pairs','Page route'];
    const safe=value=>{
      let raw=String(value??'').replace(/\u0000/g,'');
      if(/^\s*[=+\-@\t\r]/.test(raw))raw="'"+raw;
      return '"'+raw.replace(/"/g,'""')+'"';
    };
    const lines=[headers.map(safe).join(',')];
    for(const x of records)lines.push([
      x.firstAt,x.lastAt,x.ipAddress,x.location,x.source,x.visitEvents,
      x.distinctSessions,x.uniquePages,x.repeatedPairs,
      (Array.isArray(x.sequence)?x.sequence:[]).join(' → ')
    ].map(safe).join(','));
    return lines.join('\r\n');
  }
  function exportHistory(){
    const data=cache.get(selected)?.data;
    if(data?.history?.status!=='saved')return;
    const records=data.history.latest;
    if(!Array.isArray(records)||!records.length)return;
    const blob=new Blob([csvText(records)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='docjaks-security-ip-evidence-'+selected+'.csv';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function alertRow(row,index){
    const status=row?.priority==='priority'?'LIKELY AUTOMATED · LARGE BURST':'LIKELY AUTOMATED · PAGE SWEEP';
    const severity=row?.priority==='priority'?'priority':'review';
    const paths=Array.isArray(row?.samplePaths)?row.samplePaths:[];
    const timeline=Array.isArray(row?.timeline)?row.timeline:[];
    const pageRows=timeline.map((entry,i)=>{
      const path=String(entry?.path||'');
      const safePath=/^\/[a-z0-9/%._~\-]*$/i.test(path);
      return '<tr>'+
        '<td class="dj-security-timeline-rank">'+esc(i+1)+'</td>'+
        '<td class="dj-security-open-time">'+esc(clock(entry?.openedAt))+'</td>'+
        '<td class="dj-security-open-path"><strong>'+esc(pageTitle(path))+'</strong>'+
          '<code>'+esc(path)+'</code>'+
          (safePath?'<a href="https://www.docjaks.com'+esc(path)+'" target="_blank" rel="noopener noreferrer">View page</a>':'')+
        '</td>'+
        '<td>'+esc(interval(entry?.gapFromPriorSeconds))+'</td>'+
        '<td>'+esc(wixAverage(entry?.pageAverageSeconds))+'</td>'+
      '</tr>';
    }).join('');
    return '<article class="dj-security-alert '+severity+'">'+
      '<div class="dj-security-alert-head">'+
        '<span class="dj-security-alert-rank">'+esc(index+1)+'. '+esc(status)+'</span>'+
        '<strong>'+esc(number(row?.visitEvents))+' rapid single-page visits</strong></div>'+
      '<h3>'+esc(row?.location||'Location unavailable')+'</h3>'+
      '<p class="dj-security-when">'+esc(time(row?.start))+
        (row?.end&&row.end!==row.start?' to '+esc(time(row.end)):'')+'</p>'+
      '<div class="dj-security-alert-facts">'+
        '<span><b>'+esc(number(row?.uniquePages))+'</b> different public pages</span>'+
        '<span><b>'+esc(duration(row?.durationSeconds))+'</b> observed window</span>'+
        '<span>'+esc(row?.signature||'Browser/device not supplied')+'</span>'+
        '<span>Wix source: '+esc(row?.source||'unknown')+'</span>'+ 
        '<span><b>IP: </b><code>'+esc(row?.networkVerified?row.ipAddress:'Not verified')+'</code></span>'+ 
        '<span><b>'+esc(number(row?.distinctSessions))+'</b> distinct Wix sessions</span>'+ 
        '<span><b>'+esc(number(row?.repeatedPairs))+'</b> consecutive duplicate pairs</span></div>'+
      '<p class="dj-security-caution">Likely automation pattern, not confirmed unauthorized access. '+
        'The IP identifies a network, not an individual. Repeated page paths may be automated monitoring or a crawler.</p>'+
      '<details class="dj-security-paths"><summary>PAGE-BY-PAGE DETAILS · '+esc(number(row?.visitEvents))+' opens</summary>'+
        '<p class="dj-security-timeline-note"><b>OPENED</b> is the time Wix recorded each page visit (Louisiana time). '+
        '<b>GAP</b> is the difference between recorded visit timestamps, NOT time spent on a page. '+
        '<b>WIX PAGE AVG</b> is an average where Wix provides it, NOT an individual visit duration. '+
        'N/A means Wix has not measured it.</p>'+
        (timeline.length?
          '<div class="dj-security-timeline-scroll"><table class="dj-security-timeline-table">'+
            '<thead><tr><th>#</th><th>OPENED · LOUISIANA</th><th>PAGE OPENED</th>'+
              '<th>GAP FROM PRIOR</th><th>WIX PAGE AVG</th></tr></thead>'+
            '<tbody>'+pageRows+'</tbody></table></div>'+
            (row?.timelineTruncated?'<p class="dj-security-timeline-note">Showing the first '+
              esc(number(timeline.length))+' of '+esc(number(row.timelineEvents))+
              ' recorded opens in this pattern.</p>':''):
          '<div class="dj-security-path-list">'+paths.map(path=>
            '<code>'+esc(path)+'</code>').join('')+'</div>'+
          '<small>Exact page timestamps are not available from this report version. Refresh to load the latest data.</small>')+
      '</details></article>';
  }
  function paint(){
    if(!live())return;
    const host=document.getElementById('securityWatchResult');
    if(!host)return;
    const data=cache.get(selected)?.data;
    if(!data)return;
    if(data.status==='unavailable'){
      host.innerHTML='<div class="dj-security-unavailable"><h3>SECURITY TRAFFIC REPORT UNAVAILABLE</h3>'+
        '<p>'+esc(data.error||'The Wix security analytics connection needs attention.')+'</p>'+
        '<p>No safety conclusion can be drawn without data. Blocked requests and failed sign-ins remain N/A.</p></div>';
      return;
    }
    const rows=Array.isArray(data.alerts)?data.alerts:[];
    const partial=data.status==='partial'||data.coverage?.partial===true;
    const coverage=partial?'PARTIAL TRAFFIC COVERAGE':'WIX TRAFFIC REVIEWED';
    const status=rows.length?
      'Likely automated public-page traffic detected. This does not establish a security attack.':
      'No matching rapid page sweeps in Wix data. Other threats may still exist.';
    host.innerHTML='<div class="dj-security-report">'+
      '<div class="dj-security-coverage">'+
        '<strong>'+esc(coverage)+'</strong>'+
        '<span>'+esc(dates(data.range))+' · Checked '+esc(time(data.checkedAt))+'</span></div>'+
      '<div class="dj-security-metrics">'+
        metric('CRAWLER-LIKE PAGE SWEEPS',data.totalPatterns,'Behavioral patterns, not proven attacks')+
        metric('FLAGGED PAGE OPENS',data.flaggedVisitEvents,'Separate one-page sessions, not unique people')+
        metric('NETWORK IPs RECORDED',data.history?.status==='saved'?data.history.networkCount:null,'From encrypted owner-only history')+
        metric('BLOCKED ATTACKS',null,'N/A · Firewall event feed not connected')+
      '</div>'+
      '<div class="dj-security-summary '+(rows.length?'flagged':'quiet')+'">'+
        '<strong>'+esc(status)+'</strong>'+
        '<small>'+(partial?
          'The report reached its 2,500-row evidence limit. More events may exist, so findings are incomplete.':
          'This is behavioral screening, not intrusion detection or an all-clear.')+'</small></div>'+
      historyPanel(data.history)+routeMatches(data.relatedRoutes)+
      '<div class="dj-security-detail-header"><h3>FLAGGED ACTIVITY</h3>'
        '<span>'+esc(number(data.priorityPatterns))+' priority review · '+
          esc(number(data.totalPatterns))+' patterns</span></div>'+
      (rows.length?'<div class="dj-security-alerts">'+rows.map(alertRow).join('')+'</div>':
        '<p class="dj-security-empty">No qualifying page sweeps for this selection. That does not prove the website was attack-free.</p>')+
      '<details class="dj-security-method"><summary>What we can and cannot verify</summary>'+
        '<p>Wix records public-page traffic. DJOMS looks for 8 or more different pages, each visited in a single-page session, within 3 minutes from the same network IP and browser/device category when IP is available. '+
        'Rows without an IP are grouped by location only and can never be presented as a verified network match. Legitimate crawlers, content previews and shared networks can match. '+
        'Missing session timing or aggregated rows are not silently treated as suspicious. The page-by-page time gap is not dwell time, because each row may represent a different visitor or session.</p>'+
        '<p>'+esc(number(data.coverage?.analyzedRows))+' Wix analytics rows scanned. '+
          esc(number(data.observationsNotEvaluated))+' rows lacked enough evidence for this specific rule. '+
          'Actual requests blocked by a firewall, attempted passwords, server errors and unauthorized changes cannot be proven from this Wix report.</p>'+
        '<p>Traffic Quality classifies crawler-like sessions separately for marketing. Website Security only reviews patterns; it does not identify attacks or modify Wix totals.</p>'+ 
        '<p>No visitors are blocked or deleted, and published visitor totals are not automatically altered.</p>'+
      '</details></div>';
  }
  document.addEventListener('click',event=>{
    const pick=event.target.closest('[data-security-range]');
    if(pick&&live()){
      const value=pick.getAttribute('data-security-range');
      if(!['today','7d','30d'].includes(value))return;
      selected=value;
      document.querySelectorAll('[data-security-range]').forEach(btn=>{
        const current=btn.getAttribute('data-security-range')===selected;
        btn.classList.toggle('active',current);
        btn.setAttribute('aria-pressed',String(current));
      });
      const host=document.getElementById('securityWatchResult');
      if(host)host.innerHTML='<p class="dj-security-pending">Checking the selected dates…</p>';
      void load();
      return;
    }
    if(event.target.closest('[data-security-export]')&&live()){
      exportHistory();return;
    }
    if(event.target.closest('[data-security-refresh]')&&live()){
      cache.delete(selected);
      void load(true);
    }
  });
  window.djomsWebsiteSecurity={render:shell,refresh:()=>{cache.delete(selected);return load(true);}};
})();