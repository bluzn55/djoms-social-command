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
  function miniMetric(label,last,current,unit='count',inverse=false){
    const motion=movement(last,current,inverse);
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
      const lastClicks=engine.previous?.clicks,currClicks=engine.current?.clicks;
      const engineCtr=valid(now)&&now>0&&valid(currClicks)?currClicks/now:null;
      const clickChange=movement(lastClicks,currClicks);
      return '<div class="mj-dropdown-row mj-engine-detail-row">'+
        '<span class="mj-dropdown-rank">'+esc(i+1)+'.</span>'+
        '<span class="mj-dropdown-desc"><strong>'+esc(engine.name)+'</strong>'+
        '<small>LAST '+esc(number(prev))+' · CURRENT '+esc(number(now))+
          ' · <b class="'+esc(diff.tone)+'">'+esc(diff.text)+'</b></small>'+
        '<small>SEARCH CLICKS: L '+esc(number(lastClicks))+' / C '+esc(number(currClicks))+
          ' · <b class="'+esc(clickChange.tone)+'">'+esc(clickChange.text)+'</b></small>'+
        '<small>Search CTR '+esc(formatValue(engineCtr,'percentage'))+
          ' · Average position '+esc(engine.id==='google'?
            formatValue(engine.positionCurrent,'position'):'N/A')+'</small></span>'+
        '<span class="mj-dropdown-stat"><b>'+esc(number(now))+'</b><small>appearances</small></span></div>';
    });
    const intro=search?.status==='reported'
      ?'Top reporting engines ranked by verified search appearances. Only engines with actual positive search appearances or clicks are listed. '+
       'The combined total uses exactly '+search.scope+
       '. Range '+(search.currentRange?.start||'N/A')+' to '+(search.currentRange?.end||'N/A')+
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
        'Google result clicks '+number(p.clicks)+pagesText,
        number(p.impressions),'appearances',i);
    });
    const pageRows=pages.map((p,i)=>mapDetailRow('RESULT PAGE: '+named(p.page),
      'Google clicks '+number(p.clicks)+' · Page shown in search results',
      number(p.impressions),'appearances',i+termRows.length));
    const rows=[...termRows,...pageRows];
    const context='Google Search Console: '+number(impressions)+' reported Google appearances, '+
      number(clicks)+' clicks. Phrases show what people typed when Google discloses it; '+
      'result pages show which Doc Jaks pages appeared. Google hides some searches. '+
      'Phrase and page counts overlap and must not be added together or to the engine totals.';
    let empty='Google has not reported individual search phrases or result pages for the selected dates.';
    if(connected&&valid(impressions)&&impressions>0&&clicks===0)
      empty='Google reported '+number(impressions)+' search appearances and zero clicks, '+
        'but did not disclose individual phrase or page details for this period.';
    return mapDropdown('google-phrases','GOOGLE SEARCH PHRASES & RESULT PAGES',
      rows,context,empty);
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
          search.scope+' ('+(search.currentRange?.start||'N/A')+
          ' through '+(search.currentRange?.end||'N/A')+
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
    return card('social','7','SOCIAL MEDIA','♟',
      '<div class="mj-social-inner">'+rows+'</div>'+
      '<div class="mj-social-impact"><strong>SOCIAL HEALTH · '+(socialEvidence?'COUNTS':'N/A')+'</strong>'+
        '<small>'+esc('15 of 100 points when FB/IG are comparable. X is manual only.')+'</small></div>',
      'Social is a second discovery current, not a continuation of Google clicks. Meta figures are current lifetime totals on posts published in each period.');
  }
  // #5 MUSIC is the existing verified music reporting, brought INTO the
  // numbered boardwalk. This function never infers plays from Wix page visits
  // or link clicks, and music sales remain scored in SALES only.
  function musicPanel(music,owner){
    const ms=owner?.stages?.find(stage=>stage.id==='music');
    const score=Number.isInteger(ms?.score)?ms.score:null;
    const grade=score===null?'N/A':String(score);
    const historic=music?.radioImport;
    const radioDates=historic?.start&&historic?.end?
      historic.start+' to '+historic.end+' (UTC)':'Not imported';
    const current=music?.current,previous=music?.previous;
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
    return card('music','5','MUSIC / RADIO / STREAMING','♫',
      '<div class="mj-music-score-line">'+
        '<span class="mj-music-score">MUSIC HEALTH <b>'+esc(grade)+
          '</b><small>10 of 100 points, when listening is verified</small></span>'+
        '<small>Independent listening activity, not radio-site clicks</small></div>'+
      heroMetric('RADIO.CO STREAM CONNECTIONS',previous?.connections,current?.connections,
        'count',false,'Imported Radio.co CSV for the selected UTC dates; connections are not unique listeners.')+
      '<div class="mj-minis">'+
        miniMetric('TOTAL LISTENING TIME',previous?.seconds,current?.seconds,'time')+
      '</div>'+
      '<div class="mj-music-grid">'+
        row('PAID MUSIC UNITS',formatValue(music?.musicUnits),
          'Wix Music category · counted in #6 Sales')+
        row('PAID MUSIC SALES',formatValue(music?.musicItemSalesCents,'cents'),
          'Wix Music category · counted in #6 Sales')+
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
    const first=card('search','1','SEARCH APPEARANCES','⌕',
      heroMetric('Verified engine appearances',search?.previous,
        search?.current,'count',false,'Google and Bing combined ONLY when their reported dates match.')+
      '<div class="mj-small-splits">'+
        miniMetric('COMBINED CTR',search?.ctrPrevious,search?.ctrCurrent,'percentage')+
        miniMetric('GOOGLE POSITION',search?.positionPrevious,search?.positionCurrent,'position',true)+'</div>'+
      searchEnginesDropdown(search)+searchAppearancesDetails(seo),
      'Reporting engines: '+(search?.scope||'N/A')+
      '. Google position is not an average across engines.');
    const second=card('clicks','2','SEARCH CLICKS','↖',
      heroMetric('Verified engine clicks',search?.clicksPrevious,search?.clicksCurrent,'count',false,
        'Clicks reported by the same search engines and dates as Box 1.')+
      '<div class="mj-card-branches"><span>✖ No Click</span><span>✓ Clicked Doc Jaks</span></div>'+
      clicksByEngineDropdown(search),
      'Click totals are from the engines included in #1. Search phrases and result pages appear under #1. Wix visits are separate.');
    // #3 is the actual WEBSITE ARRIVAL stage, regardless of whether the
    // visitor came from search, social, referral, or a direct connection.
    // Visitors are Wix estimates of distinct browsers, NOT identified people
    // nor a verified match to a specific search click.
    const third=card('traffic','3','WEBSITE VISITS','⌖',
      heroMetric('TOTAL WEBSITE VISITS',traffic.sessions.last,traffic.sessions.now,'count',
        false,'All Wix-reported sessions, including direct and identifiable referral visits.')+
      '<div class="mj-minis">'+
        miniMetric('WEBSITE VISITORS',priorVisitors,wix?site.visitors:null)+
        miniMetric('RETURNING VISITORS',wixCmp.returningVisitors?.previous,
          wixCmp.returningVisitors?.current)+'</div>'+
      wixSourcesDropdown(site)+
      (typeof window.djomsSupporterPanel==='function'?
        window.djomsSupporterPanel(period):'')+
      locationsDropdown(site),
      'Visits count sessions; Visitors estimate distinct browsers/devices. '+
      'Not every visit came from a link click, and one visitor can make several visits.');
    // #4 unifies where people went and how they engaged. Metrics remain
    // distinct Wix measures; they are never summed into a fabricated total.
    const fourth=card('visitors','4','PAGES & ENGAGEMENT','◷',
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
    const eighth=card('actions','8','MEANINGFUL ACTIONS','✦',
      '<div class="mj-minis">'+
        miniMetric('INQUIRIES',contactsLast,contactsNow)+
        miniMetric('PIT KREWE',null,null)+
        miniMetric('RADIO LISTENERS',null,null)+
        miniMetric('FILE DOWNLOAD EVENTS',
          previousEvents.fileDownload?.previous,gaEvent.fileDownload)+'</div>',
      'Actual listeners and confirmed Pit Krewe members remain N/A until their own proof is connected.');
    const sixth=card('sales','6','PAID WEB SALES','▣',
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
      '<div class="mj-boardwalk">'+
        '<svg class="mj-water-path" viewBox="0 0 1200 650" preserveAspectRatio="none" aria-hidden="true">'+
          '<path class="mj-path-shadow" d="M 75 160 C 285 70, 460 230, 610 130 S 1040 45, 1135 175 C 1180 290, 1170 390, 1080 490 S 750 590, 575 485 S 245 390, 90 530"/>'+
          '<path class="mj-path-planks" d="M 75 160 C 285 70, 460 230, 610 130 S 1040 45, 1135 175 C 1180 290, 1170 390, 1080 490 S 750 590, 575 485 S 245 390, 90 530"/>'+
        '</svg>'+
        first+second+third+fourth+musicPanel(music,owner)+sixth+socialPanel(social)+eighth+
      '</div>'+
      '<div class="mj-swamp-disclaimer">⚜ Every stop is a separate reported measurement. '+
        'Social Media and Music/Radio are independent discovery and entertainment channels, not steps every visitor takes. '+
        'Website Visits, Visitors, Page Views and listening connections count different things; no fabricated conversion funnel is implied.</div>'+
      '<div class="mj-decision-heading"><span>⚜ THE FOUR QUESTIONS THAT TURN DATA INTO DECISIONS ⚜</span></div>'+
      '<div class="mj-intelligence">'+
        '<article><h3>1. WHAT HAPPENED?</h3><p>'+esc(note.evidence)+
          '</p><small>Recorded evidence</small></article>'+
        '<article><h3>2. WHY?</h3><p>'+esc(note.why)+
          '</p><small>HYPOTHESIS · '+esc(note.confidence)+'</small></article>'+
        '<article><h3>3. WHAT DO WE CHANGE?</h3><p>'+esc(note.next)+
          '</p><small>Suggested improvement to test</small></article>'+
        '<article><h3>4. DID IT WORK?</h3><strong class="mj-trend '+esc(direction.tone)+'">'+
          esc(canCompare?direction.text:'NOT YET PROVEN')+'</strong>'+
          '<p>'+esc(metricDefs[key]?.label||'Tracked metric')+': Last '+esc(showMetric(key,lastMetric))+
          ' · Current '+esc(showMetric(key,curr))+'</p>'+
          '<small>Observed change is not proof that a specific page edit caused it.</small></article>'+
      '</div>'+
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
      const openDropdowns=new Set([...slot.querySelectorAll('details.mj-stage-dropdown[open]')]
        .map(item=>item.dataset.mjDropdown).filter(Boolean));
      slot.innerHTML=journey({site:correctSite,seo,ga4,sales,period,social});
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
