/* DOC JAKS · Verified Social Journey (Facebook, Instagram, X)
   Facebook/Instagram counts are the CURRENT lifetime metrics of posts
   published in each reporting window, NOT interactions on particular dates.
   Comparisons use measured per-post cohort activity; older cohorts have had
   more time to accumulate interactions. Treat direction as provisional.
   X remains owner-entered, display-only, never included in score. */
(function socialJourneyModule(){
  'use strict';
  const keys=['facebook','instagram','x'];
  // Keep exposure in the detailed post report, but score actions only.
  const measureKeys=['views','clicks','reactions','comments','shares'];
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const shift=(day,amount)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return null;
    const d=new Date(day+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()+amount);
    return d.toISOString().slice(0,10);
  };
  const emptyRow=(platform)=>({
    platform,kind:platform==='x'?'owner-entered':'Meta',
    currentPosts:null,previousPosts:null,now:{},last:{},movements:{},displayPct:{},
    exposureTrend:null,
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
        const reports=await Promise.allSettled([
          preexisting?Promise.resolve(preexisting):api('analytics?'+newQuery),
          api('analytics?'+oldQuery)
        ]);
        current=reports[0].status==='fulfilled'?reports[0].value:null;
        last=reports[1].status==='fulfilled'?reports[1].value:null;
        const failed=reports.find(report=>report.status==='rejected');
        if(failed)throw failed.reason;
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
  const promotionLabels={olr5150:'OLR5150 social posts',docjaks:'Other Doc Jaks social posts',social_unclassified:'Unclassified social posts'};
  const platformLabels={facebook:'Facebook',instagram:'Instagram',x:'X',youtube:'YouTube'};
  const promotionId=value=>value==='olr5150'||value==='docjaks'?value:'social_unclassified';
  function promotionGroups(source){
    let labels={};
    try{labels=window.djomsPostAcquisitionGroups?.()||{};}catch{}
    const supplied=Array.isArray(source?.posts),recordsComplete=source?.coverage?.recordInventoryComplete===true;
    const seen=new Set(),duplicates=new Set();
    const posts=[];
    for(const row of supplied?source.posts:[]){
      if(!Object.hasOwn(platformLabels,row?.platform)||!row.postId)continue;
      const identity=row.platform+':'+String(row.postId);
      if(seen.has(identity)){duplicates.add(row.platform);continue;}
      seen.add(identity);
      const group=promotionId(row.recordId&&Object.hasOwn(labels,row.recordId)?labels[row.recordId]:row.acquisitionGroup);
      posts.push({recordId:row.recordId||null,postId:String(row.postId),platform:row.platform,
        title:String(row.title||'Untitled post'),campaign:row.campaign||null,acquisitionGroup:group==='social_unclassified'?null:group,
        publishedAt:row.publishedAt||null,checkedAt:row.checkedAt||null,permalink:row.permalink||null,
        views:valid(row.views)?row.views:null,clicks:valid(row.clicks)?row.clicks:null,
        source:row.source||null,manual:row.platform==='x',metricSources:row.metricSources||{},
        warnings:Array.isArray(row.warnings)?row.warnings:[],group});
    }
    const out={};
    for(const [id,label] of Object.entries(promotionLabels)){
      const grouped=posts.filter(post=>post.group===id),platforms={};
      for(const [platform,name] of Object.entries(platformLabels)){
        const all=posts.filter(post=>post.platform===platform),selected=grouped.filter(post=>post.platform===platform);
        const measuredPlatform=platform==='facebook'||platform==='instagram';
        const inventoryComplete=supplied&&recordsComplete&&!duplicates.has(platform)&&
          source?.platforms?.[platform]?.inventory?.complete===true&&source.platforms[platform].posts===all.length;
        const unclassifiedPosts=all.filter(post=>post.group==='social_unclassified').length;
        const classificationComplete=id==='social_unclassified'||unclassifiedPosts===0;
        const totals={};
        for(const field of ['views','clicks']){
          const measured=measuredPlatform?selected.filter(post=>valid(post[field])):[];
          const complete=measuredPlatform&&inventoryComplete&&classificationComplete&&measured.length===selected.length;
          const value=measured.length?measured.reduce((sum,post)=>sum+post[field],0):complete?0:null;
          totals[field]={value,status:complete?'complete':valid(value)?'partial':'unavailable',
            measuredPosts:measured.length,expectedPosts:selected.length,inventoryComplete,classificationComplete,
            unclassifiedPosts,excluded:!measuredPlatform,
            note:platform==='x'?'Owner-entered X snapshots are excluded from measured totals.':platform==='youtube'?
              'No verified per-post YouTube report is connected to this feed.':
              !supplied?'No current publishing-window post report is available.':
              !inventoryComplete?'Returned posts only; the complete publishing-window inventory is not verified.':
              !classificationComplete?'Posts without a promotion label remain unclassified and are not assigned to either named group.':
              !complete?'Some posts have no reported '+(field==='clicks'?'link-click':'view')+' measurement.':
              'Complete measured '+name+' posts in this promotion group.'};
        }
        platforms[platform]={key:platform,name,posts:selected,postCount:selected.length,manual:platform==='x',
          inventoryComplete,unclassifiedPosts,totals,
          status:Object.values(totals).every(t=>t.status==='complete')?'complete':Object.values(totals).some(t=>valid(t.value))?'partial':'unavailable'};
      }
      const totals={};
      for(const field of ['views','clicks']){
        const included=Object.values(platforms).filter(row=>!row.manual&&valid(row.totals[field].value));
        const missing=Object.values(platforms).filter(row=>!included.includes(row));
        const measuredPosts=included.reduce((sum,row)=>sum+row.totals[field].measuredPosts,0);
        const completeMeasuredInventory=['facebook','instagram'].every(platform=>platforms[platform].totals[field].status==='complete');
        // Empty, complete Instagram rows cannot establish a zero for an
        // unknown Facebook group (or vice versa). An actual measured post,
        // or verified empty coverage across the measured platforms, is needed.
        const value=included.length&&(measuredPosts>0||completeMeasuredInventory)?included.reduce((sum,row)=>sum+row.totals[field].value,0):null;
        totals[field]={value,status:!valid(value)?'unavailable':missing.length||included.some(row=>row.totals[field].status!=='complete')?'partial':'complete',
          measuredPosts,scope:'measured Meta posts',
          expectedPosts:Object.values(platforms).filter(row=>!row.manual).reduce((sum,row)=>sum+row.postCount,0),
          includedPlatforms:included.map(row=>row.key),missingPlatforms:missing.map(row=>row.key),excludedPlatforms:['x'],
          note:'Sum of available measured post '+(field==='clicks'?'link clicks':'views')+'. X owner-entered counts are excluded; missing platform or post measurements are not zero.'};
      }
      out[id]={id,label,posts:grouped,postCount:grouped.length,platforms,totals,
        status:Object.values(totals).every(t=>t.status==='complete')?'complete':Object.values(totals).some(t=>valid(t.value))?'partial':'unavailable',
        unclassifiedPosts:posts.filter(post=>post.group==='social_unclassified').length,
        note:'Current lifetime metrics of posts published during the selected dates. These are post views and link clicks, not website visits. Group labels describe the promoting post, not pages opened later in the visit.'};
    }
    return out;
  }
  function summary(period){
    const validPeriod=period?.query&&period?.start&&period?.endInclusive&&
      Number.isInteger(period.days)&&period.days>0&&period.days<=365;
    if(!validPeriod)return {...empty,promotionGroups:promotionGroups(null),status:'unavailable',note:'Select a valid reporting window.'};
    const key=period.start+'|'+period.endInclusive;
    if(!cache.has(key)&&!inFlight.has(key)&&typeof api==='function')void load(period,key);
    let entry=cache.get(key);
    // An explicit Meta refresh can supply a newer same-post view snapshot.
    // Replace only the current matched cohort, never the previous cohort.
    const incoming=typeof analyticsData!=='undefined'&&
      isCurrent(analyticsData,period.start,period.endInclusive)?analyticsData:null;
    if(entry&&incoming&&
      Date.parse(incoming.checkedAt||'')>Date.parse(entry.current?.checkedAt||'')){
      entry={...entry,current:incoming,checkedAt:incoming.checkedAt};
      cache.set(key,entry);
    }
    if(!entry)return {...empty,promotionGroups:promotionGroups(null)};
    const result={status:entry.status,note:'Lifetime performance, as of now, of posts PUBLISHED in each window. These are not interactions that occurred solely during these dates. Older posts have had longer to accumulate reactions.',
      platforms:{},promotionGroups:promotionGroups(isCurrent(entry.current,period.start,period.endInclusive)?entry.current:null),scoreSignals:[],availableWeight:0,checkedAt:entry.checkedAt,
      error:entry.error||null};
    for(const name of keys){
      const first=entry.current?.platforms?.[name];
      const second=entry.previous?.platforms?.[name];
      const row=emptyRow(name);
      row.currentPosts=Number.isInteger(first?.posts)?first.posts:null;
      row.previousPosts=Number.isInteger(second?.posts)?second.posts:null;
      row.now={};row.last={};row.movements={};row.displayPct={};
      row.exposureTrend=name==='x'?null:first?.exposureTrend||null;
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
        row.displayPct[metric]=oldPer===0&&nowPer>0?'NEW':pct;
        row.movements[metric]=Math.min(40,Math.max(-40,pct));
      }
      result.platforms[name]=row;
    }
    // Two Meta platforms only; per-post movement and measured field coverage.
    // Stronger engagement first: clicks, shares, comments, reactions.
    // Passive post views never contribute to Social Health.
    const fieldWeights={clicks:45,shares:30,comments:15,reactions:10};
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
  // Classification is owner metadata, independent of immutable post metrics.
  // A saved label immediately regroups cached post rows through the fresh map.
  window.addEventListener('djoms-acquisition-group-updated',()=>{
    document.dispatchEvent(new CustomEvent('djoms:social-report'));
  });
  document.addEventListener('djoms:social-report',()=>{
    if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
      typeof window.renderConnectionStrip==='function')window.renderConnectionStrip();
  });
})();
