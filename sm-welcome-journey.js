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
// Exact card-level arrivals come from the SAME consented post-referrals
// report already used in #2. Each unique tracking ID identifies a saved
// DJOMS record and a platform-specific URL, not a verified social-site tap.
function exactPlacecardArrivals(period){
 const source=typeof window.djomsSocialPostReferrals==='function'?
   window.djomsSocialPostReferrals(period):null;
 const verified=source?.arrivalStatus==='reported'&&
   source?.range?.start===period.start&&source?.range?.end===period.end&&
   Array.isArray(source.rows);
 const records=verified?source.rows.filter(item=>
   item&&typeof item.recordId==='string'&&
   Number.isSafeInteger(item.directArrivals)&&item.directArrivals>0&&
   ['facebook','instagram','x','youtube'].includes(item.platform)&&
   ['BBQ','SOSS','MUSIC','BOOK'].includes(item.campaign)):[];
 const arrivals=records.reduce((sum,item)=>sum+item.directArrivals,0);
 const cardCount=new Set(records.map(item=>item.recordId)).size;
 const platformName={facebook:'Facebook',instagram:'Instagram',x:'X',youtube:'YouTube'};
 const groupName={BBQ:'BBQ',SOSS:'Sosses',MUSIC:'Music',BOOK:'Book'};
 const photo=(url,title,large)=>{
   const ok=typeof url==='string'&&/^https:\/\/[a-z0-9.-]+\//i.test(url);
   return ok?'<img loading="lazy" referrerpolicy="no-referrer" src="'+
     esc(url)+'" alt="'+esc(title)+' · saved Doc Jaks placecard artwork"'+
     (large?' class="sm-card-art-large"':' class="sm-card-art-thumb"')+'>':
     '<span class="sm-card-no-image">Artwork not available</span>';
 };
 const views=records.sort((a,b)=>b.directArrivals-a.directArrivals||
   a.recordId.localeCompare(b.recordId)||a.platform.localeCompare(b.platform))
  .map(item=>{
    const meta=typeof window.djomsPlacecardMeta==='function'?
      window.djomsPlacecardMeta(item.recordId,item.platform):null;
    const title=String(meta?.placecardName||item.placecardName||
      item.postTitle||'Saved DJOMS placecard').replace(/\.(?:png|jpe?g|webp)$/i,'').slice(0,140);
    const n=Number(item.placecardNumber);
    const numbered=Number.isInteger(n)&&n>=1&&n<=15?
      groupName[item.campaign]+' #'+String(n).padStart(2,'0'):
      groupName[item.campaign];
    const cardId=meta?.code||'Card '+item.recordId.slice(-8).toUpperCase();
    const platform=(platformName[item.platform]||item.platform)+' tracking link';
    const text=String(meta?.postingText||meta?.caption||'').trim();
    const short=text.replace(/\s+/g,' ').slice(0,155);
    const snippet=short?(short+(text.replace(/\s+/g,' ').length>155?'…':'')):
      'Caption unavailable in saved DJOMS records';
    const image=photo(meta?.imageUrl,title,false);
    const detailImage=photo(meta?.imageUrl,title,true);
    const copySource=meta?.textSource||
      'Saved posting text not in the current DJOMS library.';
    return '<article class="sm-card-arrival">'+
      '<div class="sm-card-arrival-summary">'+
        '<span class="sm-card-thumbnail">'+image+'</span>'+
        '<span class="sm-card-info">'+
          '<b>'+esc(numbered+' · '+title)+'</b>'+
          '<small>'+esc(platform+' · '+cardId)+'</small>'+
          '<span class="sm-card-copy-excerpt">'+esc(snippet)+'</span>'+
        '</span>'+
        '<span class="sm-card-arrival-count"><strong>'+
          num(item.directArrivals)+'</strong><small>arrivals</small></span>'+
      '</div>'+
      '<details class="sm-card-creative-detail">'+
        '<summary>VIEW THIS PLACE CARD · FULL IMAGE & POST TEXT</summary>'+
        '<div class="sm-card-creative-open">'+
          '<div class="sm-card-creative-image">'+detailImage+'</div>'+
          '<div class="sm-card-creative-text">'+
            '<strong>TEXT ON THE SAVED PLACE CARD</strong>'+
            '<small>'+esc(copySource)+'</small>'+
            (text?'<p class="sm-card-full-caption">'+esc(text)+'</p>':
              '<p class="sm-card-full-caption">Saved post wording not available.</p>')+
            '<button type="button" data-sm-card-open="'+esc(item.recordId)+'">'+
              'OPEN EXACT PLACE CARD IN CONTENT LIBRARY</button>'+
          '</div>'+
        '</div>'+
      '</details>'+
      pageTime(period,item.recordId,item.platform)+
    '</article>';
  }).join('');
 const status=verified?
   records.length?'<strong>'+num(arrivals)+' arrivals · '+
     num(cardCount)+' exact cards</strong>':
     '<strong>0 tracked arrivals</strong>':
     '<strong>N/A · reporting</strong>';
 const empty=verified?'No tracked placecard arrivals in the selected dates.':
   'Checking exact placecard link attribution. Older untagged posts cannot be identified.';
 return '<details class="mj-stage-dropdown mj-sm-exact-arrivals" data-mj-dropdown="exact-placecards">'+
  '<summary><span>EXACT PLACE CARDS THAT BROUGHT VISITORS</span>'+
    '<b>'+status+' ▾</b></summary>'+
  '<div class="mj-dropdown-content">'+
    '<p class="sm-next-hint">Each arrival is a consented SM Welcome landing through '+
      'one uniquely tagged card link. Artwork and text are taken from the '+
      'saved DJOMS post. The named platform identifies which link was used, '+
      'not proof of where the person physically clicked it.</p>'+
    (views||'<p class="sm-next-hint">'+esc(empty)+'</p>')+
  '</div></details>';
}
// On-demand aggregate page activity for one tagged placecard link.
const pageCache=new Map(),pagePending=new Map();
const duration=v=>{
 if(!Number.isSafeInteger(v)||v<=0)return 'N/A';
 const mins=Math.floor(v/60),sec=v%60;
 return (mins?mins+'m ':'')+sec+'s';
};
function pageTimeHtml(data,err){
 if(!data)return '<p class="sm-next-hint">'+esc(err||'Checking verified page-time measurements…')+'</p>';
 if(data.status==='not_started')
   return '<p class="sm-next-hint">No card-specific page-time measurements have started yet. Earlier arrivals cannot be assigned a duration or page journey.</p>';
 const pages=Array.isArray(data.pages)?data.pages:[];
 if(!pages.length)return '<p class="sm-next-hint">No measured page opens for this card in the selected dates. This does not prove the person left.</p>';
 return '<div class="sm-page-rows">'+pages.map(item=>
   '<div class="sm-page-row"><b>'+esc(item.path)+'</b>'+
   '<span>'+num(item.pageViews)+' opens</span>'+
   '<strong>'+esc(duration(item.measuredActiveSeconds))+' active</strong></div>').join('')+
   '</div><p class="sm-next-hint">Measured visible-tab time aggregated for this card, not full visit duration or an individual browsing trail. A zero/blank measurement displays as N/A.</p>';
}
function pageTime(period,record,platform){
 const normalized=String(record||'').replace(/-/g,'').toLowerCase();
 if(!/^[a-f0-9]{32,48}$/.test(normalized))return '';
 const tag='docjaks_post_'+normalized+'_'+platform;
 const k=period.query+'|'+tag;
 const existing=pageCache.get(k);
 if(!existing&&!pagePending.has(k)&&typeof api==='function'){
   const job=api('sm-welcome-journey?'+period.query+'&trackingId='+encodeURIComponent(tag))
     .then(data=>{
       if(data?.range?.start!==period.start||data?.range?.end!==period.end)
         throw Error('Page report dates mismatch.');
       pageCache.set(k,{data});
     }).catch(err=>pageCache.set(k,{error:String(err?.message||'Not available')}))
     .finally(()=>{
       pagePending.delete(k);
       document.querySelectorAll('[data-sm-time-key]').forEach(node=>{
         if(node.getAttribute('data-sm-time-key')===k){
           const current=pageCache.get(k);
           node.innerHTML=pageTimeHtml(current?.data,current?.error);
         }
       });
     });
   pagePending.set(k,job);
 }
 return '<details class="mj-stage-dropdown sm-card-page-time" data-mj-dropdown="page-'+
   esc(tag)+'"><summary><span>PAGES VISITED & MEASURED TIME</span><b>▾</b></summary>'+
   '<div class="mj-dropdown-content" data-sm-time-key="'+esc(k)+'">'+
     pageTimeHtml(existing?.data,existing?.error)+'</div></details>';
}
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
 return '<section class="mj-sm-next" aria-label="Exact placecard arrivals and Welcome page next actions">'+
   exactPlacecardArrivals(period)+html+'</section>';
}
window.djomsSmWelcomeJourneySection=section;
})();
