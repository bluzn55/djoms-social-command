(function missionModule() {
  'use strict';
  const snapshot = {
    interests:{status:'idle',data:null,error:null},
    chapter:{status:'idle',data:null,error:null},
    sales:{status:'idle',data:null,error:null},
    radio:{status:'idle',data:null,error:null},
    stationLive:{status:'idle',data:null,error:null}
  };
  const ENDPOINTS = {
    interests:'website-interests',
    chapter:'chapter-clicks',
    sales:'trading-post-sales'
  };
  let lastPeriodKey='';
  let lastLoaded = 0;
  let sequence = 0;
  const PERIOD = 2 * 60 * 1000;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));
  const measurable = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const show = value => measurable(value) ? new Intl.NumberFormat('en-US').format(value) : '—';
  const money = cents => Number.isSafeInteger(cents) && cents >= 0
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents / 100)
    : '—';

  function period() {
    const selection=typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
    if(!selection?.start||!selection?.end||!selection?.query)
      throw new Error('Choose a website reporting period before reading the Business Pulse.');
    return selection;
  }

  async function getReport(path,selected) {
    const response=await fetch('/api/meta/'+path+'?'+selected.query,{
      credentials:'same-origin',
      cache:'no-store',
      signal:AbortSignal.timeout(55000)
    });
    const value=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(response.status === 401
      ? 'Sign in again to read the report.'
      : String(value.error || 'The report could not be checked.'));
    if (!value || value.connected !== true) throw new Error('The source has not confirmed its connection.');
    // The chapter report begins when click tracking was enabled. Its
    // requestedStart is still the exact shared period.
    if(value.range?.end!==selected.end ||
       (value.range?.requestedStart||value.range?.start)!==selected.start)
      throw new Error('This report does not match the selected dates. Showing no stale totals.');
    return value;
  }

  // Historical Radio.co export, deliberately separate from Wix's date-scoped reports.
  async function getRadioImport() {
    const response=await fetch('/api/meta/radio-report',{
      credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)
    });
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(response.status===401
      ? 'Sign in again to view Radio.co statistics.'
      : String(value.error||'The Radio.co export could not be read.'));
    if(value?.mode!=='imported'||value?.station!=='Outlaw Radio 5150'
      ||!Array.isArray(value.rows)||!value.summary
      ||value.durationUnit!=='seconds')
      throw new Error('Radio.co has not returned a verified export with duration units.');
    return value;
  }

  // Official Radio.co public metadata, not the private listening stats.
  async function getRadioLiveStatus() {
    const response=await fetch('/api/meta/radio-live-status',{
      credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)
    });
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(response.status===401
      ? 'Sign in again to check Radio.co station status.'
      : String(value.error||'Station broadcast status unavailable.'));
    if(value?.connected!==true||value.stationId!=='s37e227d75'
       ||value.mode!=='public-station-status'
       ||!['online','offline'].includes(value.broadcastStatus)
       ||value.listenerCountAvailable!==false)
      throw new Error('Radio.co has not verified public broadcast status.');
    return value;
  }

  function audioTime(value) {
    if(!Number.isFinite(value)||value<0)return '—';
    const seconds=Math.round(value),h=Math.floor(seconds/3600),
      m=Math.floor(seconds%3600/60),sec=seconds%60;
    return h
      ? h+'h '+String(m).padStart(2,'0')+'m '+String(sec).padStart(2,'0')+'s'
      : m+'m '+String(sec).padStart(2,'0')+'s';
  }

  function phaseText(item, ok, pending) {
    if (item.status === 'error') return item.error || 'Connection needs attention';
    if (item.status !== 'ok') return pending;
    return ok;
  }

  function statusLight(color, text) {
    return `<span class="mission-intel-health"><i class="gyr-light ${color}" aria-hidden="true"></i><strong>${escape(text)}</strong></span>`;
  }
  function meter(title, value, note = '') {
    return `<span class="mission-intel-meter"><small>${escape(title)}</small><b>${escape(value)}</b>${note ? '<em>'+escape(note)+'</em>' : ''}</span>`;
  }
  function linked(path) {
    try {
      return new URL(String(path || ''), 'https://docjaks.com').pathname.replace(/\/+$/, '') || '/';
    } catch (_) { return ''; }
  }
  function findGroup(key) {
    const result=snapshot.interests.data;
    if (snapshot.interests.status !== 'ok') return null;
    return result?.groups?.find(group => group.id === key) || null;
  }

  function bookCard() {
    const interest=findGroup('book');
    const chapter=snapshot.chapter.status==='ok' ? snapshot.chapter.data : null;
    const store=snapshot.sales.status==='ok' ? snapshot.sales.data : null;
    const bookUnits=store?.complete && Array.isArray(store.products)
      ? store.products.filter(product => /\bwooden\s+token\b/i.test(String(product.name||'')))
          .reduce((sum,product)=>sum+(measurable(product.units)?product.units:0),0)
      : null;
    const visitors=interest?.verified ? interest.visitors : null;
    const clicks=chapter?.status==='reported' && measurable(chapter.clicks) ? chapter.clicks : null;
    const problems=[snapshot.interests,snapshot.chapter,snapshot.sales].filter(x=>x.status==='error').length;
    const color=problems===3?'red':problems || !interest?.verified || chapter?.status!=='reported' || !store?.complete?'yellow':'green';
    const warnings=[snapshot.interests.error,snapshot.chapter.error,snapshot.sales.error].filter(Boolean);
    return `<article class="mission-intel-card">
      <header class="mission-intel-card-head">
        <div><small>BOOK · CHAPTER 1</small><h3>The Wooden Token</h3></div>
        ${statusLight(color,color.toUpperCase())}
      </header>
      <div class="mission-intel-meters mission-intel-4">
        ${meter('Page views',show(interest?.views))}
        ${meter('Visitors',show(visitors))}
        ${meter('Chapter clicks',show(clicks))}
        ${meter('Wix book units',show(bookUnits))}
      </div>
      <div class="mission-intel-actions">
        <button type="button" data-view="Website Analytics">Book details ›</button>
        <a href="https://www.docjaks.com/_files/ugd/cf21c8_27ee63f049e5479b8d37c885f638bb2b.pdf" target="_blank" rel="noopener noreferrer">Chapter 1 ↗</a>
      </div>
      ${warnings.length?'<p class="mission-intel-error">'+escape(warnings.join(' · '))+'</p>':''}
    </article>`;
  }
  function storeCard() {
    const info=snapshot.sales, data=info.status==='ok'?info.data:null;
    const ready=!!data?.complete && Array.isArray(data.products);
    const color=info.status==='error'?'red':ready?'green':'yellow';
    const products=ready && data.products.length
      ? '<div class="mission-intel-products">'+data.products.slice(0,3).map(product=>
          '<div class="mission-intel-product"><span>'+escape(product.name||'Unnamed product')+'</span><strong>'+show(product.units)+' sold</strong></div>'
        ).join('')+'</div>'
      : '';
    return `<article class="mission-intel-card">
      <header class="mission-intel-card-head">
        <div><small>STORE · WHAT SOLD</small><h3>Trading Post</h3></div>
        ${statusLight(color,color.toUpperCase())}
      </header>
      <div class="mission-intel-meters mission-intel-3">
        ${meter('Paid orders',show(ready?data.paidOrders:null))}
        ${meter('Items sold',show(ready?data.units:null))}
        ${meter('Item sales',money(ready?data.itemSalesCents:null))}
      </div>
      ${products}
      <div class="mission-intel-actions">
        <button type="button" data-view="Website Analytics">Sales details ›</button>
        <a href="https://www.docjaks.com/trading-post-1" target="_blank" rel="noopener noreferrer">Visit Trading Post ↗</a>
      </div>
      ${info.status==='error'?'<p class="mission-intel-error">'+escape(info.error||'Store reporting unavailable')+'</p>':''}
    </article>`;
  }
  function radioCard() {
    const interest=snapshot.interests;
    const group=findGroup('music');
    const page=group?.pages?.find(item=>linked(item.path)==='/outlaw-radio-5150');
    const fallback=typeof websiteSnapshot==='function'
      ?(websiteSnapshot()?.topPages||[]).find(item=>linked(item.path)==='/outlaw-radio-5150')
      :null;
    const views=measurable(page?.views)?page.views
      :(interest.status==='ok'&&interest.data?.reconciled&&!interest.data.partial&&!page?0
        :measurable(fallback?.views)?fallback.views:null);
    const visitors=measurable(page?.visitors)?page.visitors
      :measurable(fallback?.visitors)?fallback.visitors:null;
    const connected=typeof localData!=='undefined'&&localData?.website?.connected===true;
    const color=interest.status==='error'&&!connected?'red':'yellow';
    const report=snapshot.radio.status==='ok'?snapshot.radio.data:null;
    const stats=report?.summary||{};
    const live=snapshot.stationLive.status==='ok'?snapshot.stationLive.data:null;
    const liveText=live?.broadcastStatus==='online'?'ON AIR'
      :live?.broadcastStatus==='offline'?'OFF AIR':'—';
    const liveNote=live?'Official public Radio.co status'
      :snapshot.stationLive.status==='error'?'Could not verify broadcast status'
      :'Checking station…';
    const nowPlaying=live?.broadcastStatus==='online'&&live.nowPlaying
      ?'<p class="locknote"><strong>NOW PLAYING · </strong>'+escape(live.nowPlaying)+'</p>':'';
    const period=report?.range
      ?report.range.start+' through '+report.range.end+' (UTC)'
      :'Period not confirmed';
    const latest=report
      ?`<div class="mission-intel-meters mission-intel-4">
         ${meter('Stream connections',show(stats.connections))}
         ${meter('Peak simultaneous',show(stats.peak))}
         ${meter('Avg. connection',audioTime(stats.averageDurationRaw))}
         ${meter('Total listened',audioTime(stats.totalDurationRaw))}
        </div>
        <p class="locknote"><strong>HISTORICAL RADIO.CO CSV · ${escape(period)}</strong>
        This is the latest imported report, NOT live data and NOT necessarily the Wix date selection.
        The CSV's daily unique counts cannot establish unique people across the entire period.</p>
        ${report.screenComparison?.note
           ?'<p class="locknote">Source discrepancy: '+escape(report.screenComparison.note)+'</p>':''}`
      :`<p class="locknote">${snapshot.radio.status==='error'
        ?'Radio.co import unavailable: '+escape(snapshot.radio.error)
        :snapshot.radio.status==='loading'?'Loading the last Radio.co export…'
        :'Radio.co export not yet loaded.'}</p>`;
    return `<article class="mission-intel-card">
      <header class="mission-intel-card-head">
        <div><small>RADIO · 51.50</small><h3>Outlaw Radio 5150</h3></div>
        ${statusLight(color,color.toUpperCase())}
      </header>
      <div class="mission-intel-meters mission-intel-4">
        ${meter('Website page views',show(views))}
        ${meter('Website visitors',show(visitors))}
        ${meter('Station broadcast',liveText,liveNote)}
        ${meter('Active listeners','—','Listener statistics not connected')}
      </div>
      ${nowPlaying}
      ${snapshot.stationLive.status==='error'
        ?'<p class="locknote">Public station-status check unavailable: '+escape(snapshot.stationLive.error)+'</p>':''}
      ${latest}
      <div class="mission-intel-actions">
        <button type="button" data-view="Website Analytics">Radio website details ›</button>
        <a href="https://outlawradio5150.com" target="_blank" rel="noopener noreferrer">Listen live ↗</a>
      </div>
      ${interest.status==='error'?'<p class="mission-intel-error">'+escape(interest.error||'Wix page reporting unavailable')+'</p>':''}
    </article>`;
  }
  function paint() {
    const panel=document.getElementById('missionBusinessPulse');
    if(!panel) return;
    const selected=period();
    const periodName=selected.range==='custom'
      ? selected.start+' to '+selected.endInclusive
      : ({today:'TODAY','7d':'LAST 7 DAYS','30d':'LAST 30 DAYS','365d':'LAST 365 DAYS'})[selected.range]||'SELECTED DATES';
    panel.innerHTML=`<div class="mission-intel-title">
        <div><strong>BUSINESS PULSE</strong><small>${escape(periodName)}</small></div>
        <button type="button" data-mission-pulse-refresh="1" aria-label="Refresh book, store and radio website statistics">Check activity</button>
      </div>
      <div class="mission-intel-grid">${bookCard()}${storeCard()}${radioCard()}</div>
      <details class="mission-intel-data-notes">
        <summary>About these numbers</summary>
        <p>Selected Wix dates: ${escape(selected.start)} through ${escape(selected.endInclusive)}. Missing data stays unavailable. Chapter clicks do not prove reading. Wix paid store sales exclude tax and shipping, refunds and outside channels. Radio webpage views are not listener counts. The Radio.co historical export uses its own explicitly labelled UTC dates and is not live or filtered by Wix selection. Current station status and song come from Radio.co's public API, but listener counts do not. Testing traffic may be included.</p>
      </details>`;
  }
  function refresh(force = false) {
    if(typeof owner==='undefined' || !owner) return;
    const selected=period();
    if(!force && lastLoaded && lastPeriodKey===selected.query && Date.now()-lastLoaded<PERIOD) return;
    const ticket=++sequence;
    lastLoaded=Date.now();
    lastPeriodKey=selected.query;
    for(const key of Object.keys(ENDPOINTS)) snapshot[key]={status:'loading',data:null,error:null};
    snapshot.radio={status:'loading',data:null,error:null};
    snapshot.stationLive={status:'loading',data:null,error:null};
    paint();
    getRadioLiveStatus().then(data=>{
      if(ticket!==sequence)return;
      snapshot.stationLive={status:'ok',data,error:null};
      paint();
    }).catch(error=>{
      if(ticket!==sequence)return;
      snapshot.stationLive={status:'error',data:null,error:String(error.message||'Radio.co status unavailable.')};
      paint();
    });
    getRadioImport().then(data=>{
      if(ticket!==sequence)return;
      snapshot.radio={status:'ok',data,error:null};
      paint();
    }).catch(error=>{
      if(ticket!==sequence)return;
      snapshot.radio={status:'error',data:null,error:String(error.message||'Radio.co report unavailable.')};
      paint();
    });
    for(const [key,path] of Object.entries(ENDPOINTS)) {
      getReport(path,selected).then(data=>{
        if(ticket!==sequence) return;
        snapshot[key]={status:'ok',data,error:null};
        if(key==='sales') {
          window.djomsVerifiedReports ||= {};
          window.djomsVerifiedReports.sales={query:selected.query,data};
          document.dispatchEvent(new CustomEvent('djoms:verified-report',{detail:{source:'sales'}}));
        }
        paint();
      }).catch(error=>{
        if(ticket!==sequence) return;
        snapshot[key]={status:'error',data:null,error:error.name==='TimeoutError'
          ? 'Wix timed out. Try Check activity again.' : String(error.message||'Report unavailable.')};
        if(key==='sales') {
          window.djomsVerifiedReports ||= {};
          window.djomsVerifiedReports.sales={query:selected.query,data:null,error:snapshot[key].error};
          document.dispatchEvent(new CustomEvent('djoms:verified-report',{detail:{source:'sales'}}));
        }
        paint();
      });
    }
  }

  const previous=window.renderConnectionStrip;
  if(typeof previous!=='function') return;
  window.renderConnectionStrip=function(...args) {
    const value=previous.apply(this,args);
    if(typeof activeView==='undefined' || activeView!=='Mission Control') return value;
    const strip=document.getElementById('connectionStrip');
    if(!strip || strip.hidden) return value;
    const anchor=strip.querySelector('.mission-glance-head');
    let panel=document.getElementById('missionBusinessPulse');
    if(!panel) {
      panel=document.createElement('section');
      panel.id='missionBusinessPulse';
      panel.className='mission-intel-section';
      panel.setAttribute('aria-label','Business, book and radio activity');
      if(anchor) anchor.before(panel); else strip.append(panel);
    }
    paint();
    refresh(false);
    return value;
  };
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-mission-pulse-refresh]');
    if(!b) return;
    event.preventDefault();
    refresh(true);
  });
  if(typeof activeView!=='undefined'&&activeView==='Mission Control'
    &&typeof owner!=='undefined'&&owner) window.renderConnectionStrip();
})();