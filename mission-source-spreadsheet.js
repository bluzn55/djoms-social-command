/* DJOMS · Owner discovery spreadsheet · 22 sources plus totals, six measurements, 18 rows.
   Read-only; never treat unrelated providers' numbers as additive. */
(function discoveryWorkbook(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const good=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const whole=value=>good(value)?new Intl.NumberFormat('en-US').format(Math.round(value)):'N/A';
  const dateRx=/^\d{4}-\d{2}-\d{2}$/;
  const columns=[
    ['direct','DIRECT'],['google','GOOGLE SEARCH'],['maps','GOOGLE MAPS'],
    ['bing','BING'],['yahoo','YAHOO'],['duckduckgo','DUCKDUCKGO'],
    ['facebook','FACEBOOK'],['instagram','INSTAGRAM'],['x','X / TWITTER'],
    ['youtube','YOUTUBE'],['tiktok','TIKTOK'],['pinterest','PINTEREST'],
    ['reddit','REDDIT'],['yelp','YELP'],['nextdoor','NEXTDOOR'],
    ['ai','AI REFERRALS'],['outlaw','OUTLAW RADIO 5150'],
    ['websites','OTHER WEBSITES / BLOGS'],['email','EMAIL'],
    ['qr','QR CODES'],['ads','PAID ADS'],['other','OTHER REFERRALS']
  ];
  const measures=[
    ['appearances','SEARCH APPEARANCES'],
    ['clicks','SEARCH CLICKS'],
    ['ctr','CLICK-THROUGH RATE'],
    ['position','AVERAGE SEARCH POSITION'],
    ['visits','WEBSITE VISITS (SESSIONS)'],
    ['stay','AVERAGE WEBSITE STAY']
  ];
  // "Direct" is attribution, not proof of how a visitor heard about Doc Jaks.
  // Unmarked Google Maps, email and QR visits may fall into broader sources.
  function sourceKind(item){
    const name=String(item?.source||item?.sourceMedium||item?.referrer||'').toLowerCase();
    const cat=String(item?.category||'').toLowerCase();
    const s=name+' '+cat;
    if(/maps\.google|google\s*maps|google.*business\s*profile|google_business_profile|g\.page|(?:^|[\W_])gbp(?:[\W_]|$)/.test(s))return 'maps';
    if(/(?:^|[\W_])qr(?:[\W_]|$)|qr.?code|scan.?code/.test(s))return 'qr';
    if(/(?:^|[\W_])(?:cpc|ppc|paid|display|advertising|ads)(?:[\W_]|$)/.test(s))return 'ads';
    if(/outlawradio5150|outlaw\s*(?:radio\s*)?5150|51\.50/.test(s))return 'outlaw';
    if(/chatgpt|openai|perplexity|copilot|claude|gemini|deepseek|you\.com/.test(s))return 'ai';
    if(/facebook|fb\.me|\bfb\b/.test(s))return 'facebook';
    if(/instagram|ig\.me|\binsta\b/.test(s))return 'instagram';
    if(/youtube|youtu\.be/.test(s))return 'youtube';
    if(/twitter|t\.co|x\.com/.test(s)||name==='x'||name.startsWith('x /'))return 'x';
    if(/tiktok/.test(s))return 'tiktok';
    if(/pinterest/.test(s))return 'pinterest';
    if(/reddit/.test(s))return 'reddit';
    if(/yelp/.test(s))return 'yelp';
    if(/nextdoor/.test(s))return 'nextdoor';
    if(/duckduckgo|duck\.com/.test(s))return 'duckduckgo';
    if(/(?:^|\W)bing(?:\W|$)/.test(s))return 'bing';
    if(/yahoo/.test(s))return 'yahoo';
    if(/google/.test(s))return 'google';
    if(/newsletter|email|e-mail/.test(s))return 'email';
    if(/(?:^|\W)direct(?:\W|$)|\(direct\)|\(none\)/.test(s))return 'direct';
    if(/referral|referrer|blog|websites?|\.[a-z]{2,}(?:\W|$)/.test(s))return 'websites';
    return 'other';
  }
  function summarizeSources(rows,flag,total){
    const buckets=Object.create(null);
    let sum=0;
    for(const item of rows){
      if(!good(item?.sessions))continue;
      const key=sourceKind(item);
      const n=item.sessions;
      let bucket=buckets[key];
      if(!bucket)bucket=buckets[key]={sessions:0,weightedStay:0,stayComplete:true};
      bucket.sessions+=n;
      sum+=n;
      const avg=good(item.avgTimeSeconds)?item.avgTimeSeconds:
        good(item.averageSessionDuration)?item.averageSessionDuration:null;
      if(!good(avg))bucket.stayComplete=false;
      else bucket.weightedStay+=avg*n;
    }
    return {buckets,complete:flag===true&&(!good(total)||total===sum)};
  }
  function wixReport(report){
    if(report?.connected!==true||!Array.isArray(report.trafficSources))return null;
    return summarizeSources(report.trafficSources,report.trafficSourcesComplete,report.sessions);
  }
  // Wix already provides prior-period source rows in the same verified
  // report, so use them immediately instead of waiting for another request.
  function wixPriorReport(report){
    const rows=report?.trafficSourcesPrevious;
    if(report?.connected!==true||!Array.isArray(rows))return null;
    if(!rows.length&&report.trafficSourcesPreviousComplete!==true)return null;
    const previousSessions=report?.metricComparisons?.sessions?.previous;
    return summarizeSources(rows,report.trafficSourcesPreviousComplete,previousSessions);
  }
  function ga4Report(report,which='current'){
    const detail=which==='last'?report?.sourceDetailsPrevious:report?.sourceDetails;
    if(report?.status!=='connected'||detail?.status!=='reported'||
        !Array.isArray(detail.rows))return null;
    return summarizeSources(detail.rows,true,
      which==='current'?report.metrics?.sessions:null);
  }
  function sourceNumber(data,key,measure){
    if(!data)return null;
    const bucket=data.buckets[key];
    if(!bucket)return measure==='visits'&&data.complete?0:null;
    if(measure==='visits')return bucket.sessions;
    return bucket.sessions>0&&bucket.stayComplete?
      bucket.weightedStay/bucket.sessions:null;
  }
  // Complete-source fallback is only used for like-for-like Wix attribution.
  // Session durations are weighted by sessions; rates/positions are not summed.
  function completeSourceTotal(data,measure){
    if(!data?.complete)return null;
    const buckets=Object.values(data.buckets||{});
    const sessionTotal=buckets.reduce((sum,b)=>sum+b.sessions,0);
    if(measure==='visits')return sessionTotal;
    if(measure==='stay'&&sessionTotal>0&&buckets.every(b=>b.stayComplete))
      return buckets.reduce((sum,b)=>sum+b.weightedStay,0)/sessionTotal;
    return null;
  }
  // The existing read-only Wix range endpoint can provide an equal-length
  // prior period. A failure is N/A, never a fabricated zero.
  const priorCache=new Map(),pending=new Set();
  function priorSourceData(period){
    if(!dateRx.test(period?.start||'')||!dateRx.test(period?.end||''))return null;
    const start=Date.parse(period.start+'T00:00:00Z');
    const end=Date.parse(period.end+'T00:00:00Z');
    const days=Math.round((end-start)/86400000);
    if(!Number.isInteger(days)||days<1||days>366)return null;
    const previousStart=new Date(start-days*86400000).toISOString().slice(0,10);
    const previousEndInclusive=new Date(start-86400000).toISOString().slice(0,10);
    const key=previousStart+'|'+period.start;
    if(priorCache.has(key))return priorCache.get(key);
    if(!pending.has(key)){
      pending.add(key);
      const q='range=custom&start='+encodeURIComponent(previousStart)+
        '&end='+encodeURIComponent(previousEndInclusive);
      void fetch('/api/meta/website-range?'+q,{
        credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(45000)
      }).then(async response=>{
        if(!response.ok)return null;
        const report=await response.json();
        return report?.range?.start===previousStart&&report?.range?.end===period.start?
          wixReport(report):null;
      }).catch(()=>null).then(prior=>{
        priorCache.set(key,prior);
        pending.delete(key);
        document.dispatchEvent(new CustomEvent('djoms:verified-report',{
          detail:{source:'wix-prior-source-attribution'}
        }));
      });
    }
    return null;
  }
  function nice(measure,value){
    if(!good(value))return 'N/A';
    if(measure==='ctr')return (value*100).toFixed(1)+'%';
    if(measure==='position')return value.toFixed(1);
    if(measure==='stay'){
      const secs=Math.round(value);
      return Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0');
    }
    return whole(value);
  }
  function signal(measure,previous,current){
    if(!good(previous)||!good(current)||previous===current)return '';
    const up=measure==='position'?current<previous:current>previous;
    return up?' mission-sheet-up':' mission-sheet-down';
  }
  // A compact trend under each CURRENT amount. Green means improving;
  // average search position improves when its numeric value decreases.
  function changeBadge(measure,previous,current){
    if(!good(current))return '';
    if(!good(previous))return '<span class="mission-sheet-delta mission-sheet-unknown" title="No verified preceding period">N/A</span>';
    if(previous===current)return '<span class="mission-sheet-delta mission-sheet-flat">0.0%</span>';
    if(previous===0){
      return '<span class="mission-sheet-delta mission-sheet-up" title="Previous value is zero; relative percent is undefined">↑ NEW</span>';
    }
    const delta=(current-previous)/previous*100;
    if(!Number.isFinite(delta))return '';
    const abs=Math.abs(delta);
    const places=abs>0&&abs<0.1?2:1;
    const arrow=delta>0?'↑':'↓';
    const improving=measure==='position'?delta<0:delta>0;
    const tone=improving?'mission-sheet-up':'mission-sheet-down';
    return '<span class="mission-sheet-delta '+tone+
      '" title="Versus verified last period'+
      (measure==='position'?'; a lower search position is better':'')+'">'+
      arrow+abs.toFixed(places)+'%</span>';
  }
  function draw({site,ga4,seo,period}={}){
    const google=seo?.status==='connected';
    const search=google?seo.metrics||{}:{};
    const compared=google&&seo.comparison?.status==='reported'?seo.comparison:null;
    const pastSearch=name=>good(compared?.[name]?.previous)?
      compared[name].previous:null;
    const ctrLast=good(pastSearch('ctr'))?pastSearch('ctr'):
      good(pastSearch('impressions'))&&pastSearch('impressions')>0&&
      good(pastSearch('clicks'))?
      pastSearch('clicks')/pastSearch('impressions'):null;
    // Same-period Maps data comes from the separately authorized GBP report.
    // Maps impressions do not get added to the Search Console total.
    const savedMaps=window.djomsVerifiedReports?.maps;
    const maps=period?.query&&savedMaps?.data&&savedMaps.query===period.query&&
      savedMaps.data.range?.start===period.start&&
      savedMaps.data.range?.end===period.end?
      savedMaps.data:null;
    const savedBing=window.djomsVerifiedReports?.bing;
    const bing=period?.query&&savedBing?.data&&savedBing.query===period.query&&
      savedBing.data.range?.start===period.start&&
      savedBing.data.range?.end===period.end?
      savedBing.data:null;
    const wix=wixReport(site),ga=ga4Report(ga4),gaPrior=ga4Report(ga4,'last');
    const current=wix&&(wix.complete||Object.keys(wix.buckets).length)?wix:ga||wix;
    // Compare Wix with Wix, never a mix of Wix and GA4. Wix already
    // returns the matching previous source rows; old range fetch is fallback.
    const last=current===wix&&current?
      (wixPriorReport(site)||priorSourceData(period)):null;
    function raw(measure,source,which){
      if(measure==='visits')
        return sourceNumber(which==='last'?last:current,source,measure);
      if(measure==='stay'){
        // GA4 reports source-level average session duration in seconds;
        // Wix attribution currently reports sessions only. Do not mix
        // providers across the Last / Current comparison.
        if(ga)return sourceNumber(which==='last'?gaPrior:ga,source,'stay');
        return sourceNumber(which==='last'?last:current,source,'stay');
      }
      if(source==='maps'){
        if(measure!=='appearances'||maps?.status!=='connected')return null;
        if(which==='current')return good(maps.metrics?.impressions)?maps.metrics.impressions:null;
        return maps.comparison?.status==='reported'&&
          good(maps.comparison?.appearances?.previous)?
          maps.comparison.appearances.previous:null;
      }
      if(source==='bing'){
        if(bing?.status!=='connected'||measure==='position')return null;
        const field=measure==='appearances'?'impressions':measure;
        if(which==='current')return good(bing.metrics?.[field])?bing.metrics[field]:null;
        return bing.comparison?.status==='reported'&&
          good(bing.comparison?.[field]?.previous)?
          bing.comparison[field].previous:null;
      }
      if(source!=='google'||!google)return null;
      if(which==='last')return measure==='ctr'?ctrLast:pastSearch(
        measure==='appearances'?'impressions':measure);
      return measure==='appearances'?search.impressions:search[measure];
    }
    // Search counts include only verified Google Search and Bing providers.
    // Maps profile impressions do not belong in these website-search totals.
    // A missing prior period for any connected source makes the past N/A
    // instead of comparing a partial past against a wider current total.
    const searchProviders=[...(google?['google']:[]),
      ...(bing?.status==='connected'?['bing']:[])];
    // Do not add provider totals with different observed date ranges.
    const sameSearchWindow=searchProviders.length<2||(
      bing?.currentRange?.start===seo?.comparison?.currentRange?.start&&
      bing?.currentRange?.end===seo?.comparison?.currentRange?.end);
    const sameSearchPrevious=searchProviders.length<2||(
      bing?.previousRange?.start===seo?.comparison?.previousRange?.start&&
      bing?.previousRange?.end===seo?.comparison?.previousRange?.end);
    function measuredSearchTotal(measure,which){
      if(!searchProviders.length||!sameSearchWindow||
        (which==='last'&&!sameSearchPrevious))return null;
      if(measure==='position')return searchProviders.length===1&&
        searchProviders[0]==='google'?raw('position','google',which):null;
      if(measure==='ctr'){
        const clicks=measuredSearchTotal('clicks',which);
        const impressions=measuredSearchTotal('appearances',which);
        return good(clicks)&&good(impressions)&&impressions>0?
          clicks/impressions:null;
      }
      const values=searchProviders.map(source=>raw(measure,source,which));
      return values.every(good)?values.reduce((sum,n)=>sum+n,0):null;
    }
    const totalValue=(measure,which)=>{
      if(['appearances','clicks','ctr','position'].includes(measure))
        return measuredSearchTotal(measure,which);
      if(current===wix&&current){
        if(which==='current'){
          if(measure==='visits'&&good(site?.sessions))return site.sessions;
          if(measure==='stay'&&good(site?.avgTimeSeconds))return site.avgTimeSeconds;
        }else{
          const metric=measure==='visits'?'sessions':'avgTimeSeconds';
          const previous=site?.metricComparisons?.[metric]?.previous;
          if(good(previous))return previous;
        }
        return completeSourceTotal(which==='last'?last:current,measure);
      }
      if(current===ga&&current&&which==='current'){
        if(measure==='visits'&&good(ga4?.metrics?.sessions))return ga4.metrics.sessions;
        if(measure==='stay'&&good(ga4?.metrics?.averageSessionDuration))
          return ga4.metrics.averageSessionDuration;
        return completeSourceTotal(current,measure);
      }
      return null;
    };
    const headerName=(id,label)=>
      id==='maps'
        ?'<span class="mission-sheet-maps-heading"><span class="mission-sheet-maps-words"><b>GOOGLE</b><b>MAPS</b></span></span>'
        :esc(label);
    const head='<thead><tr>'+
      '<th scope="col" class="mission-sheet-metric">MEASUREMENT</th>'+
      '<th scope="col" class="mission-sheet-total" title="Verified measured Google Search and Bing sources; Maps profile appearances excluded">TOTAL</th>'+
      '<th scope="col" class="mission-sheet-period">PERIOD</th>'+
      columns.map(([id,label])=>
        '<th scope="col" class="mission-sheet-source'+(id==='google'?' mission-sheet-google':'')+
        '" title="'+(id==='direct'
            ?'Direct-attributed website sessions from Wix; not proof a person typed the URL'
            :esc(label))+'">'+headerName(id,label)+'</th>').join('')+
      '</tr></thead>';
    const body=measures.map(([metric,label])=>{
      const totalPrevious=totalValue(metric,'last');
      const totalCurrent=totalValue(metric,'current');
      const totalCell=which=>{
        const value=which==='last'?totalPrevious:totalCurrent;
        const isChange=which==='change';
        const tone=which==='last'?'':signal(metric,totalPrevious,totalCurrent);
        const mark=isChange
          ?(good(totalCurrent)?changeBadge(metric,totalPrevious,totalCurrent):
            '<span class="mission-sheet-delta mission-sheet-unknown">N/A</span>')
          :'<span class="mission-sheet-main">'+esc(nice(metric,value))+'</span>';
        const scope=metric==='position'
          ?'Ranking cannot be combined across Google and Bing; N/A when more than one engine reports'
          :['appearances','clicks','ctr'].includes(metric)
          ?'Measured Google Search and Bing only, not all search engines; Maps profile impressions excluded'
          :'Overall '+(current===wix?'Wix':current===ga?'Google Analytics':'unverified')+
            ' measure; not the sum of incomplete source categories';
        return '<td class="mission-sheet-number mission-sheet-total-cell'+tone+
          (isChange?' mission-sheet-change-cell':'')+
          (!isChange&&!good(value)?' mission-sheet-na':'')+
          '" title="'+esc(scope)+'">'+mark+'</td>';
      };
      const cells=which=>columns.map(([id])=>{
        const previous=raw(metric,id,'last'),current=raw(metric,id,'current');
        const value=which==='last'?previous:current;
        const tone=which==='current'?signal(metric,previous,current):'';
        return '<td class="mission-sheet-number'+tone+
          (!good(value)?' mission-sheet-na':'')+'">'+
          '<span class="mission-sheet-main">'+esc(nice(metric,value))+'</span></td>';
      }).join('');
      const changes=columns.map(([id])=>{
        const previous=raw(metric,id,'last'),current=raw(metric,id,'current');
        const tone=signal(metric,previous,current);
        return '<td class="mission-sheet-number mission-sheet-change-cell'+tone+'">'+
          (good(current)?changeBadge(metric,previous,current):
            '<span class="mission-sheet-delta mission-sheet-unknown">N/A</span>')+
          '</td>';
      }).join('');
      return '<tr class="mission-sheet-data-row mission-sheet-last">'+
        '<th rowspan="3" scope="rowgroup" class="mission-sheet-metric">'+esc(label)+'</th>'+
        totalCell('last')+
        '<th scope="row" class="mission-sheet-period">LAST</th>'+cells('last')+'</tr>'+
        '<tr class="mission-sheet-data-row mission-sheet-current">'+
        totalCell('current')+
        '<th scope="row" class="mission-sheet-period">CURRENT</th>'+
        cells('current')+'</tr>'+
        '<tr class="mission-sheet-data-row mission-sheet-change">'+
        totalCell('change')+
        '<th scope="row" class="mission-sheet-period" style="white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important">'+
        '<span class="mission-sheet-period-label" style="display:inline-block!important;white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important">%&nbsp;CHANGE</span></th>'+
        changes+'</tr>';
    }).join('');
    const queries=google&&Array.isArray(seo.topQueries)?
      seo.topQueries.filter(row=>typeof row?.query==='string'&&row.query.trim()).slice(0,5):[];
    const queryDetails=queries.length?
      '<details class="mission-sheet-queries"><summary>TOP GOOGLE SEARCHES ▸</summary>'+
      '<div class="mission-sheet-query-rows">'+queries.map(q=>
        '<div><strong>'+esc(q.query)+'</strong><span>'+esc(whole(q.impressions))+
        ' appearances · '+esc(whole(q.clicks))+' clicks (current)</span></div>'
      ).join('')+'</div></details>':'';
    const provider=current===wix&&current?'Wix':
      current===ga&&current?'Google Analytics':'N/A';
    const bingNote=bing?.status==='connected'?
      ' Bing Webmaster searches include its reported search verticals. Bing average position is N/A because the overall traffic API does not report it.':
      bing?.status==='needs-setup'?
      ' Bing search reporting needs a verified DOCJAKS.COM property and a private BING_WEBMASTER_API_KEY configured in the DJOMS backend. <a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer">Open Bing Webmaster Tools ↗</a>':
      bing?.status==='needs-site'?
      ' Bing search reporting needs verified DOCJAKS.COM. <a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer">Verify or import from Google Search Console ↗</a>':
      bing?.status==='incomplete'?
      ' Bing daily reporting is incomplete for these dates, so unverified periods remain N/A.':
      bing?.status==='needs-attention'||bing?.status==='unavailable'?
      ' Bing Webmaster: '+esc(bing.message||'Reporting unavailable.')+'.':
      '';
    const mapNote=maps?.status==='connected'?
      ' Google Maps appearances come from Business Profile desktop/mobile daily impressions; they are not unique people or site visits. Google does not provide a separate Maps CTR or average search position through that report.':
      maps?.status==='not-connected'?
      ' Google Maps appearances need Business Profile authorization. <a href="/api/meta/local-google-connect">Connect Google Business Profile ↗</a>':
      maps?.status==='needs-location'?
      ' Google Maps appearances need a selected location in REVIEWS & LOCAL.':
      maps?.status==='reconnect'?
      ' Google Business Profile needs reconnection in REVIEWS & LOCAL.':
      maps?.status==='unavailable'?
      ' Google Maps appearances: '+esc(maps.message||'API permission or data unavailable.')+'.':
      '';
    return '<section class="mission-source-sheet" aria-label="Twenty-two traffic sources, six measures, eighteen Last Current and Percent Change data rows">'+
      '<div class="mission-sheet-heading"><div><h3>SEARCH & DISCOVERY · 22 SOURCES</h3>'+
      '<p>Six measurements with LAST, CURRENT and % CHANGE on separate rows.</p></div>'+
      '<strong>22 SOURCES + TOTAL · 18 ROWS</strong></div>'+
      '<p class="mission-sheet-scroll-hint">SCROLL RIGHT FOR ALL 22 SOURCES → MEASUREMENT, TOTAL and PERIOD stay visible.</p>'+
      '<div class="mission-sheet-scroll" tabindex="0" role="region" aria-label="Horizontal source comparison spreadsheet">'+
        '<table class="mission-sheet-table">'+head+'<tbody>'+body+'</tbody></table>'+
      '</div>'+
      '<p class="mission-sheet-note">TOTAL is immediately after MEASUREMENT. Search counts cover connected Google Search and Bing reporting only, never every possible search engine. Google Maps profile impressions are excluded. Search totals remain N/A when provider reporting dates differ. '+
        'Search CTR is calculated from same-period clicks and appearances, while search rankings cannot be combined across engines. '+
        'Website visit and stay totals come from the overall '+esc(provider)+' report, not from adding incomplete source rows. '+
        'Website visits are attributed sessions from '+esc(provider)+
        ' and are not unique visitors. Previous source sessions use Wix\'s matching preceding period when verified; otherwise N/A. '+
        'Wix and GA4 session counts are never added. Source-specific average stay uses GA4 session duration when verified (and may differ from the Wix overall average). Relative percent changes compare matching periods; lower average search position is better. '+
        'NEW is used instead of a percentage when the last value was zero. N/A means not applicable or unverified.'+bingNote+mapNote+'</p>'+
      queryDetails+'</section>';
  }
  window.djomsSourceSpreadsheet=draw;
})();
