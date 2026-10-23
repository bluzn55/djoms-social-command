/* DOC JAKS · Visitor Journey Intelligence
   All evidence is aggregate and owner-only. A search result click cannot
   be matched to an individual Wix session from these APIs.
   Why is always an explicitly labeled hypothesis until tested. */
(function journeyModule(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const number=value=>valid(value)?new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value):'N/A';
  const ratio=value=>valid(value)&&value<=1?(value*100).toFixed(1)+'%':'N/A';
  const cash=value=>Number.isSafeInteger(value)&&value>=0?
    new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100):'N/A';
  const plain=value=>String(value||'').replace(/^https?:\/\/(?:www\.)?docjaks\.com/i,'').replace(/[?#].*$/,'')||'/';
  const named=value=>{
    const path=plain(value);
    if(path==='/')return 'Home';
    const last=path.split('/').filter(Boolean).pop()||'Unknown';
    const friendly={'the-wooden-token':'The Wooden Token','outlaw-radio-5150':'Outlaw Radio 5150',
      'listenting-dock':'Listening Dock','the-pit':'The Pit','ember-hall':'Ember Hall'};
    return friendly[last]||last.replace(/[-_]/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
  };
  const row=(name,value,note)=>'<div class="mj-row"><span>'+esc(name)+
    (note?'<small>'+esc(note)+'</small>':'')+'</span><strong>'+esc(value)+'</strong></div>';
  const report=(name,period)=>{
    const item=window.djomsVerifiedReports?.[name];
    return item?.query===period?.query?item.data:null;
  };
  const salesReady=(sales,period)=>sales?.connected===true&&sales?.complete===true&&
    sales?.range?.start===period?.start&&sales?.range?.end===period?.end;
  const periodTitle=period=>({today:'Day','7d':'Week','30d':'Month','365d':'Year',
    custom:'Custom'})[period?.range]||'Selected period';
  const match=(a,b)=>a===b?'hold':a>b?'up':'down';
  const metricDefs={
    searchCtr:{label:'Google search CTR',unit:'percent',higher:true,source:'Google Search Console'},
    searchClicks:{label:'Google search clicks',unit:'count',higher:true,source:'Google Search Console'},
    siteVisitors:{label:'Wix visitors',unit:'count',higher:true,source:'Wix'},
    siteBounceRate:{label:'Wix bounce rate',unit:'percent',higher:false,source:'Wix'},
    sitePageViews:{label:'Wix page views',unit:'count',higher:true,source:'Wix'},
    formSubmissions:{label:'Wix form submissions',unit:'count',higher:true,source:'Wix'},
    fileDownloads:{label:'GA4 download events',unit:'count',higher:true,source:'GA4'},
    radioLinkClicks:{label:'GA4 radio link clicks',unit:'count',higher:true,source:'GA4'},
    paidOrders:{label:'Wix paid web orders',unit:'count',higher:true,source:'Wix paid store'},
    grossSalesCents:{label:'Gross web item sales',unit:'cents',higher:true,source:'Wix paid store'}
  };
  function valueFor(key,site,seo,ga4,sales,period){
    const google=seo?.status==='connected',g=google?seo.metrics||{}:{};
    const wix=site?.connected===true;
    const event=ga4?.status==='connected'&&ga4.actions?.status==='reported'?ga4.actions.counts||{}:{};
    const paid=salesReady(sales,period);
    const values={
      searchCtr:google?g.ctr:null,searchClicks:google?g.clicks:null,
      siteVisitors:wix?site.visitors:null,siteBounceRate:wix?site.bounceRate:null,
      sitePageViews:wix?site.pageViews:null,formSubmissions:wix?site.formsSubmitted:null,
      fileDownloads:event.fileDownload??null,
      radioLinkClicks:ga4?.status==='connected'&&ga4.actions?.radioLinkStatus==='reported'?ga4.actions.radioLinkClicks:null,
      paidOrders:paid?sales.paidOrders:null,
      grossSalesCents:paid?sales.itemSalesCents:null
    };
    return valid(values[key])?values[key]:null;
  }
  function showMetric(key,value){
    if(!valid(value))return 'N/A';
    const type=metricDefs[key]?.unit;
    return type==='percent'?ratio(value):type==='cents'?cash(value):number(value);
  }
  function linkFor(page){
    try{
      const u=new URL(String(page||''),'https://www.docjaks.com');
      if(!['http:','https:'].includes(u.protocol)||!['docjaks.com','www.docjaks.com'].includes(u.hostname.toLowerCase()))return null;
      return u.origin+u.pathname;
    }catch{return null;}
  }
  function targetLabel(path){
    const url=linkFor(path);
    return url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(url)+'">'+esc(named(path))+' ↗</a>':esc(named(path));
  }
  function evidenceList(id,title,rows,empty,sub){
    return '<details class="mj-evidence"'+(id==='search'?' open':'')+'>'+
      '<summary><strong>'+esc(title)+'</strong><span>'+esc(rows.length?rows.length+' shown':'N/A')+' ▾</span></summary>'+
      (sub?'<p>'+esc(sub)+'</p>':'')+
      (rows.length?'<div class="mj-evidence-list">'+rows.join('')+'</div>':
        '<p class="mj-empty">'+esc(empty)+'</p>')+'</details>';
  }
  function evidence(seo,site,ga4){
    const paired=seo?.status==='connected'&&seo.queryPages?.status==='reported'?
      (seo.queryPages.rows||[]):[];
    const pairRows=paired.filter(p=>p.query&&p.page&&valid(p.impressions))
      .sort((a,b)=>(b.clicks??0)-(a.clicks??0)||(b.impressions??0)-(a.impressions??0))
      .slice(0,5).map(p=>'<div class="mj-list-row"><span><strong>'+esc(p.query)+'</strong>'+
        '<small>Shown URL: '+targetLabel(p.page)+'</small></span>'+
        '<b>'+number(p.impressions)+' seen · '+number(p.clicks)+' clicks</b></div>');
    const onlyQuery=seo?.status==='connected'&&Array.isArray(seo.topQueries)?
      seo.topQueries.filter(p=>p?.query).slice(0,5).map(p=>
        '<div class="mj-list-row"><span><strong>'+esc(p.query)+'</strong>'+
        '<small>Matched URL not supplied</small></span><b>'+number(p.impressions)+' seen · '+
        number(p.clicks)+' clicks</b></div>'):[];
    const landings=site?.connected===true&&Array.isArray(site.landingPages)?
      site.landingPages.filter(p=>p.path&&valid(p.sessions)).slice(0,5).map(p=>
        '<div class="mj-list-row"><span><strong>'+targetLabel(p.path)+'</strong></span>'+
        '<b>'+number(p.sessions)+' landing sessions</b></div>'):[];
    const exits=site?.connected===true&&Array.isArray(site.exitPages)?
      site.exitPages.filter(p=>p.path&&valid(p.sessions)).slice(0,5).map(p=>
        '<div class="mj-list-row"><span><strong>'+targetLabel(p.path)+'</strong></span>'+
        '<b>'+number(p.sessions)+' ending sessions</b></div>'):[];
    const transitions=ga4?.status==='connected'&&ga4.journey?.pageTransitions?.status==='reported'?
      (ga4.journey.pageTransitions.rows||[]).filter(p=>p.from&&p.to&&valid(p.views)).slice(0,5).map(p=>
        '<div class="mj-list-row"><span><strong>'+esc(named(p.from))+' → '+esc(named(p.to))+
        '</strong><small>GA4 internal referrer evidence</small></span>'+
        '<b>'+number(p.views)+' page views</b></div>'):[];
    const clicks=ga4?.status==='connected'&&ga4.actions?.ctaPages?.status==='reported'?
      (ga4.actions.ctaPages.rows||[]).filter(p=>p.pagePath&&p.destination&&valid(p.clicks)).slice(0,5).map(p=>
        '<div class="mj-list-row"><span><strong>'+esc(named(p.pagePath))+'</strong>'+
        '<small>Outbound link: '+esc(p.destination.slice(0,100))+'</small></span>'+
        '<b>'+number(p.clicks)+' click events</b></div>'):[];
    const pageEvents=ga4?.status==='connected'&&ga4.actions?.eventPages?.status==='reported'?
      (ga4.actions.eventPages.rows||[]).filter(p=>p.pagePath&&valid(p.events)).slice(0,5).map(p=>
        '<div class="mj-list-row"><span><strong>'+esc(named(p.pagePath))+'</strong>'+
        '<small>'+esc(p.eventName||'Action')+'</small></span>'+
        '<b>'+number(p.events)+' events</b></div>'):[];
    return '<div class="mj-evidence-grid">'+
      evidenceList('search','SEARCH PHRASE → GOOGLE RESULT PAGE',pairRows.length?pairRows:onlyQuery,
        'Google has not returned phrase-level result details for these dates.',
        pairRows.length?'Actual Google query/page aggregate pairs; not individual website sessions.':
          'Top search phrases; the exact matching result URL is not verified here.')+
      evidenceList('landings','WHICH PAGES PEOPLE ENTERED',landings,
        'Wix landing-page sessions are not available for these dates.',
        'Wix sessions can include visits from non-Google sources.')+
      evidenceList('exits','WHICH PAGES SESSIONS ENDED ON',exits,
        'No Wix exit-page breakdown was returned.',
        'An exit is not proof that the content or CTA failed.')+
      evidenceList('paths','PAGE → NEXT PAGE',transitions,
        'No verified internal referral paths returned. GA4 tagging may need attention.',
        'GA4 page_view events grouped by internal referrer; not unique people or full sessions.')+
      evidenceList('clicks','PAGE → OUTBOUND BUTTON OR LINK',clicks,
        'No page-specific outbound click events reported. Internal buttons still require tracking.',
        'Only automatically measured outbound clicks are included. Clicking is not completion.')+
      evidenceList('events','FORM & SIGNUP EVENTS BY PAGE',pageEvents,
        'No verified page-specific GA4 form or signup events returned.',
        'GA4 event counts are not confirmed Pit Krewe memberships.')+
      '</div>';
  }
  function diagnostic(site,seo,ga4,sales,period){
    const impressions=seo?.status==='connected'?seo.metrics?.impressions:null;
    const ctr=seo?.status==='connected'?seo.metrics?.ctr:null;
    const landing=site?.connected===true?site.landingPages?.find(p=>p.path&&valid(p.sessions)&&p.sessions>0):null;
    const bounce=site?.connected===true?site.bounceRate:null;
    const page=site?.connected===true?site.topPages?.find(p=>p.path&&valid(p.visitors)&&p.visitors>0):null;
    const radio=ga4?.status==='connected'&&ga4.actions?.status==='reported'?ga4.actions.radioLinkClicks:null;
    if(valid(impressions)&&impressions>=50&&valid(ctr)&&ctr<0.025){
      return {evidence:number(impressions)+' Google appearances, '+ratio(ctr)+' reported CTR.',
        why:'The search result may not communicate the page value clearly, or it may appear for searches with different intentions. Neither is established yet.',
        next:'Review the high-impression search phrases and matched result URLs. Test a clearer page title and search description.',
        metric:'searchCtr',confidence:'Measured low CTR; cause is a hypothesis.'};
    }
    if(valid(bounce)&&bounce>=0.70&&valid(site?.sessions)&&site.sessions>=10){
      return {evidence:'Wix bounce rate '+ratio(bounce)+' across '+number(site.sessions)+' sessions.',
        why:'Visitors might not find the promised content or a useful next step quickly enough. High bounce alone does not establish why.',
        next:'Improve the first-screen explanation and one clear next-step CTA on the most-used entry page. Instrument that CTA.',
        metric:'siteBounceRate',confidence:'Measured bounce; proposed explanation requires testing.'};
    }
    if(valid(radio)&&radio>0){
      return {evidence:number(radio)+' GA4 radio-related external-link click events; listening starts are not confirmed.',
        why:'An interested visitor may click Listen Live without audio actually starting. The number of real listeners remains unknown.',
        next:'Verify a Radio.co listening-start measure separately from link clicks, then compare click-to-listen completion.',
        metric:'radioLinkClicks',confidence:'Radio click events measured; actual listening remains unverified.'};
    }
    if(landing&&page){
      return {evidence:number(landing.sessions)+' Wix entry sessions on '+named(landing.path)+
          '; '+number(page.visitors)+' reported visitors to '+named(page.path)+'.',
        why:'The main entry pages and most-visited pages may offer different next steps. These totals do not show an individual path.',
        next:'Verify the first CTA visible on '+named(landing.path)+' and record its clicks, destinations and completions.',
        metric:'sitePageViews',confidence:'Entry/page aggregates known; individual motivations unverified.'};
    }
    return {evidence:'Site navigation and internal CTA conversion are not yet consistently linked end to end.',
      why:'Without a verified click and completion for each CTA, we cannot distinguish lack of interest from a missing or confusing next step.',
      next:'Instrument the main Home and Outlaw Radio CTAs, then validate each destination and completion event.',
      metric:'siteVisitors',confidence:'Instrumentation gap, not a claim about visitor intent.'};
  }
  function progressLine(test,site,seo,ga4,sales,period){
    const def=metricDefs[test.metric];
    if(!def)return '';
    const raw=valueFor(test.metric,site,seo,ga4,sales,period);
    const cityParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(test.createdAt));
    const ymd=['year','month','day'].map(k=>cityParts.find(x=>x.type===k)?.value||'').join('-');
    const samePeriod=test.range===period?.range;
    const startedAfter=samePeriod&&period?.start&&period.start>ymd;
    const eligible=startedAfter&&raw!==null&&test.days===period?.days;
    let verdict='PENDING FULL POST-CHANGE WINDOW',tone='pending';
    let detail='Choose '+({today:'Day','7d':'Week','30d':'Month'})[test.range]+
      ' and wait until the entire reporting window begins after the change.';
    if(eligible){
      const movement=match(raw,test.baseline);
      const good=movement==='hold'?null:movement===(def.higher?'up':'down');
      tone=good===null?'pending':good?'up':'down';
      verdict=good===null?'NO MEASURED CHANGE':good?'METRIC IMPROVED':'METRIC DECLINED';
      detail='Current '+showMetric(test.metric,raw)+' vs recorded baseline '+
        showMetric(test.metric,test.baseline)+'. Comparison is observational, not proof this change caused it.';
    }
    return '<div class="mj-test-row"><div><strong>'+esc(test.note)+
      '</strong><small>'+esc(test.createdAt.slice(0,10))+' · '+esc(def.label)+
      ' · baseline '+esc(showMetric(test.metric,test.baseline))+
      ' · '+esc(({today:'Day','7d':'Week','30d':'Month'})[test.range]||test.range)+
      '</small></div><strong class="mj-result '+tone+'">'+esc(verdict)+'</strong>'+
      '<p>'+esc(detail)+'</p>'+
      '<button type="button" data-mj-remove="'+esc(test.id)+'" title="Remove this recorded change">Remove</button></div>';
  }
  let tests=[],testsLoaded=false,testsBusy=false,testsError='';
  async function loadTests(){
    if(testsLoaded||testsBusy||typeof api!=='function')return;
    testsBusy=true;
    try{
      const response=await api('journey-tests');
      tests=Array.isArray(response?.tests)?response.tests:[];
      testsLoaded=true;testsError='';
    }catch(err){
      testsLoaded=true;
      testsError=err?.message||'Change log could not be read.';
    }finally{
      testsBusy=false;
      if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&typeof window.renderConnectionStrip==='function')
        window.renderConnectionStrip();
    }
  }
  function testsPanel(site,seo,ga4,sales,period){
    const selectable=period?.range==='today'||period?.range==='7d'||period?.range==='30d';
    const periodReady=selectable&&period?.start&&period?.endInclusive;
    const opts=Object.entries(metricDefs).map(([key,d])=>{
      const n=valueFor(key,site,seo,ga4,sales,period);
      return '<option value="'+key+'"'+(n===null?' disabled':'')+'>'+
        esc(d.label+(n===null?' · N/A':' · current '+showMetric(key,n)))+'</option>';
    }).join('');
    return '<details class="mj-tests"><summary>RECORD A CHANGE & SEE IF IT HELPED ▾'+
      '<small>Owner-only · saved across devices</small></summary>'+
      '<p>Record the change before you make it. We save its current verified metric as the baseline. Later, select the same reporting length to compare a full post-change window.</p>'+
      (testsError?'<p class="mj-empty">'+esc(testsError)+'</p>':'')+
      '<form id="mjTestForm" class="mj-test-form">'+
        '<label>WHAT ARE YOU CHANGING?<input name="note" maxlength="180" required minlength="5" placeholder="Example: Make Listen Live button bigger on Home"></label>'+
        '<label>WHICH VERIFIED NUMBER SHOULD IMPROVE?<select name="metric" required><option value="">Choose a measured KPI…</option>'+opts+'</select></label>'+
        '<button type="submit"'+(!periodReady?' disabled':'')+'>Record current baseline</button>'+
        (!periodReady?'<small>Choose Day, Week, or Month above to record a comparable baseline.</small>':'')+
      '</form>'+
      '<div class="mj-tests-list">'+(tests.length?tests.slice(0,12).map(t=>progressLine(t,site,seo,ga4,sales,period)).join(''):
        '<p class="mj-empty">'+(testsLoaded?'No website changes recorded yet.':'Loading saved changes…')+'</p>')+
      '</div><p class="mj-caveat">A before/after result can show improvement, but only controlled comparisons and other evidence can help establish WHY. Google search reports can be delayed.</p></details>';
  }
  function journey(context){
    const {site,seo,ga4,sales,period}=context||{};
    const g=seo?.status==='connected'?seo.metrics||{}:{};
    const w=site?.connected===true;
    const paid=salesReady(sales,period);
    const clicks=valid(g.clicks)?g.clicks:null;
    const impressions=valid(g.impressions)?g.impressions:null;
    const notClicked=valid(impressions)&&valid(clicks)&&impressions>=clicks?impressions-clicks:null;
    const landing=w&&Array.isArray(site.landingPages)?
      site.landingPages.filter(p=>valid(p.sessions)).reduce((sum,p)=>sum+p.sessions,0):null;
    const entryCount=w&&Array.isArray(site.landingPages)&&site.landingPages.length>0?landing:null;
    const flows=ga4?.status==='connected'&&ga4.journey?.pageTransitions?.status==='reported'?
      ga4.journey.pageTransitions.rows||[]:null;
    const outbound=ga4?.status==='connected'&&ga4.actions?.ctaPages?.status==='reported'?
      ga4.actions.ctaPages.rows||[]:null;
    const outboundEvents=Array.isArray(outbound)?
      outbound.reduce((sum,p)=>sum+(valid(p.clicks)?p.clicks:0),0):null;
    const gaActions=ga4?.status==='connected'&&ga4.actions?.status==='reported'?ga4.actions.counts||{}:{};
    const suggestion=diagnostic(site,seo,ga4,sales,period);
    const key=suggestion.metric;
    const current=valueFor(key,site,seo,ga4,sales,period);
    const def=metricDefs[key];
    let previous=null;
    if(key==='searchCtr'||key==='searchClicks'){
      const cmp=seo?.comparison?.status==='reported'?seo.comparison:null;
      previous=key==='searchCtr'?cmp?.ctr?.previous:cmp?.clicks?.previous;
    }else if(key==='siteVisitors')previous=site?.metricComparisons?.visitors?.previousVisitors;
    else if(key==='siteBounceRate')previous=site?.metricComparisons?.bounceRate?.previous;
    else if(key==='sitePageViews')previous=site?.metricComparisons?.pageViews?.previous;
    else if(key==='formSubmissions')previous=site?.metricComparisons?.formsSubmitted?.previous;
    else if(key==='fileDownloads')previous=ga4?.actions?.comparison?.counts?.fileDownload?.previous;
    const hasCompare=valid(previous)&&valid(current);
    const arrow=hasCompare?(current===previous?'→':((current>previous)===def.higher?'↑':'↓')):'';
    const change=hasCompare?(current===previous?'No movement':(arrow==='↑'?'Moving favorably':'Moving unfavorably')):'Comparison N/A';
    const foot='Google search exposure, Wix entry sessions and GA4 events are different measures. They cannot be added into a single visitor funnel. A search query cannot normally be traced to a particular individual.';
    const step=(num,title,value,caption)=>'<div class="mj-step"><small>'+esc(num+' · '+title)+'</small><strong>'+esc(value)+
      '</strong><span>'+esc(caption)+'</span></div>';
    return '<section id="mjVisitorJourney" class="mission-journey-panel" aria-label="Doc Jaks Visitor Journey Intelligence">'+
      '<header class="mj-header"><div><small>DOC JAKS · SEARCH TO ACTION TO RESULTS</small>'+
        '<h2>VISITOR JOURNEY INTELLIGENCE</h2>'+
        '<p>WHAT happened? WHY might it have happened? WHAT should we change? DID it help?</p></div>'+
        '<b>'+esc(periodTitle(period))+' · Actual data only</b></header>'+
      '<div class="mj-flow" aria-label="Flow from search discovery through verified outcome">'+
        step('1','SEARCH SHOWN',number(impressions),'Google result appearances')+
        step('2','CLICK?',number(clicks),'Google search clicks')+
        step('3','ARRIVED',number(entryCount),'Top reported Wix entry sessions')+
        step('4','NEXT PAGE',Array.isArray(flows)?number(flows.reduce((sum,r)=>sum+(valid(r.views)?r.views:0),0)):'N/A',
          'GA4 internal referrer page views')+
        step('5','CTA CLICK',number(outboundEvents),'GA4 outbound click events')+
        step('6','OUTCOME',paid?number(sales.paidOrders):'N/A','Verified Wix paid orders')+
      '</div>'+
      '<div class="mj-split"><span class="mj-no-click">SEARCH RESULT NOT CLICKED <b>'+
        (notClicked!==null?'≈'+number(notClicked):'N/A')+
        '</b><small>Approximate appearances without a click, not people</small></span>'+
        '<span class="mj-yes-click">SEARCH RESULT CLICKED <b>'+number(clicks)+
        '</b><small>Google clicks, not matched to Wix sessions</small></span></div>'+
      '<div class="mj-outcomes">'+
        row('Wix form submissions',w?number(site.formsSubmitted):'N/A','Confirmed submissions, not necessarily Krewe members')+
        row('GA4 download events',number(gaActions.fileDownload),'Events, not unique readers')+
        row('Radio listening starts','N/A','External-link clicks are not verified listening')+
        row('Gross paid web item sales',paid?cash(sales.itemSalesCents):'N/A','Paid Wix items before tax and shipping')+
      '</div>'+
      evidence(seo,site,ga4)+
      '<div class="mj-intelligence">'+
        '<article><h3>1. WHAT HAPPENED?</h3><p>'+esc(suggestion.evidence)+
          '</p><small>Verified measurements from the selected dates.</small></article>'+
        '<article><h3>2. WHY MIGHT THAT BE?</h3><p>'+esc(suggestion.why)+
          '</p><small>HYPOTHESIS · '+esc(suggestion.confidence)+'</small></article>'+
        '<article><h3>3. WHAT SHOULD WE CHANGE?</h3><p>'+esc(suggestion.next)+
          '</p><small>Recommended next test, not an automatic site edit.</small></article>'+
        '<article><h3>4. DID IT HELP?</h3>'+
          '<strong class="mj-trend '+(arrow==='↑'?'up':arrow==='↓'?'down':'pending')+'">'+esc(change)+
          '</strong><p>'+esc(def.label)+': Last '+esc(showMetric(key,previous))+
            ' · Current '+esc(showMetric(key,current))+'</p>'+
          '<small>This is period movement, not proof of cause. Record the change below to compare a full post-change window.</small></article>'+
      '</div>'+testsPanel(site,seo,ga4,sales,period)+
      '<p class="mj-caveat">'+esc(foot)+' Internal CTA clicks and confirmed listener starts need separate instrumentation; they remain N/A until verified.</p>'+
    '</section>';
  }
  window.djomsVisitorJourney=journey;
  const original=window.renderConnectionStrip;
  if(typeof original==='function'){
    window.renderConnectionStrip=function(...args){
      const result=original.apply(this,args);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control')void loadTests();
      return result;
    };
  }
  document.addEventListener('submit',async e=>{
    const form=e.target.closest?.('#mjTestForm');
    if(!form)return;
    e.preventDefault();
    const period=typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
    if(!period?.start||!period?.endInclusive||!['today','7d','30d'].includes(period.range)){
      if(typeof notice==='function')notice('Select Day, Week, or Month before recording a change.',true);
      return;
    }
    const metric=form.elements.namedItem('metric')?.value;
    const note=form.elements.namedItem('note')?.value?.trim()||'';
    const site=typeof websiteSnapshot==='function'?websiteSnapshot():null;
    const seo=report('seo',period),ga4=report('ga4',period),sales=report('sales',period);
    const baseline=valueFor(metric,site,seo,ga4,sales,period);
    if(!valid(baseline)||note.length<5||!metricDefs[metric]){
      if(typeof notice==='function')notice('Enter a description and select a metric that has verified data.',true);
      return;
    }
    const button=form.querySelector('button[type=submit]');
    if(button)button.disabled=true;
    try{
      const response=await api('journey-tests',{
        note,metric,baseline,range:period.range,start:period.start,endInclusive:period.endInclusive
      });
      tests=Array.isArray(response.tests)?response.tests:tests;
      testsLoaded=true;testsError='';
      if(typeof notice==='function')notice('Change saved. The comparison begins after a full new reporting window.');
      if(typeof window.renderConnectionStrip==='function')window.renderConnectionStrip();
    }catch(err){
      if(typeof notice==='function')notice(err?.message||'Could not save the change.',true);
      if(button)button.disabled=false;
    }
  });
  document.addEventListener('click',async e=>{
    const button=e.target.closest?.('[data-mj-remove]');
    if(!button)return;
    e.preventDefault();
    if(!confirm('Remove this recorded change and its baseline?'))return;
    button.disabled=true;
    try{
      const response=await api('journey-tests',{id:button.dataset.mjRemove},'DELETE');
      tests=Array.isArray(response.tests)?response.tests:tests;
      testsLoaded=true;
      if(typeof window.renderConnectionStrip==='function')window.renderConnectionStrip();
    }catch(err){
      if(typeof notice==='function')notice(err?.message||'Could not remove the record.',true);
      button.disabled=false;
    }
  });
})();
