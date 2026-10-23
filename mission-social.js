/* DOC JAKS · Verified Social Journey (Facebook, Instagram, X)
   Facebook/Instagram counts are the CURRENT lifetime metrics of posts
   published in each reporting window, NOT interactions on particular dates.
   Comparisons use measured per-post cohort activity; older cohorts have had
   more time to accumulate interactions. Treat direction as provisional.
   X remains owner-entered, display-only, never included in score. */
(function socialJourneyModule(){
  'use strict';
  const keys=['facebook','instagram','x'];
  const measureKeys=['views','reactions','comments','shares'];
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const shift=(day,amount)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return null;
    const d=new Date(day+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()+amount);
    return d.toISOString().slice(0,10);
  };
  const emptyRow=(platform)=>({
    platform,kind:platform==='x'?'owner-entered':'Meta',
    currentPosts:null,previousPosts:null,now:{},last:{},movements:{},
    verified:false,sourceNote:'No matched reporting periods received.'
  });
  const cache=new Map();
  const inFlight=new Map();
  const empty={status:'checking',platforms:Object.fromEntries(keys.map(k=>[k,emptyRow(k)])),
    scoreSignals:[],availableWeight:0,
    note:'Checking matched current and prior social publishing cohorts.'};
  const isCurrent=(data,start,end)=>data?.period?.startDate===start&&data?.period?.endDate===end;
  async function load(period,key){
    if(inFlight.has(key))return inFlight.get(key);
    const days=period.days,start=period.start,end=period.endInclusive;
    const oldEnd=shift(start,-1),oldStart=shift(start,-days);
    const oldQuery='range=custom&start='+encodeURIComponent(oldStart)+'&end='+encodeURIComponent(oldEnd);
    const newQuery='range=custom&start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end);
    const preexisting=typeof analyticsData!=='undefined'&&isCurrent(analyticsData,start,end)?analyticsData:null;
    const job=(async()=>{
      let current=null,last=null;
      try{
        [current,last]=await Promise.all([
          preexisting?Promise.resolve(preexisting):api('analytics?'+newQuery),
          api('analytics?'+oldQuery)
        ]);
        if(!isCurrent(current,start,end)||!isCurrent(last,oldStart,oldEnd))
          throw new Error('Meta publishing date ranges did not match the selected period.');
        cache.set(key,{status:'reported',current,previous:last,
          start,end,lastStart:oldStart,lastEnd:oldEnd,checkedAt:new Date().toISOString()});
      }catch(err){
        cache.set(key,{status:'unavailable',current,previous:last,
          error:err?.message||'Social comparisons unavailable.'});
      }
      document.dispatchEvent(new CustomEvent('djoms:social-report'));
    })().finally(()=>inFlight.delete(key));
    inFlight.set(key,job);
    return job;
  }
  function reportedMetric(source,platform,key){
    const row=source?.platforms?.[platform];
    if(!row||!source)return null;
    const posts=row.posts;
    if(!Number.isInteger(posts)||posts<0||row.inventory?.complete!==true||
      source.coverage?.recordInventoryComplete!==true)return null;
    if(posts===0)return 0; // complete inventory establishes no posts, not missing metrics
    const cell=row.coverage?.[key];
    return cell?.complete===true&&cell.expectedPosts===posts&&
      cell.measuredPosts===posts&&valid(row[key])?row[key]:null;
  }
  function displayMetric(source,platform,key){
    const row=source?.platforms?.[platform];
    if(!row)return null;
    // X is manual and may contain only selected metrics. Never infer missing zeros.
    if(platform==='x'){
      const c=row.coverage?.[key];
      return c?.complete===true&&valid(row[key])?row[key]:null;
    }
    return reportedMetric(source,platform,key);
  }
  function summary(period){
    const validPeriod=period?.query&&period?.start&&period?.endInclusive&&
      Number.isInteger(period.days)&&period.days>0&&period.days<=365;
    if(!validPeriod)return {...empty,status:'unavailable',note:'Select a valid reporting window.'};
    const key=period.start+'|'+period.endInclusive;
    if(!cache.has(key)&&!inFlight.has(key)&&typeof api==='function')void load(period,key);
    const entry=cache.get(key);
    if(!entry)return {...empty};
    const result={status:entry.status,note:'Lifetime performance, as of now, of posts PUBLISHED in each window. These are not interactions that occurred solely during these dates. Older posts have had longer to accumulate reactions.',
      platforms:{},scoreSignals:[],availableWeight:0,checkedAt:entry.checkedAt,
      error:entry.error||null};
    for(const name of keys){
      const first=entry.current?.platforms?.[name];
      const second=entry.previous?.platforms?.[name];
      const row=emptyRow(name);
      row.currentPosts=Number.isInteger(first?.posts)?first.posts:null;
      row.previousPosts=Number.isInteger(second?.posts)?second.posts:null;
      row.now={};row.last={};row.movements={};
      row.verified=name!=='x'&&result.status==='reported'&&
        first?.inventory?.complete===true&&second?.inventory?.complete===true&&
        entry.current?.coverage?.recordInventoryComplete===true&&
        entry.previous?.coverage?.recordInventoryComplete===true;
      row.sourceNote=name==='x'?'OWNER ENTERED · excluded from health score':
        'META · lifetime totals for posts published in each window';
      for(const metric of measureKeys){
        row.now[metric]=displayMetric(entry.current,name,metric);
        row.last[metric]=displayMetric(entry.previous,name,metric);
        const old=reportedMetric(entry.previous,name,metric);
        const now=reportedMetric(entry.current,name,metric);
        if(name==='x'||!row.verified||!valid(old)||!valid(now))continue;
        // Per-published-post normalization so quantity alone is not scored.
        const oldPer=old/Math.max(1,row.previousPosts);
        const nowPer=now/Math.max(1,row.currentPosts);
        const pct=oldPer===0?(nowPer===0?0:40):(nowPer-oldPer)/oldPer*100;
        if(!Number.isFinite(pct))continue;
        row.movements[metric]=Math.min(40,Math.max(-40,pct));
      }
      result.platforms[name]=row;
    }
    // Two Meta platforms only; per-post movement and measured field coverage.
    // Shares carry the greatest weight (conversation/community referrals);
    // likes and views are positive but do not directly prove website visits.
    const fieldWeights={shares:40,reactions:30,comments:20,views:10};
    for(const name of ['facebook','instagram']){
      const row=result.platforms[name];
      for(const [metric,weight] of Object.entries(fieldWeights)){
        const movement=row.movements[metric];
        if(valid(movement)||typeof movement==='number'&&Number.isFinite(movement)&&movement<0)
          result.scoreSignals.push({label:(name==='facebook'?'Facebook':'Instagram')+' '+(metric==='reactions'?'likes':metric),
            weight:weight/2,movement,platform:name,metric});
      }
    }
    result.availableWeight=result.scoreSignals.reduce((sum,item)=>sum+item.weight,0);
    return result;
  }
  window.djomsSocialPeriod=summary;
  document.addEventListener('djoms:social-report',()=>{
    if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
      typeof window.renderConnectionStrip==='function')window.renderConnectionStrip();
  });
})();