/* DJOMS · Wix visitor-breakdown refresh while the owner is viewing reports.
   Wix summary and visitor-type reports can update at different times.
   Run at most once per 30 minutes, only in a visible signed-in dashboard.
   Do not schedule on the server, replace good reports with connection errors,
   or overwrite a date range changed during an in-flight request. */
(function wixVisitorSyncMonitor(){
  'use strict';
  const INTERVAL_MS=30*60*1000;
  const VIEWS=new Set(['Mission Control','Platform Details','Website Analytics']);
  let lastAttemptAt=0;
  let inFlight=false;

  function currentState(){
    if(typeof owner!=='string'||!owner||typeof csrf!=='string'||!csrf)return null;
    if(typeof websiteSnapshot!=='function'||typeof websitePeriodQuery!=='function')return null;
    if(typeof activeView!=='string'||!VIEWS.has(activeView))return null;
    if(document.visibilityState!=='visible')return null;
    if(typeof busy==='boolean'&&busy)return null;
    const snapshot=websiteSnapshot();
    if(snapshot?.connected!==true)return null;
    if(!['pending','unverified'].includes(snapshot.visitorReconciliation?.status))return null;
    const range=websiteRange;
    const query=websitePeriodQuery();
    return {snapshot,range,query};
  }

  async function checkIfDue(){
    if(inFlight)return;
    let selection;
    try{selection=currentState();}catch(_){return;}
    if(!selection)return;
    const now=Date.now();
    // Use the report's actual last refresh (including the first page load)
    // so we don't immediately duplicate the initial Wix API request.
    const checkedAt=Date.parse(selection.snapshot?.checkedAt||'');
    const mostRecent=Math.max(lastAttemptAt,Number.isFinite(checkedAt)?checkedAt:0);
    if(now-mostRecent<INTERVAL_MS)return;
    lastAttemptAt=now;
    inFlight=true;
    try{
      // Fetch new Wix data into a temporary object FIRST.
      // A transient Wix outage must not wipe verified visitors/visits.
      const next=await api('website-range?'+selection.query);
      if(!next?.connected||next?.range?.selection!==selection.range)return;
      if(next?.range?.start!==selection.snapshot?.range?.start||
         next?.range?.end!==selection.snapshot?.range?.end)return;
      if(websiteRange!==selection.range||websitePeriodQuery()!==selection.query)return;

      const wasMatched=selection.snapshot.visitorReconciliation?.status==='reconciled';
      websiteRangeReports[selection.range]=next;
      if(selection.range==='7d')localData.website=next;

      if(['Mission Control','Platform Details'].includes(activeView)){
        renderConnectionStrip();
      }else if(activeView==='Website Analytics'){
        render();
      }
      if(!wasMatched&&next.visitorReconciliation?.status==='reconciled'&&
         typeof notice==='function'){
        notice('Wix visitor totals now reconcile: New + Returning = Website Visitors.');
      }
    }catch(_){
      // Keep all previous verified readings; next attempt is throttled.
    }finally{
      inFlight=false;
    }
  }

  // A minute timer gives prompt resumed checks without continually querying
  // Wix; the elapsed-time guard enforces 30 minutes between remote checks.
  window.setInterval(()=>{void checkIfDue();},60000);
  window.addEventListener('focus',()=>{void checkIfDue();});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void checkIfDue();
  });
})();