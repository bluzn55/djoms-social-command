/* DJOMS · Wix visitor-breakdown refresh while the owner is viewing reports.
   Wix summary and visitor-type reports can update at different times.
   Run at most once per 10 minutes while pending, only in a visible signed-in dashboard.
   Do not schedule on the server, replace good reports with connection errors,
   or overwrite a date range changed during an in-flight request. */
(function wixVisitorSyncMonitor(){
  'use strict';
  const INTERVAL_MS=10*60*1000;
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
    const reconciliation=snapshot.visitorReconciliation;
    // Current counts may be aligned while yesterday's comparison still lags.
    if(!reconciliation||reconciliation.status==='reconciled'&&
       reconciliation.previousReconciled===true)return null;
    if(!['pending','unverified','reconciled'].includes(reconciliation.status))return null;
    const range=websiteRange;
    const query=websitePeriodQuery();
    return {snapshot,range,query};
  }

  async function checkIfDue(force=false){
    if(inFlight)return;
    let selection;
    try{selection=currentState();}catch(_){return;}
    if(!selection)return;
    const now=Date.now();
    // Use the report's actual last refresh (including the first page load)
    // so we don't immediately duplicate the initial Wix API request.
    const checkedAt=Date.parse(selection.snapshot?.checkedAt||'');
    const mostRecent=Math.max(lastAttemptAt,Number.isFinite(checkedAt)?checkedAt:0);
    if(!force&&now-mostRecent<INTERVAL_MS)return;
    lastAttemptAt=now;
    inFlight=true;
    try{
      // Fetch new Wix data into a temporary object FIRST.
      // A transient Wix outage must not wipe verified visitors/visits.
      const next=await api('website-range?'+selection.query);
      if(!next?.connected||next?.range?.selection!==selection.range)return;
      // A custom range never changes without user action; rolling Day/Week/
      // Month/Year dates may advance at midnight while the page stays open.
      if(selection.range==='custom'&&
         (next?.range?.start!==selection.snapshot?.range?.start||
          next?.range?.end!==selection.snapshot?.range?.end))return;
      if(websiteRange!==selection.range||websitePeriodQuery()!==selection.query)return;

      const wasMatched=selection.snapshot.visitorReconciliation?.status==='reconciled';
      websiteRangeReports[selection.range]=next;
      if(selection.range==='7d')localData.website=next;

      if(['Mission Control','Platform Details'].includes(activeView)){
        renderConnectionStrip();
      }else if(activeView==='Website Analytics'){
        render();
      }
      const agreement=next.visitorReconciliation;
      if(!wasMatched&&agreement?.status==='reconciled'&&typeof notice==='function'){
        notice('Wix visitors reconciled: '+agreement.newVisitors+' New + '+
          agreement.returningVisitors+' Returning = '+agreement.summaryVisitors+
          ' Website Visitors.');
      }else if(force&&typeof notice==='function'){
        if(agreement?.status==='reconciled'){
          notice('Wix verified '+agreement.newVisitors+' New + '+
            agreement.returningVisitors+' Returning = '+agreement.summaryVisitors+
            ' Website Visitors. Prior-period comparisons '+(
            agreement.previousReconciled?'also reconcile.':'are still catching up.'));
        }else{
          notice('Wix was checked again. Current summary: '+
            (agreement?.summaryVisitors??'N/A')+' visitors; New + Returning: '+
            (agreement?.classifiedVisitors??'N/A')+
            '. The figures still disagree. DJOMS will not guess the difference.');
        }
      }
    }catch(error){
      // Keep all previous verified readings; the owner can retry manually.
      if(force&&typeof notice==='function')
        notice('Wix refresh did not complete: '+String(error?.message||'Connection interrupted.'),true);
    }finally{
      inFlight=false;
    }
  }

  // Manual refresh is never subject to the automatic ten-minute guard.
  // Delegated handling survives full report redraws and view switching.
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-wix-split-refresh]');
    if(!button)return;
    event.preventDefault();
    if(inFlight)return;
    button.disabled=true;
    button.textContent='CHECKING WIX...';
    void checkIfDue(true).finally(()=>{
      if(button.isConnected){
        button.disabled=false;
        button.textContent='REFRESH WIX NOW';
      }
    });
  });

  // A minute timer gives prompt resumed checks without continually querying
  // Wix; the elapsed-time guard enforces ten minutes between automatic checks.
  window.setInterval(()=>{void checkIfDue();},60000);
  window.addEventListener('focus',()=>{void checkIfDue();});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void checkIfDue();
  });
})();