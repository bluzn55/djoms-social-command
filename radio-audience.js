/* Outlaw Radio 5150: owner-verified Radio.co numbers and live location observations.
   Country data from imported CSV remains unchanged; city is optional. */
(function(){
'use strict';
const cache=new Map(),pending=new Map(),ttl=90000;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number.isSafeInteger(x)&&x>=0?x.toLocaleString('en-US'):'N/A';
const dur=x=>{
 if(typeof x!=='number'||!Number.isFinite(x)||x<0)return 'N/A';
 const s=Math.round(x);
 return Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m '+s%60+'s';
};
const editDur=x=>{
 if(typeof x!=='number'||!Number.isFinite(x)||x<0)return '';
 const s=Math.round(x),pad=n=>String(n).padStart(2,'0');
 return pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60);
};
const parseDur=x=>{
 if(!String(x||'').trim())return null;
 const p=String(x).trim().split(':');
 if(p.length!==3||p.some(y=>!/^\d{1,3}$/.test(y)))throw Error('Enter hh:mm:ss, for example 00:12:30.');
 const [h,m,s]=p.map(Number);
 if(h>23||m>59||s>59)throw Error('Average listening time must be below 24 hours.');
 return h*3600+m*60+s;
};
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')?x.slice(5,7)+'-'+x.slice(8,10)+'-'+x.slice(0,4):'N/A';
const when=x=>x&&Number.isFinite(Date.parse(x))?new Intl.DateTimeFormat('en-US',{
 timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',
 hour:'numeric',minute:'2-digit',hour12:true
}).format(new Date(x)):'N/A';
const metric=(title,value,note)=>'<span class="ra-metric"><small>'+esc(title)+'</small>'+
 '<strong>'+esc(value)+'</strong><em>'+esc(note)+'</em></span>';
const currentPeriod=()=>typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
function content(q){
 const item=cache.get(q),data=item?.data||null,overview=data?.overview||null;
 const saved=Array.isArray(data?.liveLocations)?data.liveLocations:[];
 const period=data?.range||currentPeriod()||{};
 const from=date(period.start),to=date(period.endInclusive);
 const areas=saved.length?saved.map(x=>
  '<div class="ra-city-row"><b>'+esc([x.city,x.region,x.country].filter(Boolean).join(', '))+'</b>'+
  '<small>'+esc(num(x.connections))+' live connection'+(x.connections===1?'':'s')+
  ' observed · '+esc(when(x.capturedAt))+'</small></div>').join(''):
  '<p class="ra-note">No verified live towns or countries saved for this period.</p>';
 return '<div class="ra-head"><strong>VERIFIED LISTENER AUDIENCE</strong>'+
  '<small>'+esc(overview?'RECORDED RADIO.CO OVERVIEW':'PERIOD UNIQUE / AVERAGE PENDING')+'</small></div>'+
  '<div class="ra-grid">'+
   metric('PERIOD UNIQUE',num(overview?.uniqueListeners),'Radio.co selected-period total')+
   metric('AVERAGE LISTEN',dur(overview?.averageSeconds),'Radio.co selected-period average')+
  '</div>'+
  '<p class="ra-note">'+(overview?'Owner-recorded Radio.co Overview for '+esc(from)+' to '+
    esc(to)+' UTC; recorded '+esc(when(overview.capturedAt))+'.':
    'Daily CSV unique figures cannot be added together. Save the matching period totals from Radio.co Overview.')+'</p>'+
  '<details class="rli-details ra-details" data-ra-section="overview">'+
   '<summary>RECORD RADIO.CO OVERVIEW · UNIQUE / AVERAGE</summary>'+
   '<p class="ra-note">In Radio.co Statistics → Overview, select '+esc(from)+' to '+
    esc(to)+' (UTC date labels), then enter exactly what Radio.co displays.</p>'+
   '<div class="ra-fields">'+
    '<label>Connections<input type="number" min="0" step="1" data-ra-total'+
      (overview?' value="'+overview.totalConnections+'"':'')+'></label>'+
    '<label>Unique listeners<input type="number" min="0" step="1" data-ra-unique'+
      (overview?' value="'+overview.uniqueListeners+'"':'')+'></label>'+
    '<label>Average listen (hh:mm:ss)<input data-ra-average type="text" placeholder="00:12:30"'+
      (overview&&overview.averageSeconds!==null?' value="'+esc(editDur(overview.averageSeconds))+'"':'')+'></label>'+
    '<label>Peak at once (optional)<input data-ra-peak type="number" min="0" step="1"'+
      (overview&&overview.peakConnections!==null?' value="'+overview.peakConnections+'"':'')+'></label>'+
   '</div>'+
   '<label class="ra-confirm"><input type="checkbox" data-ra-verified-overview> '+
     'These are the Radio.co Overview numbers for the exact selected dates.</label>'+
   '<button type="button" data-ra-save="overview">SAVE VERIFIED OVERVIEW</button>'+
   '<span class="ra-feedback" data-ra-result="overview" role="status"></span>'+
  '</details>'+
  '<details class="rli-details ra-details" data-ra-section="locations">'+
   '<summary>LISTENER LOCATIONS · OPTIONAL TOWNS'+(saved.length?' · '+esc(num(saved.length)):'')+'</summary>'+
   '<p class="ra-note">The Radio.co CSV country breakdown remains in '+
    '<b>COUNTRIES · DEVICES · LISTENING APPS</b>. Towns are optional and only appear '+
    'when Radio.co Real Time shows them. Live map locations are approximate.</p>'+
   '<div class="ra-cities">'+areas+'</div>'+
   '<details class="ra-add"><summary>RECORD VERIFIED LIVE TOWN / CITY</summary>'+
    '<div class="ra-fields">'+
     '<label>Country<input data-ra-country maxlength="70" placeholder="United States"></label>'+
     '<label>Town or city (optional)<input data-ra-city maxlength="75" placeholder="Only if Radio.co shows it"></label>'+
     '<label>Region / state (optional)<input data-ra-region maxlength="65" placeholder="LA"></label>'+
     '<label>Live connections<input data-ra-connections type="number" min="1" max="5000" step="1"></label>'+
    '</div>'+
    '<label class="ra-confirm"><input type="checkbox" data-ra-verified-city> '+
      'I saw this location in Radio.co Real Time, not in Wix website analytics.</label>'+
    '<button type="button" data-ra-save="city">RECORD LIVE LOCATION</button>'+
    '<span class="ra-feedback" data-ra-result="city" role="status"></span>'+
   '</details>'+
  '</details>'+
  '<p class="ra-note">No automatic live city feed is connected. '+
   'These snapshots are not listener identities or historical town-level totals.</p>'+
  (!data?'<p class="ra-note">'+esc(item?.error||'Checking saved radio observations…')+'</p>':'');
}
function paint(q){
 document.querySelectorAll('.mj-radio-audience[data-ra-query]').forEach(node=>{
  if(node.dataset.raQuery!==q)return;
  const open=[...node.querySelectorAll('details[data-ra-section]')].filter(x=>x.open)
   .map(x=>x.dataset.raSection);
  node.innerHTML=content(q);
  node.querySelectorAll('details[data-ra-section]').forEach(x=>x.open=open.includes(x.dataset.raSection));
 });
}
function load(q,force=false){
 if(pending.has(q))return pending.get(q);
 const previous=cache.get(q);
 if(!force&&previous&&Date.now()-previous.time<ttl)return Promise.resolve(previous.data);
 const task=api('radio-audience?'+q).then(data=>{
  if(data?.status!=='reported'||!data.range)throw Error(data?.error||'Audience evidence unavailable.');
  cache.set(q,{time:Date.now(),data});return data;
 }).catch(err=>{cache.set(q,{time:Date.now(),data:null,error:String(err?.message||'Report unavailable.')});return null;})
 .finally(()=>{pending.delete(q);paint(q);});
 pending.set(q,task);return task;
}
window.djomsRadioAudienceSection=period=>{
 const q=period?.query;
 if(!q)return '<section class="mj-radio-audience">Select a report period.</section>';
 if(typeof owner!=='undefined'&&owner&&!pending.has(q)&&
    (!cache.has(q)||Date.now()-cache.get(q).time>ttl))queueMicrotask(()=>load(q));
 return '<section class="mj-radio-audience" data-ra-query="'+esc(q)+'">'+content(q)+'</section>';
};
document.addEventListener('click',async ev=>{
 const button=ev.target.closest?.('[data-ra-save]');
 if(!button)return;
 const section=button.closest('.mj-radio-audience');
 if(!section||button.disabled)return;
 ev.preventDefault();
 const kind=button.dataset.raSave,q=section.dataset.raQuery;
 const period=currentPeriod(),status=section.querySelector('[data-ra-result="'+kind+'"]');
 if(!period||period.query!==q){if(status)status.textContent='Period changed. Refresh #4.';return;}
 const get=s=>section.querySelector(s)?.value?.trim()||'';
 let body;
 try{
  if(kind==='overview'){
   const total=get('[data-ra-total]'),unique=get('[data-ra-unique]');
   if(!/^\d+$/.test(total)||!/^\d+$/.test(unique))throw Error('Enter the exact total and unique counts.');
   if(!section.querySelector('[data-ra-verified-overview]')?.checked)throw Error('Verify these figures came from Radio.co Overview.');
   body={kind:'overview',start:period.start,endInclusive:period.endInclusive,
    totalConnections:Number(total),uniqueListeners:Number(unique),
    averageSeconds:parseDur(get('[data-ra-average]')),
    peakConnections:get('[data-ra-peak]')===''?null:Number(get('[data-ra-peak]')),
    sourceConfirmed:true};
  }else if(kind==='city'){
   const value=get('[data-ra-connections]');
   if(!/^\d+$/.test(value))throw Error('Enter the observed live connections.');
   if(!section.querySelector('[data-ra-verified-city]')?.checked)throw Error('Verify the location came from Radio.co Real Time.');
   body={kind:'live-location',country:get('[data-ra-country]'),
    city:get('[data-ra-city]'),region:get('[data-ra-region]'),
    connections:Number(value),sourceConfirmed:true};
  }else return;
  button.disabled=true;
  if(status)status.textContent='Saving verified Radio.co observation…';
  let result;
  try{result=await api('radio-audience',body);}
  catch(e){
   if(kind==='overview'&&/already exists|replacement/i.test(String(e?.message||''))&&
      confirm('Replace the existing Overview values for these exact dates?'))
     result=await api('radio-audience',{...body,replaceExisting:true});
   else throw e;
  }
  if(!['saved','already_recorded'].includes(result?.status))throw Error('Save was not confirmed.');
  cache.delete(q);await load(q,true);
  const updated=[...document.querySelectorAll('.mj-radio-audience')].find(x=>x.dataset.raQuery===q);
  const feedback=updated?.querySelector('[data-ra-result="'+kind+'"]');
  if(feedback)feedback.textContent=kind==='city'?'Live location recorded.':'Radio.co Overview figures saved.';
 }catch(e){if(status)status.textContent=String(e?.message||'Could not save data.');}
 finally{button.disabled=false;}
});
})();