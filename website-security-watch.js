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
  function alertRow(row,index){
    const status=row?.priority==='priority'?'PRIORITY REVIEW':'REVIEW';
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
        '<span>Wix source: '+esc(row?.source||'unknown')+'</span></div>'+
      '<p class="dj-security-caution">Likely automation pattern, not confirmed unauthorized access. '+
        'The location and browser group does not identify an individual, device or IP address.</p>'+
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
      'Potential automated page sweeps detected. Review the evidence below.':
      'No rapid page sweeps matched the current rules in the Wix traffic reviewed.';
    host.innerHTML='<div class="dj-security-report">'+
      '<div class="dj-security-coverage">'+
        '<strong>'+esc(coverage)+'</strong>'+
        '<span>'+esc(dates(data.range))+' · Checked '+esc(time(data.checkedAt))+'</span></div>'+
      '<div class="dj-security-metrics">'+
        metric('RAPID PAGE-SWEEP PATTERNS',data.totalPatterns,'Pattern groups, not unique people')+
        metric('VISITS IN FLAGGED PATTERNS',data.flaggedVisitEvents,'Possible non-customer activity')+
        metric('BLOCKED ATTACKS',null,'N/A · Firewall event feed not connected')+
      '</div>'+
      '<div class="dj-security-summary '+(rows.length?'flagged':'quiet')+'">'+
        '<strong>'+esc(status)+'</strong>'+
        '<small>'+(partial?
          'The report reached its 2,500-row evidence limit. More events may exist, so findings are incomplete.':
          'This is behavioral screening, not intrusion detection or an all-clear.')+'</small></div>'+
      '<div class="dj-security-detail-header"><h3>FLAGGED ACTIVITY</h3>'+
        '<span>'+esc(number(data.priorityPatterns))+' priority review · '+
          esc(number(data.totalPatterns))+' patterns</span></div>'+
      (rows.length?'<div class="dj-security-alerts">'+rows.map(alertRow).join('')+'</div>':
        '<p class="dj-security-empty">No qualifying page sweeps for this selection. That does not prove the website was attack-free.</p>')+
      '<details class="dj-security-method"><summary>What we can and cannot verify</summary>'+
        '<p>Wix records public-page traffic. DJOMS looks for 8 or more different pages, each visited in a single-page session, within 3 minutes from the same approximate location and browser/device category. '+
        'Legitimate crawlers, content previews and shared networks can match. '+
        'Missing session timing or aggregated rows are not silently treated as suspicious. The page-by-page time gap is not dwell time, because each row may represent a different visitor or session.</p>'+
        '<p>'+esc(number(data.coverage?.analyzedRows))+' Wix analytics rows scanned. '+
          esc(number(data.observationsNotEvaluated))+' rows lacked enough evidence for this specific rule. '+
          'Actual requests blocked by a firewall, attempted passwords, server errors and unauthorized changes cannot be proven from this Wix report.</p>'+
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
    if(event.target.closest('[data-security-refresh]')&&live()){
      cache.delete(selected);
      void load(true);
    }
  });
  window.djomsWebsiteSecurity={render:shell,refresh:()=>{cache.delete(selected);return load(true);}};
})();