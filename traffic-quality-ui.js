/* DOC JAKS · Traffic Quality UI. Wix original metrics are never changed.
   Heuristic-only classification: likely automated, engaged-looking, unknown. */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const n=v=>Number.isSafeInteger(v)&&v>=0?v.toLocaleString('en-US'):'N/A';
const moment=v=>v&&Number.isFinite(Date.parse(v))?
  new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',
    month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v)):'N/A';
const cache=new Map(),pending=new Map(),TTL=120000;
const keyFor=period=>{
  const choice=period?.selection||period?.range;
  if(!['today','7d','30d','365d','custom'].includes(choice))return null;
  const start=period?.start,end=period?.endInclusive;
  if(choice==='custom'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||
       !/^\d{4}-\d{2}-\d{2}$/.test(end||''))return null;
    return 'range=custom&start='+encodeURIComponent(start)+
      '&end='+encodeURIComponent(end);
  }
  return 'range='+encodeURIComponent(choice);
};
const label=(v)=>String(v??'');
const locationTitle=loc=>[loc?.city,loc?.region,loc?.country]
  .filter(Boolean).join(', ');
function locationGroup(report,location){
  if(!location?.country)return {
    total:report.totalWixSessions,automated:report.likelyAutomated,
    engaged:report.engagedLooking,undetermined:report.unclassified
  };
  const local=location.city||location.region;
  const values=local?report.byLocation:report.byCountry;
  if(!Array.isArray(values))return null;
  const match=values.find(x=>x.country===location.country&&
    (!local||x.city===(location.city||'')&&x.region===(location.region||'')));
  if(!match)return report.status==='reported'?
    {total:0,automated:0,engaged:0,undetermined:0}:null;
  return match;
}
function patterns(report,location){
  const items=Array.isArray(report?.patterns)?report.patterns:[];
  return items.filter(item=>!location?.country||
    item.country===location.country&&
    (!location.city||item.city===location.city)&&
    (!location.region||item.region===location.region));
}
function metric(title,value,description,kind=''){
  return '<div class="dj-quality-metric '+kind+'">'+
    '<small>'+esc(title)+'</small><strong>'+esc(n(value))+'</strong>'+
    '<span>'+esc(description)+'</span></div>';
}
function detailHtml(data,loc,compact){
  const selected=locationGroup(data,loc);
  const list=patterns(data,loc);
  if(!selected)return '<p class="dj-quality-note">Wix location coverage is not complete. Cannot classify these visits.</p>';
  const complete=data.status==='reported'&&data.reconciled===true;
  const total=selected.total;
  const auto=selected.automated;
  const engaged=selected.engaged;
  const undecided=complete?selected.undetermined:null;
  // Never make a "verified human" claim. These are mutually exclusive
  // session groups, not people, and raw Wix totals remain untouched.
  const cards=metric('WIX VISITS · ORIGINAL',total,'Unchanged source total')+
    metric('LIKELY AUTOMATED',auto,'Rapid crawler-like page sweeps','automation')+
    metric('ENGAGED-LOOKING',engaged,'2+ pages or measured stay ≥30 sec','engagement')+
    metric('UNCLASSIFIED',undecided,'Neither pattern is proven','unknown');
  const note='These are website sessions, not unique people. Rapid scanning is not an attack. '+
    'Engaged-looking does not prove a human. Unclassified is not automatically a bot. '+
    'We do not subtract these estimates from Wix visitor or sales totals.';
  const reportLabel=loc?.country?' · '+locationTitle(loc):' · All website sources';
  const coverage=complete?'Fully reconciled with Wix session total':
    'Partial data · remaining sessions cannot be classified';
  if(compact){
    return '<div class="dj-quality-compact"><div class="dj-quality-title">'+
      '<strong>TRAFFIC QUALITY · CRAWLER-LIKE VS ENGAGED</strong>'+
      '<small>'+esc(coverage)+'</small></div>'+
      '<div class="dj-quality-grid">'+cards+'</div>'+
      '<p class="dj-quality-note">'+esc(note)+'</p>'+
      '<button type="button" class="dj-quality-see" data-quality-open-world="1">'+
        'VIEW COUNTRIES & DETAILS</button></div>';
  }
  const cases=list.length?list.slice(0,12).map(item=>
    '<div class="dj-quality-case"><strong>'+esc([
      item.city,item.region,item.country].filter(Boolean).join(', '))+'</strong>'+
    '<small>'+esc(moment(item.start))+' · '+esc(n(item.visits))+
      ' visits · '+esc(n(item.pages))+' different pages · '+
      esc(n(item.durationSeconds))+' sec recorded burst</small></div>').join(''):
    '<p>No rapid-page-sweep patterns matched this selection. Other automation could still be present.</p>';
  return '<section class="dj-quality-full">'+
    '<header><div><strong>TRAFFIC QUALITY</strong>'+
      '<small>PROBABLE CRAWLERS · ENGAGED VISITS · UNCLEAR ACTIVITY'+esc(reportLabel)+'</small></div>'+
      '<span>'+esc(coverage)+'</span></header>'+
    '<div class="dj-quality-grid">'+cards+'</div>'+
    '<p class="dj-quality-note">'+esc(note)+'</p>'+
    '<details class="dj-quality-evidence"><summary>WHY WERE VISITS FLAGGED? · '+
      esc(n(list.length))+' rapid-scan patterns</summary>'+
      '<p>At least eight different public pages were opened within three minutes, '+
      'using single-page sessions from a common network and browser profile. '+
      'This is consistent with a crawler, but not proof of malicious intent.</p>'+
      cases+
    '</details>'+
  '</section>';
}
function errorHtml(error){
  return '<div class="dj-quality-loading"><strong>TRAFFIC QUALITY · N/A</strong>'+
    '<p>'+esc(error||'Wix visitor quality has not been verified for this period.')+
    '</p></div>';
}
function render(el, data, location, compact){
  el.innerHTML=!data?'<p class="dj-quality-loading">Checking visit quality from Wix…</p>':
    data.status==='unavailable'?errorHtml(data.error):
    detailHtml(data,location,compact);
}
function mount(id,period,location=null,compact=false){
  const slot=document.getElementById(id),key=keyFor(period);
  if(!slot)return;
  if(!key){slot.innerHTML=errorHtml('Choose a supported reporting period.');return;}
  const stamp=key+'|'+JSON.stringify(location);
  slot.dataset.qualityStamp=stamp;
  const existing=cache.get(key);
  if(existing&&Date.now()-existing.time<TTL){render(slot,existing.data,location,compact);return;}
  render(slot,null,location,compact);
  if(!pending.has(key)){
    const request=api('traffic-quality?'+key).then(data=>{
      const q=data?.range||{};
      const expected=period?.selection||period?.range;
      if(q.selection!==expected||q.start!==period?.start||q.endInclusive!==period?.endInclusive)
        throw new Error('Wix traffic quality reporting dates did not match.');
      cache.set(key,{data,time:Date.now()});
      return data;
    }).catch(error=>{
      const data={status:'unavailable',error:String(error?.message||'Report unavailable.')};
      cache.set(key,{data,time:Date.now()});return data;
    }).finally(()=>pending.delete(key));
    pending.set(key,request);
  }
  pending.get(key).then(data=>{
    if(document.getElementById(id)===slot&&slot.dataset.qualityStamp===stamp)
      render(slot,data,location,compact);
  });
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-quality-open-world]');
  if(!button)return;
  event.preventDefault();
  if(typeof window.djomsWorldwideVisitors?.open==='function'){
    const period=typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
    window.djomsWorldwideVisitors.open(null,period);
  }
});
window.djomsTrafficQuality={mount};
})();