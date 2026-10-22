/* DJOMS · Owner discovery spreadsheet · 22 sources, six measurements, 12 rows.
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
  function ga4Report(report){
    if(report?.status!=='connected'||report?.sourceDetails?.status!=='reported'||
        !Array.isArray(report.sourceDetails.rows))return null;
    return summarizeSources(report.sourceDetails.rows,true,report.metrics?.sessions);
  }
  function sourceNumber(data,key,measure){
    if(!data)return null;
    const bucket=data.buckets[key];
    if(!bucket)return measure==='visits'&&data.complete?0:null;
    if(measure==='visits')return bucket.sessions;
    return bucket.sessions>0&&bucket.stayComplete?
      bucket.weightedStay/bucket.sessions:null;
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
    if(!good(previous))return '<span class="mission-sheet-delta mission-sheet-unknown" title="No verified preceding period">CHANGE N/A</span>';
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
    const wix=wixReport(site),ga=ga4Report(ga4);
    const current=wix&&(wix.complete||Object.keys(wix.buckets).length)?wix:ga||wix;
    // Do not compare prior Wix attribution against present GA4 attribution.
    const last=current===wix&&current?priorSourceData(period):null;
    function raw(measure,source,which){
      if(measure==='visits'||measure==='stay')
        return sourceNumber(which==='last'?last:current,source,measure);
      if(source!=='google'||!google)return null;
      if(which==='last')return measure==='ctr'?ctrLast:pastSearch(
        measure==='appearances'?'impressions':measure);
      return measure==='appearances'?search.impressions:search[measure];
    }
    const head='<thead><tr>'+
      '<th scope="col" class="mission-sheet-metric">MEASUREMENT</th>'+
      '<th scope="col" class="mission-sheet-period">PERIOD</th>'+
      columns.map(([id,label],i)=>
        '<th scope="col" class="mission-sheet-source'+(id==='google'?' mission-sheet-google':'')+
        '"><span>'+(i+1)+'.</span> '+esc(label)+'</th>').join('')+
      '</tr></thead>';
    const body=measures.map(([metric,label])=>{
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
        '<th scope="row" class="mission-sheet-period">LAST</th>'+cells('last')+'</tr>'+
        '<tr class="mission-sheet-data-row mission-sheet-current">'+
        '<th scope="row" class="mission-sheet-period">CURRENT</th>'+
        cells('current')+'</tr>'+
        '<tr class="mission-sheet-data-row mission-sheet-change">'+
        '<th scope="row" class="mission-sheet-period">% CHANGE</th>'+
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
    return '<section class="mission-source-sheet" aria-label="Twenty-two traffic sources, six measures, eighteen Last Current and Percent Change data rows">'+
      '<div class="mission-sheet-heading"><div><h3>SEARCH & DISCOVERY · 22 SOURCES</h3>'+
      '<p>Six measurements with LAST, CURRENT and % CHANGE on separate rows.</p></div>'+
      '<strong>22 COLUMNS · 18 ROWS</strong></div>'+
      '<p class="mission-sheet-scroll-hint">SCROLL RIGHT TO SEE ALL SOURCES → The two left columns stay visible.</p>'+
      '<div class="mission-sheet-scroll" tabindex="0" role="region" aria-label="Horizontal source comparison spreadsheet">'+
        '<table class="mission-sheet-table">'+head+'<tbody>'+body+'</tbody></table>'+
      '</div>'+
      '<p class="mission-sheet-note">Google Search Console supplies search appearances, clicks, CTR and average position for Google only. '+
        'Website visits are attributed sessions from '+esc(provider)+
        ' and are not unique visitors. Previous source sessions use the preceding equal-length Wix report when available. '+
        'Wix and GA4 are never combined. Relative percent changes compare matching periods; lower average search position is better. '+
        'NEW is used instead of a percentage when the last value was zero. N/A means not applicable or unverified.</p>'+
      queryDetails+'</section>';
  }
  window.djomsSourceSpreadsheet=draw;
})();
