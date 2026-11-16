/* Doc Jaks · artwork-based Social Command.
   Presentation only: consumes the same selected-date reports as Mission Control.
   This file never fetches, invents measurements, or treats missing data as zero. */
(function organicCommandModule(){
  'use strict';
  const ASSET='/assets/organic-command.webp';
  const CHAPTER_PDF='https://www.docjaks.com/_files/ugd/cf21c8_27ee63f049e5479b8d37c885f638bb2b.pdf';
  const WIDTH=1199,HEIGHT=1312;
  const state={root:null,slot:null,context:null,model:null,selectedPath:null,platform:'facebook',promotionPlatform:'all',arrivalGroup:'all',arrivalPlatform:'all',entryPath:null,drawer:null,action:null,lastTrigger:null};
  let fitFrame=0,fitObserver=null;
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const count=n=>valid(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n):'—';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sameRange=(a,b)=>!!a&&!!b&&typeof a.start==='string'&&typeof a.end==='string'&&
    /^\d{4}-\d{2}-\d{2}$/.test(a.start)&&/^\d{4}-\d{2}-\d{2}$/.test(a.end)&&
    a.start<a.end&&a.start===b.start&&a.end===b.end;
  const report=(name,period)=>{
    const entry=window.djomsVerifiedReports?.[name];
    return period?.query&&entry?.query===period.query?entry.data:null;
  };
  const safely=(fn,...args)=>{try{return typeof fn==='function'?fn(...args):null;}catch{return null;}};
  function pathOf(value){
    const raw=String(value??'').trim();
    if(!raw)return null;
    try{
      const url=new URL(raw,'https://www.docjaks.com');
      if(!['https:','http:'].includes(url.protocol)||!['docjaks.com','www.docjaks.com'].includes(url.hostname.toLowerCase()))return null;
      return (url.pathname||'/').replace(/\/$/,'')||'/';
    }catch{return null;}
  }
  function pageName(path){
    const clean=pathOf(path);
    if(!clean)return 'Unreported page';
    const names={'/':'Home','/outlaw-radio-5150':'Outlaw Radio 5150','/the-wooden-token':'The Wooden Token','/sm-welcome':'SM Welcome','/trading-post':'Trading Post','/music-hall':'Music Hall','/ember-hall':'Ember Hall'};
    if(names[clean])return names[clean];
    return safely(window.wName,clean)||clean.slice(1).replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }
  // Keep the full page identity in details and accessibility labels. The
  // instrument only needs the readable name, without a CMS category prefix.
  const boardPageName=path=>pageName(path).replace(/^Category\s*\/\s*/i,'');
  const boardEngineName=engine=>({google:'Google',bing:'Bing'}[String(engine.id||'').toLowerCase()]||String(engine.name||'Search engine').replace(/\s*\([^)]*\)\s*/g,'').trim());
  function duration(value){
    if(!valid(value))return '—';
    const seconds=Math.round(value),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
    return hours?hours+'h '+minutes+'m':minutes?minutes+'m '+rest+'s':rest+'s';
  }
  function percent(value){
    if(!valid(value)||value>1)return '—';
    const n=value*100;
    return n.toFixed(n<10?1:0)+'%';
  }
  function money(value,currency='USD'){
    if(!Number.isSafeInteger(value)||value<0)return '—';
    try{return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(value/100);}catch{return '—';}
  }
  const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.slice(5,7)+'/'+value.slice(8,10)+'/'+value.slice(0,4):'—';
  const windowLabel=p=>p?.start&&p?.endInclusive?dateLabel(p.start)+' – '+dateLabel(p.endInclusive):'Choose reporting dates';
  const knownNumber=(source,key)=>source&&valid(source[key])?source[key]:null;
  const unknown=reason=>({value:null,reason});
  const metric=(value,reason)=>({value:valid(value)?value:null,reason:valid(value)?'':reason});
  const arrivalLabels={search:'Search',olr5150:'OLR5150 social posts',docjaks:'Other Doc Jaks social posts',social_unclassified:'Unclassified social',other:'Direct & other sources'};
  const platformLabels={facebook:'Facebook',instagram:'Instagram',x:'X',youtube:'YouTube'};

  function modelFor(context){
    const period=context?.period||{};
    const site=context?.site?.connected===true&&sameRange(context.site.range,period)?context.site:null;
    const matchingReport=name=>{
      const supplied=context?.[name],saved=report(name,period);
      return sameRange(supplied?.range,period)?supplied:sameRange(saved?.range,period)?saved:null;
    };
    const seo=matchingReport('seo'),ga4=matchingReport('ga4'),sales=matchingReport('sales');
    const bing=matchingReport('bing');
    const savedChapter=report('chapter',period);
    const chapter=savedChapter?.connected===true&&savedChapter.target===CHAPTER_PDF&&
      savedChapter.measuresReading===false&&Array.isArray(savedChapter.buttons)&&
      sameRange({start:savedChapter.range?.requestedStart||savedChapter.range?.start,end:savedChapter.range?.end},period)?savedChapter:null;
    const savedReading=safely(window.djomsChapterReadingData,period);
    const reading=savedReading?.connected===true&&savedReading.mode==='active-reading-sessions'&&
      savedReading.range?.start===period.start&&savedReading.range?.end===period.endInclusive?savedReading:null;
    const search=safely(window.djomsCombinedSearch,{seo,bing,period});
    const searchReady=search?.status==='reported';
    const siteReason=site?'Wix did not return this measurement for the selected dates.':'A matching Wix website report is not available for the selected dates.';
    const rawPages=site&&Array.isArray(site.topPages)?site.topPages:null;
    const pageGroups=new Map();
    for(const row of rawPages||[]){
      const path=pathOf(row?.path);if(!path)continue;
      const group=pageGroups.get(path)||[];group.push(row);pageGroups.set(path,group);
    }
    // URL query variants belong to one page. View events can be added, but
    // visitors, sessions and averages cannot safely be combined from aggregates.
    const pages=[...pageGroups].map(([path,variants])=>variants.length===1?
      {...variants[0],path,variants}: {path,variants,
        views:variants.every(p=>valid(p.views))?variants.reduce((sum,p)=>sum+p.views,0):null,
        visitors:null,sessions:null,avgTimeSeconds:null,bounceRate:null})
      .sort((a,b)=>(valid(b.views)?b.views:-1)-(valid(a.views)?a.views:-1)||a.path.localeCompare(b.path));
    const landingGroups=new Map();
    for(const row of site?.landingPages||[]){
      const path=pathOf(row?.path);if(!path||!valid(row.sessions))continue;
      landingGroups.set(path,(landingGroups.get(path)||0)+row.sessions);
    }
    const landings=[...landingGroups].map(([path,sessions])=>({path,sessions})).sort((a,b)=>b.sessions-a.sessions);
    const sourceRows=site&&Array.isArray(site.trafficSources)?site.trafficSources.filter(p=>valid(p?.sessions)):[];
    const sourceComplete=!!site&&Array.isArray(site.trafficSources)&&site.trafficSourcesComplete===true&&sourceRows.length===site.trafficSources.length&&(!valid(site.sessions)||sourceRows.reduce((n,r)=>n+r.sessions,0)===site.sessions);
    const radioRows=sourceRows.filter(row=>safely(window.djomsOutlawRadioReferral,row)===true);
    const radioReferrals=sourceComplete&&typeof window.djomsOutlawRadioReferral==='function'?radioRows.reduce((n,r)=>n+r.sessions,0):null;
    const radioReport=safely(window.djomsRadioListenerData,period);
    const radioMatched=radioReport?.status==='reported'&&sameRange(radioReport.range,period);
    const radio=radioMatched?radioReport:null,summary=radio?.summary||null;
    const connections=summary?.overviewComplete===true?knownNumber(summary,'connections'):null;
    const listeningSeconds=summary?.listeningComplete===true?knownNumber(summary,'listeningSeconds'):null;
    const averageListening=valid(connections)&&connections>0&&valid(listeningSeconds)?listeningSeconds/connections:null;
    const social=context?.social||null;
    const platforms={};
    for(const key of ['facebook','instagram','x','youtube']){
      const row=social?.platforms?.[key],manual=key==='x',available=!!row&&social?.status==='reported';
      const now={};
      for(const field of ['views','clicks','reactions','comments','shares'])now[field]=available&&valid(row.now?.[field])?row.now[field]:null;
      const has=Object.values(now).some(valid);
      platforms[key]={name:{facebook:'Facebook',instagram:'Instagram',x:'X',youtube:'YouTube'}[key],key,now,
        currentPosts:available&&valid(row.currentPosts)?row.currentPosts:null,
        verified:row?.verified===true&&available,manual,has,
        sourceNote:manual?'Owner-entered records. Not live X analytics.':row?.sourceNote||(has?'Reported post measurements for the selected publishing dates.':'No matching measured platform report has been supplied.'),
        reason:has?'':key==='youtube'?'A matching YouTube analytics report is not available in this report feed.':social?.error||'Measured platform totals are unavailable for these publishing dates.'};
    }
    // Meta's helper returns each current metric only after current-cohort
    // inventory and field coverage pass. Its row.verified flag also requires
    // prior inventory, which is not needed to total the current snapshots.
    // Manual X stays separate; another feed must explicitly verify its cohort.
    const measuredPlatforms=Object.values(platforms).filter(p=>!p.manual&&
      (['facebook','instagram'].includes(p.key)||p.verified));
    const socialTotals={};
    for(const field of ['views','clicks']){
      const included=measuredPlatforms.filter(p=>valid(p.now[field]));
      const excluded=Object.values(platforms).filter(p=>p.manual);
      const missing=Object.values(platforms).filter(p=>!p.manual&&!included.includes(p));
      const value=included.length?included.reduce((sum,p)=>sum+p.now[field],0):null;
      socialTotals[field]={value:valid(value)?value:null,included,missing,excluded,
        status:!valid(value)?'unavailable':missing.length||excluded.length?'partial':'complete'};
    }
    const socialCoverage=Object.values(socialTotals).every(t=>t.status==='complete')?'complete':
      Object.values(socialTotals).some(t=>valid(t.value))?'partial':'unavailable';
    const arrivalReport=matchingReport('arrivalGroups');
    const arrivalRows=Array.isArray(arrivalReport?.groups)?arrivalReport.groups:[];
    const arrivalReady=arrivalReport?.status==='reported'&&arrivalReport.complete===true&&Array.isArray(arrivalReport.landingPages)&&
      arrivalReport.coverage?.reconciled===true&&valid(arrivalReport.totalVisits)&&
      arrivalRows.length===Object.keys(arrivalLabels).length&&
      Object.keys(arrivalLabels).every(id=>arrivalRows.filter(row=>row.id===id).length===1)&&
      arrivalRows.every(row=>valid(row.visits))&&
      arrivalRows.reduce((sum,row)=>sum+row.visits,0)===arrivalReport.totalVisits;
    const arrivals=Object.fromEntries(Object.entries(arrivalLabels).map(([id,label])=>{
      const row=arrivalRows.find(row=>row.id===id);
      return [id,{...row,id,label,visits:arrivalReady?row.visits:null,
        landingPages:Array.isArray(row?.landingPages)?row.landingPages:[],
        platforms:Array.isArray(row?.platforms)?row.platforms:[],
        posts:Array.isArray(row?.posts)?row.posts:[]}];
    }));
    const promotionGroups=social?.promotionGroups||{};
    const paid=sales?.connected===true&&sales?.complete===true&&sameRange(sales.range,period);
    const currency=paid&&typeof sales.currency==='string'?sales.currency:'USD';
    const actionsReady=ga4?.status==='connected'&&sameRange(ga4.range,period)&&ga4.actions?.status==='reported';
    const actionCounts=actionsReady?ga4.actions.counts||{}:{};
    const transitionReady=ga4?.status==='connected'&&sameRange(ga4.range,period)&&ga4.journey?.pageTransitions?.status==='reported';
    const transitions=transitionReady&&Array.isArray(ga4.journey.pageTransitions.rows)?ga4.journey.pageTransitions.rows.filter(r=>pathOf(r?.from)&&pathOf(r?.to)&&valid(r.views)).map(r=>({...r,from:pathOf(r.from),to:pathOf(r.to)})):[];
    const music=safely(window.djomsMusicEvidence,{period,sales});
    const owner=safely(window.djomsOwnerScore,site,ga4,seo,sales,period,social,music);
    const score=Number.isInteger(owner?.score)?owner.score:null;
    const improved=(owner?.stages||[]).filter(s=>Number.isInteger(s.score)&&s.score>100).sort((a,b)=>b.score-a.score);
    const declined=(owner?.stages||[]).filter(s=>Number.isInteger(s.score)&&s.score<100).sort((a,b)=>a.score-b.score);
    const gaps=[];
    if(!searchReady)gaps.push('search');
    if(!site)gaps.push('website');
    if(!summary?.overviewComplete||!summary?.listeningComplete)gaps.push('radio import');
    if(!paid)gaps.push('paid sales');
    if(!actionsReady)gaps.push('actions');
    const next=declined.length?'Review '+String(declined[0].name||'the declining measure').toLowerCase():gaps.length?'Check '+gaps[0]+' coverage':improved.length?'Build on '+String(improved[0].name||'the strongest signal').toLowerCase():'Watch the next reporting period';
    return {period,site,seo,ga4,sales,search,bing,chapter,reading,pages,rawPages,landings,sourceRows,sourceComplete,radio,summary,platforms,social,socialTotals,socialCoverage,promotionGroups,arrivalReport,arrivalReady,arrivals,paid,currency,actionsReady,actionCounts,transitions,transitionReady,owner,score,improved,declined,gaps,next,
      appearances:metric(searchReady?search.current:null,search?.note||'No matching search-engine appearance report.'),
      searchClicks:metric(searchReady?search.clicksCurrent:null,search?.note||'No matching search-engine click report.'),
      visits:metric(arrivalReady?arrivalReport.totalVisits:knownNumber(site,'sessions'),siteReason),
      entryPages:metric(arrivalReady?arrivalReport.entryPageCount:site?.landingPagesComplete===true&&site?.entryPageCoverage?.status==='reported'?
        knownNumber(site,'distinctEntryPages'):null,site?.entryPageCoverage?.note||'A complete landing-page report must reconcile with the selected website visits before pages reached can be counted.'),
      connections:metric(connections,radio?'The imported Overview does not cover every selected UTC day.':'No matching Radio.co import is available for these dates.'),
      averageListening:metric(averageListening,!radio?'No matching Radio.co import is available.':connections===0?'No stream connections were recorded; average listening is undefined.':'Complete imported connection and listening-time coverage is required.'),
      listeningSeconds:metric(listeningSeconds,radio?'The imported listening-time report does not cover every selected UTC day.':'No matching Radio.co import is available.'),
      radioReferrals:metric(radioReferrals,'A complete matched Wix traffic-source report is needed to establish radio-origin website visits.'),
      gross:metric(paid?sales.itemSalesCents:null,'The complete paid Wix order report is not available for these dates.'),
      orders:metric(paid?sales.paidOrders:null,'The complete paid Wix order report is not available for these dates.')};
  }

  function rect(x,y,w,h){return 'left:'+(100*x/WIDTH).toFixed(3)+'%;top:'+(100*y/HEIGHT).toFixed(3)+'%;width:'+(100*w/WIDTH).toFixed(3)+'%;height:'+(100*h/HEIGHT).toFixed(3)+'%';}
  const fields=[
    ['appearances',150,173,170,39,'oc-search-value'],['searchClicks',129,311,188,58,'oc-search-clicks'],
    ['searchEngines',117,237,240,21,'oc-engine-label'],
    ['searchArrivals',131,394,190,16,'oc-source-caption'],
    ['visits',350,519,208,38,'oc-arrival-value'],['entryPages',655,519,175,38,'oc-arrival-value'],
    ['selectedName',428,800,322,28,'oc-selected-name'],['pageViews',246,861,175,44,'oc-page-value'],['pageTime',492,861,196,44,'oc-page-value oc-time-value'],['pageBounce',772,861,149,44,'oc-page-value'],
    ['gross',184,1014,237,54,'oc-odometer'],['orders',450,1012,80,37,'oc-orders-value'],
    ['working',248,1183,235,34,'oc-verdict'],['attention',526,1183,231,34,'oc-verdict'],['next',792,1183,262,34,'oc-verdict'],
    ['reportBadge',900,27,247,20,'oc-report-badge'],['reportFooter',412,1243,357,27,'oc-report-footer']
  ];
  const covers=[
    ['Search clicks',137,369,177,22,''],
    ['3. OLR5150 SOCIAL POSTS',417,264,322,26,'oc-heading-cover'],
    ['4. OTHER DOC JAKS SOCIAL',821,264,278,26,'oc-heading-cover'],
    ['Website visits',345,556,215,24,''],['First pages opened',638,556,200,24,'oc-entry-label'],
    ['All arrivals · open source breakdown',380,585,439,25,'oc-dark-label'],
    ['Reported actions · open for evidence',698,1068,368,24,'oc-action-label']
  ];
  const selectorRects=[[198,694,185,104],[413,699,174,96],[608,698,174,99],[806,697,185,100]];
  const sections=[
    ['search','1. Search Engines',110,111,258,150],['clicks','2. Result Clicks',106,264,244,147],
    ['radio','3. OLR5150 Social Posts',401,262,351,149],['social','4. Other Doc Jaks Social Posts',805,262,304,149],
    ['arrivals','5. Website Arrivals',321,463,539,122],['journey','6. Website Journey',353,633,475,54],
    ['sales','7. Paid Web Sales — Gross',133,964,409,119],['actions','8. Meaningful Actions',679,964,413,34],
    ['bottom','9. Bottom Line',220,1100,857,125]
  ];
  function promotionInstrument(id,x,y,w,h){
    return '<div class="oc-promotion-instrument" data-oc-promotion="'+id+'" style="'+rect(x,y,w,h)+'">'+
      '<div class="oc-promotion-platforms">'+Object.entries(platformLabels).map(([key,label])=>'<button type="button" data-oc-group="'+id+'" data-oc-group-platform="'+key+'" aria-label="'+esc(arrivalLabels[id]+' — '+label+' details')+'"><i aria-hidden="true"></i><span class="oc-fit-region">'+label+'</span></button>').join('')+'</div>'+
      '<div class="oc-promotion-stats">'+[['views','Post views'],['clicks','Link clicks'],['visits','Website visits']].map(([key,label])=>'<button type="button" data-oc-group="'+id+'" '+(key==='visits'?'data-oc-arrival-group="'+id+'"':'')+'><span class="oc-fit-region">'+label+'</span><strong class="oc-fit-region" data-oc-group-value="'+key+'">—</strong></button>').join('')+'</div>'+
      '<button type="button" class="oc-promotion-details" data-oc-group="'+id+'"><span class="oc-fit-region">Platform &amp; post details</span></button></div>';
  }

  function scaffold(slot){
    const root=document.createElement('section');root.id='djOrganicCommand';root.setAttribute('aria-label','Doc Jaks Social Command Center');
    root.innerHTML='<div class="oc-board">'+
      '<img class="oc-art" src="'+ASSET+'" alt="" width="1199" height="1312" decoding="async" fetchpriority="high">'+
      '<div class="oc-art-error" hidden>The command artwork could not load. The report instruments below remain available.</div>'+
      fields.map(([key,x,y,w,h,cl])=>'<span class="oc-readout '+cl+'" data-oc-value="'+key+'" style="'+rect(x,y,w,h)+'" aria-hidden="true">—</span>').join('')+
      covers.map(([text,x,y,w,h,cl])=>'<span class="oc-label-cover '+cl+'" style="'+rect(x,y,w,h)+'" aria-hidden="true">'+esc(text)+'</span>').join('')+
      sections.map(([key,label,x,y,w,h])=>'<button type="button" class="oc-hotspot oc-section" data-oc-section="'+key+'" aria-label="'+esc(label)+' — open reported data" style="'+rect(x,y,w,h)+'"></button>').join('')+
      promotionInstrument('olr5150',405,300,343,112)+promotionInstrument('docjaks',810,300,300,112)+
      selectorRects.map(([x,y,w,h],i)=>'<button type="button" class="oc-hotspot oc-page-selector" data-oc-page-index="'+i+'" style="'+rect(x,y,w,h)+'" aria-pressed="false"><span class="oc-selector-name">—</span><span class="oc-selector-count">—</span></button>').join('')+
      '<button type="button" class="oc-hotspot oc-details-button" data-oc-section="journey" style="'+rect(286,912,279,40)+'" aria-label="Page details and next stops"></button>'+
      '<button type="button" class="oc-hotspot oc-details-button" data-oc-section="pages" style="'+rect(638,914,244,38)+'" aria-label="View all reported pages"></button>'+
      [['read',666,1007,125,51],['listen',810,1007,128,51],['join',959,1007,130,51]].map(([key,x,y,w,h])=>'<button type="button" class="oc-hotspot" data-oc-action="'+key+'" style="'+rect(x,y,w,h)+'" aria-label="'+esc(key)+' — meaningful action evidence"></button>').join('')+
      '<button type="button" class="oc-hotspot" data-oc-section="coverage" aria-label="Report source coverage and dates" style="'+rect(886,21,276,39)+'"></button>'+
      '</div><nav class="oc-mobile-nav" aria-label="Open a readable command instrument">'+sections.map(([key,label])=>'<button type="button" data-oc-section="'+key+'">'+esc(label)+'</button>').join('')+'</nav>'+
      '<p class="oc-source-note" data-oc-source-note></p>'+
      '<section class="oc-drawer" aria-labelledby="ocDrawerTitle" hidden><header class="oc-drawer-header"><div><p class="oc-drawer-kicker">DOC JAKS · REPORTED EVIDENCE</p><h2 id="ocDrawerTitle"></h2></div><div class="oc-drawer-actions"><button type="button" class="oc-brass-button" data-oc-export>Download CSV</button><button type="button" class="oc-close" data-oc-close aria-label="Close this instrument">Close ×</button></div></header><div class="oc-drawer-body"></div></section>'+
      '<div class="oc-sr" aria-live="polite" data-oc-announcement></div>';
    slot.replaceChildren(root);state.root=root;state.slot=slot;
    fitObserver?.disconnect();
    if(typeof ResizeObserver==='function'){
      fitObserver=new ResizeObserver(scheduleFit);
      fitObserver.observe(root.querySelector('.oc-board'));
    }
    root.querySelector('.oc-art').addEventListener('error',()=>{root.classList.add('oc-no-art');root.querySelector('.oc-art-error').hidden=false;});
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||!root.contains(button))return;
      if(button.hasAttribute('data-oc-close')){state.drawer=null;root.querySelector('.oc-drawer').hidden=true;state.lastTrigger?.isConnected&&state.lastTrigger.focus();return;}
      if(button.hasAttribute('data-oc-export')){downloadEvidence();return;}
      if(button.hasAttribute('data-oc-arrival-group')){
        const id=button.dataset.ocArrivalGroup;
        state.arrivalGroup=id==='all'||Object.hasOwn(arrivalLabels,id)?id:'all';
        state.arrivalPlatform=['olr5150','docjaks'].includes(state.arrivalGroup)&&Object.hasOwn(platformLabels,button.dataset.ocArrivalPlatform)?button.dataset.ocArrivalPlatform:'all';
        state.entryPath=null;state.drawer='arrivals';state.lastTrigger=button;paintDrawer(true);return;
      }
      if(button.hasAttribute('data-oc-entry-page')){state.entryPath=pathOf(button.dataset.ocEntryPage);state.drawer='arrivals';paintDrawer();return;}
      if(button.hasAttribute('data-oc-entry-back')){state.entryPath=null;paintDrawer();return;}
      if(button.hasAttribute('data-oc-group')){
        state.drawer=button.dataset.ocGroup==='olr5150'?'radio':'social';
        state.promotionPlatform=Object.hasOwn(platformLabels,button.dataset.ocGroupPlatform)?button.dataset.ocGroupPlatform:'all';
        state.lastTrigger=button;paintDrawer(true);return;
      }
      if(button.hasAttribute('data-oc-radio-import')){
        const reports=document.getElementById('organicFullReports');
        const target=reports?.querySelector('.mj-radio-intel .rli-import-details');
        if(reports)reports.open=true;
        for(let node=target;node&&node!==reports;node=node.parentElement){if(node.tagName==='DETAILS')node.open=true;}
        (target||reports)?.scrollIntoView({behavior:'smooth',block:'start'});
        target?.querySelector('[data-rli-kind]')?.focus({preventScroll:true});return;
      }
      if(button.hasAttribute('data-oc-page-index')){
        const page=state.model.pages[Number(button.dataset.ocPageIndex)];if(!page)return;
        state.selectedPath=page.path;updateBoard();if(state.drawer==='journey'||state.drawer==='pages')paintDrawer();announce(pageName(page.path)+' selected. '+count(page.views)+' page views.');return;
      }
      if(button.hasAttribute('data-oc-page')){state.selectedPath=button.dataset.ocPage;state.drawer='journey';updateBoard();paintDrawer();announce(pageName(state.selectedPath)+' selected.');return;}
      if(button.dataset.ocPlatform){state.platform=button.dataset.ocPlatform;state.action=null;state.lastTrigger=button;state.drawer='socialMetrics';updateBoard();paintDrawer(true);return;}
      if(button.dataset.ocAction){state.action=button.dataset.ocAction;state.drawer='actions';state.lastTrigger=button;paintDrawer(true);return;}
      if(button.dataset.ocSection){state.drawer=button.dataset.ocSection;state.action=null;state.lastTrigger=button;if(state.drawer==='arrivals'){state.arrivalGroup='all';state.arrivalPlatform='all';state.entryPath=null;}if(['radio','social'].includes(state.drawer))state.promotionPlatform='all';paintDrawer(true);}
    });
    root.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.drawer){state.drawer=null;root.querySelector('.oc-drawer').hidden=true;state.lastTrigger?.isConnected&&state.lastTrigger.focus();}});
  }
  function announce(text){state.root.querySelector('[data-oc-announcement]').textContent=text;}
  function downloadEvidence(){
    if(!state.drawer)return;
    const drawer=state.root.querySelector('.oc-drawer'),rows=[
      ['Doc Jaks Social Command Center'],[drawer.querySelector('h2').textContent],
      ['Selected website dates',windowLabel(state.model.period)],[]
    ];
    for(const item of drawer.querySelector('.oc-drawer-body').children){
      if(item.matches('.oc-evidence-line'))rows.push([item.firstElementChild.textContent,item.lastElementChild.textContent]);
      else if(item.matches('.oc-table-wrap')){
        rows.push([]);for(const row of item.querySelectorAll('tr'))rows.push([...row.children].map(cell=>cell.textContent));
      }else if(item.matches('.oc-page-list')){
        rows.push(['Page','Views']);for(const button of item.querySelectorAll('[data-oc-page]'))rows.push([button.dataset.ocPage,button.querySelector('strong').textContent]);
      }else if(item.matches('h3,.oc-note,.oc-empty'))rows.push([item.textContent]);
    }
    const safe=value=>{const text=String(value??'');return '"'+(/^[\s\u0000-\u001f\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';};
    const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
    link.download='doc-jaks-'+state.drawer+'-'+(state.model.period.start||'report')+'.csv';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    announce('Downloaded the selected instrument with source and date notes.');
  }
  function text(key,value){
    const el=state.root.querySelector('[data-oc-value="'+key+'"]');if(!el)return;
    el.textContent=value;
  }
  function scheduleFit(){
    if(fitFrame)return;
    fitFrame=requestAnimationFrame(()=>{fitFrame=0;fitBoardText();});
  }
  function fitBoardText(){
    const board=state.root?.querySelector('.oc-board');
    if(!board?.isConnected||!board.clientWidth)return;
    const scale=board.getBoundingClientRect().width/WIDTH;
    const cash=board.querySelector('.oc-odometer');
    const cells=cash.classList.contains('oc-text-cash')?[cash]:[...cash.children];
    const elements=[...board.querySelectorAll('.oc-readout:not(.oc-odometer),.oc-label-cover,.oc-selector-name,.oc-selector-count,.oc-fit-region'),...cells];
    // Start from the responsive CSS size on every pass, so shorter updates
    // and larger screens can grow again. Measure actual glyphs, including
    // wrapped lines, against all four edges of each reserved text area.
    cash.style.removeProperty('font-size');
    elements.forEach(el=>el.style.removeProperty('font-size'));
    const range=document.createRange();
    for(const el of elements){
      const style=getComputedStyle(el),box=el.getBoundingClientRect();
      const base=parseFloat(style.fontSize);
      const left=box.left+parseFloat(style.paddingLeft)+2*scale;
      const right=box.right-parseFloat(style.paddingRight)-2*scale;
      const top=box.top+parseFloat(style.paddingTop)+scale;
      const bottom=box.bottom-parseFloat(style.paddingBottom)-scale;
      range.selectNodeContents(el);
      const fits=()=>{const ink=range.getBoundingClientRect();return ink.left>=left-.1&&ink.right<=right+.1&&ink.top>=top-.1&&ink.bottom<=bottom+.1;};
      if(fits())continue;
      let low=0,high=base;
      for(let i=0;i<11;i++){
        const size=(low+high)/2;
        el.style.setProperty('font-size',size.toFixed(3)+'px','important');
        if(fits())low=size;else high=size;
      }
      el.style.setProperty('font-size',low.toFixed(3)+'px','important');
    }
    // Odometer digits share one size, chosen to fit the narrowest cell.
    if(cells.length>1){const size=Math.min(...cells.map(el=>parseFloat(getComputedStyle(el).fontSize)));cells.forEach(el=>el.style.setProperty('font-size',size.toFixed(3)+'px','important'));}
  }
  document.fonts?.ready.then(scheduleFit);
  document.fonts?.addEventListener('loadingdone',scheduleFit);
  function selectedPage(){return state.model.pages.find(p=>p.path===state.selectedPath)||null;}
  function updateBoard(){
    const m=state.model,root=state.root,selected=selectedPage();
    for(const key of ['appearances','searchClicks','visits','entryPages','orders'])text(key,count(m[key].value));
    text('searchEngines',m.search?.status==='reported'?(m.search.engines||[]).map(boardEngineName).join(' · ')+' · Details':'Open search details');
    text('searchArrivals',count(m.arrivals.search.visits)+' recorded website visits');
    root.querySelectorAll('[data-oc-promotion]').forEach(instrument=>{
      const id=instrument.dataset.ocPromotion,group=m.promotionGroups[id],arrival=m.arrivals[id];
      for(const key of ['views','clicks','visits']){
        const metric=key==='visits'?{value:arrival.visits,status:m.arrivalReady?'reported':'unavailable'}:group?.totals?.[key];
        const field=instrument.querySelector('[data-oc-group-value="'+key+'"]');
        field.textContent=count(metric?.value)+(metric?.status==='partial'&&valid(metric.value)?'*':'');
        field.parentElement.setAttribute('title',(key==='visits'?'Recorded website arrivals for the selected dates.':metric?.note||'Measured post snapshots for the selected publishing dates.')+(metric?.status==='partial'?' Partial coverage; open details.':''));
      }
      instrument.querySelectorAll('[data-oc-group-platform]').forEach(button=>{
        const platform=group?.platforms?.[button.dataset.ocGroupPlatform];
        const has=valid(platform?.totals?.views?.value)||valid(platform?.totals?.clicks?.value);
        button.dataset.signal=platform?.status==='reported'||platform?.status==='complete'?'green':has?'yellow':'unknown';
      });
    });
    text('selectedName',state.selectedPath?'Selected: '+boardPageName(state.selectedPath):'No reported pages');
    text('pageViews',count(selected?.views));text('pageTime',duration(selected?.avgTimeSeconds));text('pageBounce',percent(selected?.bounceRate));
    const gross=money(m.gross.value,m.currency),cashNode=root.querySelector('[data-oc-value="gross"]');
    cashNode.classList.toggle('oc-text-cash',gross==='—'||m.currency!=='USD'||gross.length>7);
    cashNode.classList.toggle('oc-long-cash',gross.length>7);
    if(gross!=='—'&&m.currency==='USD'&&gross.length<=7){const digits='$'+gross.slice(1).padStart(6,' ');cashNode.replaceChildren(...[...digits].map(char=>{const s=document.createElement('span');s.textContent=char===' '?'\u00a0':char;return s;}));}
    else cashNode.textContent=gross;
    text('working',m.improved.length?m.improved[0].name+' improving':m.score===100?'Measured activity holding':'No verified improvement');
    text('attention',m.declined.length?m.declined[0].name+' declining':m.gaps.length?'Missing '+m.gaps[0]+' data':'No measured decline');
    text('next',m.next);text('reportBadge','REPORTED DATA · VIEW COVERAGE');text('reportFooter',windowLabel(m.period));
    root.querySelectorAll('[data-oc-page-index]').forEach((button,i)=>{const page=m.pages[i],name=page?pageName(page.path):'No reported page';button.disabled=!page;button.dataset.ocPath=page?.path||'';button.setAttribute('aria-pressed',String(!!page&&page.path===state.selectedPath));button.querySelector('.oc-selector-name').textContent=page?boardPageName(page.path):name;button.querySelector('.oc-selector-count').textContent=page?count(page.views)+(page.views===1?' view':' views'):'—';button.setAttribute('title',page?name+' · '+page.path:name);button.setAttribute('aria-label',page?name+', '+count(page.views)+' page views. Select to show page details.':'No reported page in this position');});
    const sourceValues={search:count(m.appearances.value)+' search appearances',clicks:count(m.searchClicks.value)+' search clicks; '+count(m.arrivals.search.visits)+' recorded website visits',radio:count(m.arrivals.olr5150.visits)+' website visits attributed to OLR5150 social posts',social:count(m.arrivals.docjaks.visits)+' website visits attributed to other Doc Jaks social posts',arrivals:count(m.visits.value)+' website visits; '+count(m.entryPages.value)+' different first pages opened',sales:money(m.gross.value,m.currency)+' gross item sales on paid Wix orders',bottom:m.score===null?'Direction is unverified':'Online activity index '+m.score+'; baseline 100'};
    root.querySelectorAll('.oc-section').forEach(button=>{const key=button.dataset.ocSection,label=sections.find(s=>s[0]===key)?.[1]||key;button.setAttribute('aria-label',label+'. '+(sourceValues[key]||'Open detailed reported evidence.'));});
    root.querySelector('[data-oc-source-note]').textContent='Selected dates: '+windowLabel(m.period)+'. Website arrivals count the first page opened in each visit. The total includes Search, OLR5150 posts, other Doc Jaks posts, unclassified social and direct/other sources. Later page views stay in Website Journey. — means unavailable; * means partial post metrics. Open a source to see its coverage.';
    scheduleFit();
  }

  const line=(label,value,note)=>'<div class="oc-evidence-line"><span>'+esc(label)+(note?'<small>'+esc(note)+'</small>':'')+'</span><strong>'+esc(value)+'</strong></div>';
  const note=text=>'<p class="oc-note">'+esc(text)+'</p>';
  const empty=reason=>'<p class="oc-empty"><strong>— Not available</strong><span>'+esc(reason)+'</span></p>';
  function table(headers,rows,caption){
    if(!rows.length)return '';
    return '<div class="oc-table-wrap"><table>'+(caption?'<caption>'+esc(caption)+'</caption>':'')+'<thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  const sectionTitle=text=>'<h3>'+esc(text)+'</h3>';
  function pageList(){
    const m=state.model;
    if(!m.pages.length)return empty(m.rawPages?'No valid website page rows were returned for these dates.':'Wix has not returned a matching page report.');
    return '<div class="oc-page-list">'+m.pages.map(p=>'<button type="button" data-oc-page="'+esc(p.path)+'" aria-pressed="'+String(p.path===state.selectedPath)+'"><span><b>'+esc(pageName(p.path))+'</b><small>'+esc(p.path)+'</small></span><strong>'+count(p.views)+' <small>views</small></strong><span aria-hidden="true">›</span></button>').join('')+'</div>'+note(m.site?.topPagesComplete===true?'All reported pages for these dates, ranked by views. Repeat views are included.':m.site?.pageReportCoverage?.pages||'This is a partial page list. Rankings cover the rows returned by Wix; they may not include every visited page.');
  }
  function searchPanel(clicks){
    const m=state.model,s=m.search;
    let out=s?.status==='reported'?line(clicks?'Search result clicks':'Search appearances',count(clicks?s.clicksCurrent:s.current),'Provider totals, not unique visitors')+
      line('Previous matched period',count(clicks?s.clicksPrevious:s.previous))+
      line('Click-through rate',percent(s.ctrCurrent))+
      line('Google average position',valid(s.positionCurrent)?s.positionCurrent.toFixed(1):'—','Not a combined Google + Bing ranking'):empty(clicks?m.searchClicks.reason:m.appearances.reason);
    if(s?.status==='reported'){
      out+=table(['Engine','Appearances','Clicks'],(s.engines||[]).map(e=>[e.name,count(e.current?.impressions),count(e.current?.clicks)]));
      out+=note('Search reporting days: '+(s.currentRange?.start||'—')+' → '+(s.currentRange?.end||'—')+'. '+(s.note||''));
    }
    if(clicks){
      out+=sectionTitle('Recorded website arrivals from Search')+line('Website visits',count(m.arrivals.search.visits),'Same-date Wix website visits; search-provider click totals above use their own reporting coverage.')+'<button type="button" class="oc-brass-button" data-oc-arrival-group="search">See the first pages they opened</button>';
      const paired=m.seo?.status==='connected'&&m.seo.queryPages?.status==='reported'&&Array.isArray(m.seo.queryPages.rows)?m.seo.queryPages.rows.filter(p=>p?.query&&p.page&&valid(p.clicks)).sort((a,b)=>b.clicks-a.clicks):[];
      out+=sectionTitle('Search phrase → result destination');
      out+=paired.length?table(['Search phrase','Shown URL / page','Clicks'],paired.slice(0,30).map(p=>[p.query,pathOf(p.page)||String(p.page),count(p.clicks)])):empty('The search provider did not return query-and-destination pairs for this window.');
      out+=note('A search click is not a verified website arrival. Search reports and Wix sessions use separate measurements and cannot identify a person-by-person journey.');
    }
    return out;
  }
  function arrivalsPanel(){
    const m=state.model;
    let out=line('All website visits',count(m.visits.value),'The total stays intact, including direct and unclassified traffic.')+
      note('The first page opened is counted once per website visit. Going on to another page, including Outlaw Radio, is shown separately in Website Journey.');
    out+='<div class="oc-drawer-selector">'+[['all','All arrivals'],...Object.entries(arrivalLabels)].map(([id,label])=>'<button type="button" data-oc-arrival-group="'+id+'" aria-pressed="'+String(state.arrivalGroup===id)+'">'+esc(label)+' · '+count(id==='all'?m.visits.value:m.arrivals[id].visits)+'</button>').join('')+'</div>';
    const group=state.arrivalGroup==='all'?null:m.arrivals[state.arrivalGroup];
    const platform=group&&['olr5150','docjaks'].includes(group.id)&&Object.hasOwn(platformLabels,state.arrivalPlatform)?state.arrivalPlatform:null;
    const incoming=platform?group.platforms.find(row=>row.platform===platform):group;
    const rows=group?(m.arrivalReady?(incoming?.landingPages||[]):[]):m.arrivalReady?m.arrivalReport.landingPages:m.landings.map(row=>({path:row.path,visits:row.sessions}));
    const visits=group?(m.arrivalReady?(incoming?.visits??0):null):m.visits.value;
    const firstPages=group?(m.arrivalReady?(platform?new Set(rows.map(row=>pathOf(row.path)).filter(Boolean)).size:group.entryPageCount):null):m.entryPages.value;
    if(group&&['olr5150','docjaks'].includes(group.id))out+='<div class="oc-drawer-selector">'+[['all','All platforms'],...Object.entries(platformLabels)].map(([key,label])=>'<button type="button" data-oc-arrival-group="'+group.id+'" data-oc-arrival-platform="'+key+'" aria-pressed="'+String(state.arrivalPlatform===key)+'">'+label+'</button>').join('')+'</div>';
    out+=sectionTitle(group?group.label+(platform?' · '+platformLabels[platform]:''):'All recorded arrivals')+
      line('Website visits',count(visits),group?'Visits assigned to this group; each visit belongs to one group.':'Every recorded source.')+
      line('Different first pages opened',count(firstPages),'The number of distinct pages these visits started on.');
    if(!m.arrivalReady)out+=empty(m.arrivalReport?.coverage?.reason||m.arrivalReport?.note||'The first-page source breakdown is still loading or unavailable. The all-source total is retained; no source split is guessed.');
    if(state.entryPath){
      const path=state.entryPath,row=(rows||[]).find(row=>pathOf(row.path)===path);
      out+=sectionTitle('First page: '+pageName(path))+
        line('Visits that started here',count(group&&!m.arrivalReady?null:row?.visits),path)+
        table(['Arrival group','Visits starting here'],Object.values(m.arrivals).filter(g=>!group||g.id===group.id).map(g=>[g.label+(platform?' · '+platformLabels[platform]:''),m.arrivalReady?count((platform?(g.platforms.find(row=>row.platform===platform)?.landingPages||[]):g.landingPages).filter(p=>pathOf(p.path)===path).reduce((sum,p)=>sum+(valid(p.visits)?p.visits:0),0)):'—']));
      out+='<div class="oc-drawer-selector"><button type="button" data-oc-entry-back>Back to first pages</button><button type="button" data-oc-page="'+esc(path)+'">View this page’s activity in #6</button></div>';
    }else{
      out+=sectionTitle('First page opened · most arrivals first');
      out+=(rows||[]).length?'<div class="oc-table-wrap"><table><thead><tr><th>First page opened</th><th>Website visits</th></tr></thead><tbody>'+rows.slice().sort((a,b)=>b.visits-a.visits).map(row=>'<tr><td>'+(pathOf(row.path)?'<button type="button" class="oc-inline-page" data-oc-entry-page="'+esc(pathOf(row.path))+'">'+esc(pageName(row.path))+'</button><small class="oc-entry-path">'+esc(row.path)+'</small>':'Unreported first page')+'</td><td>'+count(row.visits)+(m.arrivalReady?'':' · reported rows only')+'</td></tr>').join('')+'</tbody></table></div>':note(m.arrivalReady&&visits===0?'No website visits were attributed to this group in the selected dates.':'No first-page rows are available for this selection.');
    }
    if(m.arrivalReady)out+=note('Reconciled: '+Object.values(m.arrivals).map(g=>g.label+' '+count(g.visits)).join(' + ')+' = '+count(m.arrivalReport.totalVisits)+' website visits. The same page can be a first page for several groups, so distinct page counts are not added together.');
    return out+note('Unclassified social visits lack a usable saved-post group. Direct and other visits stay in their own group; a radio page destination never changes the original arrival source.');
  }
  function promotionPanel(id){
    const m=state.model,group=m.promotionGroups[id],arrivals=m.arrivals[id];
    const platform=state.promotionPlatform==='all'?null:state.promotionPlatform;
    const selected=platform?group?.platforms?.[platform]:group;
    const incoming=platform?arrivals.platforms.find(row=>row.platform===platform):arrivals;
    const arrivalVisits=m.arrivalReady?(platform?(incoming?.visits??0):arrivals.visits):null;
    let out=note(id==='olr5150'?'Visits attributed to social posts explicitly labeled as promoting Outlaw Radio 5150.':'Visits attributed to social posts explicitly labeled as other Doc Jaks promotions. OLR5150 posts are excluded from this group.')+
      '<div class="oc-drawer-selector">'+[['all','All platforms'],...Object.entries(platformLabels)].map(([key,label])=>'<button type="button" data-oc-group="'+id+'" data-oc-group-platform="'+key+'" aria-pressed="'+String(state.promotionPlatform===key)+'">'+label+'</button>').join('')+'</div>'+
      sectionTitle(platform?platformLabels[platform]:arrivalLabels[id])+
      line('Website visits',count(arrivalVisits),'Wix visits occurring during '+windowLabel(m.period)+'. Each visit has one first page.')+
      '<button type="button" class="oc-brass-button" data-oc-arrival-group="'+id+'" data-oc-arrival-platform="'+(platform||'all')+'">First pages opened by these visits</button>';
    for(const [key,label] of [['views','Post views'],['clicks','Link clicks']]){
      const cell=selected?.totals?.[key];
      out+=line(label,count(cell?.value),(cell?.status==='partial'?'PARTIAL · ':'')+(cell?.note||'No matching per-post measurement is available.'));
    }
    out+=note(group?.note||'Only explicitly classified posts belong to this group. Missing post measurements remain unavailable.')+
      note('Post views and link clicks are current lifetime snapshots for posts published in the selected window. Website visits count arrivals during the selected dates, including visits from older tagged posts. These different measurements are not added together.');
    const posts=Array.isArray(selected?.posts)?selected.posts:[];
    out+=sectionTitle('Individual post measurements');
    out+=posts.length?table(['Post / platform','Post views','Link clicks','Evidence'],posts.map(post=>[post.title+' · '+(platformLabels[post.platform]||post.platform),count(post.views),count(post.clicks),post.manual?'Owner entered · excluded from totals':post.source||'Measured platform snapshot'])):note('No classified post rows are available for this publishing window. Label saved posts in Content Library to separate OLR5150 from other Doc Jaks promotions.');
    const tracked=arrivals.posts.filter(post=>!platform||post.platform===platform);
    out+=sectionTitle('Website arrivals by tracked post');
    out+=tracked.length?table(['Post / platform','Website visits','First pages opened'],tracked.map(post=>[post.title+' · '+(platformLabels[post.platform]||post.platform),m.arrivalReady?count(post.visits):'—',m.arrivalReady?((post.landingPages||[]).map(page=>pageName(page.path)+' ('+count(page.visits)+')').join('; ')||'—'):'—'])):note(m.arrivalReady&&arrivalVisits===0?'No website arrivals were attributed to this group for these dates.':'No matched tracked-post arrival rows are available. Untagged visits cannot be assigned from their later page views.');
    out+='<div class="oc-drawer-selector"><button type="button" data-oc-section="socialMetrics">All social metrics &amp; coverage</button><button type="button" data-oc-arrival-group="social_unclassified">Unclassified social arrivals</button>'+(id==='olr5150'?'<button type="button" data-oc-section="radioListening">Radio listeners &amp; listening time</button>':'')+'</div>';
    return out+note('Post labels and tracking links identify the promotion credited for a visit. A copied or reshared tagged link retains its label; the platform label identifies the tracked link, not proof of where someone physically clicked it.')+note('To label a saved post: Tools & reports → Content Library → Open the post → Website traffic group. The label does not change the published post or its shared link.');
  }
  function journeyPanel(){
    const m=state.model,p=selectedPage();
    let out='<div class="oc-drawer-selector">'+m.pages.slice(0,4).map(row=>'<button type="button" data-oc-page="'+esc(row.path)+'" aria-pressed="'+String(row.path===state.selectedPath)+'">'+esc(pageName(row.path))+'</button>').join('')+'</div>';
    out+=sectionTitle(state.selectedPath?pageName(state.selectedPath):'Select a reported page');
    if(!p)return out+empty('This page has no measured row in the current selected-date report.')+pageList();
    out+=line('Page views',count(p.views),'Repeat views are included')+line('Visitors',count(p.visitors))+line('Sessions',count(p.sessions))+line('Average time on page',duration(p.avgTimeSeconds))+line('Bounce rate',percent(p.bounceRate));
    if(p.variants?.length>1){
      out+=note('Wix returned several URL variants of this page. Views are combined; distinct visitors, sessions, time and bounce are shown separately below because combining those aggregates would change their meaning.');
      out+=table(['Reported URL','Views','Time','Bounce'],p.variants.map(row=>[row.path,count(row.views),duration(row.avgTimeSeconds),percent(row.bounceRate)]));
    }
    if(!valid(p.avgTimeSeconds)||!valid(p.bounceRate)||p.bounceRate>1)out+=note('Unavailable time or bounce fields stay unreported. Other pages’ averages are not substituted.');
    if(m.arrivalReady){
      const first=m.arrivalReport.landingPages.find(row=>pathOf(row.path)===p.path);
      out+=sectionTitle('Visits that started on this page')+line('First-page arrivals',count(first?.visits??0),'All recorded sources; later page views above are a separate measure.')+
        table(['Where they came from','First-page arrivals'],Object.values(m.arrivals).map(group=>[group.label,count(group.landingPages.filter(row=>pathOf(row.path)===p.path).reduce((sum,row)=>sum+row.visits,0))]));
    }
    if(p.path==='/outlaw-radio-5150')out+='<button type="button" class="oc-brass-button" data-oc-section="radioListening">Radio listeners &amp; listening time</button>';
    out+=sectionTitle('Where they went next');
    const next=m.transitions.filter(r=>r.from===p.path).sort((a,b)=>b.views-a.views);
    out+=next.length?table(['Next page','Recorded page-view events'],next.map(r=>[pageName(r.to)+' · '+r.to,count(r.views)])):empty(m.transitionReady?'No matching internal-referrer page-view events were returned for this page. That does not establish an exit or a bounce.':'A matching GA4 internal-referrer report is unavailable.');
    out+=note('Next-page counts are GA4 page_view events grouped by internal referrer. They are not unique visitors, complete click paths, or inferred exits.');
    out+='<button type="button" class="oc-brass-button" data-oc-section="pages">View all reported pages</button>';
    return out;
  }
  function radioPanel(){
    const m=state.model,r=m.radio,s=m.summary;
    let out=note('IMPORTED RADIO.CO CSV · NOT LIVE. Connections are not unique listeners. Website visits are not listening sessions.')+
      line('Imported stream connections',count(m.connections.value),m.connections.reason||'All selected UTC days covered')+
      line('Average listening per connection',duration(m.averageListening.value),m.averageListening.reason||'Imported listening seconds ÷ imported connections')+
      line('Imported total listening time',duration(m.listeningSeconds.value),m.listeningSeconds.reason)+
      line('Radio-origin website visits',count(m.radioReferrals.value),m.radioReferrals.reason||'Wix referral sessions, not stream connections');
    out+='<button type="button" class="oc-brass-button" data-oc-radio-import>Update Radio.co imports</button>';
    if(!r)return out+empty('No matching imported Radio.co report was supplied for the selected dates.');
    out+=line('Overview coverage',count(s.overviewDays)+' / '+count(s.requestedDays)+' days')+line('Listening-time coverage',count(s.listeningDays)+' / '+count(s.requestedDays)+' days');
    if(s.overviewComplete!==true&&valid(s.connections))out+=line('Connections on imported days only',count(s.connections),'PARTIAL · not a full-window total');
    if(s.listeningComplete!==true&&valid(s.listeningSeconds))out+=line('Listening on imported days only',duration(s.listeningSeconds),'PARTIAL · not a full-window total');
    const daily=Array.isArray(r.rows)?r.rows:[];
    if(daily.length)out+=sectionTitle('Imported daily records')+table(['UTC date','Connections','Listening time'],daily.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,40).map(row=>[row.date,count(row.connections),duration(row.listeningSeconds)]));
    const hourly=Array.isArray(r.hourly)?r.hourly.filter(row=>valid(row.connections)):[];
    out+=sectionTitle('Time of day');
    out+=hourly.length?table(['Date / time (Central)','Connections'],hourly.slice(-24).map(row=>{const d=new Date(row.stamp);return [Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric'}).format(d):row.date||'—',count(row.connections)];})):empty('No hourly listening rows were imported for these dates.');
    const countries=Object.entries(s.countries||{}).filter(([,n])=>valid(n)).sort((a,b)=>b[1]-a[1]);
    out+=sectionTitle('Country / city');
    out+=countries.length?table(['Country','Connections'],countries.map(([code,n])=>{let label=code;try{if(/^[A-Z]{2}$/i.test(code))label=new Intl.DisplayNames(['en'],{type:'region'}).of(code.toUpperCase());}catch{}return [label,count(n)];})):empty('No country breakdown is present in this import.');
    return out+note('City-level listening and new / returning listeners are unavailable from these aggregate imports. Daily unique counts are not added into a period-wide unique listener total.');
  }
  function socialPanel(){
    const m=state.model,p=m.platforms[state.platform];
    const coverage=t=>{
      if(!valid(t.value))return 'No verified platform value is available. Missing metrics are not counted as zero.';
      return (t.status==='partial'?'PARTIAL · ':'')+'Included: '+t.included.map(row=>row.name).join(' + ')+'. '+
        (t.missing.length?'No verified value: '+t.missing.map(row=>row.name).join(', ')+'. ':'')+
        (t.excluded.length?'Excluded owner-entered records: '+t.excluded.map(row=>row.name).join(', ')+'.':'');
    };
    let out=sectionTitle('Reported social totals')+
      line('Post views total',count(m.socialTotals.views.value),coverage(m.socialTotals.views))+
      line('Post clicks total',count(m.socialTotals.clicks.value),coverage(m.socialTotals.clicks))+
      note('Publishing window: '+windowLabel(m.period)+' (Central time). These are current lifetime totals for posts published in that window, not activity occurring only during those dates. '+
        (m.social?.checkedAt?'Snapshot checked: '+m.social.checkedAt+'. ':'' )+
        'Platform views and clicks can count the same person repeatedly. No combined unique audience or website-arrival total is inferred.')+
      table(['Platform','Post views','Post clicks','Included in total'],Object.values(m.platforms).map(row=>{
        const fields=['views','clicks'].filter(field=>m.socialTotals[field].included.some(p=>p.key===row.key));
        return [row.name,count(row.now.views),count(row.now.clicks),row.manual?'Owner entered · excluded':fields.length?fields.join(' + '):row.has?'Unverified · excluded':'Unavailable'];
      }))+sectionTitle('Platform details')+
      '<div class="oc-drawer-selector">'+Object.values(m.platforms).map(row=>'<button type="button" data-oc-platform="'+row.key+'" aria-pressed="'+String(row.key===state.platform)+'">'+esc(row.name)+'</button>').join('')+'</div>'+sectionTitle(p.name)+note(p.sourceNote);
    if(!p.has)out+=empty(p.reason);
    out+=line('Posts in selected publishing window',count(p.currentPosts))+line('Post views',count(p.now.views))+line('Post clicks',count(p.now.clicks),'A post click is not necessarily a website click or arrival')+line('Reactions / likes',count(p.now.reactions))+line('Comments',count(p.now.comments))+line('Shares / reposts',count(p.now.shares));
    if(!p.manual)out+=note('These are current lifetime totals for posts published during the selected dates, not actions that happened only within that period. Older posts have had longer to collect activity. Missing metrics remain unreported.');
    return out+note('This overview includes all reported social posts, including posts not assigned to a traffic group. The two main instruments show their own classified groups. No campaign-caused sales are inferred.');
  }
  function salesPanel(){
    const m=state.model;
    if(!m.paid)return empty(m.gross.reason);
    let out=line('Gross paid website item sales',money(m.gross.value,m.currency),'Reported item sales on paid Wix website orders')+line('Paid website orders',count(m.orders.value))+line('Currency',m.currency);
    const previous=m.sales.salesComparison?.status==='reported'&&m.sales.salesComparison.previousRange?.end===m.sales.range.start?m.sales.salesComparison.previous:null;
    if(previous)out+=line('Previous gross paid item sales',money(previous.itemSalesCents,m.currency))+line('Previous paid orders',count(previous.paidOrders));
    return out+note('Gross item sales are not profit. Shipping, tax, refunds, fees, and product costs are not silently subtracted. External Amazon purchases and unreported sales are not assumed.');
  }
  function readingPanel(){
    const m=state.model,r=m.reading,c=m.chapter;
    let out=sectionTitle('Chapter One · active reading');
    if(r?.trackingSince&&r.range.end<r.trackingSince){
      out+=empty('Reading tracking began on '+r.trackingSince+', after the selected dates. Earlier reading sessions and time are unreported.');
    }else if(r){
      out+=note('On-page reader · '+windowLabel(m.period)+' · Central time.'+
        (r.checkedAt?' Snapshot checked: '+r.checkedAt+'.':''));
      if(r.partialCoverage)out+=note('PARTIAL TRACKING COVERAGE · This selection begins before reading tracking started'+
        (r.trackingSince?' on '+r.trackingSince:'')+'. Earlier reading cannot be recovered.');
      out+=line('Chapter opened',count(r.openSessions),'Anonymous browser sessions, not unique people')+
        line('Started reading',count(r.readingSessions),'Recorded reader starts')+
        line('Average active reading',r.readingSessions>0?duration(r.avgActiveSeconds):'—',r.readingSessions===0?'No reading sessions; an average is undefined.':'Inactive and hidden-page time excluded')+
        line('Total active reading time',duration(r.activeSeconds))+
        line('Read at least 30 seconds',count(r.read30))+
        line('Read at least 1 minute',count(r.read60))+
        line('Read at least 3 minutes',count(r.read180))+
        line('Reached the last page',count(r.endReached),'Scrolling to the end does not establish a complete read')+
        line('Marked finished',count(r.finished),'Reader-confirmed, not independently verified completion')+
        note(r.caveat||'These are anonymous client-measured sessions, not unique readers or proof that every paragraph was read.');
    }else out+=empty('The existing on-page reader has not returned a verified report for these selected dates. No reading time or completed reads are inferred from downloads or page visits.');
    out+=sectionTitle('Chapter-link clicks · separate Wix evidence');
    if(!c)return out+empty('A matching Wix first-chapter link report is not available for these dates.');
    const reportedClicks=c.partial===false?knownNumber(c,'clicks'):null;
    out+=line('Chapter PDF-link clicks',count(reportedClicks),'Website button/link events, not completed downloads or reading sessions')+
      line('Unique clickers',count(reportedClicks!==null?knownNumber(c,'uniqueClickers'):null),'Only a provider-reported unique count; never summed across buttons');
    if(c.status==='not-tracked')out+=note(c.message||'Chapter-link tracking was not active during these dates.');
    if(c.partial)out+=note('PARTIAL CLICK COVERAGE · The full selected-window click total is unavailable. Any button rows below show only the returned evidence.');
    if(c.range.start!==m.period.start)out+=note('Click tracking covers '+c.range.start+' through '+m.period.endInclusive+' within the selected dates. Earlier clicks are unreported.');
    if(c.buttons.length)out+=table(['Chapter button / page','Clicks','Unique clickers'],c.buttons.filter(Boolean).map(row=>[
      [row.title||row.type||'Chapter link',row.page].filter(Boolean).join(' · '),count(row.clicks),count(row.uniqueClickers)]));
    return out+note('These link clicks and the active-reading session counts above are separate measurements and may overlap. They are not added into a conversion or reader total.');
  }
  function actionsPanel(){
    const m=state.model,c=m.actionCounts;
    let out='<div class="oc-drawer-selector">'+[['read','Read'],['listen','Listen'],['join','Join']].map(([key,label])=>'<button type="button" data-oc-action="'+key+'" aria-pressed="'+String(state.action===key)+'">'+label+'</button>').join('')+'</div>';
    if(state.action==='listen')return out+line('Imported listening time',duration(m.listeningSeconds.value),m.listeningSeconds.reason)+line('Imported connections',count(m.connections.value),m.connections.reason)+note('An engaged-listener count requires session-level playback evidence. Aggregate connections and a website page visit cannot establish it.')+'<button type="button" class="oc-brass-button" data-oc-section="radioListening">Open radio evidence</button>';
    if(state.action==='read')out+=readingPanel();
    if(state.action==='join')out+=sectionTitle('Joining evidence')+note('Sign-up events are not independently verified Pit Krewe memberships.');
    if(!m.actionsReady)return out+empty('The matching GA4 action report is unavailable for the selected dates.');
    out+=sectionTitle('GA4 action events')+line('All file download events',count(c.fileDownload),'All reported files; not completed chapter reads')+line('Form submission events',count(c.formSubmit))+line('Sign-up events',count(c.signUp),'Not confirmed Pit Krewe members')+line('Add-to-cart events',count(c.addToCart))+line('Checkout start events',count(c.beginCheckout));
    const pages=m.ga4.actions?.eventPages?.status==='reported'&&Array.isArray(m.ga4.actions.eventPages.rows)?m.ga4.actions.eventPages.rows.filter(r=>r?.pagePath&&valid(r.events)):[];
    if(pages.length)out+=sectionTitle('Page-level action events')+table(['Page','Event','Count'],pages.slice(0,30).map(r=>[pageName(r.pagePath),r.eventName||'Reported action',count(r.events)]));
    return out+note('Actions can repeat or overlap. They are not added into a unique conversion total; a button click is not proof of its intended completion.');
  }
  function bottomPanel(){
    const m=state.model;
    let out=line('Online activity direction',m.score===null?'— Unverified':String(m.score),'Baseline 100 · above 100 forward · below 100 backward')+line('Gross paid website item sales',money(m.gross.value,m.currency),'Sales, not profit');
    out+=sectionTitle('What is working');
    out+=m.improved.length?m.improved.map(s=>line(s.name,String(s.score),'Verified comparison index')).join(''):note(m.score===100?'The measured overall index is holding at 100.':'No positive comparison is verified in the available report.');
    out+=sectionTitle('Needs attention');
    out+=m.declined.length?m.declined.map(s=>line(s.name,String(s.score),'Below the 100 baseline')).join(''):note('No negative comparison has been established by the available evidence.');
    if(m.gaps.length)out+=note('Incomplete coverage: '+m.gaps.join(', ')+'. Missing reports are not counted as zero or neutral performance.');
    out+=sectionTitle('What to do next')+note(m.next+'. Open that instrument to inspect its actual measurements and dates before choosing a change.');
    return out+note(m.owner?.note||'The available reports do not establish a business-wide growth, profit, or causal conversion result.');
  }
  function coveragePanel(){
    const m=state.model;
    return line('Selected website dates',windowLabel(m.period))+table(['Source','Report coverage'],[
      ['Search engines',m.search?.status==='reported'?(m.search.scope||'Reported')+' · '+(m.search.currentRange?.start||'—')+' → '+(m.search.currentRange?.end||'—'):'Not available'],
      ['Wix website',m.site?'Matched selected dates':'Not available'],
      ['First pages & arrival groups',m.arrivalReady?'Complete first-page report; all five source groups reconcile to the total':m.arrivalReport?.note||'No complete matched source-by-first-page report'],
      ['GA4 actions',m.actionsReady?'Matched selected dates':'Not available'],
      ['Chapter One active reading',m.reading?(m.reading.trackingSince&&m.reading.range.end<m.reading.trackingSince?'Tracking was not active during these dates':(m.reading.partialCoverage?'Partial tracking coverage · ':'Matched selected dates · ')+'anonymous on-page reader sessions'):'No matched reader report'],
      ['Chapter PDF-link clicks',m.chapter?(m.chapter.partial?'Partial Wix click evidence':m.chapter.status==='not-tracked'?'Tracking was not active':m.chapter.range.start!==m.period.start?'Tracking began within the selected window':'Matched selected dates'):'No matched Wix click report'],
      ['Radio.co',m.radio?'Imported CSV · '+(m.summary?.overviewComplete&&m.summary?.listeningComplete?'complete selected UTC days':'partial selected UTC days'):'No matching import'],
      ['Social platforms',(m.socialCoverage==='partial'?'Partial measured totals':m.socialCoverage==='unavailable'?'No verified totals':'Complete measured totals')+' · current lifetime snapshots for posts published in the selected window; inspect each metric’s platform coverage. X owner-entered records excluded.'],
      ['Paid Wix sales',m.paid?'Complete matched paid-order report':'Not available']
    ])+note('All instruments use reported measurements or display an em dash. Provider delays, date boundaries, incomplete imports, and unavailable fields remain visible. No sample values or estimated conversions are used.');
  }
  function paintDrawer(scroll=false){
    const root=state.root,drawer=root.querySelector('.oc-drawer');
    if(!state.drawer){drawer.hidden=true;return;}
    const specs={search:['1. Search Engines',()=>searchPanel(false)],clicks:['2. Result Clicks',()=>searchPanel(true)],radio:['3. OLR5150 Social Posts',()=>promotionPanel('olr5150')],social:['4. Other Doc Jaks Social Posts',()=>promotionPanel('docjaks')],radioListening:['Outlaw Radio 5150 · Listening',radioPanel],socialMetrics:['All Social Post Metrics',socialPanel],arrivals:['5. Website Arrivals · First Pages',arrivalsPanel],journey:['6. Website Journey',journeyPanel],pages:['6. All Reported Pages',pageList],sales:['7. Paid Web Sales — Gross',salesPanel],actions:['8. Meaningful Actions',actionsPanel],bottom:['9. Bottom Line',bottomPanel],coverage:['Source Coverage & Dates',coveragePanel]};
    const selected=specs[state.drawer]||specs.coverage;
    const body=drawer.querySelector('.oc-drawer-body'),previousScroll=body.scrollTop;
    drawer.querySelector('#ocDrawerTitle').textContent=selected[0];
    body.innerHTML=selected[1]();drawer.hidden=false;drawer.dataset.instrument=state.drawer;body.scrollTop=previousScroll;
    if(scroll)requestAnimationFrame(()=>{drawer.scrollIntoView({behavior:'smooth',block:'start'});});
  }
  function mount(slot,context){
    const target=typeof slot==='string'?document.getElementById(slot):slot;
    if(!target)return null;
    state.context=context||{};state.model=modelFor(state.context);
    if(!state.selectedPath&&state.model.pages.length)state.selectedPath=state.model.pages[0].path;
    if(!state.root||state.root.parentElement!==target||!state.root.isConnected)scaffold(target);
    updateBoard();paintDrawer();return state.root;
  }
  window.djomsOrganicCommand={mount};
})();
