/* DJOMS · Google Maps Business Profile performance, optional owner data.
   Maps profile appearances are NOT website visits or Search Console impressions. */
(function missionMapsReader(){
  'use strict';
  const cache=new Map(),active=new Map(),cacheMs=240000;
  const current=()=>typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
  const sameRange=(report,period)=>report?.range?.start===period?.start&&
    report?.range?.end===period?.end;
  function publish(period,report){
    if(!sameRange(report,period))return;
    window.djomsVerifiedReports ||= {};
    const old=window.djomsVerifiedReports.maps;
    const stamp=period.query+'|'+String(report?.checkedAt||'')+'|'+String(report?.status||'');
    window.djomsVerifiedReports.maps={query:period.query,data:report,stamp};
    if(old?.stamp!==stamp)
      document.dispatchEvent(new CustomEvent('djoms:verified-report',{detail:{source:'maps'}}));
  }
  function load(period,force=false){
    const key=period?.query;
    if(!key||!period.start||!period.end)return Promise.resolve(null);
    const found=cache.get(key);
    if(!force&&found&&Date.now()-found.at<cacheMs)return Promise.resolve(found);
    if(!force&&active.has(key))return active.get(key);
    const request=(async()=>{
      let report=null,error=null;
      try{
        const response=await fetch('/api/meta/maps-performance?'+key,{
          credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(34000)
        });
        report=await response.json().catch(()=>null);
        if(!response.ok)throw Error(report?.error||'Maps performance could not be reached.');
        if(!sameRange(report,period))throw Error('Maps report does not match the selected dates.');
      }catch(e){
        error=e?.name==='TimeoutError'?'Maps reporting took too long.':
          String(e?.message||'Maps performance unavailable.');
      }
      const snapshot={report,error,at:Date.now()};
      cache.set(key,snapshot);
      return snapshot;
    })().finally(()=>active.delete(key));
    active.set(key,request);
    return request;
  }
  function refresh(force=false){
    const period=current();
    if(!period?.start||!period?.end||!period.query)return;
    const key=period.query;
    const existing=cache.get(key);
    if(existing?.report)publish(period,existing.report);
    void load(period,force).then(snapshot=>{
      if(current()?.query!==key||!snapshot?.report)return;
      publish(period,snapshot.report);
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
  window.djomsRefreshMapsPerformance=()=>refresh(true);
})();
