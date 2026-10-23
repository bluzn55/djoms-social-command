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
  const time=value=>good(value)?Math.floor(Math.round(value)/60)+'m '+(Math.round(value)%60)+'s':'N/A';
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
  // These two cards use the exact signed percentage, not the +/-5%
  // smoothing used for the larger website momentum assessment.
  const changeColor=comparison=>!isTrend(comparison)?'neutral':
    comparison.percentChange>0?'green':comparison.percentChange<0?'red':'neutral';
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

  // WEBSITE DIRECTION ONLY: equally weight the change in Wix visitors
  // and the change in average time on site. Their percentage changes
  // come from the preceding equally long period. No profit is inferred.
  // A 1% or 2% change must be visible. The pointer's position is
  // intentionally nonlinear near zero; the numeric percent stays exact.
  const signedChange=(value)=>{
    if(typeof value!=='number'||!Number.isFinite(value))return 'N/A';
    const decimals=Math.abs(value)>0&&Math.abs(value)<0.1?2:1;
    const shown=value.toFixed(decimals);
    return (value>0?'+':'')+shown+'%';
  };
  function quickNeedle(visitorComparison,stayComparison){
    const empty=(message)=>({kind:'unknown',label:'N/A',score:null,
      changePercent:null,visitsPoints:null,stayPoints:null,
      position:50,explanation:message});
    if(!isTrend(visitorComparison)||!isTrend(stayComparison))
      return empty('Both comparable Wix trends are required.');
    const visitsChange=visitorComparison.percentChange;
    const stayChange=stayComparison.percentChange;
    const visitsPoints=100+visitsChange;
    const stayPoints=100+stayChange;
    if(!good(visitsPoints)||!good(stayPoints))
      return empty('Invalid source comparison values.');
    const changePercent=(visitsChange+stayChange)/2;
    if(!Number.isFinite(changePercent))return empty('Combined change is not finite.');
    const score=100+changePercent;
    const kind=changePercent>0?'up':changePercent<0?'down':'hold';
    const label=kind==='up'?'UP':kind==='down'?'DOWN':'HOLD';
    const magnitude=Math.abs(changePercent);
    // A slight change still moves the pointer clearly away from center.
    // The signed percentage shown beside it is the actual calculated value.
    const distance=magnitude===0?0:9+35*magnitude/(magnitude+20);
    const position=Math.min(94,Math.max(6,50-Math.sign(changePercent)*distance));
    return {kind,label,score,changePercent,visitsPoints,stayPoints,position,
      explanation:'Equal-weight direction from visit change '+signedChange(visitsChange)+
        ' and average-stay change '+signedChange(stayChange)+
        '. Composite '+signedChange(changePercent)+
        '. This is an indicator, not actual sales or profit growth.'};
  }


  // The 100-baseline weighted score lives in mission-owner-score.js.
  // Keep source-specific directional diagnostics for the detailed panels.
  const changeMotion=(comparison,inverse=false)=>{
    if(!comparison||!Number.isFinite(comparison.percentChange))return 'unknown';
    const change=(inverse?-1:1)*comparison.percentChange;
    return change>0?'up':change<0?'down':'hold';
  };
  const safeMotion=value=>['up','down','hold','mixed'].includes(value)?value:'unknown';
  const measureRatio=value=>good(value)&&value<=1?(value*100).toFixed(1)+'%':'N/A';
  function momentumScore(site,ga4,seo,sales,period){
    const weighted=typeof window.djomsOwnerScore==='function'?
      window.djomsOwnerScore(site,ga4,seo,sales,period):null;
    const section=id=>weighted?.stages?.find(item=>item.id===id);
    const gsc=seo?.status==='connected'&&seo?.comparison?.status==='reported'?
      seo.comparison:null;
    return {...(weighted||{score:null,kind:'unknown',verdict:'UNVERIFIED',
      position:50,stages:[],covered:0,availableWeight:0,
      parts:[],note:'The owner scoring model is unavailable.'}),
      google:section('search')?.status||'unknown',
      traffic:section('sources')?.status||'unknown',
      engagement:section('engagement')?.status||'unknown',
      business:section('sales')?.status||'unknown',
      googleImpressions:changeMotion(gsc?.impressions),
      googleClicks:changeMotion(gsc?.clicks),
      salesVerdict:assessBusiness(sales,period)
    };
  }
  function stageScore(meter,id){
    const section=meter?.stages?.find(s=>s.id===id);
    const state=section?.status||'unknown';
    const score=Number.isInteger(section?.score)?section.score:null;
    const tooltip=score===null?'This section lacks a verified previous/current comparison':
      '100 is unchanged; '+section.weight+' importance points; '+
      section.measured+' measured signals. 101+ forward, 99- backward.';
    return '<strong class="mission-stage-score story-'+safeMotion(state)+
      '" title="'+esc(tooltip)+'">SCORE '+(score===null?'N/A':score)+'</strong>';
  }
  const storyNumber=value=>good(value)?fmt(value):'N/A';
  function storyRow(label,value,direction='unknown'){
    return '<div class="mission-story-row"><span>'+esc(label)+'</span><strong class="story-'+
      safeMotion(direction)+'">'+esc(value)+'</strong></div>';
  }
  // Side-by-side verified period values. Never invent a missing previous value.
  // Per-metric colors use verified, comparable values, not the parent card score.
  // Bounce rate and search position improve when they decrease.
  function readableAmount(value){
    if(value===null||value===undefined)return null;
    const valueText=String(value).trim();
    if(!valueText||valueText==='N/A'||valueText==='—')return null;
    const durationMatch=valueText.match(/^(\d+)m\s*(\d+)s$/i);
    if(durationMatch)return Number(durationMatch[1])*60+Number(durationMatch[2]);
    const shortTime=valueText.match(/^(\d+)s$/i);
    if(shortTime)return Number(shortTime[1]);
    const number=valueText.replace(/[$,%]/g,'').replace(/,/g,'');
    if(!/^(?:\d+)(?:\.\d+)?$/.test(number))return null;
    return Number(number);
  }
  function pairDirection(label,last,current){
    const previous=readableAmount(last),present=readableAmount(current);
    if(!good(previous)||!good(present))return 'unknown';
    if(previous===present)return 'hold';
    const lowerBetter=/bounce rate|search position|avg\. position/i.test(label||'');
    return ((present>previous)!==lowerBetter)?'up':'down';
  }
  function inlinePair(last,current,direction='unknown',label=''){
    const prev=last==null?'N/A':String(last);
    const now=current==null?'N/A':String(current);
    return '<span class="mission-pair-values story-'+pairDirection(label,prev,now)+
      '" title="'+esc('Last '+prev+', current '+now)+'">'+
      '<span class="mission-pair-last">'+
        '<span class="mission-pair-prefix">L</span>'+
        '<strong class="mission-pair-number">'+esc(prev)+'</strong></span>'+
      '<span class="mission-pair-current">'+
        '<span class="mission-pair-prefix">C</span>'+
        '<strong class="mission-pair-number">'+esc(now)+'</strong></span></span>';
  }
  function storyPairRow(label,last,current,direction='unknown'){
    return '<div class="mission-story-row mission-story-pair"><span>'+esc(label)+
      '</span>'+inlinePair(last,current,direction,label)+'</div>';
  }
  // Dedicated lower-evidence renderer. Explicit layout styles are intentional:
  // the lower 3 evidence cards must match the top owner cards even when an
  // older generic .mission-story-pair stylesheet rule is still in the cache.
  // All 21 lower data rows use the same fixed L / C positions.
  function detailPairRow(label,last,current,direction='unknown'){
    const before=last==null?'N/A':String(last);
    const after=current==null?'N/A':String(current);
    const directionClass=pairDirection(label,before,after);
    const numberStyle='font:900 18px/1.3 Arial,sans-serif;white-space:nowrap;';
    const partStyle='display:flex;align-items:center;justify-content:flex-start;'+
      'gap:5px;padding:4px 7px;min-width:0;box-sizing:border-box;'+
      'font:900 18px/1.3 Arial,sans-serif;white-space:nowrap;';
    return '<div class="mission-story-row mission-story-pair mission-detail-pair-row" '+
        'style="display:grid;grid-template-columns:minmax(0,1fr) 280px;'+
        'align-items:center;column-gap:12px;padding:8px 0;min-width:0;">'+
      '<span class="mission-detail-pair-label" '+
        'style="font:900 18px/1.3 Arial,sans-serif;min-width:0;">'+esc(label)+'</span>'+
      '<span class="mission-pair-values mission-detail-pair-values story-'+
        directionClass+'" title="'+esc('Last '+before+', current '+after)+'" '+
        'style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'+
        'width:280px;max-width:100%;min-width:0;justify-self:end;gap:0;'+
        'font:900 18px/1.3 Arial,sans-serif;white-space:nowrap;">'+
        '<span class="mission-pair-last" style="'+partStyle+'">'+
          '<span class="mission-pair-prefix" style="'+numberStyle+'">L</span>'+
          '<strong class="mission-pair-number" style="'+numberStyle+'">'+esc(before)+'</strong></span>'+
        '<span class="mission-pair-current" style="'+partStyle+
          'border-left:2px solid #c78a7b;">'+
          '<span class="mission-pair-prefix" style="'+numberStyle+'">C</span>'+
          '<strong class="mission-pair-number" style="'+numberStyle+'">'+esc(after)+'</strong></span>'+
      '</span></div>';
  }

  function storyCard(title,direction,body,note){
    const status={up:'UP',down:'DOWN',hold:'HOLD',mixed:'MIXED',unknown:'N/A'};
    return '<article class="mission-story-card story-'+safeMotion(direction)+'">'+
      '<header><h4>'+esc(title)+'</h4><strong>'+status[safeMotion(direction)]+'</strong></header>'+
      '<div class="mission-story-rows">'+body+'</div><p class="mission-story-note">'+esc(note)+'</p></article>';
  }
  function momentumBreakdown(site,ga4,seo,sales,period,score){
    const wix=site?.connected===true,google=seo?.status==='connected',
      ga=ga4?.status==='connected',g=google?seo.metrics||{}:{},
      gm=ga?ga4.metrics||{}:{},cmp=wix?site.metricComparisons||{}:{},
      actions=ga&&ga4.actions?.status==='reported'?ga4.actions:null;
    const gc=google&&seo.comparison?.status==='reported'?seo.comparison:null;
    const googleLast=key=>good(gc?.[key]?.previous)?gc[key].previous:null;
    const priorCtr=good(googleLast('impressions'))&&googleLast('impressions')>0&&good(googleLast('clicks'))
      ?googleLast('clicks')/googleLast('impressions'):null;
    const pair=detailPairRow;
    const trafficRows=[
      pair('Visitors',storyNumber(cmp.visitors?.previousVisitors),storyNumber(wix?site.visitors:null),score.traffic),
      pair('Page views',storyNumber(cmp.pageViews?.previous),storyNumber(wix?site.pageViews:null),
        changeMotion(cmp.pageViews)),
      pair('Wix sessions',storyNumber(cmp.sessions?.previous),storyNumber(wix?site.sessions:null)),
      pair('GA4 sessions (separate)','N/A',storyNumber(ga?gm.sessions:null))
    ];
    const sources=wix&&Array.isArray(site.trafficSources)?
      site.trafficSources.filter(s=>good(s.sessions)&&String(s.source||s.category||'').trim())
        .sort((a,b)=>b.sessions-a.sessions).slice(0,8):[];
    if(sources.length){
      trafficRows.push('<div class="mission-story-subhead">WIX VISIT SOURCES · SESSIONS</div>');
      for(const s of sources)
        trafficRows.push(pair(String(s.source||s.category).replace(/_/g,' '),'N/A',fmt(s.sessions)));
    }
    const trafficNote=(wix&&site.trafficSourcesComplete!==true?
      'Some source rows may be incomplete. ':'')+
      'Wix visitors and sessions are different measures. GA4 sessions are independent; never add Wix and GA4 totals.';
    const engagementRows=[
      pair('Average stay',time(cmp.avgTimeSeconds?.previous),time(wix?site.avgTimeSeconds:null),
        changeMotion(cmp.avgTimeSeconds)),
      pair('Bounce rate',measureRatio(cmp.bounceRate?.previous),measureRatio(wix?site.bounceRate:null),
        changeMotion(cmp.bounceRate,true)),
      pair('Pages per session',good(cmp.pagesPerSession?.previous)?cmp.pagesPerSession.previous.toFixed(2):'N/A',
        good(wix?site.pagesPerSession:null)?site.pagesPerSession.toFixed(2):'N/A'),
      pair('Returning visitors',storyNumber(cmp.returningVisitors?.previous),
        storyNumber(cmp.returningVisitors?.current),changeMotion(cmp.returningVisitors)),
      pair('GA4 engagement (separate)','N/A',measureRatio(ga?gm.engagementRate:null))
    ];
    const engagementNote='Higher average stay is encouraging, but bounce rate and repeat visits matter too. Radio listening cannot be inferred from website time.';
    const ordersReady=sales?.connected===true&&sales?.complete===true&&
      sales.range?.start===period?.start&&sales.range?.end===period?.end&&
      Number.isSafeInteger(sales.paidOrders)&&sales.paidOrders>=0&&
      Number.isSafeInteger(sales.itemSalesCents)&&sales.itemSalesCents>=0;
    const prior=ordersReady&&sales?.salesComparison?.status==='reported'&&
      sales.salesComparison.previousRange?.end===sales.range.start?
        sales.salesComparison.previous:null;
    const contacts=wix&&good(site.contactClicks)&&good(site.formsSubmitted)?
      site.contactClicks+site.formsSubmitted:null;
    const businessRows=[
      pair('Customer inquiries','N/A','N/A'),
      pair('Pit Krewe members','N/A','N/A'),
      pair('Wix contact actions','N/A',storyNumber(contacts)),
      pair('GA4 download events','N/A',storyNumber(actions?.counts?.fileDownload)),
      pair('GA4 radio link clicks','N/A',storyNumber(actions?.radioLinkClicks)),
      pair('Actual radio listeners','N/A','N/A'),
      pair('Paid web orders',storyNumber(prior?.paidOrders),storyNumber(ordersReady?sales.paidOrders:null)),
      pair('Gross web item sales',money(prior?.itemSalesCents),money(ordersReady?sales.itemSalesCents:null))
    ];
    const businessNote='Only verified paid Wix web orders count as online sales. Downloads and link clicks do not prove customers, memberships or listening.';
    const discovery=typeof window.djomsSourceSpreadsheet==='function'?
      window.djomsSourceSpreadsheet({site,ga4,seo,period}):
      '<p class="mission-sheet-note">Search comparison is not loaded. Refresh this page.</p>';
    return '<section class="mission-story mission-story-spreadsheet" '+
      'aria-label="Full-width discovery spreadsheet with website details underneath">'+
      discovery+
      '<div class="mission-story-website">'+
        storyCard('WEBSITE TRAFFIC & SOURCES',score.traffic,trafficRows.join(''),trafficNote)+
      '</div>'+
      '<div class="mission-story-grid mission-story-grid-supporting">'+
        storyCard('VISITOR ENGAGEMENT',score.engagement,engagementRows.join(''),engagementNote)+
        storyCard('ACTIONS & ONLINE SALES',score.business,businessRows.join(''),businessNote)+
      '</div>'+
      (typeof renderVisitorEvidence==='function'?renderVisitorEvidence(site):'')+
      '<p class="mission-story-coverage">'+esc(score.note)+'</p></section>';
  }

  // Owner customer journey. Google Search exposure and Wix-attributed
  // traffic describe different steps, not additive audience totals.
  function searchStageCard(seo,score){
    const valid=seo?.status==='connected',m=valid?seo.metrics||{}:{};
    const comparison=valid&&seo.comparison?.status==='reported'?seo.comparison:null;
    const last=key=>good(comparison?.[key]?.previous)?comparison[key].previous:null;
    const priorCtr=good(last('impressions'))&&last('impressions')>0&&good(last('clicks'))
      ?last('clicks')/last('impressions'):null;
    return '<article class="mission-direction-signal mission-stage-card mission-stage-google">'+
      '<div class="mission-stage-head"><small>1. SEARCH</small>'+
      stageScore(score,'search')+'</div>'+
      '<div class="mission-stage-rows">'+
        storyPairRow('Search appearances',storyNumber(last('impressions')),storyNumber(m.impressions),
          score?.googleImpressions)+
        storyPairRow('Search clicks',storyNumber(last('clicks')),storyNumber(m.clicks),
          score?.googleClicks)+
        storyPairRow('Search CTR',measureRatio(priorCtr),measureRatio(m.ctr))+
        storyPairRow('Search position',good(last('position'))?last('position').toFixed(1):'N/A',
          good(m.position)?m.position.toFixed(1):'N/A')+
      '</div><p class="mission-stage-foot">Google Search Console values. Bing is shown separately below; report dates may differ.</p></article>';
  }

  // Only the critical channel summary goes up here. The 23-source detail
  // spreadsheet below retains ALL traffic source metrics.
  function sourceStageCard(site,score){
    const linked=site?.connected===true;
    const currentRows=linked&&Array.isArray(site.trafficSources)?site.trafficSources:[];
    const previousRows=linked&&Array.isArray(site.trafficSourcesPrevious)?
      site.trafficSourcesPrevious:[];
    const c=linked?site.metricComparisons||{}:{};
    const summarize=rows=>{
      const buckets={direct:0,google:0,other:0},found=new Set();
      let total=0;
      for(const item of rows){
        if(!good(item?.sessions))continue;
        const name=String(item.source||'').toLowerCase();
        const cat=String(item.category||'').toLowerCase();
        let kind='other';
        if(/(?:^|[^a-z0-9])direct(?:$|[^a-z0-9])|\(direct\)/.test(name)||cat==='direct')
          kind='direct';
        else if(/google/.test(name)&&!/maps\.google|google\s*maps|g\.page/.test(name))
          kind='google';
        buckets[kind]+=item.sessions;found.add(kind);total+=item.sessions;
      }
      return {buckets,found,total};
    };
    const now=summarize(currentRows),prior=summarize(previousRows);
    const currentComplete=linked&&site.trafficSourcesComplete===true&&
      (!good(site.sessions)||now.total===site.sessions);
    const lastComplete=linked&&site.trafficSourcesPreviousComplete===true&&
      (!good(c.sessions?.previous)||prior.total===c.sessions.previous);
    const get=(snapshot,key,complete)=>snapshot.found.has(key)||complete?
      storyNumber(snapshot.buckets[key]):'N/A';
    const pair=(name,key)=>storyPairRow(name,linked?get(prior,key,lastComplete):'N/A',
      linked?get(now,key,currentComplete):'N/A');
    return '<article class="mission-direction-signal mission-stage-card mission-stage-sources">'+
      '<div class="mission-stage-head"><small>2. WEBSITE TRAFFIC &amp; SOURCES</small>'+
      stageScore(score,'sources')+'</div>'+
      '<div class="mission-stage-rows">'+
        storyPairRow('Wix sessions',storyNumber(c.sessions?.previous),
          storyNumber(linked?site.sessions:null),score?.traffic)+
        pair('Direct','direct')+
        pair('Google referrals','google')+
        pair('Other sources','other')+
      '</div><p class="mission-stage-foot">Wix sessions, not unique people. '+
      'Use Search &amp; Discovery below for the full source breakdown.'+
      ((!currentComplete||!lastComplete)?' Unverified rows show N/A.':'')+
      '</p></article>';
  }
  function periodKpi(item,site,score){
    const visits=item?.label==='VISITORS';
    const comparison=site?.connected===true?
      site.metricComparisons?.[visits?'visitors':'avgTimeSeconds']:null;
    const previous=visits?comparison?.previousVisitors:comparison?.previous;
    const current=visits?comparison?.currentVisitors:comparison?.current;
    const format=visits?storyNumber:time;
    const change=changeMotion(comparison);
    const returning=site?.connected===true?site.metricComparisons?.returningVisitors:null;
    const pages=site?.connected===true?site.metricComparisons?.pageViews:null;
    const bounce=site?.connected===true?site.metricComparisons?.bounceRate:null;
    const depth=site?.connected===true?site.metricComparisons?.pagesPerSession:null;
    const rows=[
      storyPairRow(visits?'Visitors':'Average stay',format(previous),format(current),change)
    ];
    if(visits){
      rows.push(storyPairRow('Returning visitors',storyNumber(returning?.previous),
        storyNumber(returning?.current),changeMotion(returning)));
      rows.push(storyPairRow('Page views',storyNumber(pages?.previous),
        storyNumber(site?.connected===true?site.pageViews:null),changeMotion(pages)));
    }else{
      rows.push(storyPairRow('Bounce rate',measureRatio(bounce?.previous),
        measureRatio(site?.connected===true?site.bounceRate:null),changeMotion(bounce,true)));
      rows.push(storyPairRow('Pages per session',
        good(depth?.previous)?depth.previous.toFixed(2):'N/A',
        good(site?.connected===true?site.pagesPerSession:null)?
          site.pagesPerSession.toFixed(2):'N/A'));
    }
    return '<div class="mission-direction-signal trend-metric mission-stage-card '+esc(item?.state)+'">'+
      '<div class="mission-stage-head"><small>'+
        esc(visits?'3. WEBSITE VISITORS':'4. VISITOR ENGAGEMENT')+'</small>'+
        stageScore(score,visits?'visitors':'engagement')+'</div>'+
      '<div class="mission-stage-rows">'+rows.join('')+'</div>'+
      '<p class="mission-stage-foot">Change vs last: <strong class="mission-stage-change story-'+
        safeMotion(change)+'">'+esc(Number.isFinite(comparison?.percentChange)?
          signedChange(comparison.percentChange):'N/A')+'</strong></p></div>';
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
    const momentum=momentumScore(site,ga4,seo,sales,period);
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

    const websiteDirection=momentum.verdict;
    const directionColor=momentum.kind==='up'?'green':
      momentum.kind==='down'?'red':momentum.kind==='unknown'?'unknown':'yellow';

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
      ?'Average time on site is '+time(site.avgTimeSeconds)+' ('+
        signedChange(stay.percentChange)+' versus the preceding period). '+
        (visitorsTrend==='down'
          ?'Average stay improved, but visitor traffic fell. The overall verdict must consider both.'
          :'People are spending more time on the site.')
      :visitorsTrend==='up'&&isTrend(visitors)
        ?'Wix reports '+fmt(currentVisitors)+' visitors, '+percent(visitors.percentChange)+
          ' versus the preceding period.'
        :visitorsTrend==='steady'&&stayTrend==='steady'
          ?'Website traffic and average stay remained roughly steady.'
          :'No positive improvement is confirmed for these dates. '+discovering;
    let concern=visitorsTrend==='down'&&isTrend(visitors)
      ?'Visits fell '+Math.abs(visitors.percentChange).toFixed(1)+'% to '+fmt(currentVisitors)+
        (good(previousVisitors)?' (from '+fmt(previousVisitors)+').':'.')+
        ' This needs attention even while average stay improves. '+
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
    // If search appearances increased but clicks declined, improve relevance
    // and the search result invitation before broad traffic advice.
    const googleComparison=seo?.status==='connected'&&
      seo.comparison?.status==='reported'?seo.comparison:null;
    const appearancesRose=good(googleComparison?.impressions?.previous)&&
      good(seo.metrics?.impressions)&&
      seo.metrics.impressions>googleComparison.impressions.previous;
    const clicksFell=good(googleComparison?.clicks?.previous)&&
      good(seo.metrics?.clicks)&&
      seo.metrics.clicks<googleComparison.clicks.previous;
    if(appearancesRose&&clicksFell){
      next='SEARCH: Appearances increased but clicks fell. Open TOP GOOGLE SEARCHES below; check the high-impression queries, improve the relevant page titles/descriptions and next-step invitations, then compare clicks next period.';
      nextHref='https://search.google.com/search-console';
    }else if(visitorsTrend==='down'&&isTrend(visitors)&&available){
      next='Improve traffic: compare Direct, Google, Facebook and Instagram to see what declined. Keep what holds attention.';
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
      proof('VISITORS',available?changeColor(visitors):'neutral',
        available&&good(currentVisitors)?fmt(currentVisitors):'N/A',
        available&&isTrend(visitors)?signedChange(visitors.percentChange):'N/A'),
      proof('ENGAGEMENT',available&&good(site?.avgTimeSeconds)?changeColor(stay):'neutral',
        available?time(site.avgTimeSeconds):'N/A',
        available&&good(site?.avgTimeSeconds)&&isTrend(stay)?signedChange(stay.percentChange):'N/A'),
      proof('ONLINE SALES',salesReady?businessStatus.state:'unknown',
        salesReady?fmt(sales.paidOrders)+' paid orders':'N/A',
        salesReady?money(sales.itemSalesCents)+' item sales (not profit)':'Paid order report unavailable'),
      proof('MEANINGFUL ACTIONS',meaningfulAction.state,
        meaningfulAction.headline,meaningfulAction.note)
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
      websiteDirection,directionColor,momentum,working,concern,next,nextHref,
      // Percentages always come from the matching Wix reporting periods.
      visitorDelta:isTrend(visitors)?visitors.percentChange:null,
      stayDelta:isTrend(stay)?stay.percentChange:null,
      coverage,actionEvidence,warnings,
      notes:[
        'Each stage starts at 100 with importance weights: Search 15 points, Traffic 20, Visitors 25, Engagement 15, Actions 10 and Paid Web Sales 15.',
        'Scores above 100 are green (forward), exactly 100 is yellow (unchanged), and 99 or below is red (backward). Missing comparisons remain N/A.',
        'Within each stage, verified metric changes are capped at plus or minus 40 points, so a dramatic percentage from a tiny base cannot erase large traffic losses.',
        'The overall index reweights available section scores and requires at least 50 out of 100 importance points in verified comparisons.',
        'The index is not measured revenue, profit, actual radio listening or confirmed Pit Krewe membership.',
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


  // Overall text is categorical. The four statuses stay individually colored.
  const directionClass=value=>Number.isFinite(value)?(value>0?'up':value<0?'down':'flat'):'unknown';
  function websiteTrendMarkup(summary){
    const score=summary?.momentum;
    if(!score)return '<b>NOT YET PROVEN</b>';
    const tone=status=>status==='up'?'up':status==='down'?'down':'flat';
    const word=status=>status==='unknown'?'N/A':status.toUpperCase();
    const primary='<b class="mission-trend-'+tone(score.kind)+'">'+
      esc(score.verdict)+'</b>';
    return primary+' <span aria-hidden="true"> · </span> '+
      score.parts.map(p=>'<b class="mission-trend-'+tone(p.status)+'">'+
        esc(p.name+' '+word(p.status))+'</b>').join(' <span aria-hidden="true"> · </span> ');
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
    return '<strong>'+esc(label)+'</strong>';
  };
  function actionTable(headers,rows){
    return rows.length?'<div class="mission-action-table-scroll"><table class="mission-action-table">'+
      '<thead><tr>'+headers.map(t=>'<th scope="col">'+esc(t)+'</th>').join('')+
      '</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':'';
  }

  // Four genuine outcomes in priority order, then separate GA4 download
  // interest. Counts are different things; never sum them into one total.
  function meaningfulActionsCard(site,ga4,sales,period,score){
    const gaActions=ga4?.connected===true&&ga4?.actions?.status==='reported'?
      ga4.actions:null;
    const downloads=good(gaActions?.counts?.fileDownload)?gaActions.counts.fileDownload:null;
    const rows=[
      {id:'contacts',label:'Customer Inquiries',value:null},
      {id:'krewe',label:'Pit Krewe Members',value:null},
      {id:'radio',label:'Radio Listeners',value:null},
      {id:'downloads',label:'File Downloads',value:downloads,secondary:true}
    ];
    return '<div class="mission-direction-signal action-summary-card mission-stage-card">'+
      '<div class="mission-stage-head"><small>5. MEANINGFUL ACTIONS</small>'+
        stageScore(score,'actions')+'</div>'+
      '<div class="mission-action-compact-rows">'+rows.map(item=>{
        const expanded=actionDetailsOpen&&selectedAction===item.id;
        return '<button type="button" class="mission-action-compact-row'+
          (item.secondary?' secondary':'')+(expanded?' selected':'')+
          '" data-direction-action-open="'+item.id+
          '" aria-expanded="'+(expanded?'true':'false')+
          '" aria-controls="missionActionDetails" title="See '+
          esc(item.label)+' details">'+
          '<span>'+esc(item.label)+'</span>'+
          inlinePair('N/A',count(item.value))+
          '<i aria-hidden="true">›</i></button>';
      }).join('')+'</div>'+
      '<button type="button" class="mission-action-compact-toggle" data-direction-actions-toggle="1"'+
        ' aria-expanded="'+(actionDetailsOpen?'true':'false')+'" aria-controls="missionActionDetails">'+
        (actionDetailsOpen?'Hide Details ▾':'Show Details ▸')+'</button>'+
    '</div>';
  }

  function actionsDetail(site,ga4,sales,period){
    const actions=ga4?.connected===true&&ga4?.actions?.status==='reported'?ga4.actions:null;
    const counts=actions?.counts||{};
    const contactsKnown=good(site?.contactClicks)&&good(site?.formsSubmitted)&&site?.connected===true;
    const contacts=contactsKnown?site.contactClicks+site.formsSubmitted:null;
    const verifiedOrders=sales?.connected===true&&sales?.complete===true&&
      sales?.range?.start===period?.start&&sales?.range?.end===period?.end&&
      Number.isSafeInteger(sales.paidOrders)&&sales.paidOrders>=0&&
      Number.isSafeInteger(sales.itemSalesCents)&&sales.itemSalesCents>=0;
    const orders=verifiedOrders?sales.paidOrders:null;
    const tabs=[
      {id:'orders',label:'GROSS SALES',value:verifiedOrders?money(sales.itemSalesCents):'N/A',
        sub:'Wix paid web items · before tax/shipping'},
      {id:'krewe',label:'PIT KREWE MEMBERS',value:'N/A',sub:'GA4 sign-up events: '+count(counts.signUp)},
      {id:'contacts',label:'CUSTOMER INQUIRIES',value:'N/A',sub:'Wix contact actions: '+count(contacts)},
      {id:'radio',label:'RADIO LISTENERS',value:'N/A',sub:'Radio link clicks: '+count(actions?.radioLinkClicks)},
      {id:'downloads',label:'FILE DOWNLOADS',value:count(counts.fileDownload),sub:'GA4 download events'}
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
        actionTable(['FILE','EVENTS'],rows.map(row=>
          '<tr><td>'+evidenceRowLink(row)+
          (row.extension&&row.extension!=='(not set)'?'<small>Type: '+esc(row.extension)+'</small>':'')+
          '</td><td>'+esc(count(row.events))+'</td></tr>'))+
        (rows.length===0?'<p>No individual files were returned for these dates.</p>':'')+
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
      detail='<h4>CUSTOMER INQUIRIES</h4>'+
        '<p><b>Verified customer inquiries: N/A.</b> Contact actions and submitted forms have not yet been classified as qualified business inquiries.</p>'+
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
      detail='<h4>GROSS SALES · WIX WEB</h4>'+
        '<p>Paid web item sales, before tax and shipping: <b>'+
        esc(verifiedOrders?money(sales.itemSalesCents):'N/A')+'</b>. Paid orders: <b>'+
        esc(count(orders))+'</b>.</p>'+
        '<p>This is the verified Wix website portion only, not total company-wide gross sales. '+
        'Offline sales are not connected, and this amount is not profit.</p>'+
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


  // Vertical centerline, with a horizontal pointer aimed at the score.
  // Zero is the middle; green/up at the top, red/down at the bottom.
  // For a small nonzero change, amplify the pointer offset for readability.
  // 100 = hold (yellow), 101+ = forward (green), 99- = backward
  // (red). Do not change these thresholds based on arbitrary +/-5% bands.
  function directionMeter(summary){
    const model=summary?.momentum;
    const number=Number.isInteger(model?.score)?model.score:null;
    const status=model?.kind||'unknown';
    const verdict=number===null?'UNVERIFIED':number>100?'FORWARD':
      number<100?'BACKWARD':'HOLDING';
    const pointer=typeof model?.position==='number'?model.position:50;
    const stages=Array.isArray(model?.stages)?model.stages:[];
    const message='Tracked online direction index: '+
      (number===null?'unverified':number+' points, '+verdict)+
      '. Baseline 100; 101 and above green, 100 yellow, 99 and below red. '+
      stages.map(v=>v.name+' '+(Number.isInteger(v.score)?v.score:'N/A')+
        ', influence '+v.weight+' points').join('; ')+
      '. This is NOT total business profit or revenue growth.';
    return '<div class="mission-direction-meter score-meter '+esc(status)+
      '" role="group" aria-label="'+esc(message)+'">'+
      '<div class="mission-direction-meter-top"><strong>OWNER DIRECTION</strong>'+
      '<div class="mission-score-summary">'+
        '<b class="mission-owner-number" data-mission-score="'+
        (number===null?'na':number)+'">'+(number===null?'N/A':number)+'</b>'+
        '<small>'+esc(verdict)+'</small>'+
      '</div></div>'+
      '<div class="mission-score-vertical" style="--mission-score-y:'+
        esc(pointer.toFixed(2))+'%" aria-hidden="true">'+
        '<div class="mission-score-scale"><span class="mission-score-center-line"></span></div>'+
        '<div class="mission-score-pointer"></div></div>'+
      '<p class="mission-score-boundaries"><b>101+ GREEN</b><b>100 YELLOW</b><b>99− RED</b></p>'+
      '<div class="mission-score-breakdown">'+
        stages.map(item=>'<span class="component-'+safeMotion(item.status)+
        '" title="'+esc(item.name+': weight '+item.weight+
          ' points. '+item.measured+' verified comparison metrics.')+'">'+
          '<span class="mission-score-component-name">'+esc(item.name)+
          '<small>'+item.weight+' pts</small></span>'+
          '<b>'+esc(Number.isInteger(item.score)?item.score:'N/A')+'</b>'+
        '</span>').join('')+
      '</div>'+
      '<p class="mission-score-coverage">'+esc((model?.covered??0)+
      '/6 verified sections · '+(model?.availableWeight??0)+
      '/100 weight. N/A excluded.')+'</p>'+
    '</div>';
  }
  function ownerDigest(summary){
    const score=summary?.momentum;
    const scoreText=Number.isInteger(score?.score)?
      score.score+' POINTS · '+score.verdict:'INSUFFICIENT DATA';
    const sections=[
      ['WHAT IS WORKING',summary.working,'working'],
      ['WHAT NEEDS ATTENTION',summary.concern,'attention'],
      ['WHAT TO DO NEXT',summary.next,'next']
    ];
    return '<section class="mission-owner-digest" aria-label="What happened and next steps">'+
      '<div class="mission-owner-digest-heading"><strong>OWNER SUMMARY</strong>'+
        '<span>'+esc(scoreText)+'</span></div>'+
      '<div class="mission-owner-digest-grid">'+sections.map(([title,value,style])=>
        '<article class="mission-owner-digest-item '+style+'">'+
        '<strong>'+esc(title)+'</strong><p>'+esc(value)+'</p></article>').join('')+
      '</div>'+
      '<p class="mission-owner-digest-caution">Scores measure change in tracked online signals, '+
      'not business profit, actual radio listening or confirmed Pit Krewe memberships.</p>'+
    '</section>';
  }
  function ownerScoreMethod(summary){
    const score=summary?.momentum;
    const stages=score?.stages||[];
    return '<details class="mission-owner-method">'+
      '<summary>HOW THE 100-POINT SCORES ARE CALCULATED ▸</summary>'+
      '<p>Each of six stages starts at 100. Scores 101 and above are green (forward); '+
        '100 is yellow (holding); 99 and below are red (backward). '+
        'The stages have different importance weights, totaling 100 points.</p>'+
      '<div class="mission-owner-weight-grid">'+stages.map(stage=>
        '<span><b>'+esc(stage.name)+'</b><strong>'+stage.weight+
          ' POINTS</strong><small>SCORE '+
          esc(Number.isInteger(stage.score)?stage.score:'N/A')+'</small></span>').join('')+
      '</div>'+
      '<p>Inside each section, verified period-to-period changes are weighted and '+
        'limited to 40 points above or below baseline, preventing one large percentage '+
        'from drowning out other evidence. Unverified Last/Current metrics remain N/A. '+
        'Unverified sections are excluded and the remaining section weights are '+
        'rebalanced; the owner meter needs at least 50 of the 100 importance points '+
        'measured before making a direction call.</p>'+
      '<p>Sales use paid Wix web orders and gross item sales only. Actions are '+
        'measured GA4 events, not proven customers or Pit Krewe memberships. '+
        'The index is a diagnostic signal, not a measured financial return.</p>'+
      '</details>';
  }

  // The Online Sales total comes from approved, fully PAID WEB orders,
  // excluding refunds and in-person orders. Categories come from the
  // optional verified Wix V3 catalog lookup, never product-name guesses.
  function onlineSalesCard(sales,period,score){
    const ready=sales?.connected===true&&sales?.complete===true&&
      sales?.range?.start===period?.start&&sales?.range?.end===period?.end&&
      Number.isSafeInteger(sales.paidOrders)&&sales.paidOrders>=0&&
      Number.isSafeInteger(sales.itemSalesCents)&&sales.itemSalesCents>=0;
    const amount=ready?money(sales.itemSalesCents):'N/A';
    const orders=ready?fmt(sales.paidOrders):'N/A';
    const salesPrior=ready&&sales?.salesComparison?.status==='reported'&&
      sales.salesComparison.previousRange?.end===sales.range.start?
        sales.salesComparison.previous:null;
    const categories=sales?.onlineCategories;
    const expected=['food','swag','music','books','bundles','review'];
    const groups=Array.isArray(categories?.groups)?categories.groups:[];
    const known=ready&&['reported','partial'].includes(categories?.status)&&
      categories.itemSalesCents===sales.itemSalesCents&&
      groups.length===expected.length&&
      groups.every((g,i)=>g?.id===expected[i]&&
        Number.isSafeInteger(g.itemSalesCents)&&g.itemSalesCents>=0&&
        Number.isSafeInteger(g.units)&&g.units>=0&&
        Array.isArray(g.products)&&g.products.every(p=>
          Number.isSafeInteger(p.itemSalesCents)&&p.itemSalesCents>=0&&
          Number.isSafeInteger(p.units)&&p.units>=0))&&
      groups.reduce((n,g)=>n+g.itemSalesCents,0)===sales.itemSalesCents;
    const partial=ready&&categories&&categories.status!=='reported';
    const categoriesHtml=known?
      (categories.status==='partial'?'<p class="mission-online-pending">Unclassified items appear under Needs Review. Category totals still match the verified online total.</p>':'')+
      '<div class="mission-online-groups">'+groups.map(group=>
      '<details class="mission-online-category"><summary>'+
        '<span>'+esc(group.label)+'</span><strong>'+esc(money(group.itemSalesCents))+'</strong>'+
        '<small>'+esc(fmt(group.units))+' units</small></summary>'+
        (group.products.length?
          '<div class="mission-online-items"><table><thead><tr>'+
          '<th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Sales</th>'+
          '</tr></thead><tbody>'+group.products.map(product=>
            '<tr><td>'+esc(product.name||'Item N/A')+
              (product.sku?'<small>SKU: '+esc(product.sku)+'</small>':'')+
              '</td><td>'+esc(fmt(product.units))+'</td>'+
              '<td>'+esc(money(product.itemSalesCents))+'</td></tr>'
          ).join('')+'</tbody></table></div>':
          '<p class="mission-online-empty">No sales recorded in this category.</p>')+
      '</details>').join('')+'</div>':
      '<p class="mission-online-pending">'+
        (ready?
          'Product-category breakdown: N/A. The verified online total remains available.'+
          (partial?' Wix category lookup is incomplete or unavailable.':'')
          :'Paid online sales have not been verified for these dates.')+
      '</p>';
    return '<section class="mission-direction-signal mission-online-summary mission-stage-card">'+
      '<div class="mission-stage-head"><small>6. PAID WEB SALES</small>'+
        stageScore(score,'sales')+'</div>'+
        '<span class="mission-online-source">Wix online only</span>'+
      '<div class="mission-stage-rows">'+
        storyPairRow('Paid orders',storyNumber(salesPrior?.paidOrders),orders)+
        storyPairRow('Gross item sales',money(salesPrior?.itemSalesCents),amount)+
      '</div><p class="mission-stage-foot">Paid web items before tax/shipping; no margins or profit inferred.</p>'+
      '<details class="mission-online-breakdown">'+
        '<summary><span class="mission-online-show">Show Categories ▸</span>'+
          '<span class="mission-online-hide">Hide Categories ▾</span></summary>'+
        '<div class="mission-online-breakdown-inner">'+
          '<p class="mission-online-description">Paid website store products only. Tax, shipping, market and event sales are excluded. Bundles are counted once.</p>'+
          categoriesHtml+
        '</div>'+
      '</details>'+
    '</section>';
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
    // Six stages in the order a person reaches and interacts with Doc Jaks.
    const visitors=summary.coverage.find(item=>item.label==='VISITORS');
    const engagement=summary.coverage.find(item=>item.label==='ENGAGEMENT');
    const leadingCards=[
      searchStageCard(seo,summary.momentum),
      sourceStageCard(site,summary.momentum),
      periodKpi(visitors,site,summary.momentum),
      periodKpi(engagement,site,summary.momentum),
      meaningfulActionsCard(site,ga4,sales,period,summary.momentum),
      onlineSalesCard(sales,period,summary.momentum)
    ].join('');
    node.innerHTML=
      '<div class="mission-direction-overview">'+
        '<div class="mission-direction-overview-main">'+
          '<div class="mission-direction-title-block">'+
            '<small>DOC JAKS · OWNER-FIRST BUSINESS INTELLIGENCE</small>'+
            '<h2>ARE WE MOVING FORWARD OR BACKWARD?</h2></div>'+
          '<p class="mission-stage-journey">THE OWNER VIEW: '+
            'SEARCH → TRAFFIC &amp; SOURCES → VISITORS → ENGAGEMENT → ACTIONS → SALES</p>'+
          '<div class="mission-direction-evidence mission-direction-top-evidence">'+
            leadingCards+'</div>'+
        '</div>'+
        '<div class="mission-direction-gauge-aside">'+directionMeter(summary)+'</div>'+
      '</div>'+
      (typeof window.djomsVisitorJourney==='function'
        ?window.djomsVisitorJourney({site,ga4,seo,sales,period}):'')+
      '<p class="mission-period-context">LAST = the preceding equal-length reporting period; CURRENT = selected dates ('+
        esc(periodName(period))+'). For Week this means the previous seven days versus the current seven days.</p>'+
      ownerDigest(summary)+
      ownerScoreMethod(summary)+
      momentumBreakdown(site,ga4,seo,sales,period,summary.momentum)+
      '<section id="missionActionDetails" class="mission-action-panel"'+
        (actionDetailsOpen?'':' hidden')+'>'+
        (actionDetailsOpen?actionsDetail(site,ga4,sales,period):'')+'</section>'+
      '<details class="mission-direction-details"><summary class="mission-direction-details-toggle">'+
        '<span class="mission-detail-show">Show Details</span>'+
        '<span class="mission-detail-hide">Hide Details</span></summary>'+
        '<p>Business direction evaluates multiple independent sources. Website direction is only one part; no website percentage implies business profit.</p>'+
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
    const clickedRow=event.target.closest('[data-direction-action-open]');
    if(clickedRow){
      event.preventDefault();
      const chosen=clickedRow.dataset.directionActionOpen;
      if(!['orders','krewe','contacts','radio','downloads'].includes(chosen))return;
      const wasOpen=actionDetailsOpen&&selectedAction===chosen;
      selectedAction=chosen;
      actionDetailsOpen=!wasOpen;
      repaint();
      if(actionDetailsOpen)document.getElementById('missionActionDetails')?.scrollIntoView({
        block:'nearest',behavior:'smooth'
      });
      return;
    }
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