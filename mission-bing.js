/* DJOMS · Optional Bing Webmaster Tools search-performance reader.
   Read-only, owner-authenticated, follows the exact shared Wix reporting dates. */
(function missionBingReader(){
  'use strict';
  const cache=new Map(),inFlight=new Map(),cacheMs=240000;
  const selection=()=>typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
  const datesMatch=(report,period)=>report?.range?.start===period?.start&&
    report?.range?.end===period?.end;
  function publish(period,report){
    if(!datesMatch(report,period))return;
    window.djomsVerifiedReports ||= {};
    const prior=window.djomsVerifiedReports.bing;
    const stamp=period.query+'|'+String(report.checkedAt||'')+'|'+report.status;
    window.djomsVerifiedReports.bing={query:period.query,data:report,stamp};
    if(prior?.stamp!==stamp)
      document.dispatchEvent(new CustomEvent('djoms:verified-report',{detail:{source:'bing'}}));
  }
  async function load(period,force=false){
    if(!period?.query||!period.start||!period.end)return null;
    const key=period.query,old=cache.get(key);
    if(!force&&old&&Date.now()-old.at<cacheMs)return old;
    if(!force&&inFlight.has(key))return inFlight.get(key);
    const task=(async()=>{
      let report=null,error=null;
      try{
        const response=await fetch('/api/meta/bing-status?'+key,{
          credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(34000)
        });
        report=await response.json().catch(()=>null);
        if(!response.ok)throw Error(report?.error||'Bing Webmaster is not available.');
        if(!datesMatch(report,period))throw Error('Bing dates do not match the reporting period.');
      }catch(e){
        error=e?.name==='TimeoutError'?'Bing Webmaster took too long.':
          String(e?.message||'Bing report unavailable.');
      }
      const result={at:Date.now(),report,error};
      cache.set(key,result);
      return result;
    })().finally(()=>inFlight.delete(key));
    inFlight.set(key,task);
    return task;
  }
  function refresh(force=false){
    const period=selection();
    if(!period?.query||!period.start||!period.end)return;
    const key=period.query,prior=cache.get(key);
    if(prior?.report)publish(period,prior.report);
    void load(period,force).then(result=>{
      if(selection()?.query!==key||!result?.report)return;
      publish(period,result.report);
    });
  }
  const previous=window.renderConnectionStrip;
  if(typeof previous==='function'){
    window.renderConnectionStrip=function(...args){
      const result=previous.apply(this,args);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control')refresh(false);
      return result;
    };
  }
  window.djomsRefreshBingReport=()=>refresh(true);
})();
