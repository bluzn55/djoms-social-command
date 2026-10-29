(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number.isSafeInteger(n)&&n>=0?n.toLocaleString('en-US'):'N/A';
const stay=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?(n<60?Math.round(n)+' sec':Math.floor(n/60)+'m '+Math.round(n%60)+'s'):'N/A';
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.slice(5)+'-'+s.slice(0,4):'N/A';
const time=v=>v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(v)):'N/A';
const name=l=>[l?.city,l?.region,l?.country].filter(Boolean).join(', ')||'Unknown';
const label=p=>{const bits=String(p||'/').split('/').filter(Boolean);return bits.length?bits.at(-1).replace(/-/g,' ').replace(/\b\w/g,s=>s.toUpperCase()):'Home';};
const el=id=>document.getElementById(id);
const active=()=>typeof activeView!=='undefined'&&activeView==='Worldwide Visitors';
let range='7d',start='',end='',chosen=null,search='';
const stored=new Map(),waiting=new Map(),periods=['today','7d','30d','365d','custom'];
const loc=x=>({country:String(x?.country||''),city:String(x?.city||''),region:String(x?.region||'')});
const query=()=>{
 if(range==='custom'&&!(/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end))
   throw Error('Choose valid start and end dates.');
 let s='range='+range+(range==='custom'?'&start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end):'');
 if(chosen?.country)s+='&country='+encodeURIComponent(chosen.country)+'&city='+encodeURIComponent(chosen.city)+'&region='+encodeURIComponent(chosen.region);
 return 'visitor-geography?mode='+(chosen?.country?'detail':'overview')+'&'+s;
};
const k=()=>query();
const btn=(l,countryOnly=false)=>'<button type="button" data-world-choose="1" data-country="'+esc(l.country||'')+'" data-city="'+esc(countryOnly?'':l.city||'')+'" data-region="'+esc(countryOnly?'':l.region||'')+'">'+(countryOnly?'COUNTRY DETAILS':'VIEW ACTIVITY')+'</button>';
const metric=(t,n,d,format=num)=>'<div class="world-metric"><small>'+esc(t)+'</small><strong>'+esc(format(n))+'</strong><span>'+esc(d)+'</span></div>';
const period='<span>Times shown in Louisiana time. Locations are approximate, not street addresses.</span>';
function siteLink(p){
 const s=String(p||'/'),safe=/^\/[a-z0-9/%._~-]*$/i.test(s);
 return '<div class="world-page"><strong>'+esc(label(s))+'</strong><code>'+esc(s)+'</code>'+
  (safe?'<a href="https://www.docjaks.com'+esc(s)+'" target="_blank" rel="noopener noreferrer">Open page</a>':'')+'</div>';
}
function table(headers,rows){
 return rows.length?'<div class="world-table-scroll"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':
  '<p class="world-empty">No verified results were returned for this section.</p>';
}
function panel(title,detail,body,open=true){
 return '<details class="world-panel"'+(open?' open':'')+'><summary><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></summary>'+body+'</details>';
}
function cityRows(rows){
 const filtered=search?rows.filter(r=>name(r).toLowerCase().includes(search.toLowerCase())):rows;
 return '<p class="world-caption">'+num(filtered.length)+' of '+num(rows.length)+' locations</p>'+
  (filtered.length?filtered.map(r=>'<div class="world-city">'+
   '<div><strong>'+esc(name(r))+'</strong><small>'+num(r.visits)+' visits · '+num(r.views)+' page views · avg '+stay(r.avgStaySeconds)+'</small></div>'+
   '<b>'+num(r.visitors)+' visitors</b>'+btn(r)+'</div>').join(''):
   '<p class="world-empty">No matching cities or countries.</p>');
}
function overview(d){
 const countries=Array.isArray(d.countries)?d.countries:[],cities=Array.isArray(d.locations)?d.locations:[];
 return '<p class="world-caption">'+esc(date(d.range?.start))+' to '+esc(date(d.range?.endInclusive))+' · '+esc(time(d.checkedAt))+'</p>'+
  '<h3>COUNTRIES · '+num(countries.length)+'</h3><div class="world-countries">'+
  countries.map(r=>'<article class="world-country"><h4>'+esc(r.country)+'</h4><b>'+num(r.visitors)+' visitors</b>'+
    '<small>'+num(r.visits)+' visits · '+num(r.views)+' page views</small>'+btn(r,true)+'</article>').join('')+
  '</div><div class="world-city-section"><h3>CITIES & REGIONS · '+num(cities.length)+'</h3>'+
  '<label>FIND A PLACE <input id="worldSearch" type="search" value="'+esc(search)+'" placeholder="Québec, Slidell, China…"></label>'+
  '<div id="worldCities">'+cityRows(cities)+'</div></div>'+
  '<p class="world-note">Countries and cities cover all sources of Wix traffic, not only social media. '+
    'Location visitor counts can overlap. Choose any country or city for pages, times, sources and network patterns.</p>';
}
function detail(d){
 const s=d.summary||{},n=d.network||{},types=Array.isArray(d.visitorTypes)?d.visitorTypes:[];
 const type=k=>types.find(t=>t.type===k)?.visitors;
 const pages=Array.isArray(d.pages)?d.pages:[];
 const sources=Array.isArray(d.sources)?d.sources:[];
 const days=Array.isArray(d.days)?d.days:[];
 const events=Array.isArray(d.timeline)?d.timeline:[];
 return '<button type="button" data-world-back="1">‹ ALL COUNTRIES & CITIES</button>'+
  '<h3 class="world-selected-place">'+esc(name(d.location||chosen))+'</h3>'+
  '<p class="world-caption">'+esc(date(d.range?.start))+' to '+esc(date(d.range?.endInclusive))+' · '+esc(time(d.checkedAt))+'</p>'+
  '<div class="world-metrics">'+
    metric('VISITORS',s.visitors,'Wix unique')+metric('VISITS',s.visits,'Sessions')+
    metric('PAGE VIEWS',s.views,'Includes repeat views')+
    metric('AVG. STAY',s.avgStaySeconds,'Wix session average',stay)+
    metric('NEW',type('first_time_visitor'),'Wix classification')+
    metric('RETURNING',type('returning_visitor'),'Wix classification')+
    metric('NETWORK GROUPS',n.networks,'Addresses grouped, not shown')+
    metric('LARGEST NETWORK',n.largestNetworkVisits,'Visits from one network')+
  '</div>'+
  panel('PAGES VIEWED','What they looked at',
    table(['PAGE','VISITORS','VIEWS','AVG. TIME'],pages.map(r=>
      '<tr><td>'+siteLink(r.path)+'</td><td>'+num(r.visitors)+'</td><td>'+num(r.views)+'</td><td>'+stay(r.avgSeconds)+'</td></tr>')))+
  panel('WHEN THEY VISITED','By day, Louisiana time',
    table(['DAY','VISITS','VISITORS','PAGES'],days.map(r=>
      '<tr><td>'+date(r.day)+'</td><td>'+num(r.visits)+'</td><td>'+num(r.visitors)+'</td><td>'+num(r.views)+'</td></tr>')))+
  panel('HOW THEY ARRIVED','Search, social, direct and other sources',
    table(['SOURCE','CATEGORY','VISITS','VISITORS'],sources.map(r=>
      '<tr><td>'+esc(r.source)+'</td><td>'+esc(r.category)+'</td><td>'+num(r.visits)+'</td><td>'+num(r.visitors)+'</td></tr>')))+
  panel('SAME NETWORK & RETURNING VISITORS','Shared IPs are not people',
    '<div class="world-metrics">'+metric('NETWORK GROUPS',n.networks,'Different network addresses')+
      metric('NETWORKS WITH REPEATS',n.sharedNetworks,'More than one visit')+
      metric('LARGEST NETWORK',n.largestNetworkVisits,'Visits, not individuals')+'</div>'+
    '<p class="world-note">Network 1, Network 2 and so on are temporary anonymous grouping labels. '+
      'A home, company, cell provider, proxy, VPN or crawler can share a network. '+
      'Neither a shared address nor a first-time visit proves that visits came from the same person. '+
      'No raw network addresses appear in this report.</p>',false)+
  panel('EXACT PAGE-OPEN TIMES','Visit events by location, newest first',
    '<p class="world-note">Each row is a Wix analytic observation. Rows may group multiple sessions. '+
      'Same network means a shared connection, not a verified person. Page time is a Wix average, not an individual dwell time. Unknown times show N/A.</p>'+
    table(['OPENED · LOUISIANA','PAGE','VISITS','SOURCE','DEVICE','NEW / RETURNING','NETWORK','PAGE AVG.'],events.map(r=>
      '<tr><td class="world-time">'+esc(time(r.at))+'</td><td>'+siteLink(r.path)+'</td>'+
        '<td>'+num(r.visits)+'</td><td>'+esc(r.source)+'</td><td>'+esc(r.device)+'</td>'+
        '<td>'+esc(r.visitorType==='first_time_visitor'?'New':r.visitorType==='returning_visitor'?'Returning':'N/A')+'</td>'+
        '<td>'+esc(r.network||'N/A')+'</td><td>'+stay(r.pageAvgSeconds)+'</td></tr>'))+
    (d.coverage?.timeline==='partial'?'<p class="world-warning">Timeline coverage is partial.</p>':''),false)+
  (d.status==='partial'?'<p class="world-warning">Some data were unavailable or incomplete. N/A does not mean zero.</p>':'')+
  '<p class="world-note">These are approximate geographic analytics from Wix, not home addresses or personal identities. '+
    'Unusual patterns remain independently flagged in Website Security.</p>';
}
function show(d){
 const host=el('worldOutput');if(!host)return;
 if(!d){host.innerHTML='<p class="world-loading">Checking the Wix visitor report…</p>';return;}
 if(d.status==='unavailable'){
  host.innerHTML='<p class="world-warning">Wix report unavailable: '+esc(d.error||'Data not verified.')+'</p>'+
   (chosen?'<button data-world-back="1">Back to locations</button>':'');
  return;
 }
 host.innerHTML=chosen?.country?detail(d):overview(d);
}
function refresh(force=false){
 if(!active())return;
 let key;try{key=k()}catch(e){show({status:'unavailable',error:e.message});return;}
 const cached=stored.get(key);
 if(!force&&cached&&Date.now()-cached.time<120000){show(cached.data);return;}
 if(waiting.has(key))return;
 show(null);
 const task=api(key).then(data=>{
  if(data?.range?.selection!==range)throw Error('Returned reporting period does not match.');
  if(chosen&&data?.location?.country!==chosen.country)throw Error('Returned location does not match.');
  stored.set(key,{data,time:Date.now()});
 }).catch(e=>stored.set(key,{data:{status:'unavailable',error:String(e?.message||'Connection unavailable')},time:Date.now()}))
 .finally(()=>{waiting.delete(key);if(active()){try{if(k()===key)show(stored.get(key)?.data)}catch{}}});
 waiting.set(key,task);
}
function render(){
 const host=el('content');if(!host)return;
 host.innerHTML='<section class="world-dashboard"><header><div><small>⚜ DOC JAKS · ALL WEBSITE VISITORS</small>'+
  '<h2>WORLDWIDE VISITOR INTELLIGENCE</h2>'+
  '<p>Where people visit from, what they see, when they come, and whether they return.</p></div>'+
  '<span>WIX VERIFIED · READ ONLY</span></header>'+
  '<div class="world-toolbar"><b>REPORTING PERIOD</b>'+
    [['today','Day'],['7d','Week'],['30d','Month'],['365d','Year'],['custom','Custom']].map(([k,v])=>
      '<button type="button" data-world-range="'+k+'" class="'+(range===k?'selected':'')+'">'+v+'</button>').join('')+
    (range==='custom'?'<label>START <input type="date" id="worldStart" value="'+esc(start)+'"></label>'+
      '<label>END <input type="date" id="worldEnd" value="'+esc(end)+'"></label>'+
      '<button type="button" data-world-apply="1">Apply</button>':'')+
    '<button type="button" data-world-reload="1">Refresh</button></div>'+
  '<div id="worldOutput" aria-live="polite"></div>'+
  '</section>';
 let key;try{key=k()}catch{show({status:'unavailable',error:'Select valid dates and press Apply.'});return;}
 show(stored.get(key)?.data);
 void refresh();
}
function open(where=null,period=null){
 if(period&&periods.includes(period.range)){
  range=period.range;
  if(range==='custom'){start=period.start||'';end=period.endInclusive||'';}
 }
 chosen=where?.country?loc(where):null;search='';
 if(typeof setView==='function')void setView('Worldwide Visitors');
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-world-range],[data-world-choose],[data-world-back],[data-world-reload],[data-world-apply]');
 if(!b||!active())return;
 if(b.hasAttribute('data-world-range')){
  const value=b.dataset.worldRange;if(!periods.includes(value))return;
  if(value==='custom'&&!end&&typeof websiteReportPeriod==='function'){
   const p=websiteReportPeriod();start=p?.start||'';end=p?.endInclusive||'';
  }
  range=value;render();return;
 }
 if(b.hasAttribute('data-world-choose')){
  if(!b.dataset.country)return;
  chosen=loc({country:b.dataset.country,city:b.dataset.city,region:b.dataset.region});render();return;
 }
 if(b.hasAttribute('data-world-back')){chosen=null;render();return;}
 if(b.hasAttribute('data-world-reload')){try{stored.delete(k())}catch{}render();return;}
 if(b.hasAttribute('data-world-apply')){start=el('worldStart')?.value||'';end=el('worldEnd')?.value||'';render();}
});
document.addEventListener('input',e=>{
 if(!active()||e.target?.id!=='worldSearch')return;
 search=e.target.value;
 let key;try{key=k()}catch{return;}
 const rows=stored.get(key)?.data?.locations;
 const host=el('worldCities');
 if(host&&Array.isArray(rows))host.innerHTML=cityRows(rows);
});
window.djomsWorldwideVisitors={render,open};
})();