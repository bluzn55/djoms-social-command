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

  // Business indicator is independent of the website momentum needle.
  // Only two *complete*, identically scoped Wix paid WEB-order reports can
  // turn it green or red. Sales ≠ contribution margin or profit. Other
  // divisions can be added later when their own business KPIs are verified.
  function assessBusiness(sales,period){
    const base={
      state:'yellow',headline:'NOT YET PROVEN',scope:'WEB SALES',
      detail:'Waiting for verified paid sales comparisons.',
      explanation:'Business momentum not yet established. Sales and costs need verified period comparisons.'
    };
    if(sales?.connected!==true||sales?.complete!==true||
      period?.start!==sales.range?.start||period?.end!==sales.range?.end)
      return base;
    const cmp=sales.salesComparison;
    const integer=n=>Number.isSafeInteger(n)&&n>=0;
    const present=cmp?.current||{},previous=cmp?.previous||{};
    if(cmp?.status!=='reported'||cmp?.previousRange?.end!==sales.range.start||
      ![present.paidOrders,present.itemSalesCents,
        previous.paidOrders,previous.itemSalesCents].every(integer)||
      present.paidOrders!==sales.paidOrders||present.itemSalesCents!==sales.itemSalesCents){
      return {...base,headline:'COMPARISON PENDING',
        detail:'Current Wix web orders verified; previous matching period N/A.',
        explanation:'The comparison cannot be verified for both reporting periods.'};
    }
    const o=present.paidOrders,p=previous.paidOrders;
    const revenue=present.itemSalesCents,prior=previous.itemSalesCents;
    const shared=money(revenue)+' vs '+money(prior)+' · PROFIT N/A';
    const orders=o+' paid '+(o===1?'order':'orders')+' versus '+p+' in the prior period';
    if(revenue>prior&&o>=p)
      return {state:'green',headline:'WEB SALES UP',scope:'WEB SALES',
        detail:shared,
        explanation:'Verified web item sales improved: '+money(revenue)+' versus '+money(prior)+
          ', with '+orders+'. Contribution margin and overall profit remain unverified.'};
    if(revenue<prior&&o<=p)
      return {state:'red',headline:'WEB SALES DOWN',scope:'WEB SALES',
        detail:shared,
        explanation:'Verified web item sales declined: '+money(revenue)+' versus '+money(prior)+
          ', with '+orders+'. Contribution margin and overall profit remain unverified.'};
    if(revenue===prior&&o===p)
      return {state:'yellow',headline:o===0?'NO PAID SALES YET':'SALES HOLDING',
        scope:'WEB SALES',detail:shared,
        explanation:o===0?
          'Zero verified paid web orders in both comparable periods. No growth or decline has been established.':
          'Verified web sales are unchanged at '+money(revenue)+' and '+o+
            ' paid orders in both periods. Profit remains unverified.'};
    return {state:'yellow',headline:'MIXED SALES',scope:'WEB SALES',
      detail:shared,
      explanation:'Verified web sales and paid-order count moved in different directions ('+
        money(revenue)+' versus '+money(prior)+'; '+orders+
        '). The business verdict stays yellow until the results agree.'};
  }

  // Each input uses the preceding comparable period as 100 points.
  // E.g. visits -39.2% => 60.8, average stay +195.4% => 295.4.
  // The combined result is the arithmetic MEAN, giving equal weight to each.
  // Score 100 is the center line. This is a website-only relative index,
  // not a probability, profit figure, visitor count, or capped percentage.
  function quickNeedle(visitorComparison,stayComparison){
    if(!isTrend(visitorComparison)||!isTrend(stayComparison))
      return {kind:'unknown',label:'N/A',score:null,visitsPoints:null,
        stayPoints:null,position:50,explanation:'Both comparable Wix trends are required.'};
    const visitsPoints=100+visitorComparison.percentChange;
    const stayPoints=100+stayComparison.percentChange;
    // Reported percentage changes are finite, but cannot generate a
    // meaningful index if a source returns an impossible negative baseline.
    if(!good(visitsPoints)||!good(stayPoints))
      return {kind:'unknown',label:'N/A',score:null,visitsPoints:null,
        stayPoints:null,position:50,explanation:'Invalid comparison values.'};
    const score=(visitsPoints+stayPoints)/2;
    const kind=score>100.05?'up':score<99.95?'down':'hold';
    const label=kind==='up'?'UP':kind==='down'?'DOWN':'HOLD';
    // Exact score is shown; only the on-screen pointer is capped so it
    // always stays visible even if average stay grows more than 200%.
    const position=Math.min(95,Math.max(5,100-Math.min(200,Math.max(0,score))/2));
    return {kind,label,score,visitsPoints,stayPoints,position,
      explanation:'Visits '+visitsPoints.toFixed(1)+' points and average stay '+
        stayPoints.toFixed(1)+' points. Equal average '+score.toFixed(1)+
        '; 100 is the prior-period baseline.'};
  }

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
    const needle=quickNeedle(visitors,stay);
    const currentVisitors=good(site?.visitors)?site.visitors:visitors?.currentVisitors;
    const previousVisitors=good(visitors?.previousVisitors)?visitors.previousVisitors:null;
    const salesReady=sales?.connected===true&&sales?.complete===true&&Number.isSafeInteger(sales.paidOrders);
    const businessStatus=assessBusiness(sales,period);
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
    if(needle.kind!=='unknown'){
      const signals=visitorsTrend==='down'&&stayTrend==='up'?
        ' · VISITORS DOWN, AVG. STAY UP':
        visitorsTrend==='up'&&stayTrend==='down'?
        ' · VISITORS UP, AVG. STAY DOWN':'';
      websiteDirection=(needle.kind==='up'?'UP':needle.kind==='down'?'DOWN':'HOLD')+
        ' BY EQUAL-POINT SCORE'+signals;
      directionColor=needle.kind==='up'?'green':needle.kind==='down'?'red':'yellow';
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
      ?'Average stay is '+time(site.avgTimeSeconds)+' ('+
        percent(stay.percentChange)+'). Engagement earns '+
        (needle.stayPoints===null?'N/A':needle.stayPoints.toFixed(1))+
        ' points against its previous 100, '+(visitorsTrend==='down'?
          'enough to outweigh the visitor decline in the equal-point average.':
          'a positive signal for the website index.')

      :visitorsTrend==='up'&&isTrend(visitors)
        ?'Wix reports '+fmt(currentVisitors)+' visitors, '+percent(visitors.percentChange)+
          ' versus the preceding period.'
        :visitorsTrend==='steady'&&stayTrend==='steady'
          ?'Website traffic and average stay remained roughly steady.'
          :'No positive improvement is confirmed for these dates. '+discovering;
    let concern=visitorsTrend==='down'&&isTrend(visitors)
      ?'Visits fell '+Math.abs(visitors.percentChange).toFixed(1)+'% to '+fmt(currentVisitors)+
        (good(previousVisitors)?' (from '+fmt(previousVisitors)+').':'.')+
        ' The visitor score is below 100; the combined score can still be up when average stay improves more. '+
        (ga4Gap(site,ga4)?'Wix shows '+fmt(site.sessions)+' sessions versus GA4 '+fmt(ga4.metrics.sessions)+
          '; tracking coverage also needs checking.':'Compare source channels to see where visits declined.')
      :ga4Gap(site,ga4)?'Wix reports '+fmt(site.sessions)+' sessions but GA4 shows '+fmt(ga4.metrics.sessions)+'. Some sessions may be excluded by consent, blockers, bot filtering, or a tracking setup issue.'
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
    if(visitorsTrend==='down'&&isTrend(visitors)&&available){
      next='Improve traffic: compare Direct, Google, Facebook and Instagram to see what declined. Keep what holds attention. The score is an index, not verified sales or profit.';
      if(ga4Gap(site,ga4)){
        next+=' Also check the Wix-versus-GA4 session gap before relying on source totals.';
        nextHref='https://analytics.google.com/';
      }
    }else if(ga4Gap(site,ga4)){
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
      proof('VISITS',visitorsTrend==='up'?'green':visitorsTrend==='down'?'red':'neutral',
        available&&good(currentVisitors)?fmt(currentVisitors)+' visitors':'N/A',
        isTrend(visitors)?percent(visitors.percentChange)+' vs preceding period':'Previous-period comparison pending'),
      proof('ENGAGEMENT',stayTrend==='up'?'green':stayTrend==='down'?'red':'neutral',
        available?time(site.avgTimeSeconds):'N/A',
        isTrend(stay)?'Avg. time on site '+percent(stay.percentChange)+' vs preceding period':'Avg. time on site; comparison pending'),
      proof('MEANINGFUL ACTIONS',meaningfulAction.state,
        meaningfulAction.headline,meaningfulAction.note),
      proof('ONLINE SALES',salesReady?businessStatus.state:'unknown',
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
    return {overall:businessStatus.explanation,businessStatus,
      websiteDirection,directionColor,needle,working,concern,next,nextHref,
      // Percentages always come from the matching Wix reporting periods.
      visitorDelta:isTrend(visitors)?visitors.percentChange:null,
      stayDelta:isTrend(stay)?stay.percentChange:null,
      coverage,actionEvidence,warnings,
      notes:[
        'Equal-weight website index: prior-period visitors = 100 points and prior-period average stay = 100 points; the needle uses their arithmetic average. Above 100 is up, below 100 down.',
        'This index averages two separate relative change indices, not visitor counts, unique people, GA4 sessions, or money. Exceptional changes in average stay can outweigh a decline in visitors.',
        'Visitor growth, time on site and search appearances are otherwise different measurements.',
        'Site bounces and outgoing clicks do not prove radio listening. Verified web-sales growth does not prove profit or overall business health.',
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

  // Clickable owner dashboard evidence. Counts are separate measurements:
  // a download is not a sale, a sign_up event is not a Pit Krewe membership,
  // and outbound clicks are not confirmed Radio.co listening sessions.
  let actionDetailsOpen=false;
  let selectedAction='downloads';
  const verifiedUrl=(value)=>{
    try {
      const url=new URL(String(value||''));
      return ['https:','http:'].includes(url.protocol)?url.href:null;
    } catch {return null;}
  };
  const fileLink=(url,label)=>{
    const destination=verifiedUrl(url);
    return destination?'<a href="'+esc(destination)+'" target="_blank" rel="noopener noreferrer" title="Open original link in a new tab">'+esc(label)+' ↗</a>':'';
  };
  const count=value=>good(value)?fmt(value):'N/A';
  const evidenceRowLink=(row)=>{
    const label=row.fileName&&row.fileName!=='(not set)'?row.fileName:'Filename N/A';
    return fileLink(row.linkUrl,label)||'<strong>'+esc(label)+'</strong>';
  };
  function inlineFileLinks(ga4){
    const total=ga4?.actions?.counts?.fileDownload;
    if(!good(total)||total===0)return '';
    const files=ga4?.actions?.downloadFiles;
    const unavailable='<div class="mission-action-card-files">'+
      '<small>DIRECT FILE LINKS: N/A</small>'+
      '<em>Open details to inspect available download evidence.</em></div>';
    if(files?.status!=='reported'||!Array.isArray(files.rows))return unavailable;
    const rows=files.rows.filter(row=>good(row.events)&&verifiedUrl(row.linkUrl));
    if(!rows.length)return unavailable;
    return '<div class="mission-action-card-files"><small>OPEN FILE DIRECTLY</small>'+
      rows.slice(0,3).map(row=>fileLink(row.linkUrl,
        row.fileName&&row.fileName!=='(not set)'?row.fileName:'Open file')).join('')+
      (rows.length>3?'<em>+'+(rows.length-3)+' more in details</em>':'')+'</div>';
  }
  function actionTable(headers,rows){
    return rows.length?'<div class="mission-action-table-scroll"><table class="mission-action-table">'+
      '<thead><tr>'+headers.map(t=>'<th scope="col">'+esc(t)+'</th>').join('')+
      '</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':'';
  }
  function actionsDetail(site,ga4,sales,period){
    const actions=ga4?.connected===true&&ga4?.actions?.status==='reported'?ga4.actions:null;
    const counts=actions?.counts||{};
    const contactsKnown=good(site?.contactClicks)&&good(site?.formsSubmitted)&&site?.connected===true;
    const contacts=contactsKnown?site.contactClicks+site.formsSubmitted:null;
    const verifiedOrders=sales?.connected===true&&sales?.complete===true&&
      sales?.range?.start===period?.start&&sales?.range?.end===period?.end&&
      Number.isSafeInteger(sales.paidOrders)&&sales.paidOrders>=0;
    const orders=verifiedOrders?sales.paidOrders:null;
    const tabs=[
      {id:'downloads',label:'FILE DOWNLOADS',value:count(counts.fileDownload),sub:'GA4 events'},
      {id:'krewe',label:'PIT KREWE MEMBERS',value:'N/A',sub:'GA4 sign-up events: '+count(counts.signUp)},
      {id:'contacts',label:'CONTACT ACTIONS',value:count(contacts),sub:'Measured Wix clicks + forms'},
      {id:'radio',label:'RADIO LISTENERS',value:'N/A',sub:'Radio link clicks: '+count(actions?.radioLinkClicks)},
      {id:'orders',label:'PAID WEB ORDERS',value:count(orders),sub:'Verified Wix transactions'}
    ];
    let detail='';
    if(selectedAction==='downloads'){
      const fileData=actions?.downloadFiles;
      const rows=Array.isArray(fileData?.rows)?fileData.rows.filter(r=>good(r.events)):[];
      detail='<h4>DOWNLOADS BY FILE</h4>'+
        '<p>GA4 recorded <b>'+esc(count(counts.fileDownload))+
        '</b> download events for these dates. A download event is not necessarily a successful transfer or a unique visitor.</p>'+
        (fileData?.status==='reported'?
          '<p class="mission-action-good">File-by-file totals match the GA4 download event count.</p>':
          '<p class="mission-action-warning">File details are N/A or incomplete'+
            (fileData?.status==='mismatch'?' (totals do not reconcile)':'')+'. The GA4 total above remains separate.</p>')+
        actionTable(['FILE / OPEN ORIGINAL','EVENTS'],rows.map(row=>
          '<tr><td>'+evidenceRowLink(row)+
          (row.extension&&row.extension!=='(not set)'?'<small>Type: '+esc(row.extension)+'</small>':'')+
          (row.linkUrl&&verifiedUrl(row.linkUrl)?'<small class="mission-action-url">'+esc(row.linkUrl)+'</small>':
            '<small>Direct link N/A</small>')+
          '</td><td>'+esc(count(row.events))+'</td></tr>'))+
        (rows.length===0?'<p>No individual files were returned for these dates.</p>':'')+
        '<p>Links open the original website file. Your browser or Wix may preview it, require access, or start a download.</p>'+
        fileLink('https://analytics.google.com/','Open Google Analytics');
    } else if(selectedAction==='krewe'){
      const info=actions?.eventPages;
      const rows=Array.isArray(info?.rows)?info.rows.filter(r=>r.eventName==='sign_up'&&good(r.events)):[];
      detail='<h4>PIT KREWE REGISTRATIONS</h4>'+
        '<p><b>Confirmed new members: N/A.</b> Wix membership records are not linked to this scorecard yet.</p>'+
        '<p>GA4 sign_up events: <b>'+esc(count(counts.signUp))+
        '</b>. These events do not prove a completed Pit Krewe registration.</p>'+
        (info?.status!=='reported'?'<p class="mission-action-warning">Page-level evidence incomplete or N/A.</p>':'')+
        actionTable(['PAGE WITH SIGN-UP EVENT','EVENTS'],rows.map(row=>
          '<tr><td>'+esc(row.pagePath||'N/A')+'</td><td>'+esc(count(row.events))+'</td></tr>'));
    } else if(selectedAction==='contacts'){
      const info=actions?.eventPages;
      const rows=Array.isArray(info?.rows)?info.rows.filter(r=>r.eventName==='form_submit'&&good(r.events)):[];
      detail='<h4>CONTACTS AND FORMS</h4>'+
        '<p>Wix contact clicks: <b>'+esc(count(site?.connected===true?site.contactClicks:null))+
        '</b>; Wix submitted forms: <b>'+esc(count(site?.connected===true?site.formsSubmitted:null))+
        '</b>. Combined Wix contact actions: <b>'+esc(count(contacts))+'</b>.</p>'+
        '<p>GA4 form_submit events: <b>'+esc(count(counts.formSubmit))+
        '</b>. This is independent of Wix and is not added to the Wix total.</p>'+
        (info?.status!=='reported'?'<p class="mission-action-warning">Page-level evidence incomplete or N/A.</p>':'')+
        actionTable(['PAGE WITH FORM EVENT','EVENTS'],rows.map(row=>
          '<tr><td>'+esc(row.pagePath||'N/A')+'</td><td>'+esc(count(row.events))+'</td></tr>'));
    } else if(selectedAction==='radio'){
      const info=actions?.radioLinks;
      const rows=Array.isArray(info?.rows)?info.rows.filter(r=>good(r.clicks)):[];
      detail='<h4>OUTLAW RADIO 5150</h4>'+
        '<p><b>Confirmed listening sessions: N/A.</b> Radio.co listener data is not linked to this scorecard.</p>'+
        '<p>GA4 radio-related outbound link clicks: <b>'+esc(count(actions?.radioLinkClicks))+
        '</b>. Clicking a player link is not proof of listening.</p>'+
        (info?.status!=='reported'?'<p class="mission-action-warning">Individual radio link URLs incomplete or N/A.</p>':'')+
        actionTable(['RADIO LINK','CLICKS'],rows.map(row=>
          '<tr><td>'+fileLink(row.linkUrl,row.domain||'Open radio link')+
          (row.linkUrl?'<small class="mission-action-url">'+esc(row.linkUrl)+'</small>':'')+
          '</td><td>'+esc(count(row.clicks))+'</td></tr>'));
    } else if(selectedAction==='orders'){
      detail='<h4>PAID ONLINE ORDERS</h4>'+
        '<p>Verified Wix paid orders: <b>'+esc(count(orders))+'</b>. Item sales: <b>'+
        esc(verifiedOrders?money(sales.itemSalesCents):'N/A')+'</b> (not profit).</p>'+
        '<p>GA4 add-to-cart events: <b>'+esc(count(counts.addToCart))+
        '</b>; checkout starts: <b>'+esc(count(counts.beginCheckout))+
        '</b>. Events do not count as paid orders.</p>'+
        '<p>'+fileLink('https://manage.wix.com/','Open Wix to inspect transactions')+'</p>';
    }
    return '<div class="mission-action-head"><div><strong>MEANINGFUL ACTIONS · REAL EVIDENCE</strong>'+
      '<small>'+esc(periodName(period))+' · N/A = not verified</small></div>'+
      '<button type="button" data-direction-actions-toggle="1">Close ×</button></div>'+
      '<div class="mission-action-tabs" role="group" aria-label="Meaningful actions">'+
        tabs.map(tab=>'<button type="button" data-direction-action="'+tab.id+
          '" aria-pressed="'+(selectedAction===tab.id)+'" class="mission-action-tab'+
          (selectedAction===tab.id?' selected':'')+'"><small>'+esc(tab.label)+
          '</small><strong>'+esc(tab.value)+'</strong><span>'+esc(tab.sub)+
          '</span></button>').join('')+
      '</div><div class="mission-action-body">'+detail+'</div>';
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


  // Single vertical scale, green above the 100-point middle,
  // red below it. The needle is a horizontal arm aimed at the score.
  function directionMeter(summary){
    const needle=summary?.needle||quickNeedle(null,null);
    const vd=typeof summary?.visitorDelta==='number'&&
      Number.isFinite(summary.visitorDelta)?summary.visitorDelta:null;
    const sd=typeof summary?.stayDelta==='number'&&
      Number.isFinite(summary.stayDelta)?summary.stayDelta:null;
    const scoreText=needle.score===null?'N/A':needle.score.toFixed(1);
    const label=needle.kind==='unknown'?'N/A':needle.label;
    const meaning='Website momentum score: '+scoreText+'. '+needle.explanation+
      ' Compared with the preceding equal-length reporting period. '+
      'This is not business profit.';
    return '<div class="mission-direction-meter score-meter '+esc(needle.kind)+
      '" role="img" aria-label="'+esc(meaning)+'">'+
        '<div class="mission-direction-meter-top"><strong>WEBSITE MOMENTUM</strong>'+
          '<div class="mission-score-summary"><b>'+esc(scoreText)+'</b>'+
          '<small>POINTS · '+esc(label)+'</small></div></div>'+
        '<div class="mission-score-vertical" style="--mission-score-y:'+
          esc(needle.position.toFixed(1))+'%" aria-hidden="true">'+
          '<div class="mission-score-scale">'+
            '<span class="mission-score-center-line"></span></div>'+
          '<div class="mission-score-pointer"></div>'+
          '<div class="mission-score-axis-labels">'+
            '<span>GREEN · UP</span><span>100 · HOLD</span><span>RED · DOWN</span>'+
          '</div></div>'+
        '<div class="mission-score-breakdown">'+
          '<span>VISITS <b>'+esc(needle.visitsPoints===null?'N/A':needle.visitsPoints.toFixed(1))+
            ' pts</b> <small>('+esc(percent(vd))+')</small></span>'+
          '<span>ENGAGEMENT <b>'+esc(needle.stayPoints===null?'N/A':needle.stayPoints.toFixed(1))+
            ' pts</b> <small>('+esc(percent(sd))+')</small></span></div>'+
        '<small class="mission-score-caption">Each starts at 100; average determines pointer</small>'+
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
        '<div class="mission-direction-verdict '+esc(summary.businessStatus.state)+'" role="status" '+
          'title="'+esc(summary.businessStatus.explanation)+'">'+
          '<small>BUSINESS RESULTS</small>'+
          '<strong>'+esc(summary.businessStatus.headline)+'</strong>'+
          '<span>'+esc(summary.businessStatus.detail)+'</span></div>'+
      '</div>'+
      '<p class="mission-direction-webtrend">WEBSITE TREND: <b class="'+esc(summary.directionColor)+'">'+
        esc(summary.websiteDirection)+'</b></p>'+
      '<div class="mission-direction-evidence">'+summary.coverage.map(item=>{
        if(item.label!=='MEANINGFUL ACTIONS')
          return '<div class="mission-direction-signal '+esc(item.state)+'">'+
            '<small>'+esc(item.label)+'</small><strong>'+esc(item.headline)+'</strong>'+
            '<span>'+esc(item.note)+'</span></div>';
        return '<div class="mission-direction-signal '+esc(item.state)+'">'+
          '<small>'+esc(item.label)+'</small>'+
          '<button type="button" class="mission-action-open" data-direction-actions-toggle="1"'+
          ' aria-expanded="'+(actionDetailsOpen?'true':'false')+'" aria-controls="missionActionDetails">'+
          esc(item.headline)+'<em>'+ (actionDetailsOpen?'HIDE DETAILS ▲':'VIEW DETAILS ▼')+'</em></button>'+
          '<span>'+esc(item.note)+'</span>'+inlineFileLinks(ga4)+'</div>';
      }).join('')+'</div>'+
      '<section id="missionActionDetails" class="mission-action-panel"'+
        (actionDetailsOpen?'':' hidden')+'>'+
        (actionDetailsOpen?actionsDetail(site,ga4,sales,period):'')+'</section>'+
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
    const toggle=event.target.closest('[data-direction-actions-toggle]');
    if(toggle){
      event.preventDefault();
      actionDetailsOpen=!actionDetailsOpen;
      if(actionDetailsOpen&&selectedAction==='downloads')selectedAction='downloads';
      repaint();
      if(actionDetailsOpen)document.getElementById('missionActionDetails')?.scrollIntoView({
        block:'nearest',behavior:'smooth'
      });
      return;
    }
    const tab=event.target.closest('[data-direction-action]');
    if(tab){
      event.preventDefault();
      selectedAction=tab.dataset.directionAction||'downloads';
      repaint();
      document.querySelector('#missionActionDetails [data-direction-action="'+selectedAction+'"]')?.focus({preventScroll:true});
      return;
    }
    const button=event.target.closest('[data-direction-90]');
    if(!button)return;
    event.preventDefault();
    void loadNinety();
  });
  window.djomsDirectionEvaluate=evaluate;
  if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
     typeof owner!=='undefined'&&owner)repaint();
})();