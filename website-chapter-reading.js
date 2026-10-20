/* Doc Jaks · verified Chapter One reader analytics.
   Reader sessions are NOT unique visitors. No estimated reading data is shown. */
(function () {
  'use strict';
  const VERSION = '2026-10-20.active-reading.v1';
  const ROOT_CLASS = 'dj-reader-report';
  const format = n => typeof n === 'number' && Number.isFinite(n) && n >= 0
    ? new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(n) : 'N/A';
  const asTime = s => typeof s === 'number' && Number.isFinite(s) && s >= 0
    ? (Math.floor(s / 3600) ? Math.floor(s / 3600) + 'h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm'
      : Math.floor(s / 60) + 'm ' + String(Math.floor(s % 60)).padStart(2, '0') + 's')
    : 'N/A';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const CSS = \`
.\${ROOT_CLASS} {margin:16px 0 8px;padding:15px 0;border-top:2px solid #aa8244;min-width:0}
.\${ROOT_CLASS} .dj-reader-head {display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:11px}
.\${ROOT_CLASS} h4 {margin:0;font:800 18px/1.3 Arial,sans-serif;letter-spacing:.025em}
.\${ROOT_CLASS} .dj-reader-source {font-size:12px;opacity:.75;font-weight:700}
.\${ROOT_CLASS} .dj-reader-grid {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.\${ROOT_CLASS} .dj-reader-grid>div {border:1px solid #bd9e66;background:#f5ebd5;color:#3b2d1b;border-radius:7px;min-width:0;padding:10px}
.\${ROOT_CLASS} .dj-reader-grid small {display:block;font:700 13px/1.25 Arial,sans-serif;color:#705832}
.\${ROOT_CLASS} .dj-reader-grid strong {display:block;font:800 23px/1.2 Arial,sans-serif;margin:5px 0;overflow-wrap:anywhere}
.\${ROOT_CLASS} .dj-reader-note {font:400 13px/1.45 Arial,sans-serif;margin:10px 0 0}
.\${ROOT_CLASS} .dj-reader-warning {font:700 15px/1.4 Arial,sans-serif;margin:9px 0}
.\${ROOT_CLASS} .dj-reader-refresh {background:#6c4621;color:#fff9df;border:1px solid #c4a46a;border-radius:6px;font:700 13px Arial,sans-serif;padding:8px 13px;margin-top:10px;cursor:pointer}
.\${ROOT_CLASS} .dj-reader-refresh:focus-visible {outline:3px solid #edc570}
@media(max-width:720px) {.\${ROOT_CLASS} .dj-reader-grid {grid-template-columns:repeat(2,minmax(0,1fr))}.\${ROOT_CLASS} h4 {font-size:16px}.\${ROOT_CLASS} .dj-reader-grid strong {font-size:20px}}
\`;
  let key='', pending=false, sequence=0, loadedAt=0, response=null, error=null;
  function selected() {
    try {
      const chosen=typeof websiteReportPeriod==='function' ? websiteReportPeriod() : null;
      if(!chosen?.start || !chosen?.endInclusive) return null;
      return {start:chosen.start,end:chosen.endInclusive,key:chosen.start+'|'+chosen.endInclusive};
    } catch(_) { return null; }
  }
  function findTargets() {
    const content=document.getElementById('content');
    if(!content) return [];
    const cards=Array.from(content.querySelectorAll('.wda .wi-card.wi-book'));
    const mission=Array.from(content.querySelectorAll('.mission-intel-card')).filter(card=>{
      const head=card.querySelector('.mission-intel-card-head');
      return !!(head && /BOOK\s*·\s*CHAPTER\s*1/i.test(head.textContent) &&
        /The Wooden Token/i.test(head.textContent));
    });
    return [...cards,...mission];
  }
  function place(card) {
    let box=card.querySelector(':scope > .'+ROOT_CLASS);
    if(box) return box;
    box=document.createElement('section');
    box.className=ROOT_CLASS;
    box.setAttribute('aria-label','Free Chapter One active reading times');
    box.dataset.version=VERSION;
    const overview=card.querySelector(':scope > .mission-intel-overview');
    if(overview) overview.insertAdjacentElement('afterend',box);
    else card.appendChild(box);
    return box;
  }
  const number=n=>Number.isSafeInteger(n)&&n>=0;
  function validated(value, p) {
    const k=['openSessions','readingSessions','activeSeconds','avgActiveSeconds','read30','read60','read180','endReached','finished'];
    return !!(value?.connected===true && value?.mode==='active-reading-sessions' &&
      value.range?.start===p.start && value.range?.end===p.end && k.every(x=>number(value[x])));
  }
  function metric(label,value,hint='') {
    return '<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong>'+
      (hint?'<small>'+esc(hint)+'</small>':'')+'</div>';
  }
  function markup() {
    let html='<div class="dj-reader-head"><h4>CHAPTER ONE · ACTUAL READING TIME</h4><span class="dj-reader-source">Source: on-page reader · Doc Jaks</span></div>';
    if(pending) return html+'<p class="dj-reader-warning">Checking recorded reading sessions…</p>';
    if(!response) return html+'<p class="dj-reader-warning">'+esc(error||'Not available until reading-time reporting connects.')+'</p>'+
      '<p class="dj-reader-note">Reading sessions cannot be inferred from PDF downloads or general page visits.</p>';
    html+='<div class="dj-reader-grid">'+
      metric('Chapter opened',format(response.openSessions),'Browser sessions, not people')+
      metric('Started reading',format(response.readingSessions),'Reader started')+
      metric('Avg. active reading',asTime(response.avgActiveSeconds),'Inactive time excluded')+
      metric('Total active time',asTime(response.activeSeconds),'Across sessions')+
      metric('Read at least 1 minute',format(response.read60),'Minimum active time')+
      metric('Reached last page',format(response.endReached),'Scrolling to end ≠ full read')+
      metric('Marked finished',format(response.finished),'Reader-confirmed')+
      metric('Read at least 3 minutes',format(response.read180),'Minimum active time')+
      metric('Read at least 30 sec',format(response.read30),'Minimum active time')+
      '</div>';
    html+='<p class="dj-reader-note">Counts are anonymous browser sessions, not unique readers. The clock pauses for hidden or inactive pages. Scrolling to the end or clicking finished is not independent proof the chapter was read. '+
      (response.partialCoverage?'This date range begins before tracking launched on October 20, 2026. ': '')+
      'Chapter download clicks are reported separately.</p>';
    return html;
  }
  function draw() {
    const html=markup();
    findTargets().forEach(card=>{
      const box=place(card);
      if(box.dataset.rendered===html)return;
      box.dataset.rendered=html;
      box.innerHTML=html+'<button type="button" class="dj-reader-refresh">Refresh reading time</button>';
      box.querySelector('.dj-reader-refresh')?.addEventListener('click',()=>load(true));
    });
  }
  async function load(force=false) {
    const p=selected();
    if(!p){if(!error)error='Waiting for a selected reporting period.';draw();return;}
    const now=Date.now();
    if(!force && key===p.key && (pending || (loadedAt && now-loadedAt<120000)))return;
    key=p.key;
    response=null;error=null;pending=true;
    const request=++sequence;
    draw();
    try {
      const params='start='+encodeURIComponent(p.start)+'&end='+encodeURIComponent(p.end);
      const r=await fetch('/api/meta/chapter-reading?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok || !validated(d,p))throw new Error('Reading-time data is not verified for these dates.');
      if(request===sequence)response=d;
    } catch(e) {
      if(request===sequence)error=e?.name==='TimeoutError'
        ?'Reading-time report timed out. Try Refresh again.'
        :(e?.message||'Reading-time report unavailable. No totals estimated.');
    } finally {
      if(request===sequence){pending=false;loadedAt=Date.now();draw();}
    }
  }
  function check(){
    if(!findTargets().length)return;
    draw();
    load();
  }
  function boot(){
    const style=document.createElement('style');style.id='djReaderAnalyticsCss';style.textContent=CSS;
    if(!document.getElementById(style.id))document.head.appendChild(style);
    const root=document.getElementById('content');
    if(!root)return;
    new MutationObserver(check).observe(root,{subtree:true,childList:true});
    check();
    setInterval(check,60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();