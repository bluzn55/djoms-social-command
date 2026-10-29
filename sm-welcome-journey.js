/* Doc Jaks #6 · Welcome-page button-click actions.
 * Wix native CTA clicks and consented per-placecard click attribution
 * are overlapping sources and must not be added.
 */
(function(){
'use strict';
const cache=new Map(),pending=new Map(),ttl=90000;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?
  x.toLocaleString('en-US'):'N/A';
const cap=x=>String(x||'').trim().replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const LABELS={
  music:'Music','emberhold-library':'Emberhold Library',
  'my-krewe':'My Krewe','outlaw-entertainment':'Outlaw Entertainment',
  'pit-krewe':'Pit Krewe',sosses:'Sosses'
};
const dates=p=>p&&p.start&&p.endInclusive;
const row=(name,value,small)=>'<div class="sm-next-row">'+
 '<span><b>'+esc(name)+'</b><small>'+esc(small||'')+'</small></span>'+
 '<strong>'+esc(num(value))+'</strong></div>';
function paint(data){
 const wix=data?.wix||{};
 const tracked=data?.tracked||{};
 const nativeReady=wix.status==='reported';
 const trackedReady=tracked.status==='reported';
 const wixRows=nativeReady&&Array.isArray(wix.rows)?wix.rows:[];
 const matches=trackedReady&&Array.isArray(tracked.cards)?tracked.cards:[];
 const wixList=wixRows.length?
   wixRows.map(entry=>row(entry.destination,entry.clicks,'Wix-reported button clicks')).join(''):
   '<p>No verified Wix button clicks for these dates'+
   (nativeReady?'.':' yet. '+esc(wix.error||'Checking report…'))+'</p>';
 const perCard=matches.length?matches.map(entry=>{
   const desc=[entry.campaign,entry.platform].filter(Boolean).join(' · ').toUpperCase();
   const actions=Object.entries(entry.actions||{}).map(([action,n])=>
     (LABELS[action]||cap(action))+' '+num(n)).join(' · ');
   return row(entry.placecard,entry.clicks,desc+' · '+actions);
 }).join(''):'<p>'+esc(trackedReady?
   'No new per-placecard button clicks recorded for these dates.':
   'Per-placecard tracking is ready to report after a verified, consented button click. Older Wix clicks cannot be assigned to a card.')+'</p>';
 return '<div class="sm-next-top">'+
  '<div><b>WELCOME PAGE · NEXT ACTIONS</b>'+
    '<small>What visitors clicked after arriving on SM Welcome</small></div>'+
  '<div class="sm-next-totals">'+
    '<span>WIX BUTTON CLICKS <strong>'+num(nativeReady?wix.clicks:null)+'</strong></span>'+
    '<span>PLACE CARD MATCHES <strong>'+num(trackedReady?tracked.totalClicks:null)+'</strong></span>'+
  '</div></div>'+
  '<details class="mj-stage-dropdown mj-sm-next-details" data-mj-dropdown="sm-next">'+
    '<summary><span>VIEW WELCOME BUTTONS & PLACE CARDS</span><b>▾</b></summary>'+
    '<div class="mj-dropdown-content">'+
      '<div class="sm-next-subhead">ALL WELCOME PAGE BUTTONS · WIX</div>'+
      '<p class="sm-next-hint">Includes direct arrivals and your own tests. These are click events, not distinct people or confirmed visits to the next page.</p>'+
      '<div class="sm-next-rows">'+wixList+'</div>'+
      '<div class="sm-next-subhead">BUTTON CLICKS MATCHED TO A PLACE CARD</div>'+
      '<p class="sm-next-hint">New, consented link clicks only. Shows the originating placecard, platform and destination. This may overlap the Wix totals above.</p>'+
      '<div class="sm-next-rows">'+perCard+'</div>'+
      (tracked.partial?'<p class="sm-next-hint">Only the first 80 matched placecards are displayed.</p>':'')+
    '</div></details>';
}
function load(period,key){
 if(pending.has(key))return;
 const task=api('sm-welcome-journey?'+key).then(data=>{
   if(data?.range?.start!==period.start||
     data?.range?.endInclusive!==period.endInclusive)
     throw Error('Welcome report returned a different date range.');
   cache.set(key,{data,checked:Date.now()});
 }).catch(error=>{
   cache.set(key,{error:String(error?.message||'Welcome action reporting unavailable.'),
     checked:Date.now()});
 }).finally(()=>{
   pending.delete(key);
   if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
      typeof websiteReportPeriod==='function'&&
      websiteReportPeriod()?.query===key&&
      typeof window.renderConnectionStrip==='function')
        window.renderConnectionStrip();
 });
 pending.set(key,task);
}
function section(period){
 if(!dates(period))return '';
 const key=period.query;
 if(!key)return '';
 const saved=cache.get(key);
 if((!saved||Date.now()-saved.checked>=ttl)&&!pending.has(key)&&typeof api==='function')
   load(period,key);
 const data=saved?.data||null;
 const html=data?paint(data):
   '<div class="sm-next-top"><div><b>WELCOME PAGE · NEXT ACTIONS</b>'+
   '<small>'+esc(saved?.error||'Checking Wix button clicks and placecard matches…')+'</small></div>'+
   '<div class="sm-next-totals"><span>WIX BUTTON CLICKS <strong>N/A</strong></span>'+
   '<span>PLACE CARD MATCHES <strong>N/A</strong></span></div></div>';
 return '<section class="mj-sm-next" aria-label="Welcome page next actions">'+html+'</section>';
}
window.djomsSmWelcomeJourneySection=section;
})();
