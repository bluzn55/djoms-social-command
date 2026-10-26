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
  // Listener heart votes are lifetime Wix records, not station plays or
  // social-media reactions. Show no totals unless Wix returns verified data.
  let songLikes={status:'loading',songs:[],top:null,leaders:[]};
  let likesLastChecked=0,likesPending=null;
  function loadSongLikes(){
    if(likesPending||Date.now()-likesLastChecked<90000)return;
    likesLastChecked=Date.now();
    likesPending=(async()=>{
      const response=await fetch('/api/meta/song-likes',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||data?.status!=='reported'||!Array.isArray(data.songs))
        throw new Error('Verified song likes are unavailable.');
      songLikes=data;
    })().catch(()=>{
      songLikes={status:'unavailable',songs:[],top:null,leaders:[]};
    }).finally(()=>{
      likesPending=null;
      if(typeof activeView!=='undefined'&&activeView==='Mission Control')paintTop();
    });
  }

  const salesReady=(sales,period)=>sales?.connected===true&&sales?.complete===true&&
    sales?.range?.start===period?.start&&sales?.range?.end===period?.end;
  const periodTitle=period=>({today:'Day','7d':'Week','30d':'Month','365d':'Year',
    custom:'Custom'})[period?.range]||'Selected period';

  // Presentation-only formatting. API dates, filtering and persisted
  // comparison keys remain strict YYYY-MM-DD so timezone arithmetic is safe.
  const displayDay=value=>typeof value==='string'&&
    /^\d{4}-\d{2}-\d{2}$/.test(value)?
    value.slice(5,7)+'-'+value.slice(8,10)+'-'+value.slice(0,4):'N/A';
  const displayWindow=(from,to)=>{
    const start=displayDay(from),end=displayDay(to);
    if(start==='N/A'||end==='N/A')return 'N/A';
    return from===to?start:start+' to '+end;
  };
  const reportNames={
    today:'DAILY', '7d':'WEEKLY', '30d':'MONTHLY','365d':'YEARLY',custom:'CUSTOM'
  };
  // The user can change periods inside an open report. The main Mission
  // Control date handler rebuilds the entire report, so remember that intent.
  let keepDailyReportOpen=false;

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
    const googleMetric=test.metric==='searchCtr'||test.metric==='searchClicks';
    const googleFinal=seo?.status==='connected'&&seo.reportedThrough>=period?.endInclusive;
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
      if(googleMetric&&!googleFinal){
        verdict='EARLY TREND · GOOGLE REPORT DELAYED';tone='pending';
        detail+=' Google has not finalized the full selected reporting window.';
      }
    }
    return '<div class="mj-test-row"><div><strong>'+esc(test.note)+
      '</strong><small>'+esc(displayDay(test.createdAt.slice(0,10)))+' · '+esc(def.label)+
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
  // Owner route on the bayou. No painted-in numbers, each value comes
  // from the selected period's actual source report. Last < Current font size.
  const duration=value=>valid(value)?Math.floor(Math.round(value)/60)+'m '+(Math.round(value)%60)+'s':'N/A';
  const formatValue=(value,unit='count')=>{
    if(!valid(value))return 'N/A';
    return unit==='time'?duration(value):
      unit==='percentage'?ratio(value):
      unit==='decimal'?value.toFixed(2):
      unit==='position'?value.toFixed(1):
      unit==='cents'?cash(value):number(value);
  };
  function movement(previous,current,inverse=false){
    if(!valid(previous)||!valid(current))return {tone:'na',text:'N/A'};
    if(previous===current)return {tone:'hold',text:'→ 0%'};
    if(previous===0)return {tone:inverse?'down':'up',text:(inverse?'↓':'↑')+' NEW'};
    const change=(current-previous)/previous*100;
    if(!Number.isFinite(change))return {tone:'na',text:'N/A'};
    const good=(current<previous)===inverse;
    return {tone:good?'up':'down',
      text:(good?'↑':'↓')+' '+(change>0?'+':'')+change.toFixed(1)+'%'};
  }
  function heroMetric(label,last,current,unit='count',inverse=false,caption=''){
    const motion=movement(last,current,inverse);
    return '<div class="mj-primary-kpi">'+
      '<div class="mj-primary-label">'+esc(label)+'</div>'+
      '<div class="mj-head-numbers"><strong class="mj-current">'+esc(formatValue(current,unit))+'</strong>'+
      '<b class="mj-change '+esc(motion.tone)+'">'+esc(motion.text)+'</b></div>'+
      '<div class="mj-last">LAST '+esc(formatValue(last,unit))+'</div>'+
      (caption?'<small>'+esc(caption)+'</small>':'')+'</div>';
  }
  function miniMetric(label,last,current,unit='count',inverse=false,provisional=false){
    const motion=provisional?{tone:'na',text:'UPDATING'}:movement(last,current,inverse);
    return '<div class="mj-mini-kpi">'+
      '<span>'+esc(label)+'</span>'+
      '<strong>'+esc(formatValue(current,unit))+'</strong>'+
      '<small>Last '+esc(formatValue(last,unit))+'</small>'+
      '<b class="'+esc(motion.tone)+'">'+esc(motion.text)+'</b>'+
    '</div>';
  }
  const card=(id,index,title,icon,content,note='')=>
    '<article class="mj-trail-card mj-card-'+esc(id)+'">'+
      '<div class="mj-card-heading"><span class="mj-number-stake">'+esc(index)+'</span>'+
        '<span class="mj-card-icon" aria-hidden="true">'+icon+'</span>'+
        '<h3>'+esc(title)+'</h3></div>'+
      content+(note?'<p class="mj-stage-note">'+esc(note)+'</p>':'')+
      '</article>';
  // Wix visitor-type data, not a guess calculated from the total.
  // If Wix cannot verify the category, leave the display N/A.
  function wixNewVisitors(site){
    if(site?.connected!==true||!Array.isArray(site.visitorTypes))return null;
    const item=site.visitorTypes.find(row=>row?.type==='first_time_visitor');
    return valid(item?.visitors)?item.visitors:null;
  }
  // Different Wix reports must agree before New/Returning trends are trusted.
  function visitorTypeTrendsReady(site){
    const r=site?.visitorReconciliation;
    return r?.status==='reconciled'&&r.previousReconciled===true;
  }
  function visitorSplitNote(site){
    const r=site?.visitorReconciliation;
    const checkedDate=new Date(site?.checkedAt||'');
    const checked=Number.isFinite(checkedDate.getTime())?
      new Intl.DateTimeFormat('en-US',{
        timeZone:'America/Chicago',month:'2-digit',day:'2-digit',
        year:'numeric',hour:'numeric',minute:'2-digit'
      }).format(checkedDate).split('/').join('-')+' Central':'N/A';
    if(!r)return '<p class="mj-visitor-sync mj-visitor-sync-warning">'+
      '<strong>WIX BREAKDOWN UPDATING.</strong> Waiting for both visitor reports. '+
      'DJOMS checks every 10 minutes while open and visible. '+
      '<button type="button" class="mj-wix-sync-refresh" data-wix-split-refresh="1">REFRESH WIX NOW</button></p>';
    if(r.status==='reconciled')return '<p class="mj-visitor-sync"><strong>VISITORS RECONCILED:</strong> '+
      esc(number(r.newVisitors))+' New + '+esc(number(r.returningVisitors))+
      ' Returning = '+esc(number(r.summaryVisitors))+' Website Visitors. '+
      esc(number(r.summarySessions))+' total visits include repeat sessions.'+
      (r.previousReconciled?'':' Prior-period comparison is still updating.')+
      '<span class="mj-sync-timestamp"> Checked '+esc(checked)+'.</span>'+
      (r.previousReconciled?'':' <button type="button" class="mj-wix-sync-refresh"'+
        ' data-wix-split-refresh="1">REFRESH WIX NOW</button>')+'</p>';
    const classified=valid(r.classifiedVisitors)?number(r.classifiedVisitors):'N/A';
    const total=valid(r.summaryVisitors)?number(r.summaryVisitors):'N/A';
    const gap=valid(r.difference)&&r.difference>0?
      ' · '+number(r.difference)+' visitors differ between reports.':'';
    return '<p class="mj-visitor-sync mj-visitor-sync-warning" role="status">'+
      '<strong>WIX BREAKDOWN UPDATING:</strong> '+total+
      ' unique visitors in the summary; '+classified+
      ' currently assigned New or Returning in the detailed report'+gap+
      ' No missing visitors have been assumed New or Returning. '+
      '<strong>Auto-check: every 10 minutes</strong> while DJOMS is open and visible. '+
      '<span class="mj-sync-timestamp">Last checked '+esc(checked)+'.</span>'+
      ' <button type="button" class="mj-wix-sync-refresh"'+
      ' data-wix-split-refresh="1">REFRESH WIX NOW</button></p>';
  }
  function sources(site){
    const enabled=site?.connected===true;
    const summarize=rows=>{
      const values={direct:0,google:0,other:0},has={direct:false,google:false,other:false};
      let sum=0;
      for(const entry of Array.isArray(rows)?rows:[]){
        if(!valid(entry?.sessions))continue;
        const raw=String(entry.source||'').toLowerCase(),category=String(entry.category||'').toLowerCase();
        const key=/(?:^|[^a-z0-9])direct(?:$|[^a-z0-9])|\(direct\)/.test(raw)||category==='direct'
          ?'direct':/google/.test(raw)&&!/maps\.google|google\s*maps|g\.page/.test(raw)?'google':'other';
        values[key]+=entry.sessions;has[key]=true;sum+=entry.sessions;
      }
      return {values,has,sum};
    };
    const current=summarize(enabled?site.trafficSources:[]);
    const previous=summarize(enabled?site.trafficSourcesPrevious:[]);
    const priorTotal=site?.metricComparisons?.sessions?.previous;
    const currentReady=enabled&&site.trafficSourcesComplete===true&&
      (!valid(site.sessions)||current.sum===site.sessions);
    const priorReady=enabled&&site.trafficSourcesPreviousComplete===true&&
      (!valid(priorTotal)||previous.sum===priorTotal);
    const metric=(obj,key,complete)=>obj.has[key]||complete?obj.values[key]:null;
    return {
      sessions:{last:valid(priorTotal)?priorTotal:null,now:enabled?site.sessions:null},
      direct:{last:priorReady?metric(previous,'direct',true):null,
        now:currentReady?metric(current,'direct',true):null},
      google:{last:priorReady?metric(previous,'google',true):null,
        now:currentReady?metric(current,'google',true):null},
      other:{last:priorReady?metric(previous,'other',true):null,
        now:currentReady?metric(current,'other',true):null}
    };
  }

  /* Compact, native expandable drilldowns. All content is selected-period
     evidence; no visitor identity, search-to-session joins or made-up totals. */
  function mapDropdown(id,title,rows,context,empty){
    return '<details class="mj-stage-dropdown" data-mj-dropdown="'+esc(id)+'">'+
      '<summary><span>'+esc(title)+'</span><b>'+esc(rows.length?number(rows.length)+' shown':'N/A')+
      '<i aria-hidden="true">▾</i></b></summary>'+
      '<div class="mj-dropdown-content"><p class="mj-dropdown-explainer">'+esc(context)+'</p>'+
      (rows.length?'<div class="mj-dropdown-rows">'+rows.join('')+'</div>':
        '<p class="mj-dropdown-empty">'+esc(empty)+'</p>')+
      '</div></details>';
  }
  const mapDetailRow=(heading,subtext,numberText,numberLabel,index)=>{
    return '<div class="mj-dropdown-row">'+
      '<span class="mj-dropdown-rank">'+esc(index+1)+'.</span>'+
      '<span class="mj-dropdown-desc"><strong>'+esc(heading)+'</strong>'+
        (subtext?'<small>'+esc(subtext)+'</small>':'')+'</span>'+
      '<span class="mj-dropdown-stat"><b>'+esc(numberText)+'</b>'+
        '<small>'+esc(numberLabel)+'</small></span></div>';
  };
  const compactTime=value=>{
    if(!valid(value))return 'N/A';
    const s=Math.round(value);
    return s<60?s+'s':Math.floor(s/60)+'m '+(s%60)+'s';
  };
  function viewedPagesDropdown(site){
    const pages=site?.connected===true&&Array.isArray(site.topPages)?
      site.topPages.filter(p=>p&&typeof p.path==='string'&&p.path.trim()&&
        ((valid(p.views)&&p.views>0)||(valid(p.visitors)&&p.visitors>0)))
        .sort((a,b)=>(valid(b.views)?b.views:0)-(valid(a.views)?a.views:0)||
          (valid(b.visitors)?b.visitors:0)-(valid(a.visitors)?a.visitors:0)):[];
    const rows=pages.map((p,i)=>mapDetailRow(named(p.path),
      'Page visitors '+number(p.visitors)+' · Avg. time '+compactTime(p.avgTimeSeconds),
      number(p.views),'page views',i));
    return mapDropdown('pages','PAGES VIEWED',rows,
      'Wix-reported page views, visitors and average time per page. Page-level visitors may overlap, so do not add these to find unique site visitors.',
      'No Wix page-view details were returned for these dates.');
  }
  function locationsDropdown(site){
    const places=site?.connected===true&&Array.isArray(site.geography)?
      site.geography.filter(p=>p&&(p.city||p.region||p.country)&&valid(p.visitors)&&p.visitors>0)
        .sort((a,b)=>b.visitors-a.visitors):[];
    const placeName=p=>[p.city,p.region].filter(Boolean).join(', ')||p.country||'Location not supplied';
    const rows=places.map((p,i)=>mapDetailRow(placeName(p),'Approximate Wix geography',
      number(p.visitors),'visitors',i));
    return mapDropdown('locations','WHERE VISITORS ARE FROM',rows,
      'Approximate geographic categories from Wix. Some entries cover whole countries, so these rows should not be added together as unique people.',
      'Wix has not returned visitor locations for these dates.');
  }
  function wixSourcesDropdown(site){
    const current=site?.connected===true&&Array.isArray(site.trafficSources)?
      site.trafficSources.filter(p=>p&&valid(p.sessions)):[];
    const previous=site?.connected===true&&Array.isArray(site.trafficSourcesPrevious)?
      site.trafficSourcesPrevious.filter(p=>p&&valid(p.sessions)):[];
    const normalized=item=>(String(item.category||'').trim().toLowerCase()+'|'+
      String(item.source||'').trim().toLowerCase());
    const oldBySource=new Map();
    for(const p of previous){
      const key=normalized(p);
      oldBySource.set(key,(oldBySource.get(key)||0)+p.sessions);
    }
    const knownLast=site?.trafficSourcesPreviousComplete===true;
    const rows=current
      .sort((a,b)=>b.sessions-a.sessions).map((p,i)=>{
        const last=knownLast?(oldBySource.get(normalized(p))??0):null;
        const source=String(p.source||p.category||'Unassigned');
        const category=p.category&&String(p.category)!==source?String(p.category):'Wix traffic source';
        const change=movement(last,p.sessions);
        return mapDetailRow(source,
          category+' · LAST '+number(last)+' · '+change.text,
          number(p.sessions),'website visits',i);
      });
    return mapDropdown('traffic-sources','WHERE WEBSITE VISITS CAME FROM',rows,
      'Wix calls these sessions; the map calls them Website Visits. These include direct entries, search referrals, and social or other links when Wix identifies them. A visit is not necessarily a click. Google Search Console clicks use a separate measurement.'+
      (site?.trafficSourcesComplete===false?' Wix source coverage is partial.':''),
      'No verified Wix traffic-source breakdown for these dates.');
  }
  function searchEnginesDropdown(search){
    const results=Array.isArray(search?.engines)?search.engines:[];
    const engineRows=results.slice(0,5).map((engine,i)=>{
      const prev=engine.previous?.impressions,now=engine.current?.impressions;
      const diff=movement(prev,now);
      const currClicks=engine.current?.clicks;
      const engineCtr=valid(now)&&now>0&&valid(currClicks)?currClicks/now:null;
      return '<div class="mj-dropdown-row mj-engine-detail-row">'+
        '<span class="mj-dropdown-rank">'+esc(i+1)+'.</span>'+
        '<span class="mj-dropdown-desc"><strong>'+esc(engine.name)+'</strong>'+
        '<small>LAST '+esc(number(prev))+' · CURRENT '+esc(number(now))+
          ' · <b class="'+esc(diff.tone)+'">'+esc(diff.text)+'</b></small>'+
        '<small>Search CTR '+esc(formatValue(engineCtr,'percentage'))+
          ' · Average position '+esc(engine.id==='google'?
            formatValue(engine.positionCurrent,'position'):'N/A')+'</small></span>'+
        '<span class="mj-dropdown-stat"><b>'+esc(number(now))+'</b><small>appearances</small></span></div>';
    });
    const intro=search?.status==='reported'
      ?'Top reporting engines ranked by verified search appearances. Only engines with actual positive search appearances or clicks are listed. '+
       'The combined total uses exactly '+search.scope+
       '. Range '+displayWindow(search.currentRange?.start,search.currentRange?.end)+
       '. Engines with incompatible reporting dates are NOT included.'
      :'No search engine has a complete matching-date report for this selection.';
    return mapDropdown('engines','TOP SEARCH ENGINES · VERIFIED',engineRows,intro,
      search?.status==='reported'?
        'No engine reported positive appearances or clicks within the verified coverage.':
        'No compatible, verified search-engine data yet. The connected engine reports remain available below.');
  }
  function searchAppearancesDetails(seo){
    // Search phrases describe why Doc Jaks APPEARED, even when nobody clicked.
    // GSC may omit/suppress queries, so shown rows never equal all impressions.
    const connected=seo?.status==='connected';
    const metrics=connected?seo.metrics||{}:{};
    const impressions=valid(metrics.impressions)?metrics.impressions:null;
    const clicks=valid(metrics.clicks)?metrics.clicks:null;
    const pairs=connected&&seo.queryPages?.status==='reported'&&Array.isArray(seo.queryPages.rows)?
      seo.queryPages.rows.filter(p=>p?.query&&p?.page&&(valid(p.impressions)||valid(p.clicks)))
        .sort((a,b)=>(b.impressions??0)-(a.impressions??0)).slice(0,60):[];
    const terms=connected&&Array.isArray(seo.topQueries)?
      seo.topQueries.filter(p=>p?.query&&(valid(p.impressions)||valid(p.clicks)))
        .sort((a,b)=>(b.impressions??0)-(a.impressions??0)).slice(0,5):[];
    const pages=connected&&Array.isArray(seo.topPages)?
      seo.topPages.filter(p=>p?.page&&(valid(p.impressions)||valid(p.clicks)))
        .sort((a,b)=>(b.impressions??0)-(a.impressions??0)).slice(0,5):[];
    const matched=phrase=>pairs.filter(p=>p.query===phrase).slice(0,3)
      .map(p=>named(p.page)).filter(Boolean);
    const primary=terms.length?terms:pairs.slice(0,5);
    const termRows=primary.map((p,i)=>{
      const found=p.page?[named(p.page)]:matched(p.query);
      const pagesText=found.length?
        ' · Result'+(found.length>1?'s':'')+': '+[...new Set(found)].join(', '):
        ' · Result page not disclosed';
      return mapDetailRow('SEARCH PHRASE: '+p.query,
        'Search appearance'+(p.impressions===1?'':'s')+pagesText,
        number(p.impressions),'appearances',i);
    });
    const pageRows=pages.map((p,i)=>mapDetailRow('RESULT PAGE: '+named(p.page),
      'Page shown in Google search results',
      number(p.impressions),'appearances',i+termRows.length));
    const rows=[...termRows,...pageRows];
    const context='Google Search Console: '+number(impressions)+' reported Google appearances. '+
      'Search-result clicks and their source breakdown are under Section 2. Phrases show what people typed when Google discloses it; '+
      'result pages show which Doc Jaks pages appeared. Google hides some searches. '+
      'Phrase and page counts overlap and must not be added together or to the engine totals.';
    let empty='Google has not reported individual search phrases or result pages for the selected dates.';
    if(connected&&valid(impressions)&&impressions>0&&clicks===0)
      empty='Google reported '+number(impressions)+' appearances but did not disclose individual phrase or page details for this period. Search clicks are tracked in Section 2.';
    return mapDropdown('google-phrases','GOOGLE SEARCH PHRASES & RESULT PAGES',
      rows,context,empty);
  }

  // Click evidence is deliberately grouped under #2, not scattered among #1
  // search appearance phrase rows. GSC sometimes suppresses the query itself.
  function searchClicksByPhraseDropdown(seo){
    const connected=seo?.status==='connected';
    const total=connected&&valid(seo?.metrics?.clicks)?seo.metrics.clicks:null;
    const queries=connected&&Array.isArray(seo?.topQueries)?
      seo.topQueries.filter(row=>row?.query&&valid(row.clicks)&&row.clicks>0)
      .sort((a,b)=>b.clicks-a.clicks).slice(0,5):[];
    const rows=queries.map((p,i)=>mapDetailRow(p.query,
      'Verified Google Search Console query · '+number(p.impressions)+' appearances',
      number(p.clicks),'search clicks',i));
    const empty=total===0?
      'Google recorded 0 search clicks for the selected dates. Bing and other reported engine clicks are shown above.':
      'Google did not disclose the individual search phrases responsible for its clicks.';
    return mapDropdown('search-click-phrases','GOOGLE SEARCH PHRASES THAT GOT CLICKS',
      rows,'Only Google query clicks actually disclosed by Search Console. These are already part of Google’s engine click total and must not be added again.',empty);
  }

  function clicksByEngineDropdown(search){
    // Each engine in the source breakdown is genuinely included in the
    // matching-date Search totals; 0 clicks is a verified 0, not a missing row.
    const results=search?.status==='reported'&&Array.isArray(search.engines)?
      search.engines:[];
    const rows=results.slice(0,5).map((engine,i)=>{
      const last=engine.previous?.clicks,now=engine.current?.clicks;
      const change=movement(last,now);
      return '<div class="mj-dropdown-row mj-engine-clicks">'+
        '<span class="mj-dropdown-rank">'+esc(i+1)+'.</span>'+
        '<span class="mj-dropdown-desc"><strong>'+esc(engine.name)+'</strong>'+
          '<small>LAST '+esc(number(last))+' · CURRENT '+esc(number(now))+
          ' · <b class="'+esc(change.tone)+'">'+esc(change.text)+'</b></small>'+
          '<small>Verified search appearances '+esc(number(engine.current?.impressions))+
          ' · CTR '+esc(valid(engine.current?.impressions)&&engine.current.impressions>0&&
            valid(now)?formatValue(now/engine.current.impressions,'percentage'):'N/A')+
          '</small></span>'+
        '<span class="mj-dropdown-stat"><b>'+esc(number(now))+
          '</b><small>search clicks</small></span></div>';
    });
    return mapDropdown('search-click-engines','CLICKS BY SEARCH ENGINE',rows,
      search?.status==='reported'?
        'Verified search-result clicks only. Same engine/date coverage as #1: '+
          search.scope+' ('+displayWindow(search.currentRange?.start,search.currentRange?.end)+
          '). An engine with appearances but zero clicks is correctly shown as 0. '+
          'Search phrases and result pages are under #1.':
        'Waiting for verified engine-level search-result click totals.',
      'No search engine returned compatible search-click data.');
  }
  function socialPanel(social){
    const icons={facebook:'f',instagram:'◎',x:'𝕏'};
    const rows=['facebook','instagram','x'].map(platform=>{
      const d=social?.platforms?.[platform];
      const isX=platform==='x';
      const label={facebook:'FACEBOOK',instagram:'INSTAGRAM',x:'X'}[platform];
      const each=(key,title)=>{
        const now=d?.now?.[key],last=d?.last?.[key];
        const pct=d?.displayPct?.[key];
        const hue=isX?'na':pct==='NEW'?'up':
          typeof pct==='number'&&Number.isFinite(pct)?
          pct>0?'up':pct<0?'down':'hold':'na';
        return '<div class="mj-social-stat"><small>'+esc(title)+'</small>'+
          '<b>'+esc(formatValue(now))+'</b>'+
          '<span>L '+esc(formatValue(last))+'</span>'+
          (!isX&&pct==='NEW'?'<em class="up">↑ NEW</em>':
           !isX&&typeof pct==='number'&&Number.isFinite(pct)?
            '<em class="'+hue+'">'+(pct>0?'↑ +':pct<0?'↓ ':'→ ')+
              esc(pct.toFixed(1))+'%</em>':'')+'</div>';
      };
      return '<section class="mj-social-platform"><div class="mj-social-brand">'+
        '<b class="mj-social-symbol">'+icons[platform]+'</b>'+
        '<strong>'+label+'</strong><small>'+
          (isX?'Owner-entered · not scored':
            d?.verified?'Verified Meta cohort':'Comparison N/A')+'</small></div>'+
        '<div class="mj-social-stats">'+
          each('views','VIEWS')+each('reactions','LIKES')+
          each('shares','SHARES')+each('comments','COMMENTS')+'</div></section>';
    }).join('');
    const socialEvidence=social?.availableWeight>0;
    return card('social','6','SOCIAL MEDIA','♟',
      '<div class="mj-social-inner">'+rows+'</div>'+
      '<div class="mj-social-impact"><strong>SOCIAL HEALTH · '+(socialEvidence?'COUNTS':'N/A')+'</strong>'+
        '<small>'+esc('15 of 100 points when FB/IG are comparable. X is manual only.')+'</small></div>',
      'Social is a second discovery current, not a continuation of Google clicks. Meta figures are current lifetime totals on posts published in each period.');
  }
  // #4 MUSIC is the existing verified music reporting, brought INTO the
  // numbered boardwalk. This function never infers plays from Wix page visits
  // or link clicks, and music sales remain scored in SALES only.
  function musicPanel(music,owner){
    const ms=owner?.stages?.find(stage=>stage.id==='music');
    const score=Number.isInteger(ms?.score)?ms.score:null;
    const grade=score===null?'N/A':String(score);
    const historic=music?.radioImport;
    const radioDates=historic?.start&&historic?.end?
      displayWindow(historic.start,historic.end)+' (UTC)':'Not imported';
    const current=music?.current,previous=music?.previous;
    const best=songLikes.status==='reported'?songLikes.top:null;
    const lifetime=songLikes.status==='reported';
    const ranked=lifetime&&Array.isArray(songLikes.songs)?songLikes.songs:[];
    const ties=lifetime&&Array.isArray(songLikes.leaders)?songLikes.leaders.length:0;
    const likedRows=ranked.length?ranked.map((song,index)=>
      '<div class="mj-liked-row"><span class="mj-liked-rank">'+(index+1)+'</span>'+
      '<span class="mj-liked-name">'+esc(song.title)+'</span>'+
      '<strong>♥ '+number(song.likes)+'</strong></div>').join(''):
      '<p class="mj-liked-empty">'+(lifetime?'No songs liked yet.':'Wix listener votes are not available right now.')+'</p>';
    const likedHTML='<section class="mj-song-likes" aria-label="Outlaw Radio 5150 song likes">'+
      '<div class="mj-top-liked"><span>♥ #1 MOST-LIKED SONG</span>'+
      '<strong>'+esc(best?.title??(lifetime?'No likes yet':'N/A'))+'</strong>'+
      '<b>'+esc(best?number(best.likes)+' '+(best.likes===1?'LIKE':'LIKES'):'')+'</b>'+
      (ties>1?'<small>'+ties+' songs tied for first</small>':'')+
      '</div>'+
      '<details class="mj-stage-dropdown mj-liked-details" data-mj-dropdown="song-likes">'+
      '<summary><span>ALL SONG LIKES</span><b>'+esc(lifetime?ranked.length+' SONGS':'N/A')+' ▾</b></summary>'+
      '<div class="mj-liked-list">'+likedRows+'</div>'+
      '<p class="mj-liked-source">Wix radio heart-button votes · All time. Not song plays or social likes.</p>'+
      '</details></section>';
    const row=(label,value,source)=>
      '<div class="mj-music-stat"><span>'+esc(label)+'</span>'+
        '<strong>'+esc(value)+'</strong><small>'+esc(source)+'</small></div>';
    const importNote=historic&&valid(historic.connections)?
      '<details class="mj-stage-dropdown mj-music-history" data-mj-dropdown="radio-history">'+
        '<summary><span>HISTORICAL RADIO.CO EXPORT</span><b>DETAILS <i aria-hidden="true">▾</i></b></summary>'+
        '<p>'+esc(radioDates)+' · '+number(historic.connections)+' streaming connections'+
        (valid(historic.averageDurationSeconds)?
          ' · average listening duration '+duration(historic.averageDurationSeconds):'')+
        '. This CSV is historical. It is not a current/live listener count and is not automatically used for other dates.</p></details>':'';
    return card('music','4','MUSIC / RADIO / STREAMING','♫',
      '<div class="mj-music-score-line">'+
        '<span class="mj-music-score">MUSIC HEALTH <b>'+esc(grade)+
          '</b><small>10 of 100 points, when listening is verified</small></span>'+
        '<small>Independent listening activity, not radio-site clicks</small></div>'+
      likedHTML+
      heroMetric('RADIO.CO STREAM CONNECTIONS',previous?.connections,current?.connections,
        'count',false,'Imported Radio.co CSV for the selected UTC dates; connections are not unique listeners.')+
      '<div class="mj-minis">'+
        miniMetric('TOTAL LISTENING TIME',previous?.seconds,current?.seconds,'time')+
      '</div>'+
      '<div class="mj-music-grid">'+
        row('PAID MUSIC UNITS',formatValue(music?.musicUnits),
          'Wix Music category · counted in #5 Sales')+
        row('PAID MUSIC SALES',formatValue(music?.musicItemSalesCents,'cents'),
          'Wix Music category · counted in #5 Sales')+
        row('MUSIC PAGE VIEWS',formatValue(music?.musicPageViews),
          'Wix pages · not music plays')+
        row('OUTLAW RADIO PAGE VIEWS',formatValue(music?.radioPageViews),
          'Wix page · not radio listeners')+
        row('SPOTIFY STREAMS',formatValue(music?.spotifyStreams),
          'N/A until verified streaming data is connected')+
        row('APPLE MUSIC STREAMS',formatValue(music?.appleMusicStreams),
          'N/A until verified streaming data is connected')+
        row('YOUTUBE MUSIC STREAMS',formatValue(music?.youtubeMusicStreams),
          'N/A until verified streaming data is connected')+
        row('UNIQUE RADIO LISTENERS',formatValue(music?.uniqueRadioListeners),
          'N/A until Radio.co listener reporting is connected')+
      '</div>'+importNote+
      '<p class="mj-music-caveat">'+esc(music?.note||
        'Verified listening and streaming comparison pending.')+' '+
        esc(music?.caveat||'Music sales are already included in total paid web sales.')+
      '</p>',
      'This is a separate music-performance channel. Paid music is already included in total web sales and is not counted twice.');
  }

  // One concise owner summary: reporting-period evidence, never placeholder totals.
  // Direction colors are based on real last/current comparisons only.
  function quickMetric(label,last,current,unit,explanation){
    const change=movement(last,current);
    return '<div class="mj-quick-metric">'+
      '<b class="mj-quick-label">'+esc(label)+'</b>'+
      '<div class="mj-quick-values"><strong>'+esc(formatValue(current,unit))+'</strong>'+
        '<span class="mj-quick-change '+esc(change.tone)+'">'+esc(change.text)+'</span></div>'+
      '<small>'+esc(explanation)+(valid(last)?' · Last '+esc(formatValue(last,unit)):' · Prior N/A')+'</small>'+
      '</div>';
  }


  // DJOMS DAILY REPORT · readable owner briefing, seven evidence sections.
  // Every graph draws actual verified source history; missing series are N/A.
  // All interpretations are conditional, and "why" is a hypothesis, never a proven cause.
  function dailyMovement(last,current,inverse=false,unit='count'){
    if(!valid(last)||!valid(current))return {tone:'na',text:'N/A · no comparable period'};
    if(last===current)return {tone:'hold',text:'→ No change'};
    if(last===0)return {tone:inverse?'down':'up',
      text:(inverse?'↓':'↑')+' NEW (+'+formatValue(current,unit)+')'};
    const pct=Math.abs((current-last)/last*100).toFixed(1);
    const better=inverse?current<last:current>last;
    return {tone:better?'up':'down',
      text:inverse?(better?'↑ '+pct+'% better':'↓ '+pct+'% worse'):
        (better?'↑ +'+pct+'%':'↓ -'+pct+'%')};
  }

  // Four *saved report totals*, not daily values pulled from unrelated source
  // chart series. The owner-only API retains report snapshots across devices.
  const SPARK_RANGES=new Set(['today','7d','30d','365d']);
  const SPARK_KEYS=Object.freeze({
    'VERIFIED APPEARANCES':'searchAppearances',
    'COMBINED CTR':'combinedCtr',
    'GOOGLE POSITION':'googlePosition',
    'GOOGLE APPEARANCES':'googleAppearances',
    'BING APPEARANCES':'bingAppearances',
    'SEARCH RESULT CLICKS':'searchClicks',
    'NEW VISITORS':'newVisitors',
    'RETURNING VISITORS':'returningVisitors',
    'WEBSITE VISITORS':'websiteVisitors',
    'ALL WEBSITE VISITS':'websiteVisits',
    'PAGE VIEWS':'pageViews',
    'AVERAGE STAY':'averageStay',
    'BOUNCE RATE':'bounceRate',
    'PAGES / VISIT':'pagesPerVisit',
    'RADIO STREAM CONNECTIONS':'radioConnections',
    'TOTAL LISTENING TIME':'radioListeningSeconds',
    'OUTLAW RADIO PAGE VIEWS':'radioPageViews',
    'MUSIC PAGE VIEWS':'musicPageViews',
    'GROSS ONLINE ITEM SALES':'webSalesCents',
    'PAID ONLINE ORDERS':'paidOrders',
    'FACEBOOK POST VIEWS':'facebookViews',
    'INSTAGRAM POST VIEWS':'instagramViews',
    'FACEBOOK REACTIONS':'facebookLikes',
    'INSTAGRAM LIKES':'instagramLikes',
    'INQUIRIES':'inquiries',
    'FILE DOWNLOAD EVENTS':'fileDownloads',
    'CONFIRMED PIT KREWE SIGNUPS':'pitKreweSignups',
    'VERIFIED UNIQUE RADIO LISTENERS':'uniqueRadioListeners'
  });
  const historyCache=new Map();
  const historyLoaded=new Set();
  const historyPending=new Set();
  const historyAttempted=new Map();
  const historySavedFingerprints=new Map();
  let sparklinesRange=null;

  function todayCentral(){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  }

  // Four compact vertical report-total bars: newest on the RIGHT.
  // Previous slots are clearly marked missing until verified history exists.
  // Color is based on trend direction; lower positions/bounce are better.
  function historicalSparkline(label,current,unit,inverse,previous){
    const key=SPARK_KEYS[label];
    if(!key)return '';
    if(!SPARK_RANGES.has(sparklinesRange))return '<div class="mj-kpi-spark-empty">'+
      'CUSTOM WINDOW · NO COMPARABLE REPORT HISTORY</div>';
    if(!valid(current))return '<div class="mj-kpi-spark-empty">'+
      '4-REPORT TREND · N/A</div>';
    const snapshots=historyCache.get(sparklinesRange)||[];
    const byDay=new Map();
    for(const item of snapshots){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(item?.day||'')||!valid(item?.values?.[key]))continue;
      byDay.set(item.day,item.values[key]);
    }
    // The latest visible verified number replaces any stale same-day snapshot.
    byDay.set(todayCentral(),current);
    const days=[...byDay].sort((a,b)=>a[0].localeCompare(b[0])).slice(-4);
    const count=days.length;
    if(!count)return '<div class="mj-kpi-spark-empty">4-REPORT TREND · N/A</div>';

    const first=days[0][1],latest=days[count-1][1];
    // For the first captured report, use the verified Last/Current comparison
    // for color, but never pretend the Last value is an older stored report.
    const tone=count>=2?
      (first===latest?'hold':((latest>first)!==inverse?'up':'down')):
      dailyMovement(previous,current,inverse,unit).tone;
    const compact=value=>{
      if(unit==='percentage')return (value*100).toFixed(value*100<10?1:0)+'%';
      if(unit==='position')return value.toFixed(1);
      if(unit==='decimal')return value.toFixed(2);
      if(unit==='time')return value>=3600?(value/3600).toFixed(1)+'h':
        value>=60?Math.round(value/60)+'m':number(value)+'s';
      if(unit==='cents'){
        const d=value/100;
        return d>=100000?'$'+(d/1000).toFixed(0)+'k':
          d>=1000?'$'+(d/1000).toFixed(1)+'k':'$'+(d%1?d.toFixed(1):d.toFixed(0));
      }
      return value>=1000000?(value/1000000).toFixed(1)+'m':
        value>=1000?(value/1000).toFixed(1)+'k':number(value);
    };
    // Fixed positions so a lone first report appears at R4, with
    // R1–R3 represented as UNKNOWN rather than fabricated zeros.
    const W=260,H=82,bottom=59,maxBar=39;
    const centers=[34,98,162,226];
    const highest=Math.max(1,...days.map(row=>row[1]));
    const firstReal=4-count;
    const parts=[];
    for(let slot=0;slot<4;slot++){
      const center=centers[slot];
      const x=center-17;
      const dataIndex=slot-firstReal;
      if(dataIndex<0){
        parts.push('<rect class="mj-kpi-bar-missing" x="'+x+'" y="29" width="34"'+
          ' height="30" rx="4"></rect>'+
          '<text class="mj-kpi-bar-unknown" x="'+center+'" y="48"'+
          ' text-anchor="middle">?</text>');
      }else{
        const [day,value]=days[dataIndex];
        const h=value===0?2:Math.max(5,Math.round(value/highest*maxBar));
        const y=bottom-h;
        const recent=slot===3;
        parts.push('<rect class="mj-kpi-bar'+(recent?' newest':' previous')+
          '" x="'+x+'" y="'+y+'" width="34" height="'+h+'" rx="4">'+
          '<title>'+esc(displayDay(day)+' · '+formatValue(value,unit))+'</title></rect>'+
          '<text class="mj-kpi-bar-value'+(recent?' newest':'')+'"'+
          ' x="'+center+'" y="'+Math.max(12,y-5)+'" text-anchor="middle">'+
          esc(compact(value))+'</text>');
      }
      parts.push('<text class="mj-kpi-bar-label" x="'+center+'" y="76"'+
        ' text-anchor="middle">R'+(slot+1)+'</text>');
    }
    const values=days.map(([day,value])=>displayDay(day)+': '+formatValue(value,unit)).join(' · ');
    const caption=count<4?count+' OF 4 REPORTS AVAILABLE':'LAST 4 REPORT TOTALS';
    return '<div class="mj-kpi-spark mj-kpi-spark-'+tone+'">'+
      '<svg class="mj-kpi-vertical-bars" viewBox="0 0 '+W+' '+H+'"'+
        ' preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+
        esc(label+'. '+count+' of 4 saved report totals. '+values+
        '. Empty slots represent unavailable reports, not zero.')+'">'+
        '<line class="mj-kpi-bar-axis" x1="8" y1="'+bottom+
        '" x2="252" y2="'+bottom+'"></line>'+
        parts.join('')+'</svg>'+
      '<small>'+esc(caption)+'</small></div>';
  }

  // Only collect numbers that their source has actually verified for the
  // currently selected window. Missing platforms stay missing, never zero.
  function verifiedSnapshotMetrics({site,seo,ga4,sales,period,social}){
    const values={};
    const put=(key,value)=>{if(valid(value))values[key]=value;};
    if(!period?.start||!period?.end)return values;
    const savedBing=report('bing',period);
    const search=typeof window.djomsCombinedSearch==='function'?
      window.djomsCombinedSearch({seo,bing:savedBing,period}):null;
    if(search?.status==='reported'){
      put('searchAppearances',search.current);
      put('combinedCtr',search.ctrCurrent);
      put('googlePosition',search.positionCurrent);
      put('searchClicks',search.clicksCurrent);
      const google=search.engines?.find(e=>e.id==='google');
      if(google)put('googleAppearances',google.current?.impressions);
      const bing=search.engines?.find(e=>e.id==='bing');
      if(bing)put('bingAppearances',bing.current?.impressions);
    }
    if(site?.connected===true){
      put('websiteVisits',site.sessions);
      put('websiteVisitors',site.visitors);
      if(site.visitorReconciliation?.status==='reconciled'){
        put('newVisitors',wixNewVisitors(site));
        put('returningVisitors',site.metricComparisons?.returningVisitors?.current);
      }
      put('pageViews',site.pageViews);
      put('averageStay',site.avgTimeSeconds);
      put('bounceRate',site.bounceRate);
      put('pagesPerVisit',site.pagesPerSession);
      if(valid(site.contactClicks)&&valid(site.formsSubmitted))
        put('inquiries',site.contactClicks+site.formsSubmitted);
    }
    const paid=salesReady(sales,period);
    if(paid){
      put('webSalesCents',sales.itemSalesCents);
      put('paidOrders',sales.paidOrders);
    }
    const music=typeof window.djomsMusicEvidence==='function'?
      window.djomsMusicEvidence({period,sales}):null;
    if(music?.status==='reported'){
      put('radioConnections',music.current?.connections);
      put('radioListeningSeconds',music.current?.seconds);
    }
    put('radioPageViews',music?.radioPageViews);
    put('musicPageViews',music?.musicPageViews);
    if(ga4?.status==='connected'&&ga4.actions?.status==='reported')
      put('fileDownloads',ga4.actions.counts?.fileDownload);
    const meta=social?.status==='reported'?social:null;
    for(const [platform,views,likes] of [
      ['facebook','facebookViews','facebookLikes'],
      ['instagram','instagramViews','instagramLikes']]){
      const row=meta?.platforms?.[platform];
      if(!row?.verified)continue;
      put(views,row.now?.views);
      put(likes,row.now?.reactions);
    }
    return values;
  }

  function fetchReportHistory(ctx){
    const range=ctx?.period?.range;
    if(!SPARK_RANGES.has(range)||typeof api!=='function')return;
    if(historyPending.has(range))return;
    const values=verifiedSnapshotMetrics(ctx);
    const hasValues=Object.keys(values).length>0;
    const fingerprint=JSON.stringify([ctx.period.start,ctx.period.end,values]);
    const attempted=historyAttempted.get(range);
    if(hasValues&&historySavedFingerprints.get(range)===fingerprint)return;
    if(hasValues&&attempted?.fingerprint===fingerprint&&
      Date.now()-attempted.at<180000)return;
    if(!hasValues&&historyLoaded.has(range))return;
    historyPending.add(range);
    if(hasValues)historyAttempted.set(range,{fingerprint,at:Date.now()});
    const call=hasValues?
      api('report-snapshots',{range,start:ctx.period.start,end:ctx.period.end,values}):
      api('report-snapshots?range='+encodeURIComponent(range));
    Promise.resolve(call).then(response=>{
      if(!Array.isArray(response?.rows))throw new Error('Report history unavailable.');
      historyCache.set(range,response.rows);
      historyLoaded.add(range);
      if(hasValues)historySavedFingerprints.set(range,fingerprint);
    }).catch(()=>{
      // Unavailable history must never be represented as a fabricated trend.
      historyLoaded.add(range);
    }).finally(()=>{
      historyPending.delete(range);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
        typeof websiteReportPeriod==='function'&&websiteReportPeriod()?.range===range)
        paintTop();
    });
  }

  function dailyKpi(label,last,current,unit='count',inverse=false,note='',provisional=false){
    const trend=provisional?{tone:'na',text:'WIX UPDATING'}:dailyMovement(last,current,inverse,unit);
    return '<div class="mj-daily-kpi">'+
      '<b>'+esc(label)+'</b>'+
      '<strong>'+esc(formatValue(current,unit))+'</strong>'+
      '<span class="mj-daily-change '+esc(trend.tone)+'">'+esc(trend.text)+'</span>'+
      '<small>Last: '+esc(formatValue(last,unit))+
        (note?' · '+esc(note):'')+'</small>'+
      (provisional?'<div class="mj-kpi-spark-empty">WAITING FOR WIX VISITOR BREAKDOWN</div>':
        historicalSparkline(label,current,unit,inverse,last))+
      '</div>';
  }
  function dailyLine(title,items,unit='count',source=''){
    const seen=new Set();
    const rows=(Array.isArray(items)?items:[])
      .filter(row=>row&&/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')&&valid(row.value))
      .sort((a,b)=>a.date.localeCompare(b.date))
      .filter(row=>{if(seen.has(row.date))return false;seen.add(row.date);return true;})
      .slice(-21);
    const caption=source?'<p class="mj-daily-chart-note">'+esc(source)+'</p>':'';
    if(rows.length<2)return '<div class="mj-daily-chart"><h5>'+esc(title)+'</h5>'+
      '<p class="mj-daily-no-data">NOT ENOUGH VERIFIED DATED DATA FOR A LINE GRAPH</p>'+
      caption+'</div>';
    const W=760,H=230,L=54,R=18,T=18,B=40;
    const max=Math.max(1,...rows.map(row=>row.value));
    const time=date=>Date.parse(date+'T12:00:00Z');
    const start=time(rows[0].date),end=time(rows[rows.length-1].date);
    const x=date=>L+(time(date)-start)/Math.max(86400000,end-start)*(W-L-R);
    const y=value=>T+(1-value/max)*(H-T-B);
    const coords=rows.map(row=>[+x(row.date).toFixed(2),+y(row.value).toFixed(2)]);
    const weekday=iso=>displayDay(iso);
    const grid=[0,.5,1].map(f=>{
      const gy=y(f*max).toFixed(2);
      return '<line class="mj-daily-grid-line" x1="'+L+'" x2="'+(W-R)+
        '" y1="'+gy+'" y2="'+gy+'"></line>'+
        '<text class="mj-daily-axis-label" x="'+(L-8)+'" y="'+(Number(gy)+5)+
        '" text-anchor="end">'+esc(formatValue(f*max,unit))+'</text>';
    }).join('');
    const segments=[];let segment=[];
    for(let i=0;i<rows.length;i++){
      const gap=i?Math.round((time(rows[i].date)-time(rows[i-1].date))/86400000):1;
      // Do not draw a continuous trend through unreported days.
      if(gap>1&&segment.length){
        if(segment.length>1)segments.push(segment);
        segment=[];
      }
      segment.push(coords[i]);
    }
    if(segment.length>1)segments.push(segment);
    const paths=segments.map(part=>'<polyline class="mj-daily-line" points="'+
      part.map(v=>v[0]+','+v[1]).join(' ')+'"></polyline>').join('');
    const dots=rows.map((row,i)=>'<circle class="mj-daily-dot" cx="'+coords[i][0]+
      '" cy="'+coords[i][1]+'" r="4"><title>'+esc(weekday(row.date)+
      ' · '+formatValue(row.value,unit))+'</title></circle>').join('');
    return '<div class="mj-daily-chart"><h5>'+esc(title)+'</h5>'+
      '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+
        esc(title+'. From '+weekday(rows[0].date)+' to '+weekday(rows[rows.length-1].date)+
        '. Hover data points for actual reported values. Missing days are not zero.')+'">'+
      grid+paths+dots+
      '<text class="mj-daily-x-label" x="'+L+'" y="'+(H-9)+'">'+
        esc(weekday(rows[0].date))+'</text>'+
      '<text class="mj-daily-x-label" x="'+(W-R)+'" y="'+(H-9)+'" text-anchor="end">'+
        esc(weekday(rows[rows.length-1].date))+'</text></svg>'+
      caption+'</div>';
  }


  // Compact search-engine card: Google gold, Bing blue, four saved-report
  // groups in the same row as Appearances, CTR, and Google Position.
  // No fabricated zero history. A verified actual zero is still shown.
  function verifiedEngineKpi(search,period){
    const engines=Array.isArray(search?.engines)?search.engines:[];
    const google=engines.find(e=>e.id==='google');
    const bing=engines.find(e=>e.id==='bing');
    const currentGoogle=valid(google?.current?.impressions)?google.current.impressions:null;
    const currentBing=valid(bing?.current?.impressions)?bing.current.impressions:null;
    const verified=search?.status==='reported'&&
      (currentGoogle!==null||currentBing!==null);
    const start='<div class="mj-daily-kpi mj-engine-summary-kpi">'+
      '<b>VERIFIED SEARCH ENGINES</b>';
    if(!verified)return start+
      '<strong>N/A</strong><small>Search-engine appearances have not been verified for these dates.</small></div>';

    const hasHistory=SPARK_RANGES.has(period?.range);
    const byDay=new Map();
    if(hasHistory)for(const snapshot of historyCache.get(period.range)||[]){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshot?.day||''))continue;
      const g=snapshot.values?.googleAppearances,b=snapshot.values?.bingAppearances;
      if(!valid(g)&&!valid(b))continue;
      byDay.set(snapshot.day,{day:snapshot.day,google:valid(g)?g:null,
        bing:valid(b)?b:null});
    }
    // Current verified totals override older same-day snapshots.
    byDay.set(todayCentral(),{day:todayCentral(),
      google:currentGoogle,bing:currentBing});
    const reports=[...byDay.values()].sort((x,y)=>x.day.localeCompare(y.day)).slice(-4);
    const count=reports.length;
    const highest=Math.max(1,...reports.flatMap(item=>
      [item.google,item.bing].filter(valid)));
    const baseline=61,peak=33,centers=[36,102,168,234],bars=[];
    const offset=4-count;
    for(let slot=0;slot<4;slot++){
      const report=slot>=offset?reports[slot-offset]:null;
      const center=centers[slot];
      for(const [engine,delta] of [['google',-21],['bing',3]]){
        const x=center+delta,value=report?.[engine];
        if(valid(value)){
          const height=value===0?2:Math.max(5,Math.round(value/highest*peak));
          const y=baseline-height;
          bars.push('<rect class="mj-engine-mini-bar '+engine+'" x="'+x+
            '" y="'+y+'" width="18" height="'+height+'" rx="3">'+
            '<title>'+esc(displayDay(report.day)+' · '+(engine==='google'?'Google':'Bing')+
              ' '+number(value)+' verified appearances')+'</title></rect>'+
            '<text class="mj-engine-mini-value '+engine+'" text-anchor="middle"'+
            ' x="'+(x+9)+'" y="'+Math.max(13,y-4)+'">'+esc(number(value))+'</text>');
        }else{
          bars.push('<rect class="mj-engine-mini-missing" x="'+x+
            '" y="41" width="18" height="20" rx="3"></rect>'+
            '<text class="mj-engine-mini-unknown" x="'+(x+9)+
            '" y="55" text-anchor="middle">?</text>');
        }
      }
      bars.push('<text class="mj-engine-mini-label" x="'+center+
        '" y="77" text-anchor="middle">R'+(slot+1)+'</text>');
    }
    // Show only verified previous-window totals. An actual zero is highlighted;
    // incomplete prior reporting is N/A, never an assumed zero.
    const googleLast=valid(google?.previous?.impressions)?google.previous.impressions:null;
    const bingLast=valid(bing?.previous?.impressions)?bing.previous.impressions:null;
    const engineTotal=(name,current,previous,engine)=>{
      const change=dailyMovement(previous,current,false,'count');
      return '<span class="'+engine+'"><i aria-hidden="true"></i>'+
        '<strong>'+name+'</strong>'+
        '<em class="'+(current===0?'is-zero':'')+'">'+
          esc(formatValue(current))+'</em>'+
        '<span class="mj-engine-compare-line" aria-label="'+
          esc('Last '+formatValue(previous)+', '+change.text)+'">'+
          '<small class="mj-engine-last'+(previous===0?' is-zero':!valid(previous)?' is-unavailable':'')+
            '">LAST '+esc(formatValue(previous))+'</small>'+
          '<b class="mj-engine-change '+esc(change.tone)+'">'+esc(change.text)+'</b>'+
        '</span></span>';
    };
    const totals='<div class="mj-engine-split-totals">'+
      engineTotal('Google',currentGoogle,googleLast,'google')+
      engineTotal('Bing',currentBing,bingLast,'bing')+
      '</div>';
    const caption=hasHistory?
      count+' OF 4 REPORTS AVAILABLE':
      'CUSTOM DATES · HISTORICAL COMPARISON UNAVAILABLE';
    return start+totals+
      '<div class="mj-engine-mini-chart">'+
        '<svg viewBox="0 0 270 84" role="img"'+
          ' aria-label="'+esc('Google in gold, Bing in blue. '+
            'Four saved report positions, oldest on the left and latest on the right. '+
            'Question marks are missing verified history, not zero.')+'">'+
          '<line class="mj-engine-mini-baseline" x1="7" y1="'+baseline+
            '" x2="263" y2="'+baseline+'"></line>'+
          bars.join('')+'</svg>'+
      '</div>'+
      '<small class="mj-engine-mini-caption">'+esc(caption)+'</small>'+
      '</div>';
  }

  function dailyBars(title,items,unit='count',source=''){
    const rows=(Array.isArray(items)?items:[])
      .filter(item=>item&&valid(item.value)).slice(0,7);
    const caption=source?'<p class="mj-daily-chart-note">'+esc(source)+'</p>':'';
    if(!rows.length)return '<div class="mj-daily-chart"><h5>'+esc(title)+'</h5>'+
      '<p class="mj-daily-no-data">NOT ENOUGH VERIFIED DATA TO COMPARE</p>'+caption+'</div>';
    const maximum=Math.max(1,...rows.map(row=>row.value));
    return '<div class="mj-daily-chart"><h5>'+esc(title)+'</h5>'+
      '<div class="mj-daily-bars">'+rows.map(row=>
        '<div class="mj-daily-bar">'+
          '<span>'+esc(row.label)+'</span>'+
          '<div class="mj-daily-bar-track"><i style="width:'+
            Math.min(100,Math.max(0,row.value/maximum*100)).toFixed(2)+'%"></i></div>'+
          '<strong>'+esc(formatValue(row.value,unit))+'</strong>'+
        '</div>').join('')+'</div>'+caption+'</div>';
  }

  // Date-specific timing evidence and platform-specific, tagged website
  // sessions. A correlation is not attribution; keep both measurements apart.
  const postReferralsCache=new Map();
  const postReferralsPending=new Map();
  let postTrafficExpanded=true;
  function postReferrals(period){
    const key=period?.query;
    if(!key)return null;
    const saved=postReferralsCache.get(key);
    if(saved&&Date.now()-saved.checked<120000)return saved.data;
    if(!postReferralsPending.has(key)&&typeof api==='function'){
      const task=api('post-referrals?'+key).then(data=>{
        if(data?.range?.start!==period.start||data?.range?.end!==period.end)
          throw new Error('Post referral report dates did not match.');
        postReferralsCache.set(key,{data,checked:Date.now()});
        return data;
      }).catch(error=>{
        const data={status:'unavailable',rows:[],
          error:String(error?.message||'Tracked visits unavailable.')};
        postReferralsCache.set(key,{data,checked:Date.now()});
        return data;
      }).finally(()=>{
        postReferralsPending.delete(key);
        if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
          typeof websiteReportPeriod==='function'&&websiteReportPeriod()?.query===key)
          paintTop();
      });
      postReferralsPending.set(key,task);
    }
    return saved?.data||null;
  }
  function socialPostingTraffic(site,period){
    const inventory=typeof window.djomsPublishedCampaignPosts==='function'?
      window.djomsPublishedCampaignPosts():null;
    const posts=Array.isArray(inventory)?inventory.filter(post=>
      /^\d{4}-\d{2}-\d{2}$/.test(post?.day||'')&&
      post.day>=period?.start&&post.day<=period?.endInclusive&&
      ['Food','Music','Book'].includes(post.category)):null;
    const attribution=postReferrals(period);
    const attributable=Array.isArray(attribution?.rows)?attribution.rows:[];
    const shiftDay=(iso,shift)=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return null;
      const date=new Date(iso+'T12:00:00Z');
      date.setUTCDate(date.getUTCDate()+shift);
      return date.toISOString().slice(0,10);
    };
    const current=site?.connected===true?site.missionTrend:null;
    const daily=new Map();
    if(current?.granularity==='day'&&Array.isArray(current.points))
      for(const point of current.points){
        if(/^\d{4}-\d{2}-\d{2}$/.test(point?.date||'')&&
          valid(point?.sessions))
          daily.set(point.date,{
            sessions:point.sessions,views:valid(point.pageViews)?point.pageViews:null
          });
      }
    const yesterday=shiftDay(todayCentral(),-1);
    const selected=posts?.slice(0,18)||[];
    const campaignNames={Food:'FOOD',Music:'MUSIC',Book:'BOOK'};
    const comparison=post=>{
      const before=shiftDay(post.day,-1);
      const after=shiftDay(post.day,1);
      const prior=daily.get(before)?.sessions??null;
      const on=daily.get(post.day)?.sessions??null;
      const views=daily.get(post.day)?.views??null;
      const afterCount=after&&after<=yesterday?
        (daily.get(after)?.sessions??null):null;
      if(!valid(prior)||!valid(on)||post.day>yesterday)
        return {prior,on,after:afterCount,views,tone:'na',change:'N/A'};
      if(on===prior)return {prior,on,after:afterCount,views,
        tone:'hold',change:'→ 0%'};
      if(prior===0)return {prior,on,after:afterCount,views,
        tone:on>0?'up':'hold',change:on>0?'↑ NEW (+ '+number(on)+')':'→ 0%'};
      const pct=(on-prior)/prior*100;
      return {prior,on,after:afterCount,views,
        tone:pct>0?'up':'down',
        change:(pct>0?'↑ +':'↓ ')+pct.toFixed(1)+'%'};
    };
    const rows=selected.map(post=>{
      const change=comparison(post);
      const platformLabels={facebook:'FB',instagram:'IG',x:'X'};
      const channels=Array.isArray(post.platforms)?post.platforms:[];
      const sources=channels.map(platform=>{
        if(!['facebook','instagram'].includes(platform))
          return '<span class="mj-post-platform">X · website link not measured</span>';
        const found=attributable.find(row=>row.recordId===post.id&&
          row.platform===platform);
        let result='N/A';
        if(found&&valid(found.taggedVisits)){
          result=number(found.taggedVisits)+' tagged '+(found.taggedVisits===1?'visit':'visits');
        }else if(attribution?.status==='unavailable'){
          result='Wix report unavailable';
        }else if(found?.metricStatus==='other-destination'){
          result='Other website · N/A';
        }else if(attribution?.status==='reported'){
          result='Ready for tracking';
        }else{
          result='Checking tracking';
        }
        const copy=found?.trackingUrl?
          ' <button type="button" class="mj-post-copy"'+
          ' data-mj-copy-post="'+esc(post.id)+'"'+
          ' data-mj-copy-platform="'+esc(platform)+'">'+
          'COPY '+platformLabels[platform]+' LINK</button>':'';
        const postLink=found?.publishedWithTag?
          ' · LINK IN PUBLISHED POST':' · COPY FOR NEXT SHARE';
        return '<span class="mj-post-platform"><b>'+platformLabels[platform]+
          '</b> · '+esc(result)+
          (found?.trackingUrl?'<small>'+esc(postLink)+'</small>':'')+
          copy+'</span>';
      }).join('');
      return '<tr>'+
        '<td>'+esc(displayDay(post.day))+'</td>'+
        '<td><span class="mj-post-type '+esc(post.category.toLowerCase())+
          '">'+esc(campaignNames[post.category])+'</span></td>'+
        '<td><b>'+esc(post.title)+'</b><small>'+
          esc(channels.map(p=>({facebook:'Facebook',instagram:'Instagram',x:'X'})[p]||p).join(' + '))+
          '</small></td>'+
        '<td class="mj-post-count">'+esc(formatValue(change.prior))+'</td>'+
        '<td class="mj-post-count"><b>'+esc(formatValue(change.on))+
          '</b>'+(post.day===todayCentral()?'<small>Today · partial</small>':'')+'</td>'+
        '<td class="mj-post-count">'+esc(formatValue(change.after))+'</td>'+
        '<td class="mj-post-count">'+esc(formatValue(change.views))+'</td>'+
        '<td class="mj-post-change '+esc(change.tone)+'">'+esc(change.change)+'</td>'+
        '<td class="mj-post-links">'+(sources||'N/A')+'</td>'+
      '</tr>';
    }).join('');
    const comparable=selected.map(comparison).filter(x=>x.tone!=='na');
    const higher=comparable.filter(x=>x.tone==='up').length;
    const lower=comparable.filter(x=>x.tone==='down').length;
    const summary=posts===null?'POSTING RECORDS UNAVAILABLE':
      posts.length+' CONFIRMED POST'+(posts.length===1?'':'S')+
      (comparable.length?' · '+higher+' ↑ / '+lower+' ↓ · TIMING ONLY':
        ' · COMPARISON PENDING');
    return '<details class="mj-post-traffic"'+
      (postTrafficExpanded?' open':'')+
      ' aria-label="Facebook and Instagram posts versus Wix website traffic">'+
      '<summary><span>SOCIAL POSTS &amp; WEBSITE TRAFFIC</span>'+
        '<b>'+esc(summary)+' ▾</b></summary>'+
      '<div class="mj-post-traffic-body">'+
        '<p class="mj-post-traffic-intro">Which Food, Music or Book posts went out, and what happened to website visits and page views?</p>'+
        '<p class="mj-post-traffic-method">Before = previous calendar day. Post day = all visits on that date, not only after publication. Next = following complete day. Percent change compares post day with the day before. Today is incomplete.</p>'+
        (posts===null?
          '<p class="mj-post-traffic-empty">Confirmed posting history is not loaded.</p>':
          !posts.length?
          '<p class="mj-post-traffic-empty">No confirmed Food, Music or Book posts for the selected dates.</p>':
          '<div class="mj-post-traffic-scroll"><table>'+
            '<thead><tr><th>POSTED</th><th>TYPE</th><th>POST / PLATFORM</th>'+
            '<th>VISITS BEFORE</th><th>POST DAY</th><th>VISITS NEXT</th>'+
            '<th>PAGE VIEWS DAY</th><th>CHANGE</th><th>TRACKED LINK VISITS &amp; LINKS</th></tr></thead>'+
            '<tbody>'+rows+'</tbody></table></div>'+
          (posts.length>selected.length?
            '<p class="mj-post-traffic-method">Showing the '+selected.length+
              ' most recent of '+posts.length+' confirmed posts.</p>':''))+
        (attribution?.status==='unavailable'?
          '<p class="mj-post-traffic-empty">Tagged-link reporting: '+esc(attribution.error||'Unavailable')+'</p>':'')+
        '<p class="mj-post-traffic-caveat"><strong>MEASURED VS INFERRED:</strong> All-source visits can increase or decrease independently of a post. Only a visit carrying that post’s unique Doc Jaks link is tagged to it. Existing untagged posts cannot be credited retroactively. Facebook post links can be opened directly; Instagram feed captions do not make URLs clickable, so use the copied Instagram link in a Story link sticker or profile link. Signup actions are tracked separately. Wix reporting can lag.</p>'+
      '</div></details>';
  }

  const dailyCompare=(title,last,current,unit,source)=>
    dailyBars(title,[{label:'LAST',value:last},{label:'CURRENT',value:current}],unit,source);
  function dailyDecision(good,concern,action,watch){
    const line=(title,value,tone)=>
      '<div class="mj-daily-decision"><strong class="'+tone+'">'+esc(title)+'</strong>'+
      '<p>'+esc(value)+'</p></div>';
    return '<div class="mj-daily-decisions">'+
      line('↑ WHAT IS GOOD',good,'up')+
      line('↓ WHAT NEEDS ATTENTION',concern,'down')+
      line('WHAT TO DO NEXT',action,'')+
      line('WHAT TO WATCH',watch,'')+
    '</div>';
  }

  // Match the original eight-stage DJOMS 100-point model without
  // inventing another weighting system for this seven-section report.
  // Section 2 combines the existing Traffic and Visitors stages.
  function dailySectionScore(owner,ids){
    const stages=Array.isArray(owner?.stages)?owner.stages:[];
    const group=ids.map(id=>stages.find(row=>row?.id===id)).filter(Boolean);
    const measured=group.filter(row=>Number.isInteger(row.score)&&
      row.score>=60&&row.score<=140&&Number.isFinite(row.weight)&&row.weight>0);
    const weight=measured.reduce((sum,row)=>sum+row.weight,0);
    const expectedWeight=group.reduce((sum,row)=>sum+(Number.isFinite(row.weight)?row.weight:0),0);
    return {
      score:weight>0?Math.round(measured.reduce((sum,row)=>sum+row.score*row.weight,0)/weight):null,
      covered:measured.length,expected:ids.length,weight,expectedWeight
    };
  }
  function dailyHealthMeter(result,overall=false){
    const score=Number.isInteger(result?.score)&&result.score>=60&&result.score<=140?
      result.score:null;
    const tone=score===null?'na':score>100?'up':score<100?'down':'hold';
    const arrow=score===null?'?':score>100?'↑':score<100?'↓':'→';
    const status=score===null?'NOT VERIFIED':score>100?'FORWARD':
      score<100?'BACKWARD':'HOLDING';
    const pos=score===null?null:Math.max(0,Math.min(100,(score-60)/80*100));
    const covered=Number.isInteger(result?.covered)?result.covered:0;
    const expected=Number.isInteger(result?.expected)?result.expected:0;
    const weight=Number.isFinite(result?.weight)?result.weight:0;
    const expectedWeight=Number.isFinite(result?.expectedWeight)?result.expectedWeight:0;
    const partial=score!==null&&(covered<expected||weight<expectedWeight);
    const proof=score===null?'No comparable Last and Current evidence for this section.':
      (partial?'PARTIAL · ':'')+covered+' of '+expected+' scoring stages measured'+
      (expectedWeight?' · '+weight+' of '+expectedWeight+' importance points':'');
    const a11y=(overall?'Overall owner direction':'Section health')+': '+(score===null?
      'not verified':score+' of the DJOMS direction scale, '+status.toLowerCase())+'. '+proof;
    return '<div class="mj-health-meter '+(overall?'mj-health-overall ':'mj-health-section ')+
      'mj-health-'+tone+'" role="group" aria-label="'+esc(a11y)+'">'+
      '<div class="mj-health-top"><span>'+esc(overall?'WEIGHTED OVERALL':'SECTION HEALTH')+'</span>'+
        '<strong class="mj-health-score">'+esc(arrow)+' '+esc(score===null?'N/A':score)+
          ' <em>'+esc(status)+'</em></strong></div>'+
      '<div class="mj-health-track'+(score===null?' mj-health-unavailable':'')+'"'+
        ' role="img" aria-label="'+esc('Health meter. Below 100 red; 100 yellow; above 100 green. '+a11y)+'">'+
        (pos===null?'<span class="mj-health-empty">NO VERIFIED TREND</span>':
          '<span class="mj-health-needle" style="left:'+pos.toFixed(1)+'%"></span>')+
        '</div>'+
      '<div class="mj-health-scale"><span>60</span><span>100</span><span>140</span></div>'+
      '<small class="mj-health-proof">'+esc(proof)+'</small>'+
    '</div>';
  }

  function dailySection(index,title,metrics,charts,details,good,concern,action,watch,caveat='',health=''){
    return '<section class="mj-daily-section" id="mjDailySection'+index+'">'+
      '<header><div class="mj-daily-title"><b class="mj-daily-number">'+index+'</b><h4>'+esc(title)+'</h4></div>'+health+'</header>'+
      '<div class="mj-daily-metrics">'+metrics+'</div>'+
      (charts?'<div class="mj-daily-visuals">'+charts+'</div>':'')+
      (details?'<div class="mj-daily-details">'+details+'</div>':'')+
      dailyDecision(good,concern,action,watch)+
      (caveat?'<p class="mj-daily-caveat">'+esc(caveat)+'</p>':'')+
    '</section>';
  }
  function dailyOwnerReport(data){
    sparklinesRange=data?.period?.range||null;
    const {site,seo,ga4,sales,period,social,music,search,traffic,wixCmp,
      paid,comparison,contactsNow,contactsLast,owner}=data;
    const google=seo?.status==='connected';
    const googleMetrics=google?seo.metrics||{}:{};
    const googlePosition=search?.positionCurrent,priorPosition=search?.positionPrevious;
    const googleEngine=search?.engines?.find(row=>row.id==='google');
    const googleClicks=google?googleMetrics.clicks:null;
    const googleViews=google?googleMetrics.impressions:null;
    const phr=google&&Array.isArray(seo.topQueries)?seo.topQueries.filter(row=>
      row?.query&&valid(row.impressions)).sort((a,b)=>b.impressions-a.impressions).slice(0,5):[];


    const clicksStatus=valid(googleViews)&&googleViews>0&&googleClicks===0;
    const rankBad=valid(googlePosition)&&valid(priorPosition)&&googlePosition>priorPosition;
    const rankGood=valid(googlePosition)&&valid(priorPosition)&&googlePosition<priorPosition;
    const searchGood=valid(search?.current)&&valid(search?.previous)&&
      search.current>search.previous?
      'Verified search appearances grew from '+number(search.previous)+' to '+
        number(search.current)+'. More searches are displaying Doc Jaks.':
      valid(search?.current)?
        number(search.current)+' verified appearances were recorded. Check whether the trend continues.':
        'Search coverage is not yet verified for these dates.';
    const searchConcern=[
      rankBad?'Google average position slipped from '+formatValue(priorPosition,'position')+
        ' to '+formatValue(googlePosition,'position')+'. A higher position number is worse.':null,
      clicksStatus?'Google reported '+number(googleViews)+' appearances but zero Google result clicks.':null
    ].filter(Boolean).join(' ')||
      'Watch click-through rate and ranking before drawing conclusions from appearances alone.';

    // Recommendations must respond to measured results without implying that
    // clicks alone cause better Google rank. Search Console gives aggregate
    // impressions/clicks; page relevance and usefulness remain hypotheses.
    const clickOpportunity=valid(googleViews)&&googleViews>=10&&
      valid(googleClicks)&&googleClicks===0;
    const lowClickRate=valid(googleViews)&&googleViews>=20&&
      valid(googleClicks)&&googleClicks>0&&
      googleClicks/googleViews<0.02;
    const searchAction=clickOpportunity||lowClickRate?
      'PRIORITY: Earn more qualified Google clicks. Review the top disclosed searches (especially local BBQ phrases) and the page Google actually displays. Make the page title and search description clearly describe Doc Jaks, its sauces, and the relevant location; do not promise a dine-in restaurant if the page sells sauces. Put one obvious link or button to the matching BBQ/Trading Post page on that landing page. More clicks are desirable, but clicks alone do not automatically improve Google ranking.':
      rankBad?
        'Google position worsened. Inspect the queries and exact pages Google shows; improve relevant page titles, page content, and clear first-screen navigation for local BBQ searches. Verify those pages work well on mobile. More clicks are useful, but do not directly guarantee a better ranking.':
        'Keep improving the actual pages found for local BBQ searches. Check relevant search titles and descriptions, page usefulness, and one clear next-step link for sauces or the Trading Post. Aim to attract qualified clicks, not just more impressions.';
    const searchWatch=clickOpportunity?
      'First watch Google result clicks (currently zero): did a verified click appear? Track Google CTR, average position, local BBQ phrases, and visits to the matched page over comparable Google reporting dates.':
      lowClickRate?
        'Track Google clicks and CTR alongside average search position and the top query/page combinations. Do qualified visits and meaningful actions improve?':
        'Track Google search clicks, CTR, average position, top local BBQ queries, and continued Bing visibility. Compare matching reporting windows.';

    const engineDetails=(search?.engines||[]).map(row=>{
      const prior=row.previous?.impressions,now=row.current?.impressions;
      const change=dailyMovement(prior,now,false,'count');
      return '<li><span>'+esc(row.name)+'</span><b>LAST '+esc(number(prior))+
        ' · NOW '+esc(number(now))+' · <em class="'+esc(change.tone)+'">'+
        esc(change.text)+'</em></b></li>';
    }).join('');
    const searchDetails='<h5>TOP VERIFIED SEARCH ENGINES</h5>'+
      '<ol>'+(engineDetails||'<li>No comparable engine details reported.</li>')+'</ol>'+
      (phr.length?'<h5>MOST COMMON DISCLOSED GOOGLE SEARCH PHRASES</h5>'+
      '<ol>'+phr.map(row=>'<li><span>'+esc(row.query)+'</span><b>'+
        number(row.impressions)+' appearances</b></li>').join('')+'</ol>':
      '<p>Google has not disclosed enough search phrase details for these dates.</p>');
    const part1=dailySection(1,'SEARCH APPEARANCES & CTR',
      '<div class="mj-daily-search-headlines" aria-label="Four verified search discovery measures">'+
        dailyKpi('VERIFIED APPEARANCES',search?.previous,search?.current)+
        verifiedEngineKpi(search,period)+
        dailyKpi('COMBINED CTR',search?.ctrPrevious,search?.ctrCurrent,'percentage')+
        dailyKpi('GOOGLE POSITION',priorPosition,googlePosition,'position',true)+
      '</div>',
      '',
      searchDetails,searchGood,searchConcern,
      searchAction,
      searchWatch,
      'Google search phrases overlap result-page totals and are never added to overall appearances.',dailyHealthMeter(dailySectionScore(owner,['search'])));

    const siteOkay=site?.connected===true;
    const visitorTypesProvisional=!visitorTypeTrendsReady(site);
    const weekRows=siteOkay&&Array.isArray(site.weekly)?site.weekly:[];
    const weekly=(field)=>weekRows.filter(row=>
      typeof row?.start==='string'&&/^\d{4}-\d{2}-\d{2}/.test(row.start)&&valid(row[field]))
      .map(row=>({date:row.start.slice(0,10),value:row[field]}))
      .sort((a,b)=>a.date.localeCompare(b.date)).slice(-7);
    // Wix weekly series uses weekly buckets, so render bars, not a false daily line.
    const weeklyBar=(field)=>weekly(field).map(row=>({
      label:displayDay(row.date),value:row.value
    }));
    const wixSources=siteOkay&&Array.isArray(site.trafficSources)?
      site.trafficSources.filter(row=>valid(row.sessions))
        .sort((a,b)=>b.sessions-a.sessions).slice(0,6)
        .map(row=>({label:String(row.source||row.category||'Other'),value:row.sessions})):[];
    const siteGood=valid(traffic.sessions.now)&&valid(traffic.sessions.last)&&
      traffic.sessions.now>traffic.sessions.last?
      'Website visits increased from '+number(traffic.sessions.last)+' to '+
        number(traffic.sessions.now)+'.':
      valid(site?.visitors)?number(site.visitors)+
        ' website visitors were reported for the selected dates.':
        'Verified website visitor totals are unavailable.';
    const siteConcern=valid(traffic.sessions.now)&&valid(traffic.sessions.last)&&
      traffic.sessions.now<traffic.sessions.last?
      'Website visits declined from '+number(traffic.sessions.last)+' to '+
        number(traffic.sessions.now)+'. The cause is not yet established.':
      'Search clicks and website visits come from separate sources and cannot be added to infer a conversion rate.';
    const clickPhrases=google&&Array.isArray(seo?.topQueries)?
      seo.topQueries.filter(row=>row?.query&&valid(row.clicks)&&row.clicks>0)
      .sort((a,b)=>b.clicks-a.clicks).slice(0,5):[];
    const searchClickDetails='<div class="mj-daily-click-phrases">'+
      '<h5>GOOGLE SEARCH PHRASES THAT EARNED CLICKS</h5>'+
      (clickPhrases.length?'<ol>'+clickPhrases.map(row=>
        '<li><span>'+esc(row.query)+'</span><b>'+number(row.clicks)+' '+(row.clicks===1?'click':'clicks')+'</b></li>').join('')+'</ol>':
        '<p>'+esc(google&&googleClicks===0?
        'Google reported zero clicks for this period. The click-by-engine chart shows whether Bing had clicks.':
        'No individual Google search phrases with verified clicks were disclosed.')+'</p>')+
      '</div>';

    const part2=dailySection(2,'SEARCH CLICKS & WEBSITE VISITS',
      '<div class="mj-daily-subarea mj-daily-subarea-clicks">'+
        '<h5>2A · SEARCH CLICKS</h5>'+
        '<div class="mj-daily-subarea-grid">'+
          dailyKpi('SEARCH RESULT CLICKS',search?.clicksPrevious,search?.clicksCurrent)+
        '</div>'+
      '</div>'+
      '<div class="mj-daily-subarea mj-daily-subarea-visits">'+
        '<h5>2B · WEBSITE VISITS · ALL SOURCES</h5>'+
        '<div class="mj-daily-subarea-grid">'+
          dailyKpi('NEW VISITORS',wixCmp.newVisitors?.previous,siteOkay?wixNewVisitors(site):null,'count',false,'',visitorTypesProvisional)+
          dailyKpi('RETURNING VISITORS',wixCmp.returningVisitors?.previous,wixCmp.returningVisitors?.current,'count',false,'',visitorTypesProvisional)+
          dailyKpi('WEBSITE VISITORS',wixCmp.visitors?.previousVisitors,siteOkay?site.visitors:null)+
          dailyKpi('ALL WEBSITE VISITS',traffic.sessions.last,traffic.sessions.now)+
        '</div>'+visitorSplitNote(site)+
      '</div>',
      dailyBars('SEARCH CLICKS BY VERIFIED ENGINE',
        (Array.isArray(search?.engines)?search.engines:[]).map(e=>({
          label:e.id==='google'?'Google':e.id==='bing'?'Bing':e.name,
          value:e.current?.clicks
        })),'count','Google and Bing engine clicks are already included in the Section 2 total. These are not Wix visits.')+
      dailyBars('WHERE WEBSITE VISITS CAME FROM',wixSources,'count',
        'Wix sessions, not search clicks. Source coverage may be partial.')+
      dailyBars('WIX WEEKLY VISIT HISTORY',weeklyBar('sessions'),'count',
        'Verified Wix weekly buckets, potentially including partial weeks. Not a daily trend.'),
      searchClickDetails+socialPostingTraffic(site,period),siteGood,siteConcern,
      'Check the most-used entry pages and whether visitors can quickly find the next step. Use distinct tracking links for supporter posts.',
      'Direct, Google, Facebook, Instagram and other referrals, including which posts lead to actual website visits.',
      'A session is a visit, not a unique person. Wix sessions and search-engine click reports use different definitions.',dailyHealthMeter(dailySectionScore(owner,['sources','visitors'])));

    const currentBounce=siteOkay?site.bounceRate:null;
    const previousBounce=wixCmp.bounceRate?.previous;
    const currentStay=siteOkay?site.avgTimeSeconds:null;
    const priorStay=wixCmp.avgTimeSeconds?.previous;
    const pageGood=valid(currentStay)&&valid(priorStay)&&currentStay>priorStay?
      'Average time on site increased from '+duration(priorStay)+' to '+duration(currentStay)+'.':
      valid(site?.pageViews)?number(site.pageViews)+' page views were recorded.':
      'Page engagement data are unavailable.';
    const pageConcern=valid(currentBounce)&&currentBounce>=.70?
      'Bounce rate is '+ratio(currentBounce)+', above the 70% warning threshold. This does not prove why visitors leave.':
      valid(site?.pageViews)&&valid(wixCmp.pageViews?.previous)&&
        site.pageViews<wixCmp.pageViews.previous?
        'Page views fell from '+number(wixCmp.pageViews.previous)+' to '+number(site.pageViews)+'.':
        'Monitor page depth and bounce rate rather than assuming time on site proves purchases.';
    const pageRows=siteOkay&&Array.isArray(site.topPages)?
      site.topPages.filter(row=>row?.path&&valid(row.views))
        .sort((a,b)=>b.views-a.views).slice(0,5).map(row=>({
          label:named(row.path),value:row.views
        })):[];
    const part3=dailySection(3,'PAGES & ENGAGEMENT',
      dailyKpi('PAGE VIEWS',wixCmp.pageViews?.previous,siteOkay?site.pageViews:null)+
      dailyKpi('AVERAGE STAY',priorStay,currentStay,'time')+
      dailyKpi('BOUNCE RATE',previousBounce,currentBounce,'percentage',true)+
      dailyKpi('PAGES / VISIT',wixCmp.pagesPerSession?.previous,siteOkay?site.pagesPerSession:null,'decimal'),
      dailyBars('MOST-VIEWED WEBSITE PAGES',pageRows,'count',
        'Wix page views include repeat views and are not unique visitors.')+
      dailyBars('WIX WEEKLY PAGE VIEW HISTORY',weeklyBar('views'),'count',
        'Wix weekly buckets may include partial weeks; compare like-for-like windows.'),
      '',pageGood,pageConcern,
      'Clarify the first-screen message and primary button on your busiest landing pages. Verify clicks and completed actions.',
      'Bounce rate, average stay, pages per visit, and the pages with the greatest exits.',
      'A longer average stay does not automatically establish positive engagement or an actual customer.',dailyHealthMeter(dailySectionScore(owner,['engagement'])));

    const radioImport=window.djomsVerifiedReports?.radioImport?.data;
    const radioDaily=music?.current&&Array.isArray(radioImport?.rows)?
      radioImport.rows.filter(row=>row&&row.date>=period?.start&&
        row.date<=period?.endInclusive&&valid(row.connections)&&
        row.coverage==='daily-row').map(row=>({date:row.date,value:row.connections})):[];
    const topLiked=songLikes?.status==='reported'&&Array.isArray(songLikes.songs)?
      songLikes.songs.filter(row=>row?.title&&valid(row.likes))
        .sort((a,b)=>b.likes-a.likes).slice(0,5):[];
    const musicGood=valid(music?.current?.connections)&&valid(music?.previous?.connections)&&
      music.current.connections>music.previous.connections?
      'Verified Radio.co stream connections increased from '+
        number(music.previous.connections)+' to '+number(music.current.connections)+'.':
      topLiked.length&&topLiked[0].likes>0?
        '"'+topLiked[0].title+'" leads with '+number(topLiked[0].likes)+
        ' verified lifetime song likes. Likes are not plays.':
        'Verified listening trends are not yet available for these reporting dates.';
    const musicConcern=music?.status==='reported'?
      'Connections do not identify unique people. Continue checking listening duration and repeat listening.':
      'Current Radio.co listening data do not cover both selected reporting windows, so listener growth is N/A.';
    const part4=dailySection(4,'MUSIC, RADIO & STREAMING',
      dailyKpi('RADIO STREAM CONNECTIONS',music?.previous?.connections,music?.current?.connections)+
      dailyKpi('TOTAL LISTENING TIME',music?.previous?.seconds,music?.current?.seconds,'time')+
      dailyKpi('OUTLAW RADIO PAGE VIEWS',null,music?.radioPageViews)+
      dailyKpi('MUSIC PAGE VIEWS',null,music?.musicPageViews),
      dailyLine('VERIFIED RADIO.CO DAILY CONNECTIONS',radioDaily,'count',
        'Imported Radio.co CSV, UTC dates. Historical, not live. Missing days remain N/A.')+
      dailyBars('MOST-LIKED SONGS · ALL TIME',
        topLiked.map(row=>({label:row.title,value:row.likes})),'count',
        'Verified Wix heart votes, not listening starts, unique listeners or social likes.'),
      '',musicGood,musicConcern,
      'Keep station tags working smoothly and obtain consistent Radio.co daily connection and listening-time reports.',
      'Verified stream connections, listening time, repeat audience indicators and which songs earn hearts.',
      'Radio page views, heart votes, paid music units and radio listening sessions are different measurements.',dailyHealthMeter(dailySectionScore(owner,['music'])));

    const grossNow=paid?sales.itemSalesCents:null;
    const grossLast=comparison?.itemSalesCents;
    const ordersNow=paid?sales.paidOrders:null;
    const ordersLast=comparison?.paidOrders;
    const salesGood=valid(grossNow)&&valid(grossLast)&&grossNow>grossLast?
      'Paid web item sales increased from '+cash(grossLast)+' to '+cash(grossNow)+'.':
      valid(grossNow)&&grossNow>0?
        cash(grossNow)+' in verified paid web item sales was reported.':
        'No verified sales increase is established for this period.';
    const salesConcern=valid(grossNow)&&grossNow===0?
      'Verified paid web item sales were $0.00 during this period. No paid online orders recorded from this channel.':
      'Gross online sales are not profit and do not include market purchases or offline transactions.';
    const part5=dailySection(5,'PAID WEB SALES',
      dailyKpi('GROSS ONLINE ITEM SALES',grossLast,grossNow,'cents')+
      dailyKpi('PAID ONLINE ORDERS',ordersLast,ordersNow),
      dailyCompare('LAST VS CURRENT GROSS SALES',grossLast,grossNow,'cents',
        'Only reconciled paid Wix online item sales, not margins or market sales.')+
      dailyCompare('LAST VS CURRENT PAID ORDERS',ordersLast,ordersNow,'count',
        'No order count inferred from page visits, likes or add-to-cart events.'),
      '',salesGood,salesConcern,
      'Check product availability, checkout experience and clear links from the Trading Post and sauce pages.',
      'Paid orders, gross dollars and which tracked campaign links bring qualified visitors.',
      'Online paid item sales are not business-wide revenue or profit; music sales are already included once.',dailyHealthMeter(dailySectionScore(owner,['sales'])));

    const fb=social?.platforms?.facebook;
    const ig=social?.platforms?.instagram;
    const fbViews=fb?.now?.views,igViews=ig?.now?.views;
    const fbLikes=fb?.now?.reactions,igLikes=ig?.now?.reactions;
    const metaBars=[{label:'FACEBOOK',value:fbViews},{label:'INSTAGRAM',value:igViews}];
    const socialGood=valid(fbViews)||valid(igViews)?
      'Measured post-cohort views: Facebook '+number(fbViews)+
        ', Instagram '+number(igViews)+'. This reflects lifetime views on the posts, not only today.':
      'Meta has not returned a complete verified social measurement for this window.';
    const socialConcern=social?.status==='reported'?
      'Older published posts have had longer to collect views and reactions. Raw cohort totals are not reliable daily growth measures.':
      'Comparable Facebook/Instagram post-cohort data are still incomplete or unavailable.';
    const part6=dailySection(6,'SOCIAL MEDIA',
      dailyKpi('FACEBOOK POST VIEWS',null,fbViews)+
      dailyKpi('INSTAGRAM POST VIEWS',null,igViews)+
      dailyKpi('FACEBOOK REACTIONS',null,fbLikes)+
      dailyKpi('INSTAGRAM LIKES',null,igLikes),
      dailyBars('FACEBOOK VS INSTAGRAM · POST VIEWS',metaBars,'count',
        'Verified lifetime counters on posts published in the selected period, not daily interactions.'),
      '',socialGood,socialConcern,
      'Continue the BBQ, Music and Book rotation. Give supporter posts tagged links and measure the website referrals they actually generate.',
      'Shares, comments, link-driven visits and which posts attract meaningful actions.',
      'X is manually recorded and excluded from score. Social totals cannot be equated to unique readers or attributed sales.',dailyHealthMeter(dailySectionScore(owner,['social'])));

    const event=ga4?.status==='connected'&&ga4.actions?.status==='reported'?
      ga4.actions.counts||{}:{};
    const before=ga4?.actions?.comparison?.status==='reported'?
      ga4.actions.comparison.counts||{}:{};
    const downloaded=valid(event.fileDownload)?event.fileDownload:null;
    const lastDownloads=valid(before.fileDownload?.previous)?before.fileDownload.previous:null;
    const actionsGood=valid(contactsNow)&&contactsNow>0?
      number(contactsNow)+' Wix inquiry action'+(contactsNow===1?'':'s')+
        ' were recorded. Confirm whether each represented a genuine inquiry.':
      valid(downloaded)&&downloaded>0?
        number(downloaded)+' file download events were recorded. Downloads do not prove reading.':
        'No verified increase in meaningful actions is established for these dates.';
    const actionsConcern='Confirmed Pit Krewe signups and actual unique radio listeners are not measured end-to-end yet. Do not treat an unverified source as zero.';
    const part7=dailySection(7,'MEANINGFUL ACTIONS',
      dailyKpi('INQUIRIES',contactsLast,contactsNow)+
      dailyKpi('FILE DOWNLOAD EVENTS',lastDownloads,downloaded)+
      dailyKpi('CONFIRMED PIT KREWE SIGNUPS',null,null)+
      dailyKpi('VERIFIED UNIQUE RADIO LISTENERS',null,null),
      dailyCompare('INQUIRY ACTIONS · LAST VS CURRENT',contactsLast,contactsNow,'count',
        'Contact clicks plus Wix forms. Not confirmed unique people.')+
      dailyCompare('FILE DOWNLOAD EVENTS',lastDownloads,downloaded,'count',
        'GA4 events if the selected dates have complete verified coverage.'),
      '',actionsGood,actionsConcern,
      'Verify contact and Pit Krewe completion events, chapter downloads and Radio.co listening-start reporting before scoring them.',
      'Successful forms, new confirmed Krewe members, chapter downloads and verified listening sessions.',
      'File downloads are events, not proof that a chapter was read or understood.',dailyHealthMeter(dailySectionScore(owner,['actions'])));

    const currentScore=Number.isInteger(owner?.score)?owner.score:null;
    const scoreKind=currentScore===null?'na':currentScore>100?'up':
      currentScore<100?'down':'hold';
    const scoreText=currentScore===null?'NOT VERIFIED':currentScore>100?'MOVING FORWARD':
      currentScore<100?'MOVING BACKWARD':'HOLDING';
    const growingSearch=valid(search?.previous)&&valid(search?.current)&&
      search.current>search.previous;
    const fallingTraffic=valid(traffic.sessions.last)&&valid(traffic.sessions.now)&&
      traffic.sessions.now<traffic.sessions.last;
    const headline=[
      growingSearch?'Search visibility is improving.':null,
      fallingTraffic?'Website visits are falling.':null,
      rankBad?'Google average position is worsening.':null,
      rankGood?'Google average position improved.':null
    ].filter(Boolean).join(' ')||'See the verified measurements and decisions for each stage below.';
    const sections=[part1,part2,part3,part4,part5,part6,part7].join('');

    const overallScoreSource={
      score:currentScore,
      covered:Number.isInteger(owner?.covered)?owner.covered:0,
      expected:Array.isArray(owner?.stages)?owner.stages.length:8,
      weight:Number.isFinite(owner?.availableWeight)?owner.availableWeight:0,
      expectedWeight:Number.isFinite(owner?.totalWeight)?owner.totalWeight:100
    };
    const sectionScores=[
      ['search'],['sources','visitors'],['engagement'],['music'],
      ['sales'],['social'],['actions']
    ].map(ids=>dailySectionScore(owner,ids).score);
    const sectionCounts={
      up:sectionScores.filter(v=>v!==null&&v>100).length,
      down:sectionScores.filter(v=>v!==null&&v<100).length,
      hold:sectionScores.filter(v=>v===100).length,
      na:sectionScores.filter(v=>v===null).length
    };
    const finalHealth='<section class="mj-daily-final-health" aria-label="Overall business direction">'+
      '<div class="mj-daily-final-heading"><h4>OVERALL BUSINESS DIRECTION</h4>'+
        '<p>After all seven sections · Same verified DJOMS score as Mission Control</p></div>'+
      dailyHealthMeter(overallScoreSource,true)+
      '<div class="mj-daily-final-tally">'+
        '<span class="up">↑ '+sectionCounts.up+' improving</span>'+
        '<span class="down">↓ '+sectionCounts.down+' declining</span>'+
        '<span class="hold">→ '+sectionCounts.hold+' holding</span>'+
        '<span class="na">? '+sectionCounts.na+' unavailable</span>'+
      '</div>'+
      '<p class="mj-daily-caveat">The overall score is a WEIGHTED direction index, not a simple average of seven sections or an absolute business grade. '+
      'The Website Visits section combines the existing Traffic and Visitors scoring stages; each is counted once. '+
      'Unverified stages do not count as 100 or as zero.</p>'+
    '</section>';

    const dayLabel=displayWindow(period?.start,period?.endInclusive);
    const googleRange=displayWindow(search?.currentRange?.start,search?.currentRange?.end);
    const reportName=reportNames[period?.range]||'SELECTED';
    const choices=[
      ['today','DAY'],['7d','WEEK'],['30d','MONTH'],['365d','YEAR']
    ];
    const periodPicker='<div class="mj-daily-period-picker" role="group" '+
      'aria-label="Choose reporting period for this entire report">'+
      choices.map(([range,label])=>
        '<button type="button" data-website-range="'+range+'"'+
        ' aria-pressed="'+(period?.range===range?'true':'false')+'"'+
        ' class="'+(period?.range===range?'active':'')+'">'+label+'</button>').join('')+
      '</div>';
    return '<details id="mjDailyReport" class="mj-daily-report">'+
      '<summary><span>⚜ DOC JAKS · '+esc(reportName)+' PERFORMANCE REPORT</span>'+
        '<strong>7 SECTIONS · VERIFIED GRAPHS · NEXT ACTIONS <i>▾</i></strong></summary>'+
      '<div class="mj-daily-content">'+
        '<header class="mj-daily-header"><div><small>DOC JAKS OPERATIONS MANAGEMENT SYSTEM</small>'+
          '<h3>THE '+esc(reportName)+' PERFORMANCE REPORT</h3>'+
          periodPicker+
          '<div class="mj-daily-date-focus" aria-label="Dates selected for the report">'+
            '<span>SELECTED '+esc(periodTitle(period).toUpperCase())+' REPORT DATES</span>'+
            '<strong>'+esc(dayLabel)+'</strong>'+
            '<small>Day = today · Week = last 7 days · Month = last 30 days · Year = last 365 days</small>'+
          '</div>'+
          '<p class="mj-daily-search-window">Search-engine verified dates: <b>'+esc(googleRange)+
            '</b>. Google reporting can lag behind the selected dates.</p></div>'+
        '</header>'+
        '<div class="mj-daily-overview"><strong>THE HEADLINE</strong><p>'+esc(headline)+
          '</p><small>Investigations and suggested actions are hypotheses until tested. '+
          'Data can include owner website testing and incomplete source coverage.</small></div>'+
        '<nav class="mj-daily-toc" aria-label="Daily report sections">'+
          [ 'Search','Visits','Pages','Music','Sales','Social','Actions' ].map(
            (label,i)=>'<a href="#mjDailySection'+(i+1)+'">'+(i+1)+'. '+label+'</a>').join('')+
        '</nav>'+
        sections+
        finalHealth+
        '<footer class="mj-daily-footer">'+
          '<p><strong>REPORTING RULE:</strong> No fabricated numbers, no assumed conversions. '+
          'Red/green reflects the direction of the measured KPI, and Google position and bounce rate favor lower values. '+
          'A missing measurement stays N/A. Engine, website, social and listening counts are never added together.</p>'+
          '<button type="button" data-mj-daily-print="1">PRINT DAILY REPORT</button>'+
        '</footer>'+
      '</div></details>';
  }

  function journey(context){
    const {site,seo,ga4,sales,period,social:providedSocial}=context||{};
    const social=providedSocial||(typeof window.djomsSocialPeriod==='function'?window.djomsSocialPeriod(period):null);
    const music=typeof window.djomsMusicEvidence==='function'?
      window.djomsMusicEvidence({period,sales}):null;
    const bing=report('bing',period);
    const search=typeof window.djomsCombinedSearch==='function'?
      window.djomsCombinedSearch({seo,bing,period}):null;
    const wix=site?.connected===true,google=seo?.status==='connected';
    const g=google?seo.metrics||{}:{};
    const gsc=google&&seo.comparison?.status==='reported'?seo.comparison:null;
    const lastSearch=field=>valid(gsc?.[field]?.previous)?gsc[field].previous:null;
    const wixCmp=wix?site.metricComparisons||{}:{};
    const visitorTypesProvisional=!visitorTypeTrendsReady(site);
    const priorVisitors=wixCmp.visitors?.previousVisitors;
    const paid=salesReady(sales,period);
    const comparison=paid&&sales.salesComparison?.status==='reported'&&
      sales.salesComparison.previousRange?.end===sales.range.start?
      sales.salesComparison.previous:null;
    const gaEvent=ga4?.status==='connected'&&ga4.actions?.status==='reported'?ga4.actions.counts||{}:{};
    const previousEvents=ga4?.actions?.comparison?.status==='reported'?ga4.actions.comparison.counts||{}:{};
    const traffic=sources(site);
    const contactsNow=wix&&valid(site.contactClicks)&&valid(site.formsSubmitted)?
      site.contactClicks+site.formsSubmitted:null;
    const contactsLast=valid(wixCmp.clicksToContact?.previous)&&valid(wixCmp.formsSubmitted?.previous)?
      wixCmp.clicksToContact.previous+wixCmp.formsSubmitted.previous:null;
    const owner=typeof window.djomsOwnerScore==='function'?
      window.djomsOwnerScore(site,ga4,seo,sales,period,social,music):null;
    const score=Number.isInteger(owner?.score)?owner.score:null;
    const scoreName=score===null?'UNVERIFIED':score>100?'FORWARD':score<100?'BACKWARD':'HOLDING';
    const scoreStyle=score===null?'na':score>100?'up':score<100?'down':'hold';
    const scoreArrow=score===null?'?':score>100?'↑':score<100?'↓':'→';
    const scoreArrowLabel=score===null?'Insufficient verified data for direction':
      score>100?'Moving forward above 100':score<100?'Moving backward below 100':
      'Holding at exactly 100';
    const first=card('search','1','SEARCH APPEARANCES & CTR','⌕',
      '<div class="mj-search-headline-kpis" aria-label="Three equal search discovery measures">'+
        heroMetric('VERIFIED APPEARANCES',search?.previous,
          search?.current,'count')+
        heroMetric('COMBINED CTR',search?.ctrPrevious,
          search?.ctrCurrent,'percentage')+
        heroMetric('GOOGLE POSITION',
          search?.positionPrevious,search?.positionCurrent,'position',true)+
      '</div>'+
      searchEnginesDropdown(search)+searchAppearancesDetails(seo),
      'Appearances and CTR tell us how often Doc Jaks is found and chosen. '+
      'Actual search click totals and their breakdown are tracked under #2.');
    // #2 groups the journey from verified search-result clicks to ALL
    // Wix website sessions. These are two different sources and measures.
    // We do not infer a one-to-one conversion or add the metrics together.
    const second=card('clicks','2','SEARCH CLICKS & WEBSITE VISITS','↖',
      '<section class="mj-arrival-part mj-arrival-clicks" aria-label="Search clicks">'+
        '<h4 class="mj-arrival-subheading">2A · SEARCH CLICKS</h4>'+
        heroMetric('SEARCH CLICKS',search?.clicksPrevious,search?.clicksCurrent,'count',false,
          'Reported by the same search engines and dates as Box 1.')+
        clicksByEngineDropdown(search)+
        searchClicksByPhraseDropdown(seo)+
      '</section>'+
      '<section class="mj-arrival-part mj-arrival-website" aria-label="Website visits and unique visitors">'+
        '<h4 class="mj-arrival-subheading">2B · WEBSITE VISITS · ALL SOURCES</h4>'+
        '<div class="mj-minis mj-visit-counts">'+
          miniMetric('NEW VISITORS',wixCmp.newVisitors?.previous,wixNewVisitors(site),'count',false,visitorTypesProvisional)+
          miniMetric('RETURNING VISITORS',wixCmp.returningVisitors?.previous,
            wixCmp.returningVisitors?.current,'count',false,visitorTypesProvisional)+
          miniMetric('WEBSITE VISITORS',priorVisitors,wix?site.visitors:null)+
          miniMetric('ALL WEBSITE VISITS',traffic.sessions.last,traffic.sessions.now)+'</div>'+visitorSplitNote(site)+
        wixSourcesDropdown(site)+
        (typeof window.djomsSupporterPanel==='function'?
          window.djomsSupporterPanel(period):'')+
        locationsDropdown(site)+
      '</section>',
      'Search clicks come from the search engines in #1; Website Visits come from Wix and include direct, social, search and referral visits. The numbers are different measurements and are not added together.');
    // #3 shows which pages were viewed and how people engaged. Metrics remain
    // distinct Wix measures; they are never summed into a fabricated total.
    const third=card('visitors','3','PAGES & ENGAGEMENT','◷',
      heroMetric('PAGE VIEWS',wixCmp.pageViews?.previous,wix?site.pageViews:null,'count',
        false,'Total Wix page views, including repeat views by the same visitor.')+
      '<div class="mj-minis">'+
        miniMetric('AVERAGE STAY',wixCmp.avgTimeSeconds?.previous,
          wix?site.avgTimeSeconds:null,'time')+
        miniMetric('BOUNCE RATE',wixCmp.bounceRate?.previous,
          wix?site.bounceRate:null,'percentage',true)+
        miniMetric('PAGES / VISIT',wixCmp.pagesPerSession?.previous,
          wix?site.pagesPerSession:null,'decimal')+'</div>'+
      viewedPagesDropdown(site),
      'Explore the pages visited and engagement. Lower bounce is favorable.');
    const seventh=card('actions','7','MEANINGFUL ACTIONS','✦',
      '<div class="mj-minis">'+
        miniMetric('INQUIRIES',contactsLast,contactsNow)+
        miniMetric('PIT KREWE',null,null)+
        miniMetric('RADIO LISTENERS',null,null)+
        miniMetric('FILE DOWNLOAD EVENTS',
          previousEvents.fileDownload?.previous,gaEvent.fileDownload)+'</div>',
      'Actual listeners and confirmed Pit Krewe members remain N/A until their own proof is connected.');
    const fifth=card('sales','5','PAID WEB SALES','▣',
      heroMetric('Gross item sales',comparison?.itemSalesCents,
        paid?sales.itemSalesCents:null,'cents')+
      '<div class="mj-minis">'+
        miniMetric('PAID ORDERS',comparison?.paidOrders,paid?sales.paidOrders:null)+'</div>',
      'Wix paid online items only, not market sales or profit.');
    const note=diagnostic(site,seo,ga4,sales,period);
    const key=note.metric,curr=valueFor(key,site,seo,ga4,sales,period);
    const lastMetric=key==='searchCtr'?gsc?.ctr?.previous:
      key==='searchClicks'?gsc?.clicks?.previous:
      key==='siteVisitors'?priorVisitors:
      key==='siteBounceRate'?wixCmp.bounceRate?.previous:
      key==='sitePageViews'?wixCmp.pageViews?.previous:
      key==='formSubmissions'?wixCmp.formsSubmitted?.previous:
      key==='fileDownloads'?previousEvents.fileDownload?.previous:null;
    const canCompare=valid(lastMetric)&&valid(curr);
    const direction=canCompare?movement(lastMetric,curr,key==='siteBounceRate'):{tone:'na',text:'N/A'};
    const dailyFullReport=dailyOwnerReport({site,seo,ga4,sales,period,social,music,
      search,traffic,wixCmp,paid,comparison,contactsNow,contactsLast,owner});

    // Bottom-left of the trail, beneath Steps 6 and 7.
    // The explanations here replace the four oversized panels below the trail.
    const quickBrief='<article class="mj-quick-brief" aria-label="The Bottom Line: quick owner results">'+
      '<header class="mj-quick-heading">'+
        '<div class="mj-quick-title"><small>⚜ DOC JAKS · OWNER QUICK READ</small>'+
          '<h3>THE BOTTOM LINE</h3>'+
          '<p>'+esc(periodTitle(period))+' · Verified figures only</p></div>'+
        '<div class="mj-quick-score '+esc(scoreStyle)+'">'+
          '<strong>'+esc(scoreArrow)+' '+esc(score===null?'N/A':score)+' '+esc(scoreName)+'</strong>'+
          '<small>100 = Holding · Above 100 = Forward</small></div>'+
      '</header>'+
      '<div class="mj-quick-metrics" aria-label="Six key results and their changes">'+
        quickMetric('SEARCH APPEARANCES',search?.previous,search?.current,'count',
          'Shown in search results')+
        quickMetric('SEARCH CLICKS',search?.clicksPrevious,search?.clicksCurrent,'count',
          'Clicks from search results')+
        quickMetric('WEBSITE VISITS',traffic.sessions.last,traffic.sessions.now,'count',
          'All sources, Wix sessions')+
        quickMetric('PAGE VIEWS',wixCmp.pageViews?.previous,wix?site.pageViews:null,'count',
          'Pages opened, including repeats')+
        quickMetric('INQUIRIES',contactsLast,contactsNow,'count',
          'Contact clicks + forms')+
        quickMetric('GROSS WEB SALES',comparison?.itemSalesCents,
          paid?sales.itemSalesCents:null,'cents','Online item sales, not profit')+
      '</div>'+
      '<div class="mj-quick-answers" aria-label="What happened, why, next action and proof">'+
        '<div class="mj-quick-answer"><b>WHAT HAPPENED?</b><p>'+esc(note.evidence)+'</p></div>'+
        '<div class="mj-quick-answer"><b>WHY? · POSSIBLE CAUSE</b><p>'+esc(note.why)+'</p></div>'+
        '<div class="mj-quick-answer"><b>WHAT SHOULD WE CHANGE?</b><p>'+esc(note.next)+'</p></div>'+
        '<div class="mj-quick-answer"><b>DID IT WORK?</b>'+
          '<strong class="mj-quick-verdict '+esc(direction.tone)+'">'+
            esc(canCompare?direction.text:'NOT YET PROVEN')+'</strong>'+
          '<p>'+esc(metricDefs[key]?.label||'Tracked metric')+': Last '+
            esc(showMetric(key,lastMetric))+' · Now '+esc(showMetric(key,curr))+'</p>'+
          '<small>Trend only. A page edit has not been proven to cause this.</small></div>'+
      '</div>'+
      '<p class="mj-quick-legend"><span class="up">↑ GREEN · Improving</span>'+
        '<span class="down">↓ RED · Losing ground</span>'+
        '<span class="na">→ N/A · Not verified yet</span></p>'+
    '</article>';

    return '<section id="mjVisitorJourney" class="mission-journey-panel mj-swamp-map" aria-label="Swamp Visitor Journey Intelligence">'+
      '<div class="mj-swamp-trees" aria-hidden="true"></div>'+
      '<header class="mj-wood-header">'+
        '<div class="mj-wood-sign"><small>⚜ DOC JAKS · FOLLOW THE CURRENT ⚜</small>'+
          '<h2>VISITOR JOURNEY MAP</h2>'+
          '<p>FROM SEARCH AND SOCIAL DISCOVERY TO SALES</p></div>'+
        '<div class="mj-wood-score '+esc(scoreStyle)+'" role="group" aria-label="Owner direction: '+esc(scoreName)+'">'+
          '<span class="mj-direction-arrow '+esc(scoreStyle)+'" role="img" aria-label="'+esc(scoreArrowLabel)+
          '" title="'+esc(scoreArrowLabel)+'">'+esc(scoreArrow)+'</span>'+
          '<small>OWNER DIRECTION</small>'+
          '<strong>'+esc(score===null?'N/A':score)+'</strong>'+
          '<b>'+esc(scoreName)+'</b></div></header>'+
      '<button type="button" class="mj-daily-jump" data-mj-daily-open="1">OPEN '+esc(reportNames[period?.range]||'SELECTED')+' PERFORMANCE REPORT · 7 SECTIONS + GRAPHS ↓</button>'+ 
      '<div class="mj-boardwalk">'+
        '<svg class="mj-water-path" viewBox="0 0 1200 650" preserveAspectRatio="none" aria-hidden="true">'+
          '<path class="mj-path-shadow" d="M 75 160 C 285 70, 460 230, 610 130 S 1040 45, 1135 175 C 1180 290, 1170 390, 1080 490 S 750 590, 575 485 S 245 390, 90 530"/>'+
          '<path class="mj-path-planks" d="M 75 160 C 285 70, 460 230, 610 130 S 1040 45, 1135 175 C 1180 290, 1170 390, 1080 490 S 750 590, 575 485 S 245 390, 90 530"/>'+
        '</svg>'+
        first+second+third+musicPanel(music,owner)+fifth+
        '<div class="mj-lower-left" aria-label="Actions, social and owner bottom-line summary">'+
          seventh+socialPanel(social)+quickBrief+
        '</div>'+
      '</div>'+
      '<div class="mj-swamp-disclaimer">⚜ Every stop is a separate reported measurement. '+
        'Social Media and Music/Radio are independent discovery and entertainment channels, not steps every visitor takes. '+
        'Website Visits, Visitors, Page Views and listening connections count different things; no fabricated conversion funnel is implied.</div>'+
      dailyFullReport+
      '<details class="mj-map-evidence"><summary>OPEN SEARCH PHRASES, VISITED PAGES, CTAs &amp; OTHER EVIDENCE ▾</summary>'+
        evidence(seo,site,ga4)+'</details>'+
      testsPanel(site,seo,ga4,sales,period)+
      '<p class="mj-caveat">Meta views, likes and shares are current lifetime totals for posts published in the selected and preceding periods, not interactions on those dates. '+
      'Per-post Social comparisons are provisional; older posts have had longer to gain engagement. '+
      'Facebook and Instagram contribute up to 15 of the owner index’s 100 importance points only when comparable. '+
      'X is owner-entered and excluded from scoring. Google and Bing are combined only on matching reported dates. '+
      'Music listening is counted only when Radio.co verifies full current and previous UTC windows. '+
      'Music purchases already count in overall Wix paid sales and are never double-scored. '+
      'Wix website visits (sessions), estimated visitors, and CTA events remain separate.'+
      '</p>'+
      '<div class="mj-rougarou-eyes" aria-hidden="true"><i></i><i></i></div>'+
    '</section>';
  }
  window.djomsVisitorJourney=journey;
  function paintTop(){
    const slot=document.getElementById('missionJourneyTop');
    if(!slot||typeof websiteReportPeriod!=='function')return;
    try{
      const period=websiteReportPeriod();
      const site=typeof websiteSnapshot==='function'?websiteSnapshot():null;
      const correctSite=site?.range?.start===period?.start&&site?.range?.end===period?.end?
        site:null;
      const seo=report('seo',period),ga4=report('ga4',period),sales=report('sales',period);
      const social=typeof window.djomsSocialPeriod==='function'?
        window.djomsSocialPeriod(period):null;
      // Keep visitor drilldowns open when a verified source refreshes.
      const existingPostDetails=slot.querySelector('details.mj-post-traffic');
      if(existingPostDetails)postTrafficExpanded=existingPostDetails.open;
      const dailyWasOpen=slot.querySelector('#mjDailyReport')?.open===true||keepDailyReportOpen;
      const openDropdowns=new Set([...slot.querySelectorAll('details.mj-stage-dropdown[open]')]
        .map(item=>item.dataset.mjDropdown).filter(Boolean));
      slot.innerHTML=journey({site:correctSite,seo,ga4,sales,period,social});
      fetchReportHistory({site:correctSite,seo,ga4,sales,period,social});
      if(dailyWasOpen&&slot.querySelector('#mjDailyReport')){
        slot.querySelector('#mjDailyReport').open=true;
        keepDailyReportOpen=true;
      }
      loadSongLikes();
      for(const detail of slot.querySelectorAll('details.mj-stage-dropdown')){
        if(openDropdowns.has(detail.dataset.mjDropdown))detail.open=true;
      }
    }catch(error){
      slot.innerHTML='<p class="mj-loading">Visitor Journey could not be verified for these dates. '+
        'The original six performance boxes remain available below.</p>';
    }
  }
  const original=window.renderConnectionStrip;
  if(typeof original==='function'){
    window.renderConnectionStrip=function(...args){
      const result=original.apply(this,args);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control'){
        paintTop();
        void loadTests();
      }
      return result;
    };
  }
  document.addEventListener('djoms:verified-report',()=>{
    if(typeof activeView!=='undefined'&&activeView==='Mission Control')paintTop();
  });
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

  // Capture before the app's existing date-selection handler rebuilds the
  // Mission Control DOM. This preserves the report panel across periods.
  document.addEventListener('click',event=>{
    const old=document.getElementById('mjDailyReport');
    if(event.target.closest?.('#mjDailyReport > summary')){
      keepDailyReportOpen=old?.open===false;
    }else if(event.target.closest?.('#mjDailyReport [data-website-range], #mjDailyReport [data-website-custom]')){
      keepDailyReportOpen=true;
    }else if(event.target.closest?.('[data-website-range], [data-website-custom]')){
      keepDailyReportOpen=old?.open===true||keepDailyReportOpen;
    }else if(event.target.closest?.('[data-mj-daily-open]')){
      keepDailyReportOpen=true;
    }
  },true);

  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-mj-daily-open]')){
      const detail=document.getElementById('mjDailyReport');
      if(detail){
        detail.open=true;
        keepDailyReportOpen=true;
        detail.scrollIntoView({behavior:'smooth',block:'start'});
      }
    }
    if(event.target.closest?.('[data-mj-daily-print]')){
      const detail=document.getElementById('mjDailyReport');
      if(detail)detail.open=true;
      window.print();
    }
  });
  document.addEventListener('click',async e=>{
    const button=e.target.closest?.('[data-mj-copy-post]');
    if(!button)return;
    e.preventDefault();
    const period=typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
    const report=period?postReferralsCache.get(period.query)?.data:null;
    const row=report?.rows?.find(item=>
      item.recordId===button.dataset.mjCopyPost&&
      item.platform===button.dataset.mjCopyPlatform);
    if(!row?.trackingUrl){
      if(typeof notice==='function')notice('The special tracking link is not ready yet.',true);
      return;
    }
    try{
      await navigator.clipboard.writeText(row.trackingUrl);
      if(typeof notice==='function')notice('Copied the unique '+row.platform+
        ' link. Visits using this URL will be included in Wix website traffic.');
    }catch{
      if(typeof notice==='function')notice('Clipboard unavailable. Open the post record and copy its tracking link.',true);
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
