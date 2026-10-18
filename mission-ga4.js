/* DJOMS · Owner-only Google Analytics 4 visitor sources.
   Shares Wix reporting dates. Numbers are genuine GA4 values, never estimates. */
(function missionGa4(){
  'use strict';
  const delay=120000;
  const reports=new Map();
  const inFlight=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const fmt=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
    ?new Intl.NumberFormat('en-US').format(Math.round(value)):'—';
  const pct=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
    ?(value*100).toFixed(1)+'%':'—';
  const duration=value=>{
    if(typeof value!=='number'||!Number.isFinite(value)||value<0)return '—';
    const seconds=Math.round(value);
    return seconds<60?seconds+'s':Math.floor(seconds/60)+'m '+seconds%60+'s';
  };
  const current=()=>typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
  const periodLabel=p=>p?.range==='custom'
    ?(p.start+' to '+p.endInclusive)
    :({today:'Today','7d':'Last 7 days','30d':'Last 30 days','365d':'Last 365 days'})[p?.range]||'Selected dates';
  const stat=(label,value)=>'<span class="mission-ga4-stat"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></span>';
  const classify=report=>{
    if(report?.status==='connected')return {color:'green',label:'CONNECTED'};
    if(report?.status==='enable-api')return {color:'yellow',label:'ENABLE DATA API'};
    if(report?.status==='reconnect')return {color:'red',label:'RECONNECT'};
    if(report?.status==='needs-attention')return {color:'red',label:'NEEDS ATTENTION'};
    return {color:'yellow',label:'AUTHORIZE'};
  };
  const sameRange=(report,period)=>report?.range?.start===period?.start&&report?.range?.end===period?.end;
  function show(panel,report,period,error){
    const {color,label}=classify(report);
    const connected=report?.status==='connected';
    const pending=!report&&!error;
    const state=pending?'CHECKING':error?'UNAVAILABLE':label;
    const stateColor=pending?'yellow':error?'red':color;
    const data=report?.metrics||{};
    const message=error||report?.message||'Checking whether Google Analytics reports are authorized.';
    const channels=Array.isArray(report?.channels)?report.channels.slice(0,5):[];
    panel.innerHTML=
      '<div class="mission-ga4-head">'+
        '<div class="mission-ga4-title"><strong>STEP 2 · GOOGLE ANALYTICS (GA4)</strong>'+
          '<small>'+esc(periodLabel(period))+' · DOCJAKS.COM</small></div>'+
        '<span class="mission-ga4-status"><i class="gyr-light '+stateColor+'" aria-hidden="true"></i>'+
          '<b>'+esc(state)+'</b></span>'+
      '</div>'+
      '<p class="mission-ga4-intro">After someone reaches the website, GA4 shows which channels brought them here.</p>'+
      '<div class="mission-ga4-stats">'+
        stat('Sessions',connected?fmt(data.sessions):'—')+
        stat('Active users',connected?fmt(data.activeUsers):'—')+
        stat('Engagement rate',connected?pct(data.engagementRate):'—')+
        stat('Avg. session',connected?duration(data.averageSessionDuration):'—')+
      '</div>'+
      (connected?
        '<div class="mission-ga4-sources">'+
        '<strong>WHERE SESSIONS CAME FROM</strong>'+
        (channels.length?'<div class="mission-ga4-channels">'+
          channels.map((channel,index)=>
            '<div class="mission-ga4-channel"><span><em>'+(index+1)+'.</em> '+
            esc(channel.name||'Unassigned')+'</span><b>'+esc(fmt(channel.sessions))+' sessions</b></div>'
          ).join('')+'</div>':
          '<p class="mission-ga4-no-data">No traffic channels reported for these dates yet.</p>')+
        '</div>':'')+
      '<div class="mission-ga4-footer">'+
        '<small>'+esc(message)+'</small>'+
        (connected?
          '<a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Open Google Analytics ↗</a>':
          '<a class="mission-ga4-connect" href="/api/meta/ga4-connect">'+
            (report?.status==='reconnect'?'Reconnect Google Analytics ↗':'Connect Google Analytics ↗')+'</a>')+
        (report?.status==='enable-api'?
          '<a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noopener noreferrer">Enable GA4 Data API ↗</a>':'')+
      '</div>'+
      (connected?'<p class="mission-ga4-footnote">GA4 sessions and Wix visitors use different measurement methods; do not add these numbers together. Google Analytics data may take time to finalize.</p>':'');
  }
  async function load(period,force=false){
    if(!period?.query||!period?.start||!period?.end)return null;
    const key=period.query;
    const known=reports.get(key);
    if(!force&&known&&Date.now()-known.time<delay)return known;
    if(!force&&inFlight.has(key))return inFlight.get(key);
    const job=(async()=>{
      let value=null,error=null;
      try{
        const response=await fetch('/api/meta/ga4-status?'+key,{
          credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)
        });
        value=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(value.error||'GA4 data was not available.');
        if(!sameRange(value,period))throw new Error('GA4 reporting dates do not match Wix.');
      }catch(e){
        error=e?.name==='TimeoutError'?'Google Analytics took too long.':(e?.message||'GA4 report unavailable.');
      }
      const snapshot={time:Date.now(),value,error};
      reports.set(key,snapshot);
      return snapshot;
    })().finally(()=>inFlight.delete(key));
    inFlight.set(key,job);
    return job;
  }
  function paint(force=false){
    const panel=document.getElementById('missionGa4Panel');
    if(!panel)return;
    const period=current();
    if(!period?.query||!period?.start||!period?.end){
      show(panel,null,period,'Waiting for Wix reporting dates.');
      return;
    }
    const key=period.query;
    const cached=reports.get(key);
    show(panel,cached?.value||null,period,cached?.error);
    void load(period,force).then(result=>{
      if(!panel.isConnected||current()?.query!==key)return;
      show(panel,result?.value||null,period,result?.error);
    });
  }
  const previous=window.renderConnectionStrip;
  if(typeof previous==='function'){
    window.renderConnectionStrip=function(...args){
      const result=previous.apply(this,args);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control')paint(false);
      return result;
    };
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-ga4-refresh]');
    if(!target)return;
    event.preventDefault();
    paint(true);
  });
})();
