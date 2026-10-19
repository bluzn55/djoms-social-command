/* DJOMS · Business Direction / owner-first decision brief.
   One current, one preceding equal-length period. Never infer profit, listeners,
   Pit Krewe signups, or cross-platform people from unrelated measurements. */
(function directionModule(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const good=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const fmt=value=>good(value)?new Intl.NumberFormat('en-US').format(value):'N/A';
  const percent=value=>typeof value==='number'&&Number.isFinite(value)
    ?(value>0?'+':'')+value.toFixed(1)+'%':'N/A';
  const time=value=>good(value)?Math.floor(value/60)+'m '+Math.round(value%60)+'s':'N/A';
  const money=cents=>Number.isSafeInteger(cents)&&cents>=0
    ?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100):'N/A';
  const isTrend=value=>value&&typeof value.percentChange==='number'&&Number.isFinite(value.percentChange);
  const trend=(c,higherIsBetter=true)=>{
    if(!isTrend(c))return 'unknown';
    if(Math.abs(c.percentChange)<5)return 'steady';
    const rising=c.percentChange>0;
    return rising===higherIsBetter?'up':'down';
  };
  const safePeriod=()=>typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
  const reports=()=>window.djomsVerifiedReports||{};
  function matched(name,selected){
    const entry=reports()[name];
    if(!selected?.query||entry?.query!==selected.query)return null;
    return entry.data||null;
  }
  const periodName=period=>period?.range==='custom'
    ?'Custom dates':({today:'Today','7d':'Last 7 days','30d':'Last 30 days','365d':'Last 365 days'})[period?.range]||'Selected dates';
  const proof=(label,state,headline,note)=>({label,state,headline,note});
  const ga4Gap=(site,ga4)=>site?.connected===true&&ga4?.status==='connected'&&
    good(site.sessions)&&site.sessions>=10&&good(ga4?.metrics?.sessions)&&
    ga4.metrics.sessions<site.sessions/2;

  function evaluate(site,ga4,seo,sales,period){
    const available=site?.connected===true;
    const comparisons=available?site?.metricComparisons||{}:{};
    const visitors=comparisons.visitors;
    const stay=comparisons.avgTimeSeconds;
    const bounced=comparisons.bounceRate;
    const returns=comparisons.returningVisitors;
    const visitorsTrend=trend(visitors);
    const stayTrend=trend(stay);
    const bounceTrend=trend(bounced,false);
    const returnTrend=trend(returns);
    const currentVisitors=good(site?.visitors)?site.visitors:visitors?.currentVisitors;
    const previousVisitors=good(visitors?.previousVisitors)?visitors.previousVisitors:null;
    const salesReady=sales?.connected===true&&sales?.complete===true&&Number.isSafeInteger(sales.paidOrders);
    const actualActions=ga4?.connected===true&&ga4?.actions?.status==='reported'
      ?ga4.actions:null;
    const gaIssue=ga4?.status==='enable-api';
    const gaBlocked=ga4&&ga4.status!=='connected';
    const phoneActions=good(site?.contactClicks)&&good(site?.formsSubmitted)
      ?site.contactClicks+site.formsSubmitted:null;
    // Display an actual observed action signal, not merely a connected GA4
    // event-reporting feed. All action counts are events or clicks, not people,
    // purchases, confirmed Pit Krewe signups, or Radio.co listening sessions.
    const actionCounts=actualActions?.counts||{};
    const observedAction=()=>{
      if(good(phoneActions)&&phoneActions>0)return {
        state:'yellow',headline:fmt(phoneActions)+' CONTACT ACTION'+(phoneActions===1?'':'S'),
        note:'Wix contact clicks/forms, not confirmed members. Radio listeners: N/A.'
      };
      if(good(actionCounts.formSubmit)&&actionCounts.formSubmit>0)return {
        state:'yellow',headline:fmt(actionCounts.formSubmit)+' FORM EVENT'+(actionCounts.formSubmit===1?'':'S'),
        note:'GA4 form events only. Confirmed members and radio listeners: N/A.'
      };
      if(good(actionCounts.fileDownload)&&actionCounts.fileDownload>0)return {
        state:'yellow',headline:fmt(actionCounts.fileDownload)+' DOWNLOAD EVENT'+(actionCounts.fileDownload===1?'':'S'),
        note:'GA4 file-download events, not proven sales or members. Radio listeners: N/A.'
      };
      if(good(actionCounts.signUp)&&actionCounts.signUp>0)return {
        state:'yellow',headline:fmt(actionCounts.signUp)+' SIGN-UP EVENT'+(actionCounts.signUp===1?'':'S'),
        note:'GA4 sign-up events. Confirmed Pit Krewe members and radio listeners: N/A.'
      };
      return {
        state:'unknown',headline:'NOT YET VERIFIED',
        note:actualActions
          ?'GA4 events are tracked, but confirmed Pit Krewe members and radio listeners are N/A.'
          :'GA4 action counts, confirmed Pit Krewe members and radio listeners are N/A.'
      };
    };
    const meaningfulAction=observedAction();
    const warnings=[];
    if(ga4Gap(site,ga4))warnings.push('Wix and Google Analytics session counts differ substantially. Verify the GA4 tag, cookie consent and bot filtering; do not assume GA4 sees every visit.');
    if(gaIssue)warnings.push('GA4 Data API needs enabling.');
    else if(gaBlocked)warnings.push('GA4 needs attention before its reports can be trusted.');
    if(!salesReady)warnings.push('Verified online order totals are not available for these dates.');
    warnings.push('Actual Radio.co listening and contribution margin are not connected.');

    let websiteDirection='NOT ENOUGH DATA',directionColor='unknown';
    if(visitorsTrend==='up'&&stayTrend==='down'){
      websiteDirection='MIXED: TRAFFIC UP, ENGAGEMENT DOWN';directionColor='yellow';
    } else if(visitorsTrend==='down'&&stayTrend==='up'){
      websiteDirection='MIXED: TRAFFIC DOWN, ENGAGEMENT UP';directionColor='yellow';
    } else if(visitorsTrend==='up'&&stayTrend==='up'){
      websiteDirection='WEB MOMENTUM IMPROVING';directionColor='green';
    } else if(visitorsTrend==='down'&&stayTrend==='down'){
      websiteDirection='WEB MOMENTUM DECLINING';directionColor='red';
    } else if(visitorsTrend==='up'){
      websiteDirection='VISITORS INCREASING, OUTCOME UNPROVEN';directionColor='yellow';
    } else if(visitorsTrend==='down'){
      websiteDirection='VISITORS DECREASING, OUTCOME UNPROVEN';directionColor='yellow';
    } else if(visitorsTrend==='steady'&&stayTrend==='steady'){
      websiteDirection='WEB TRAFFIC ABOUT STEADY';directionColor='yellow';
    }

    const discovering=available&&isTrend(visitors)
      ?(visitorsTrend==='up'
        ?'Wix reports '+fmt(currentVisitors)+' visitors versus '+fmt(previousVisitors)+' in the preceding matching period ('+percent(visitors.percentChange)+').'
        :visitorsTrend==='down'
          ?'Wix traffic is below its previous comparable period ('+percent(visitors.percentChange)+').'
          :'Wix traffic is nearly unchanged from the previous comparable period ('+percent(visitors.percentChange)+').')
      :seo?.status==='connected'&&good(seo.metrics?.impressions)
        ?'Google showed DOCJAKS.COM '+fmt(seo.metrics.impressions)+' times. Search ranking growth is not yet established.'
        :'We need a verified current and previous period before calling discovery growth.';
    // 'What is working' must not turn a declining traffic metric into a win.
    // Highlight a supported positive signal instead; show mixed outcomes
    // honestly when average stay improves but fewer people visit.
    const working=stayTrend==='up'&&isTrend(stay)
      ?'Average time on site increased '+percent(stay.percentChange)+
        ' versus the preceding period'+(visitorsTrend==='down'?', although visitor traffic declined.':'.')
      :visitorsTrend==='up'&&isTrend(visitors)
        ?'Wix reports '+fmt(currentVisitors)+' visitors, '+percent(visitors.percentChange)+
          ' versus the preceding period.'
        :visitorsTrend==='steady'&&stayTrend==='steady'
          ?'Website traffic and average stay remained roughly steady.'
          :'No positive improvement is confirmed for these dates. '+discovering;
    let concern=ga4Gap(site,ga4)?'Wix reports '+fmt(site.sessions)+' sessions but GA4 shows '+fmt(ga4.metrics.sessions)+'. Some sessions may be excluded by consent, blockers, bot filtering, or a tracking setup issue.'
      :gaIssue?'Google Analytics is authorized, but its Data API is disabled. Website action data is unavailable in Social Command.'
      :stayTrend==='down'
        ?'Average time on site decreased '+Math.abs(stay.percentChange).toFixed(1)+'%. We have not yet separated actual radio listening from exits.'
        :visitorsTrend==='down'
          ?'Traffic decreased compared with the preceding equal-length period. Check which discovery channels declined.'
          :good(site?.bounceRate)&&site.bounceRate>=.7
            ?'Bounce rate is high, but that alone does not prove failure when visitors click out to listen to the radio.'
            :'We still need measured listening, membership actions and costs to tell whether attention creates business value.';
    let next='Measure actual radio listening and meaningful actions before grading customer growth.';
    let nextHref='';
    if(ga4Gap(site,ga4)){
      next='The Wix GA4 tag has been matched and a live phone visit was recorded. Compare future completed reporting periods, and investigate consent and bot filtering to explain the remaining Wix-versus-GA4 gap.';
      nextHref='https://analytics.google.com/';
    }else if(gaIssue){
      next='Enable the Google Analytics Data API in the Doc Jaks Social Command Google Cloud project, then check GA4 again.';
      nextHref='https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com';
    }else if(gaBlocked){
      next='Restore Google Analytics reporting first so visitor sources and actions can be measured.';
      nextHref='https://analytics.google.com/';
    }else if(!available){
      next='Restore Wix website reporting before grading movement.';
    }else if(stayTrend==='down'||(good(site?.bounceRate)&&site.bounceRate>=.7)){
      next='Track Listen Live link clicks and actual Radio.co listening before deciding whether short site visits are failures.';
    }else if(!salesReady){
      next='Check paid Wix orders, then connect product costs before calculating contribution margin.';
    }

    const smallSample=good(currentVisitors)&&good(previousVisitors)&&
      (currentVisitors<30||previousVisitors<30);
    const periodCaution=period?.range==='today'?'Today is incomplete; compare full days before drawing conclusions.'
      :period?.includesToday!==false?'This reporting window includes an unfinished day.':'';
    const coverage=[
      proof('DISCOVERY',visitorsTrend==='up'?'green':visitorsTrend==='down'?'red':'neutral',
        available&&good(currentVisitors)?fmt(currentVisitors)+' visitors':'N/A',
        isTrend(visitors)?percent(visitors.percentChange)+' vs preceding period':'Previous-period comparison pending'),
      proof('ENGAGEMENT',stayTrend==='up'?'green':stayTrend==='down'?'red':'neutral',
        available?time(site.avgTimeSeconds):'N/A',
        isTrend(stay)?percent(stay.percentChange)+' average-stay change':'Engagement comparison pending'),
      proof('MEANINGFUL ACTIONS',meaningfulAction.state,
        meaningfulAction.headline,meaningfulAction.note),
      proof('ONLINE SALES',salesReady?'neutral':'unknown',
        salesReady?fmt(sales.paidOrders)+' paid orders':'N/A',
        salesReady?money(sales.itemSalesCents)+' item sales (not profit)':'Paid order report unavailable'),
      proof('CONTRIBUTION MARGIN','unknown','NOT MEASURED',
        'Variable costs, fees and offline sales are not yet combined')
    ];
    const actionEvidence={
      contacts:phoneActions,
      purchases:salesReady?sales.paidOrders:null,
      purchasesAmount:salesReady?sales.itemSalesCents:null,
      ga4Signups:actualActions?.counts?.signUp??null,
      ga4RadioLinkClicks:actualActions?.radioLinkClicks??null
    };
    // Never call the whole business FORWARD without contribution margin and
    // reliable actions. Direction is limited to measured web momentum.
    return {overall:'BUSINESS RESULT NOT YET CONFIRMED',
      websiteDirection,directionColor,working,concern,next,nextHref,
      // Percentages always come from the matching Wix reporting periods.
      visitorDelta:isTrend(visitors)?visitors.percentChange:null,
      stayDelta:isTrend(stay)?stay.percentChange:null,
      coverage,actionEvidence,warnings,
      notes:[
        'Visitor growth, time on site and search appearances are different measurements. No platform totals are added together.',
        'Site bounces and outgoing clicks do not prove radio listening. Sales are not profit.',
        'Comparisons are against the preceding equal-length reporting period, not a different week or year.',
        smallSample?'Small comparison base: a few visitors may swing these percentages.':null,
        periodCaution
      ].filter(Boolean),
      bounceTrend,returnTrend,period:periodName(period)};
  }
  function issueList(site,ga4,seo){
    const issues=[];
    const verify=window.djomsGa4Verification;
    if(verify?.status==='mismatch')issues.push({key:'ga4-stream',
      title:'Google Analytics measurement ID does not match Wix',
      message:verify.message||'Check that Wix and Social Command use the same Google Analytics data stream.',
      url:'https://analytics.google.com/'});
    if(ga4Gap(site,ga4))issues.push({key:'ga4-coverage',
      title:'GA4 captures far fewer website sessions than Wix',
      message:'For these dates Wix reports '+fmt(site.sessions)+' sessions, while GA4 reports '+fmt(ga4.metrics.sessions)+'. Verify tracking and consent; these counts are not interchangeable.',
      url:'https://analytics.google.com/'});
    if(site&&site.connected===false){
      issues.push({key:'wix',title:'Wix website reports need attention',
        message:site.message||'The website reporting source is unavailable.',
        url:'https://manage.wix.com/'});
    }
    if(ga4&&ga4.status!=='connected'&&ga4.status!=='delayed'){
      const isApi=ga4.status==='enable-api';
      issues.push({key:'ga4',title:isApi?'Enable GA4 Data API':'Google Analytics reporting needs attention',
        message:isApi?'Authorize the Google Analytics Data API in Google Cloud. Your Wix tracking tag is already installed.':
          ga4.message||'Google Analytics reports are not yet usable.',
        url:isApi?'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com':
          'https://analytics.google.com/'});
    }
    if(seo&&seo.status!=='connected'&&seo.status!=='delayed'){
      issues.push({key:'seo',title:'Google Search data needs attention',
        message:seo.message||'Check Search Console permissions.',
        url:'https://search.google.com/search-console'});
    }
    return issues;
  }
  function syncAttention(issues){
    const old=Array.isArray(window.djomsAnalyticsIssues)?window.djomsAnalyticsIssues:[];
    window.djomsAnalyticsIssues=issues;
    const button=document.querySelector('.mission-top-attention');
    if(button&&button.dataset.baseAttention!==undefined){
      const base=Number(button.dataset.baseAttention)||0;
      const total=base+issues.length;
      const count=button.querySelector(':scope > strong');
      const small=button.querySelector('span:first-child small');
      if(count)count.textContent=String(total);
      if(small)small.textContent=(button.dataset.baseDescription||'Other platform issues')+
        ' · '+issues.length+' analytics issue'+(issues.length===1?'':'s');
      button.classList.remove('green','yellow','red');
      const baseColor=button.dataset.baseColor||'green';
      button.classList.add(baseColor==='red'?'red':issues.length||baseColor==='yellow'?'yellow':'green');
    }
    if(typeof activeView!=='undefined'&&activeView==='Needs Attention'&&
      JSON.stringify(old)!==JSON.stringify(issues)&&typeof render==='function')render();
  }
  function measure(label,content,comment){
    return '<div class="mission-direction-measure"><small>'+esc(label)+'</small>'+
      '<strong>'+esc(content)+'</strong><span>'+esc(comment)+'</span></div>';
  }
  // The existing Wix report API already compares with the preceding equal
  // period. Fetch 90 days only on owner request: no duplicate source and no
  // extra API cost on every dashboard load.
  let longView={status:'idle',date:'',data:null,error:null};
  const shift=(day,days)=>{
    const d=new Date(day+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()+days);
    return d.toISOString().slice(0,10);
  };
  const localToday=()=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  };
  const ninetyView=()=>{
    if(longView.status==='idle')return '<p><button type="button" data-direction-90="1">Compare the last 90 days with the 90 before</button></p>';
    if(longView.status==='loading')return '<p>Checking the last 90 days against the preceding 90 days…</p>';
    if(longView.status==='error')return '<p>'+esc(longView.error||'90-day comparison unavailable')+
      ' <button type="button" data-direction-90="1">Retry 90-day report</button></p>';
    const report=longView.data;
    const comparisons=report?.metricComparisons||{};
    const v=comparisons.visitors||{};
    const stay=comparisons.avgTimeSeconds||{};
    const visitorsText=good(v.currentVisitors)&&good(v.previousVisitors)
      ?fmt(v.currentVisitors)+' visitors in the latest 90 days versus '+fmt(v.previousVisitors)+' in the preceding 90 days'
      :'Visitor totals could not be verified for both 90-day periods';
    return '<p><b>90-DAY WEBSITE DIRECTION:</b> '+esc(visitorsText)+
      (isTrend(v)?' ('+esc(percent(v.percentChange))+')':'')+'. Average-stay change: '+
      esc(isTrend(stay)?percent(stay.percentChange):'not measured')+
      '. This is website data, not profit or verified listening. '+
      (report?.partial?'Some supporting Wix details are incomplete. ':'')+
      '<button type="button" data-direction-90="1">Refresh 90-day comparison</button></p>';
  };
  async function loadNinety(){
    if(longView.status==='loading')return;
    const today=localToday();
    longView={status:'loading',date:today,data:null,error:null};
    repaint();
    try{
      const start=shift(today,-89);
      const url='/api/meta/website-range?range=custom&start='+encodeURIComponent(start)+
        '&end='+encodeURIComponent(today);
      const response=await fetch(url,{
        credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(55000)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'90-day Wix report could not be loaded.');
      if(!data.connected||data.range?.start!==start||
         data.range?.end!==shift(today,1)||data.range?.days!==90)
        throw new Error('90-day report was incomplete or returned unmatched dates.');
      longView={status:'complete',date:today,data,error:null};
    }catch(error){
      longView={status:'error',date:today,data:null,
        error:error.name==='TimeoutError'?'Wix took too long; other reports remain unchanged.':
          String(error.message||'90-day report unavailable.')};
    }
    repaint();
  }


  // This needle uses only the Wix website trend already assessed in evaluate().
  // Green: both visitors and average stay improving. Red: both declining.
  // Yellow: mixed or inconclusive signals. Gray centered: insufficient data.
  // Never represent these as confirmed profit or business growth.
  function directionMeter(summary){
    const signal=summary?.directionColor;
    const category=signal==='green'?'forward':signal==='red'?'backward':
      signal==='yellow'?'watch':'unknown';
    const position=category==='forward'?16:category==='backward'?84:50;
    const caption=category==='forward'?'IMPROVING':category==='backward'?'DECLINING':
      category==='watch'?'WATCH · MIXED SIGNALS':'NOT ENOUGH DATA';
    const visitorDelta=typeof summary?.visitorDelta==='number'&&
      Number.isFinite(summary.visitorDelta)?summary.visitorDelta:null;
    const stayDelta=typeof summary?.stayDelta==='number'&&
      Number.isFinite(summary.stayDelta)?summary.stayDelta:null;
    const deltaState=visitorDelta===null?'unknown':visitorDelta>0?'up':
      visitorDelta<0?'down':'steady';
    const visitorText=visitorDelta===null?'N/A':percent(visitorDelta);
    const stayText=stayDelta===null?'N/A':percent(stayDelta);
    const meaning='Website momentum: '+caption+
      '. Visitor change: '+visitorText+'. Average-stay change: '+stayText+
      '. Compared with the preceding equal-length Wix reporting period. This does not establish business profit.';
    return '<div class="mission-direction-meter '+category+'" role="img" aria-label="'+esc(meaning)+'">'+
      '<div class="mission-direction-meter-top"><strong>WEBSITE MOMENTUM</strong>'+
        '<span class="mission-direction-meter-delta '+deltaState+'">'+
          '<b>'+esc(visitorText)+'</b><small>VISITORS</small></span></div>'+
      '<div class="mission-direction-meter-sub"><span>'+esc(caption)+'</span>'+
        '<small>AVG. STAY '+esc(stayText)+'</small></div>'+
      '<div class="mission-direction-meter-rail" style="--mission-direction-needle:'+position+'%">'+
        '<span class="mission-direction-meter-pointer" aria-hidden="true"></span>'+
      '</div>'+
      '<div class="mission-direction-meter-labels" aria-hidden="true">'+
        '<span>FORWARD</span><span>WATCH</span><span>BACKWARD</span>'+
      '</div>'+
    '</div>';
  }

  function paint(){
    const node=document.getElementById('missionDirectionPanel');
    if(!node)return;
    const period=safePeriod();
    const site=typeof websiteSnapshot==='function'?websiteSnapshot():null;
    const ga4=matched('ga4',period),seo=matched('seo',period),sales=matched('sales',period);
    const summary=evaluate(site,ga4,seo,sales,period);
    syncAttention(issueList(site,ga4,seo));
    const proof=summary.actionEvidence;
    node.innerHTML=
      '<div class="mission-direction-header"><div class="mission-direction-title-block">'+
        '<small>DOC JAKS · OWNER-FIRST BUSINESS INTELLIGENCE</small>'+
        '<h2>ARE WE MOVING FORWARD OR BACKWARD?</h2></div>'+
        directionMeter(summary)+
        '<span class="mission-direction-verdict">NOT YET PROVEN</span>'+
      '</div>'+
      '<p class="mission-direction-webtrend">WEBSITE TREND: <b class="'+esc(summary.directionColor)+'">'+
        esc(summary.websiteDirection)+'</b></p>'+
      '<div class="mission-direction-evidence">'+summary.coverage.map(item=>
        '<div class="mission-direction-signal '+esc(item.state)+'">'+
        '<small>'+esc(item.label)+'</small><strong>'+esc(item.headline)+'</strong>'+
        '<span>'+esc(item.note)+'</span></div>').join('')+'</div>'+
      '<div class="mission-direction-brief">'+
        measure('WHAT IS WORKING',summary.working,'Verified data, not a guess')+
        measure('WHAT NEEDS ATTENTION',summary.concern,'An exception to investigate')+
        '<div class="mission-direction-measure next"><small>WHAT SHOULD WE DO NEXT?</small>'+
          '<strong>'+esc(summary.next)+'</strong>'+
          (summary.nextHref?'<a href="'+esc(summary.nextHref)+'" target="_blank" rel="noopener noreferrer">Open next step ↗</a>':'')+
        '</div>'+
      '</div>'+
      '<details class="mission-direction-details"><summary>Evidence, meaningful actions and counting rules</summary>'+
        '<p><b>Business result:</b> '+esc(summary.overall)+
          '. Website movement is not the same as business profit.</p>'+
        '<div class="mission-direction-action-evidence">'+
          measure('Wix contact actions',fmt(proof.contacts),'Measured contact clicks plus forms, where available')+
          measure('Paid Wix orders',fmt(proof.purchases),'Refunded and unpaid orders excluded')+
          measure('GA4 sign-up events',fmt(proof.ga4Signups),'Not verified Pit Krewe memberships')+
          measure('Radio-related link clicks',fmt(proof.ga4RadioLinkClicks),'Not confirmed audio listeners')+
        '</div>'+
        '<p><b>What we still need:</b> actual Radio.co audience data, confirmed Pit Krewe signups, and variable costs before contribution margin can be assessed.</p>'+
        '<ul>'+summary.notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>'+
        '<p>The selected period is '+esc(summary.period)+'. The same date selection is used throughout the dashboard.</p>'+
        '<section class="mission-direction-ninety"><h4>Longer-term trend</h4>'+ninetyView()+'</section>'+
      '</details>';
  }
  function repaint(){try{paint();}catch(error){
    const box=document.getElementById('missionDirectionPanel');
    if(box)box.innerHTML='<h3>BUSINESS DIRECTION</h3><p>Could not verify the direction summary. Source reports remain available below.</p>';
  }}
  // The bridge script, SEO and Wix use the same owner-selected dates.
  const previous=window.renderConnectionStrip;
  if(typeof previous==='function'){
    window.renderConnectionStrip=function(...args){
      const result=previous.apply(this,args);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control')repaint();
      return result;
    };
  }
  document.addEventListener('djoms:verified-report',()=>{
    if(typeof activeView!=='undefined'&&activeView==='Mission Control')repaint();
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-direction-90]');
    if(!button)return;
    event.preventDefault();
    void loadNinety();
  });
  window.djomsDirectionEvaluate=evaluate;
  if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
     typeof owner!=='undefined'&&owner)repaint();
})();