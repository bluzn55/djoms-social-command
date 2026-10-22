/* DJOMS · Owner-only Google Analytics 4 visitor sources.
   Shares Wix reporting dates. Numbers are genuine GA4 values, never estimates. */
(function missionGa4(){
  'use strict';
  const delay=120000;
  const reports=new Map();
  const inFlight=new Map();
  let tagCheck={checkedAt:0,status:'checking',message:'',inFlight:null};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const fmt=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
    ?new Intl.NumberFormat('en-US').format(Math.round(value)):'N/A';
  const pct=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
    ?(value*100).toFixed(1)+'%':'N/A';
  const duration=value=>{
    if(typeof value!=='number'||!Number.isFinite(value)||value<0)return 'N/A';
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

  // Complete fixed source rows, independent Wix and Google Analytics sessions.
  // N/A = not verified; zero only follows a complete source report.
  const originOrder=[
    ['direct','Direct'],['facebook','Facebook'],['instagram','Instagram'],
    ['x','X / Twitter'],['youtube','YouTube'],['ai','AI referral sites'],
    ['outlaw','Outlaw Radio 5150'],['google','Google Search'],
    ['other-search','Other search engines'],['other-social','Other social platforms'],
    ['email','Email'],['ads','Paid advertising'],
    ['referral','Other websites / referrals'],['other','Other / unassigned']
  ];
  const validCount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  function originKind(name,category='') {
    const raw=String(name||'').trim().toLowerCase();
    const cat=String(category||'').trim().toLowerCase();
    const parts=raw.split(/\s+\/\s+/),base=parts[0]||'',medium=(parts[1]||'').trim();
    const text=raw+' '+cat;
    if(/(?:^|[^a-z])(?:cpc|ppc|paid|cpm|display|advertising|ads)(?:$|[^a-z])/.test(medium+' '+cat))return 'ads';
    // Share the same verified Email referrer detector as Search & Discovery.
    // Only tracked campaigns and known mail clients count, not generic
    // website articles with "email" in their URL.
    if((typeof window.djomsEmailReferralSource==='function'&&
      window.djomsEmailReferralSource({source:raw,category:cat}))||
      /(?:^|[^a-z0-9])(?:mail\.duck\.com|email\s*protection|@duck\.com)(?:$|[^a-z0-9])/.test(raw))
      return 'email';
    if(cat==='direct'||base==='(direct)'||base==='direct')return 'direct';
    if(/facebook|fb\.me|\bfb\b/.test(text))return 'facebook';
    if(/instagram|ig\.me|\binsta\b/.test(text))return 'instagram';
    if(/twitter|t\.co(?:\s|$)|x\.com/.test(text)||base==='x')return 'x';
    if(/youtube|youtu\.be/.test(text))return 'youtube';
    // A referral from the radio domain or an explicitly tagged external
    // forward is a radio-origin website session, not a streaming listener.
    if(typeof window.djomsOutlawRadioReferral==='function'&&
      window.djomsOutlawRadioReferral({source:raw,category:cat}))return 'outlaw';
    // Use the exact same detector as the 23-source Search & Discovery grid.
    // A named AI referrer is not an ordinary search-engine impression.
    if(typeof window.djomsAiReferralService==='function'&&
      window.djomsAiReferralService({source:raw,category:cat}))return 'ai';
    if((base==='google'||base==='google.com'||base==='www.google.com')&&
       (cat.includes('organic_search')||cat.includes('organic search')||
        medium==='organic'||medium==='organic_search'))return 'google';
    if(cat.includes('search')||medium==='organic')return 'other-search';
    if(/tiktok|pinterest|reddit|linkedin|snapchat|threads|social/.test(text))return 'other-social';
    if(cat.includes('referral')||medium==='referral')return 'referral';
    return 'other';
  }
  const sourceCount=(key,entries,complete)=>{
    const found=entries.filter(item=>item.kind===key);
    return found.length?found.reduce((sum,item)=>sum+item.sessions,0):complete?0:null;
  };
  function sourceSummary(report) {
    const wix=typeof websiteSnapshot==='function'?websiteSnapshot():null;
    const wixAvailable=wix?.connected===true&&Array.isArray(wix.trafficSources);
    const wixEntries=wixAvailable?wix.trafficSources
      .filter(item=>validCount(item?.sessions))
      .map(item=>({kind:originKind(item.source,item.category),sessions:item.sessions})):[];
    const wixComplete=wixAvailable&&wix.trafficSourcesComplete===true;
    const ga4Reported=report?.status==='connected'&&report?.sourceDetails?.status==='reported'&&
      Array.isArray(report.sourceDetails.rows);
    const ga4Entries=ga4Reported?report.sourceDetails.rows
      .filter(item=>validCount(item?.sessions))
      .map(item=>({kind:originKind(item.sourceMedium),sessions:item.sessions})):[];
    // Suppressed or partial source rows may not reconcile to GA4's actual
    // session total. Never turn missing attribution into apparent zeroes.
    const ga4SourceTotal=ga4Entries.reduce((sum,item)=>sum+item.sessions,0);
    const ga4Available=ga4Reported&&(!validCount(report?.metrics?.sessions)||
      ga4SourceTotal===report.metrics.sessions);
    const rows=originOrder.map(([key,label],i)=>
      '<tr><th scope="row"><em>'+(i+1)+'.</em> '+esc(label)+'</th>'+
      '<td>'+esc(fmt(sourceCount(key,wixEntries,wixComplete)))+'</td>'+
      '<td>'+esc(fmt(sourceCount(key,ga4Entries,ga4Available)))+'</td></tr>'
    ).join('');
    const total=entries=>entries.reduce((sum,item)=>sum+item.sessions,0);
    const wixTotal=wixComplete?total(wixEntries):null;
    const ga4Total=ga4Available?total(ga4Entries):null;
    return '<div class="mission-ga4-sources mission-ga4-sources-breakdown" aria-label="Where website traffic sessions came from">'+
      '<div class="mission-ga4-origin-heading"><strong>WHERE VISITS CAME FROM</strong>'+
      '<small>Source attribution · selected reporting dates</small></div>'+
      '<div class="mission-ga4-origin-table-scroll"><table class="mission-ga4-origin-table">'+
      '<thead><tr><th scope="col">Source</th><th scope="col">Wix sessions</th>'+
      '<th scope="col">GA4 sessions</th></tr></thead>'+
      '<tbody>'+rows+'</tbody>'+
      '<tfoot><tr><th scope="row">Reported source total</th>'+
      '<td>'+esc(fmt(wixTotal))+'</td><td>'+esc(fmt(ga4Total))+'</td></tr></tfoot>'+
      '</table></div>'+
      (!wixComplete||!ga4Available?'<p class="mission-ga4-origin-coverage">N/A means the source has not been individually verified; a 0 means a complete report recorded none.</p>':'')+
      '<p class="mission-ga4-origin-note">Sessions are visits, not unique people. Wix and GA4 use separate tracking, so their figures need not match. Do not add the two columns together.</p>'+
    '</div>';
  }


  function paintTagCheck(){
    const node=document.querySelector('#missionGa4Panel .mission-ga4-identity-status');
    if(!node)return;
    const checking=!!tagCheck.inFlight;
    const status=tagCheck.status||'checking';
    node.className='mission-ga4-identity-status '+status;
    node.textContent=checking?'Checking Google Analytics web stream…':
      status==='matched'?'Wix GA4 tag matches this Google Analytics property.':
      status==='mismatch'?'TRACKING SETUP NEEDS ATTENTION: Wix tag and GA4 property do not match.':
      tagCheck.message||'Tracking setup has not yet been verified.';
    node.title=tagCheck.message||'The tag identity check does not count sessions.';
  }
  function verifyTag(force=false){
    if(tagCheck.inFlight)return tagCheck.inFlight;
    if(!force&&tagCheck.checkedAt&&Date.now()-tagCheck.checkedAt<10*60*1000){
      paintTagCheck();
      return Promise.resolve(tagCheck);
    }
    const task=(async()=>{
      let result;
      try{
        const response=await fetch('/api/meta/ga4-verify',{
          credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(16000)
        });
        result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(result.error||'Google setup check was unavailable.');
        if(!['matched','mismatch','unavailable'].includes(result.status))
          throw new Error('Google setup check did not return a verified status.');
      }catch(error){
        result={status:'unavailable',
          message:error?.name==='TimeoutError'?'Google setup check timed out.':
            String(error.message||'Google tracking setup could not be checked.')};
      }
      const previous=tagCheck.status;
      tagCheck.status=result.status;
      tagCheck.message=result.message||'';
      tagCheck.checkedAt=Date.now();
      window.djomsGa4Verification=result;
      if(previous!==result.status)
        document.dispatchEvent(new CustomEvent('djoms:verified-report',{detail:{source:'ga4-verify'}}));
      return tagCheck;
    })().finally(()=>{tagCheck.inFlight=null;paintTagCheck();});
    tagCheck.inFlight=task;
    paintTagCheck();
    return task;
  }

  function show(panel,report,period,error){
    const {color,label}=classify(report);
    const connected=report?.status==='connected';
    const pending=!report&&!error;
    const state=pending?'CHECKING':error?'UNAVAILABLE':label;
    const stateColor=pending?'yellow':error?'red':color;
    const data=report?.metrics||{};
    const message=error||report?.message||'Checking whether Google Analytics reports are authorized.';
    const channels=Array.isArray(report?.channels)?report.channels.slice(0,8):[];
    if(report) {
      window.djomsVerifiedReports ||= {};
      const old=window.djomsVerifiedReports.ga4;
      const stamp=String(period?.query||'')+'|'+String(report.checkedAt||'')+'|'+String(report.status||'');
      window.djomsVerifiedReports.ga4={query:period?.query||null,data:report,stamp};
      if(old?.stamp!==stamp)
        document.dispatchEvent(new CustomEvent('djoms:verified-report',{detail:{source:'ga4'}}));
    }
    panel.innerHTML=
      '<div class="mission-ga4-head">'+
        '<div class="mission-ga4-title"><strong>STEP 2 · GOOGLE ANALYTICS (GA4)</strong>'+
          '<small>'+esc(periodLabel(period))+' · DOCJAKS.COM</small></div>'+
        '<span class="mission-ga4-status"><i class="gyr-light '+stateColor+'" aria-hidden="true"></i>'+
          '<b>'+esc(state)+'</b></span>'+
      '</div>'+
      '<p class="mission-ga4-intro">After someone reaches the website, GA4 shows which channels brought them here.'+
        '<span class="mission-ga4-identity-status" role="status">Checking whether Wix and Google Analytics use the same tag...</span>'+
        '<button type="button" data-ga4-verify="1" class="mission-ga4-verify-btn">Check tracking setup</button></p>'+
      '<div class="mission-ga4-stats">'+
        stat('Sessions',connected?fmt(data.sessions):'N/A')+
        stat('Active users',connected?fmt(data.activeUsers):'N/A')+
        stat('Engagement rate',connected?pct(data.engagementRate):'N/A')+
        stat('Avg. session',connected?duration(data.averageSessionDuration):'N/A')+
      '</div>'+

      sourceSummary(report)+
      (connected&&channels.length
        ?'<details class="mission-ga4-channel-details"><summary>Original GA4 channel groups</summary>'+
          '<div class="mission-ga4-channels">'+channels.map((channel,index)=>
            '<div class="mission-ga4-channel"><span><em>'+(index+1)+'.</em> '+
            esc(channel.name||'Unassigned')+'</span><b>'+esc(fmt(channel.sessions))+
            ' sessions</b></div>').join('')+'</div></details>'
        :'')+
      '<div class="mission-ga4-footer">'+
        '<small>'+esc(message)+'</small>'+
        (connected?
          '<a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Open Google Analytics ↗</a>':
          report?.status==='enable-api'?'': 
          '<a class="mission-ga4-connect" href="/api/meta/ga4-connect">'+
            (report?.status==='reconnect'?'Reconnect Google Analytics ↗':'Connect Google Analytics ↗')+'</a>')+
        (report?.status==='enable-api'?
          '<a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noopener noreferrer">Enable GA4 Data API ↗</a>':'')+
      '</div>'+
      (connected && report?.actions?.status==='reported'
        ?'<details class="mission-ga4-action-details"><summary>What visitors actually clicked or did (GA4 events)</summary>'+
          '<div class="mission-ga4-events">'+
          [['Form submissions',report.actions.counts?.formSubmit],
           ['Sign-up events',report.actions.counts?.signUp],
           ['File downloads',report.actions.counts?.fileDownload],
           ['Add to cart',report.actions.counts?.addToCart],
           ['Checkout starts',report.actions.counts?.beginCheckout],
           ['Purchase events',report.actions.counts?.purchase],
           ['Outbound link clicks',report.actions.counts?.outboundClick],
           ['Radio-related external link clicks',report.actions.radioLinkClicks]]
          .map(([label,value])=>'<span><small>'+esc(label)+'</small><b>'+esc(fmt(value))+'</b></span>')
          .join('')+'</div><p>These are GA4 events, not unique people or confirmed orders. Radio-related clicks are not actual listening. Use verified Wix paid orders for sales.</p></details>'
        :'')+
      (connected?'<p class="mission-ga4-footnote">GA4 sessions and Wix visitors use different measurement methods; do not add these numbers together. Google Analytics data may take time to finalize.</p>':'');
    paintTagCheck();
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
    void verifyTag(false);
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
    const verifyButton=event.target.closest('[data-ga4-verify]');
    if(verifyButton){event.preventDefault();void verifyTag(true);return;}
    const target=event.target.closest('[data-ga4-refresh]');
    if(!target)return;
    event.preventDefault();
    paint(true);
  });
})();
