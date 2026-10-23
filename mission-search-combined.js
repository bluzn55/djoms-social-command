/* DOC JAKS · Verified cross-engine Search Appearances.
   Never add Wix/GA4 referral visits to Google or Bing impressions.
   Multiple engine totals are combined only for identical calendar days.
   Provider totals remain distinct from people and sessions. */
(function combinedSearchModule(){
  'use strict';
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const yyyy=n=>typeof n==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(n);
  const shift=(date,days)=>{
    if(!yyyy(date))return null;
    const d=new Date(date+'T12:00:00Z');
    if(!Number.isFinite(d.getTime()))return null;
    d.setUTCDate(d.getUTCDate()+days);
    return d.toISOString().slice(0,10);
  };
  const dates=(r)=>r&&yyyy(r.start)&&yyyy(r.end)&&r.start<=r.end?r:null;
  const pair=(source,key)=>{
    const c=source?.comparison?.[key];
    return {
      current:valid(source?.metrics?.[key])?source.metrics[key]:null,
      previous:source?.comparison?.status==='reported'&&valid(c?.previous)?c.previous:null
    };
  };
  const selectionReport=(source,period)=>source?.range?.start===period?.start&&
    source?.range?.end===period?.end;
  function selected({seo,bing,period}={}){
    const googleOk=seo?.status==='connected'&&seo?.connected===true;
    const bingOk=bing?.status==='connected'&&bing?.connected===true&&
      selectionReport(bing,period);
    // Date alignment is essential: Google usually lags by two days.
    const gCur=googleOk?dates(seo?.comparison?.currentRange):null;
    const gPrior=googleOk?dates(seo?.comparison?.previousRange):null;
    const bCur=bingOk?dates(bing.currentRange):null;
    const bPrior=bingOk?dates(bing.previousRange):null;
    const target=gCur||bCur;
    const targetPrior=gCur?gPrior:bPrior;
    const message=[];
    const engines=[],ignored=[];
    if(!target){
      return {status:'unavailable',engines:[],scope:'NONE',current:null,previous:null,
        clicksCurrent:null,clicksPrevious:null,ctrCurrent:null,ctrPrevious:null,
        positionCurrent:null,positionPrevious:null,currentRange:null,previousRange:null,
        unavailable:[],note:'Search engine impression reports not available for the selected dates.'};
    }
    // Check exact dates independently. Bing API's complete current-range total
    // is reusable, otherwise use its verified daily rows to match Google's dates.
    const bingRange=(start,end)=>{
      if(!bingOk||!yyyy(start)||!yyyy(end))return null;
      if(bCur?.start===start&&bCur?.end===end&&valid(bing.metrics?.impressions)&&valid(bing.metrics?.clicks))
        return {impressions:bing.metrics.impressions,clicks:bing.metrics.clicks};
      if(bPrior?.start===start&&bPrior?.end===end&&bing.comparison?.status==='reported'&&
        valid(bing.comparison?.impressions?.previous)&&valid(bing.comparison?.clicks?.previous))
        return {impressions:bing.comparison.impressions.previous,clicks:bing.comparison.clicks.previous};
      if(bing.daily?.status!=='reported'||!Array.isArray(bing.daily.rows))return null;
      const map=new Map();
      for(const row of bing.daily.rows){
        if(!yyyy(row.date)||!valid(row.impressions)||!valid(row.clicks)||map.has(row.date))return null;
        map.set(row.date,row);
      }
      let impressions=0,clicks=0;
      for(let day=start;day<=end;day=shift(day,1)){
        const row=map.get(day);
        if(!row)return null;
        impressions+=row.impressions;clicks+=row.clicks;
        if(!Number.isSafeInteger(impressions)||!Number.isSafeInteger(clicks))return null;
      }
      return {impressions,clicks};
    };
    if(googleOk&&gCur&&gCur.start===target.start&&gCur.end===target.end){
      const impression=pair(seo,'impressions'),click=pair(seo,'clicks');
      if(valid(impression.current)&&valid(click.current)){
        const previous=gPrior&&targetPrior?.start===gPrior.start&&targetPrior?.end===gPrior.end&&
          valid(impression.previous)&&valid(click.previous)?
          {impressions:impression.previous,clicks:click.previous}:null;
        engines.push({id:'google',name:'Google',current:{impressions:impression.current,clicks:click.current},
          previous,positionCurrent:valid(seo.metrics?.position)?seo.metrics.position:null,
          positionPrevious:seo.comparison?.status==='reported'&&valid(seo.comparison?.position?.previous)?
            seo.comparison.position.previous:null,
          matched:true,shown:impression.current>0||click.current>0});
      } else ignored.push('Google: appearance or click totals not verified.');
    }
    if(bingOk){
      const now=bingRange(target.start,target.end);
      if(now){
        const previous=targetPrior?bingRange(targetPrior.start,targetPrior.end):null;
        engines.push({id:'bing',name:'Bing (Web, Chat & other Bing search)',current:now,
          previous,positionCurrent:null,positionPrevious:null,
          matched:true,shown:now.impressions>0||now.clicks>0});
      } else ignored.push('Bing: its reported days do not match the same Google date window; excluded from combined total.');
    }else if(bing?.status&&bing.status!=='connected'){
      ignored.push('Bing Webmaster: '+String(bing.message||bing.status).slice(0,200));
    }
    if(!engines.length){
      return {status:'unavailable',engines:[],scope:'NONE',current:null,previous:null,
        clicksCurrent:null,clicksPrevious:null,ctrCurrent:null,ctrPrevious:null,
        positionCurrent:null,positionPrevious:null,currentRange:target,previousRange:targetPrior,
        unavailable:ignored,note:'No complete matching-day search engine report.'};
    }
    // Actual zero is respected, but engines with no positive recorded
    // appearances or clicks do not take up rows in the requested top-five list.
    const included=engines.filter(e=>e.shown);
    const allPrevious=engines.every(e=>e.previous&&valid(e.previous.impressions)&&valid(e.previous.clicks));
    const sum=(items,key,field)=>items.reduce((n,r)=>n+r[key][field],0);
    const impressions=sum(engines,'current','impressions');
    const clicks=sum(engines,'current','clicks');
    const lastImpressions=allPrevious?sum(engines,'previous','impressions'):null;
    const lastClicks=allPrevious?sum(engines,'previous','clicks'):null;
    const google=engines.find(e=>e.id==='google');
    const active=engines.filter(e=>e.shown).map(e=>e.id==='google'?'Google':'Bing');
    const label=active.length?active.join(' + '):'Verified zero across covered engines';
    const coverage='Verified search-engine appearances ('+label+') during '+target.start+
      ' through '+target.end+'. This is not total unique searchers.';
    if(!allPrevious)message.push('Last/Current percentage is N/A until the same contributing engines have verified previous-period totals.');
    if(ignored.length)message.push(ignored.join(' '));
    return {
      status:'reported',engines:included.sort((a,b)=>b.current.impressions-a.current.impressions).slice(0,5),
      reportedEngines:engines.length,scope:label,
      current:impressions,previous:lastImpressions,clicksCurrent:clicks,clicksPrevious:lastClicks,
      ctrCurrent:impressions>0?clicks/impressions:null,
      ctrPrevious:valid(lastImpressions)&&lastImpressions>0?lastClicks/lastImpressions:null,
      positionCurrent:google?.positionCurrent??null,
      positionPrevious:google?.positionPrevious??null,
      currentRange:target,previousRange:targetPrior,
      unavailable:ignored,
      note:coverage+(message.length?' '+message.join(' '):''),
      completePrevious:allPrevious
    };
  }
  window.djomsCombinedSearch=selected;
})();