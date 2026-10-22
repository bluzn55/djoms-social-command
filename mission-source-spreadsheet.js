/* DJOMS · Owner discovery spreadsheet · 23 tracked sources (4 grouped), six measurements, 18 rows.
   Read-only; never treat unrelated providers' numbers as additive. */
(function discoveryWorkbook(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const good=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const whole=value=>good(value)?new Intl.NumberFormat('en-US').format(Math.round(value)):'N/A';
  const dateRx=/^\d{4}-\d{2}-\d{2}$/;

  // Real AI referral origins, not generic search engine visits or social posts.
  const aiServices=[
    ['chatgpt','ChatGPT / OpenAI',/(?:^|[^a-z0-9])(?:chatgpt(?:\.com)?|chat\.openai\.com|openai(?:\.com)?)(?:$|[^a-z0-9])/],
    ['perplexity','Perplexity',/(?:^|[^a-z0-9])(?:perplexity(?:\.ai|\.com)?|pplx\.ai)(?:$|[^a-z0-9])/],
    ['claude','Claude',/(?:^|[^a-z0-9])claude(?:\.ai)?(?:$|[^a-z0-9])/],
    ['copilot','Microsoft Copilot',/(?:^|[^a-z0-9])(?:copilot(?:\.microsoft\.com)?|microsoft\s+copilot)(?:$|[^a-z0-9])/],
    ['gemini','Google Gemini',/(?:^|[^a-z0-9])(?:gemini(?:\.google\.com)?|bard\.google\.com)(?:$|[^a-z0-9])/],
    ['grok','Grok',/(?:^|[^a-z0-9])(?:grok(?:\.com)?|grok\.x\.ai|x\.ai)(?:$|[^a-z0-9])/],
    ['deepseek','DeepSeek',/(?:^|[^a-z0-9])deepseek(?:\.(?:com|ai))?(?:$|[^a-z0-9])/],
    ['poe','Poe',/(?:^|[^a-z0-9])poe(?:\.com)?(?:$|[^a-z0-9])/],
    ['you','You.com',/(?:^|[^a-z0-9])you\.com(?:$|[^a-z0-9])/],
    ['mistral','Mistral Le Chat',/(?:^|[^a-z0-9])(?:mistral(?:\.ai)?|lechat\.mistral\.ai)(?:$|[^a-z0-9])/],
    ['other-ai','Other AI',/(?:^|[^a-z0-9])(?:phind(?:\.com)?|qwen(?:\.ai)?|kimi(?:\.com)?|meta\.ai)(?:$|[^a-z0-9])/]
  ];
  function aiReferralService(item){
    const name=String(item?.source||item?.sourceMedium||item?.referrer||'').trim().toLowerCase();
    const category=String(item?.category||'').trim().toLowerCase();
    for(const [id,,pattern] of aiServices)if(pattern.test(name))return id;
    if(/(?:^|[^a-z])(?:ai[\s_-]*(?:referrals?|assistants?|chatbots?|search|tools?)|generative[\s_-]*ai|artificial intelligence)(?:$|[^a-z])/.test(category))
      return 'other-ai';
    return null;
  }
  const quietSocial=['tiktok','pinterest','reddit','nextdoor'];
  const columns=[
    ['direct','DIRECT'],['google','GOOGLE SEARCH'],['maps','GOOGLE MAPS'],
    ['bing','BING'],['yahoo','YAHOO'],['duckduckgo','DUCKDUCKGO'],
    ['facebook','FACEBOOK'],['instagram','INSTAGRAM'],['x','X / TWITTER'],
    ['youtube','YOUTUBE'],['yelp','YELP'],['tripadvisor','TRIPADVISOR'],
    ['ai','AI REFERRALS'],['outlaw','OUTLAW RADIO 5150'],
    ['email','EMAIL'],['qr','QR CODES'],['ads','PAID ADS'],
    ['websites','OTHER WEBSITES / BLOGS'],['other','OTHER REFERRALS'],
    ['socialGroup','OTHER SOCIAL'],
    ['tiktok','TIKTOK'],['pinterest','PINTEREST'],['reddit','REDDIT'],['nextdoor','NEXTDOOR']
  ];
  // Four source buckets remain separate; the display-only aggregate must
  // never be added to Wix or GA4's actual website session total.
  let socialExpanded=false;
  if(typeof document!=='undefined'&&typeof document.addEventListener==='function'){
    document.addEventListener('click',event=>{
      const button=event.target?.closest?.('[data-discovery-social-toggle]');
      if(!button)return;
      const table=button.closest('.mission-sheet-table');
      if(!table)return;
      socialExpanded=!socialExpanded;
      table.classList.toggle('mission-sheet-social-expanded',socialExpanded);
      button.setAttribute('aria-expanded',String(socialExpanded));
      button.setAttribute('aria-label',
        (socialExpanded?'Hide':'Show')+' TikTok, Pinterest, Reddit and Nextdoor columns');
    });
  }
  const measures=[
    ['appearances','SEARCH APPEARANCES'],
    ['clicks','SEARCH CLICKS'],
    ['ctr','CLICK-THROUGH RATE'],
    ['position','AVERAGE SEARCH POSITION'],
    ['visits','WEBSITE VISITS (SESSIONS)'],
    ['stay','AVERAGE WEBSITE STAY']
  ];
  // A radio-source name or tagged external referral is evidence of an
  // attributable website visit, NOT evidence of someone listening to radio.
  // The internal DOCJAKS.COM radio page must not become a fake external source.
  function outlawRadioReferral(item){
    const source=String(item?.source||item?.sourceMedium||item?.referrer||'').trim().toLowerCase();
    const category=String(item?.category||'').trim().toLowerCase();
    const explicitCampaign=/(?:[?&]utm_source=|^utm_source[=:])outlaw(?:[._-]?radio)?[._-]?(?:5150|51[.]50)(?:$|[&#\s])/i.test(source);
    if(/(?:www[.])?docjaks[.]com\/(?:outlaw[-_]?radio[-_]?(?:5150|51[.]50))/i.test(source)&&!explicitCampaign)
      return false;
    const pattern=/(?:^|[^a-z0-9])(?:outlaw[\s._-]*radio[\s._-]*(?:5150|51[.]50)|outlaw[\s._-]*5150)(?=$|[^a-z0-9])/i;
    return pattern.test(source)||pattern.test(category);
  }
  // "Direct" is attribution, not proof of how a visitor heard about Doc Jaks.
  // Unmarked Google Maps, email and QR visits may fall into broader sources.
  function sourceKind(item){
    const name=String(item?.source||item?.sourceMedium||item?.referrer||'').toLowerCase();
    const cat=String(item?.category||'').toLowerCase();
    const s=name+' '+cat;
    if(/maps\.google|google\s*maps|google.*business\s*profile|google_business_profile|g\.page|(?:^|[\W_])gbp(?:[\W_]|$)/.test(s))return 'maps';
    if(/(?:^|[\W_])qr(?:[\W_]|$)|qr.?code|scan.?code/.test(s))return 'qr';
    if(/(?:^|[\W_])(?:cpc|ppc|paid|display|advertising|ads)(?:[\W_]|$)/.test(s))return 'ads';
    // Yahoo Mail and DuckDuckGo Email Protection count as EMAIL, not
    // as organic search. Wix and GA4 may identify these separately.
    if(/(?:^|[^a-z0-9])(?:e-?mail|newsletter)(?:$|[^a-z0-9])/.test(cat)||
      /\/\s*(?:e-?mail|newsletter)(?:$|[^a-z0-9])/.test(name)||
      /(?:^|[^a-z0-9])mail\.yahoo\./.test(name)||
      /(?:^|[^a-z0-9])yahoo[ -]?mail(?:$|[^a-z0-9])/.test(name)||
      /(?:^|[^a-z0-9])yahoo\s*\/\s*e-?mail(?:$|[^a-z0-9])/.test(name)||
      /(?:^|[^a-z0-9])duckduckgo\s*\/\s*e-?mail(?:$|[^a-z0-9])/.test(name)||
      /(?:^|[^a-z0-9])duck\.com\s*\/\s*e-?mail(?:$|[^a-z0-9])/.test(name)||
      /(?:^|[^a-z0-9])(?:facebook|instagram|fb|ig)\s*\/\s*(?:e-?mail|newsletter)(?:$|[^a-z0-9])/.test(name)||
      /(?:^|[^a-z0-9])mail\.duck\.com(?:$|[^a-z0-9])/.test(name)||
      /email\s*protection/.test(name)||
      /@duck\.com(?:$|\W)/.test(name))
      return 'email';
    if(outlawRadioReferral(item))return 'outlaw';
    if(aiReferralService(item))return 'ai';
    // Account followers/Meta post impressions are not website referrals.
    // Classify only identified Wix/GA4 sources; fbclid and igshid query
    // parameters alone must never be treated as verified attribution.
    const fromFacebook=/(?:^|[^a-z0-9])(?:facebook|fb)(?:$|[^a-z0-9])/.test(name)||
      /(?:^|[^a-z0-9])fb\.(?:me|com|watch)(?:$|[^a-z0-9])/.test(name)||
      /^(?:facebook|fb)$/.test(cat);
    const fromInstagram=/(?:^|[^a-z0-9])(?:instagram|instagr\.am|ig\.me|insta|ig)(?:$|[^a-z0-9])/.test(name)||
      /^(?:instagram|insta|ig)$/.test(cat);
    // Do not arbitrarily assign a shared Facebook+Instagram referrer.
    if(fromFacebook&&fromInstagram)return 'other';
    if(fromFacebook)return 'facebook';
    if(fromInstagram)return 'instagram';
    if(/youtube|youtu\.be/.test(s))return 'youtube';
    // Pinterest and Reddit domains also end in "t.com"; never attribute
    // those site visits to X just because of a loose "t.co" substring.
    if(/(?:^|[^a-z0-9])(?:twitter(?:\.com)?|t\.co|x\.com)(?:$|[^a-z0-9])/.test(name)||
      name==='x'||name.startsWith('x /'))return 'x';
    if(/tiktok/.test(s))return 'tiktok';
    if(/pinterest/.test(s))return 'pinterest';
    if(/reddit/.test(s))return 'reddit';
    if(/trip\s*advisor|tripadvisor/.test(s))return 'tripadvisor';
    if(/yelp/.test(s))return 'yelp';
    if(/nextdoor/.test(s))return 'nextdoor';
    // DuckDuckGo Search and its redirect domains are referrals. duck.com
    // alone may be an Email Protection source and is not proof of search.
    if(/duckduckgo|ddg\.gg/.test(s))return 'duckduckgo';
    if(/(?:^|[^a-z0-9])duck\.com(?:$|[^a-z0-9])/.test(name)&&
      /organic|search/.test(cat+' '+name))return 'duckduckgo';
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
      if(key==='ai'){
        // Service breakdown is nested inside the existing AI total.
        const id=aiReferralService(item)||'other-ai';
        if(!bucket.services)bucket.services=Object.create(null);
        let service=bucket.services[id];
        if(!service)service=bucket.services[id]={sessions:0,weightedStay:0,stayComplete:true};
        service.sessions+=n;
        if(!good(avg))service.stayComplete=false;
        else service.weightedStay+=avg*n;
      }
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
  function aiServiceNumber(data,id,measure){
    if(!data)return null;
    const service=data.buckets?.ai?.services?.[id];
    if(!service)return measure==='visits'&&data.complete?0:null;
    if(measure==='visits')return service.sessions;
    return measure==='stay'&&service.sessions>0&&service.stayComplete?
      service.weightedStay/service.sessions:null;
  }
  // Only show an aggregated value for a complete source report. Average
  // website stay is weighted by sessions, not the average of four averages.
  function quietSocialNumber(data,measure){
    if(!data?.complete)return null;
    const numbers=quietSocial.map(key=>sourceNumber(data,key,'visits'));
    if(!numbers.every(good))return null;
    const sessions=numbers.reduce((sum,n)=>sum+n,0);
    if(measure==='visits')return sessions;
    if(measure!=='stay'||sessions===0)return null;
    let weightedSeconds=0;
    for(const key of quietSocial){
      const bucket=data.buckets[key];
      if(!bucket||bucket.sessions===0)continue;
      if(!bucket.stayComplete)return null;
      weightedSeconds+=bucket.weightedStay;
    }
    return weightedSeconds/sessions;
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
      (wixPriorReport(site)||priorSourceData(period)):
      current===ga&&current?gaPrior:null;
    // GoDaddy/domain forwards sometimes lose their referrer in Wix. If Wix
    // identifies zero radio-origin sessions but GA4 independently verifies
    // positive tagged radio sessions, show GA4 for BOTH comparison periods,
    // never Wix LAST against GA4 CURRENT. These are not added to Wix TOTAL.
    const wixOutlawNow=sourceNumber(current,'outlaw','visits');
    const gaOutlawNow=sourceNumber(ga,'outlaw','visits');
    const outlawViaGa4=good(gaOutlawNow)&&gaOutlawNow>0&&
      (!good(wixOutlawNow)||wixOutlawNow===0);
    function raw(measure,source,which){
      if(measure==='visits'){
        const data=source==='outlaw'&&outlawViaGa4?
          (which==='last'?gaPrior:ga):
          (which==='last'?last:current);
        return source==='socialGroup'?quietSocialNumber(data,measure):
          sourceNumber(data,source,measure);
      }
      if(measure==='stay'){
        // GA4 reports source-level average session duration in seconds;
        // Wix attribution currently reports sessions only. Do not mix
        // providers across the Last / Current comparison.
        const data=ga?(which==='last'?gaPrior:ga):(which==='last'?last:current);
        return source==='socialGroup'?quietSocialNumber(data,measure):
          sourceNumber(data,source,measure);
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
    // Search TOTAL must compare the same provider(s) in LAST and CURRENT.
    // Never add Google and Bing if their observed reporting windows differ.
    // If both cannot be safely combined, show one verified provider (usually
    // Google) with an explicit G/B marker instead of discarding useful data.
    const bingConnected=bing?.status==='connected';
    const pairedCounts=source=>['last','current'].every(which=>
      good(raw('appearances',source,which))&&
      good(raw('clicks',source,which)));
    const currentCounts=source=>good(raw('appearances',source,'current'))&&
      good(raw('clicks',source,'current'));
    const sameSearchWindow=google&&bingConnected&&
      bing.currentRange?.start===seo?.comparison?.currentRange?.start&&
      bing.currentRange?.end===seo?.comparison?.currentRange?.end;
    const sameSearchPrevious=google&&bingConnected&&
      bing.previousRange?.start===seo?.comparison?.previousRange?.start&&
      bing.previousRange?.end===seo?.comparison?.previousRange?.end;
    const searchProviders=(sameSearchWindow&&sameSearchPrevious&&
      pairedCounts('google')&&pairedCounts('bing'))?['google','bing']:
      google&&pairedCounts('google')?['google']:
      bingConnected&&pairedCounts('bing')?['bing']:
      google&&currentCounts('google')?['google']:
      bingConnected&&currentCounts('bing')?['bing']:[];
    const searchScope=searchProviders.length===2?'G+B':
      searchProviders[0]==='google'?'G':
      searchProviders[0]==='bing'?'B':null;
    // Bing's overall Webmaster traffic report has no average position.
    // Always label Google position as G rather than imply cross-engine rank.
    function measuredSearchTotal(measure,which){
      if(measure==='position')return google?
        raw('position','google',which):null;
      if(!searchProviders.length)return null;
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
      if(current===ga&&current){
        if(which==='last')return completeSourceTotal(gaPrior,measure);
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
        :id==='socialGroup'
        ?'<button type="button" class="mission-social-toggle" data-discovery-social-toggle="1" aria-expanded="'+
          String(socialExpanded)+'" aria-label="'+(socialExpanded?'Hide':'Show')+
          ' TikTok, Pinterest, Reddit and Nextdoor columns">'+
          '<span>OTHER<br>SOCIAL</span><span class="mission-social-arrow" aria-hidden="true">▾</span>'+
          (good(quietSocialNumber(current,'visits'))&&quietSocialNumber(current,'visits')>0?
            '<span class="mission-social-active" title="Visits recorded in Other Social" aria-hidden="true">●</span>':'')+
          '</button>'
        :id==='tripadvisor'
        ?'<span class="mission-sheet-tripadvisor-lines"><b>TRIP</b><b>ADVISOR</b></span>'
        :esc(label);
    const head='<thead><tr>'+
      '<th scope="col" class="mission-sheet-metric">MEASUREMENT</th>'+
      '<th scope="col" class="mission-sheet-total" title="Search coverage is marked G = Google, B = Bing, G+B = both with matching reporting dates. Average position is Google only. Website totals come from Wix/GA4.">TOTAL</th>'+
      '<th scope="col" class="mission-sheet-period">PERIOD</th>'+
      columns.map(([id,label])=>
        '<th scope="col" class="mission-sheet-source'+(id==='google'?' mission-sheet-google':'')+
          (id==='tripadvisor'?' mission-sheet-tripadvisor':'')+
          (quietSocial.includes(id)?' mission-social-detail':'')+
          (id==='socialGroup'?' mission-social-group':'')+
        '" title="'+(id==='direct'
            ?'Direct-attributed website sessions from Wix; not proof a person typed the URL'
            :id==='yahoo'
            ?'Yahoo-attributed website sessions from Wix or GA4. Yahoo Mail goes to EMAIL. Separate Yahoo search appearances and clicks are not verified.'
            :id==='duckduckgo'
            ?'DuckDuckGo-attributed website sessions from Wix or GA4. DuckDuckGo Email Protection is counted under EMAIL; search appearances and ranks are not separately verified.'
            :id==='facebook'
            ?'Facebook-attributed website sessions from Wix or GA4. Paid referrals go to PAID ADS. Facebook post impressions and engagement are tracked separately in Platforms.'
            :id==='instagram'
            ?'Instagram-attributed website sessions from Wix or GA4. Paid referrals go to PAID ADS. Instagram account/post performance is tracked separately in Platforms.'
            :id==='socialGroup'
            ?'Click to show TikTok, Pinterest, Reddit and Nextdoor sources. This is one combined view, not extra website visits.'
            :id==='tripadvisor'
            ?'Tripadvisor-attributed website sessions from Wix/GA4; reviews and listing views are separate.'
            :id==='ai'
            ?'AI-attributed website visits from Wix/GA4. Expand the AI REFERRALS breakdown below for individual services; AI mentions and recommendations cannot be verified here.'
            :id==='outlaw'
            ?'Identified visits to DOCJAKS.COM from Outlaw Radio 5150 referrals or tagged external redirects. Uses GA4 source attribution if Wix reports no radio visits but GA4 identifies them. Not radio listeners.'
            :esc(label))+'">'+headerName(id,label)+'</th>').join('')+
      '</tr></thead>';
    const body=measures.map(([metric,label])=>{
      const totalPrevious=totalValue(metric,'last');
      const totalCurrent=totalValue(metric,'current');
      const totalCell=which=>{
        const value=which==='last'?totalPrevious:totalCurrent;
        const isChange=which==='change';
        const tone=which==='last'?'':signal(metric,totalPrevious,totalCurrent);
        const isSearch=['appearances','clicks','ctr','position'].includes(metric);
        const sourceTag=metric==='position'?'G':isSearch?searchScope:null;
        const tag=sourceTag&&good(value)&&(!isChange||good(totalPrevious))?
          '<small class="mission-sheet-total-scope" aria-label="'+
            esc(sourceTag==='G+B'?'Google and Bing':sourceTag==='G'?'Google only':'Bing only')+
            '">'+esc(sourceTag)+'</small>':'';
        const mark=isChange
          ?(good(totalCurrent)?
            changeBadge(metric,totalPrevious,totalCurrent).replace('</span>',tag+'</span>'):
            '<span class="mission-sheet-delta mission-sheet-unknown">N/A</span>')
          :'<span class="mission-sheet-main">'+esc(nice(metric,value))+tag+'</span>';
        const scope=metric==='position'
          ?'Google Search Console average position only; Bing supplies no compatible position. Not a combined engine ranking.'
          :isSearch
          ?'Verified search coverage: '+(searchScope==='G+B'?'Google and Bing with matching current and past reporting dates':
            searchScope==='G'?'Google only; Bing unavailable, incomplete or reports different dates':
            searchScope==='B'?'Bing only; Google comparison unavailable':'No verified search report')+
            '. Maps profile impressions excluded.'
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
        return '<td class="mission-sheet-number'+
          (quietSocial.includes(id)?' mission-social-detail':'')+
          (id==='socialGroup'?' mission-social-group':'')+tone+
          (!good(value)?' mission-sheet-na':'')+'">'+
          '<span class="mission-sheet-main">'+esc(nice(metric,value))+'</span></td>';
      }).join('');
      const changes=columns.map(([id])=>{
        const previous=raw(metric,id,'last'),current=raw(metric,id,'current');
        const tone=signal(metric,previous,current);
        return '<td class="mission-sheet-number mission-sheet-change-cell'+
          (quietSocial.includes(id)?' mission-social-detail':'')+
          (id==='socialGroup'?' mission-social-group':'')+tone+'">'+
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
    const aiNow=raw('visits','ai','current');
    const aiLast=raw('visits','ai','last');
    const aiServiceValue=(id,metric,when)=>{
      const data=metric==='stay'
        ?(ga?(when==='last'?gaPrior:ga):(when==='last'?last:current))
        :(when==='last'?last:current);
      return aiServiceNumber(data,id,metric);
    };
    const activeAI=aiServices.filter(([id])=>['last','current']
      .some(when=>{const n=aiServiceValue(id,'visits',when);return good(n)&&n>0;}));
    const aiDetailRows=activeAI.map(([id,label])=>{
      const before=aiServiceValue(id,'visits','last');
      const after=aiServiceValue(id,'visits','current');
      const stay=aiServiceValue(id,'stay','current');
      return '<tr><th scope="row">'+esc(label)+'</th>'+
        '<td>'+esc(whole(before))+'</td><td>'+esc(whole(after))+'</td>'+
        '<td>'+changeBadge('visits',before,after)+'</td>'+
        '<td>'+esc(nice('stay',stay))+'</td></tr>';
    }).join('');
    const aiDetail='<details class="mission-sheet-ai-detail">'+
      '<summary>AI REFERRALS ▸ WHICH SERVICES SENT VISITORS'+
      (good(aiNow)&&aiNow>0?' · '+esc(whole(aiNow))+' CURRENT':'')+'</summary>'+
      (aiDetailRows
        ?'<div class="mission-sheet-ai-scroll"><table aria-label="AI referring services comparison">'+
          '<thead><tr><th>AI SERVICE</th><th>LAST</th><th>CURRENT</th>'+
          '<th>% CHANGE</th><th>AVG STAY</th></tr></thead>'+
          '<tbody>'+aiDetailRows+'</tbody></table></div>'
        :'<p>'+(good(aiLast)&&good(aiNow)
          ?'No identifiable AI website referrals in these periods.'
          :'AI referral counts are not fully verified. N/A means unknown, not zero.')+'</p>')+
      '<p>Website sessions from '+esc(provider)+'. Source-specific average stay uses GA4 when verified. '+
      'Identifiable referrers do not prove AI recommendations; private visits can appear as Direct.</p>'+
      '</details>';
    const bingNote=bing?.status==='connected'?
      ' Bing Webmaster searches include its reported search verticals. Bing average position is N/A because the overall traffic API does not report it.':
      bing?.status==='needs-setup'?
      ' Bing search reporting needs an API key. Open the BING CONNECTION section below to save it securely after verifying DOCJAKS.COM.':
      bing?.status==='needs-site'?
      ' Bing search reporting needs verified DOCJAKS.COM. <a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer">Verify or import from Google Search Console ↗</a>':
      bing?.status==='incomplete'?
      ' Bing daily reporting is incomplete for these dates, so unverified periods remain N/A.':
      bing?.status==='needs-attention'||bing?.status==='unavailable'?
      ' Bing Webmaster: '+esc(bing.message||'Reporting unavailable.')+'.':
      '';
    const bingForm='<details id="bing-connection" class="mission-sheet-bing-connect"'+(bing?.status==='connected'?'':' open')+'>'+
      '<summary>BING CONNECTION · SAVE API KEY</summary>'+
      '<p>Open <a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer">Bing Webmaster Tools ↗</a>, verify or import DOCJAKS.COM, then find <b>Settings → API Access → API Key</b>. Paste the key here in your signed-in Command Center. It is encrypted on the server and never shown again.</p>'+
      '<form data-bing-connect-form="1">'+
        '<label for="missionBingApiKey">Bing Webmaster API key</label>'+
        '<input id="missionBingApiKey" type="password" name="bingApiKey" autocomplete="off" spellcheck="false" minlength="12" maxlength="256" required placeholder="Enter your Bing API key">'+
        '<button type="submit">Save &amp; verify Bing</button>'+
        '<span role="status" aria-live="polite" data-bing-connect-feedback="1"></span>'+
      '</form>'+
    '</details>';
    // Account connection status comes from the existing Meta status check.
    // It does not prove referral attribution or permission to read all insights.
    const meta=typeof connection!=='undefined'?connection:null;
    const metaLinked=platform=>meta?.[platform]?.connected===true;
    const metaKnown=platform=>typeof meta?.[platform]?.connected==='boolean';
    const metaStatus=metaKnown('facebook')||metaKnown('instagram')?
      '<p class="mission-sheet-note"><strong>META ACCOUNTS:</strong> Facebook '+
      (metaKnown('facebook')?(metaLinked('facebook')?'linked':'not linked'):'N/A')+
      ' · Instagram '+(metaKnown('instagram')?(metaLinked('instagram')?'linked':'not linked'):'N/A')+
      '. Account/post analytics remain separate from the website referrals shown above.'+
      (metaLinked('facebook')&&metaLinked('instagram')?' ':
        ' <a href="/api/meta/connect">Connect or reconnect Meta accounts ↗</a>')+
      '</p>':
      '<p class="mission-sheet-note">Facebook and Instagram website referrals use verified Wix/GA4 source reports. Check the existing Platforms page for Meta account connections and post insights.</p>';
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
    return '<section class="mission-source-sheet" aria-label="Twenty-three sources including four grouped social channels; six measures and eighteen Last, Current and Change rows">'+
      '<div class="mission-sheet-heading"><div><h3>SEARCH & DISCOVERY · 23 SOURCES</h3>'+
      '<p>Six measurements with LAST, CURRENT and % CHANGE on separate rows.</p></div>'+
      '<strong>23 SOURCES · 4 GROUPED · 18 ROWS</strong></div>'+
      bingForm+
      '<p class="mission-sheet-scroll-hint">SCROLL ALL THE WAY RIGHT FOR OTHER SOCIAL ▾ → Tap to show TikTok, Pinterest, Reddit and Nextdoor. MEASUREMENT, TOTAL and PERIOD stay visible.</p>'+
      '<div class="mission-sheet-scroll" tabindex="0" role="region" aria-label="Horizontal source comparison spreadsheet">'+
        '<table class="mission-sheet-table'+(socialExpanded?' mission-sheet-social-expanded':'')+'">'+head+'<tbody>'+body+'</tbody></table>'+
      '</div>'+
      '<p class="mission-sheet-note">TOTAL is immediately after MEASUREMENT. Search totals cover only verified comparable sources. G means Google only, B means Bing only, and G+B means both have matching reporting dates. When Google and Bing dates differ, show the verified Google-only search totals rather than add mismatched periods. Average search position is always Google only; Bing has no compatible rank metric. Google Maps impressions are excluded. '+
        'Search CTR is calculated from same-period clicks and appearances, while search rankings cannot be combined across engines. '+
        'Website visit and stay totals come from the overall '+esc(provider)+' report, not from adding incomplete source rows. '+
        'Website visits are attributed sessions from '+esc(provider)+
        ' and are not unique visitors. Previous source sessions use Wix\'s matching preceding period when verified; otherwise N/A. '+
        'Wix and GA4 session counts are never added. Source-specific average stay uses GA4 session duration when verified (and may differ from the Wix overall average). Relative percent changes compare matching periods; lower average search position is better. '+
        'NEW is used instead of a percentage when the last value was zero. N/A means not applicable or unverified. '+
        'OTHER SOCIAL combines TikTok, Pinterest, Reddit and Nextdoor without double-counting TOTAL; expand to see which platform sent visits. '+
        'TRIPADVISOR is website traffic attribution, not review counts. '+
        'OUTLAW RADIO 5150 counts identified radio-domain or tagged external visits, not radio listeners. If Wix records zero but GA4 verifies tagged radio visits, the radio column uses GA4 for both periods; it is not added to the Wix TOTAL. An untagged domain forward may show as Direct.'+bingNote+mapNote+'</p>'+
      aiDetail+metaStatus+queryDetails+'</section>';
  }
  window.djomsAiReferralService=aiReferralService;
  window.djomsOutlawRadioReferral=outlawRadioReferral;
  window.djomsSourceSpreadsheet=draw;
})();
