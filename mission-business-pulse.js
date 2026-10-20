(function missionModule() {
  'use strict';
  const snapshot = {
    interests:{status:'idle',data:null,error:null},
    chapter:{status:'idle',data:null,error:null},
    sales:{status:'idle',data:null,error:null},
    radio:{status:'idle',data:null,error:null},
    stationLive:{status:'idle',data:null,error:null},
    stories:{status:'idle',data:null,error:null}
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
  const show = value => measurable(value) ? new Intl.NumberFormat('en-US').format(value) : 'N/A';
  const money = cents => Number.isSafeInteger(cents) && cents >= 0
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents / 100)
    : 'N/A';

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

  async function getLatestStories() {
    const response=await fetch('/api/meta/latest-stories',{
      credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(35000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(response.status===401?'Sign in to view recent stories.':'Latest Wix stories unavailable.');
    if(!data||!data.blog||!data.emberHall||!Array.isArray(data.emberHall.posts))
      throw new Error('The Wix stories response was incomplete.');
    return data;
  }
  function storyDate(when) {
    const stamp=Date.parse(when||'');
    if(!Number.isFinite(stamp))return 'N/A';
    return new Intl.DateTimeFormat('en-US',{
      month:'short',day:'numeric',year:'numeric',timeZone:'America/Chicago'
    }).format(new Date(stamp));
  }
  function latestPorchPost() {
    const value=snapshot.stories.status==='ok'?snapshot.stories.data?.blog:null;
    return value?.status==='connected'&&value.post?.title?value.post:null;
  }

  function syncPorchRecentPost(blog) {
    if(!blog)return;
    const meters=blog.querySelector('.mission-intel-meters');
    if(!meters)return;
    meters.classList.remove('mission-intel-3');
    meters.classList.add('mission-intel-4');
    let tile=meters.querySelector('.mission-porch-latest');
    if(!tile) {
      tile=document.createElement('span');
      tile.className='mission-intel-meter mission-porch-latest';
      meters.append(tile);
    }
    const post=latestPorchPost();
    // The underlying verified Wix Blog view counter is a page-open metric,
    // not a guarantee that the visitor read the entire article.
    const third=meters.querySelector('.mission-intel-meter:nth-child(3)');
    if(third) third.innerHTML='<small>Post views</small><b>'+
      (Number.isSafeInteger(post?.views)&&post.views>=0?escape(show(post.views)):'N/A')+
      '</b><em>Wix · Lifetime opens</em>';
    const newLabel=post?.isNew===true
      ?'<span class="mission-story-new" title="Published within the last 7 days">NEW POST</span>':'';
    tile.innerHTML='<small>Latest published post '+newLabel+'</small><b>'+
      (post?escape(post.title):snapshot.stories.status==='loading'?'Checking…':'N/A')+
      '</b>'+(post?'<em>'+escape(storyDate(post.publishedAt))+'</em>':'');
    const actions=blog.querySelector('.mission-intel-actions');
    if(!actions)return;
    let read=actions.querySelector('.mission-porch-read-post');
    let href=null;
    if(typeof post?.url==='string') {
      try {
        const value=new URL(post.url);
        if(value.protocol==='https:'&&['docjaks.com','www.docjaks.com'].includes(value.hostname)
          &&value.pathname.startsWith('/post/'))href=value.href;
      } catch(_) {}
    }
    if(!href){if(read)read.remove();return;}
    if(!read) {
      read=document.createElement('a');
      read.className='mission-porch-read-post';
      read.textContent='Read latest post ↗';
      read.target='_blank';
      read.rel='noopener noreferrer';
      actions.append(read);
    }
    read.href=href;
  }
  function emberHallCard() {
    const source=snapshot.stories.status==='ok'?snapshot.stories.data?.emberHall:null;
    const ready=source?.status==='connected';
    const posts=ready&&Array.isArray(source.posts)?source.posts.slice(0,2):[];
    const pending=Number.isSafeInteger(source?.awaitingApproval)?source.awaitingApproval:null;
    const newSubmissions=Number.isSafeInteger(source?.newSubmissions7d)?source.newSubmissions7d:null;
    const color=ready?(pending!==null&&pending>0?'yellow':'green')
      :snapshot.stories.status==='error'?'red':'yellow';
    const label=ready?(pending!==null&&pending>0?'REVIEW':'LIVE'):
      snapshot.stories.status==='loading'?'CHECKING':'SETUP';
    const formatted=value=>Number.isSafeInteger(value)&&value>=0?show(value):'N/A';
    const reviewUrl='https://manage.wix.com/dashboard/6e5a4b9f-f175-4869-83d5-fecdaf5ad976/wix-cms/data/EmberHallPosts';
    const body=posts.length?posts.map(item=>{
      const isNew=item.isNew===true
        ?'<span class="mission-story-new" title="Published within the last 7 days">NEW POST</span>':'';
      const link=typeof item.url==='string'&&
        /^https:\/\/www\.docjaks\.com\/emberhallposts\/[a-z0-9-]+$/.test(item.url)
        ?item.url:'https://www.docjaks.com/ember-hall';
      return '<div class="mission-ember-post">'+
        '<div class="mission-ember-post-top"><small>'+
          escape(item.category||'Ember Hall')+' · '+escape(storyDate(item.publishedAt))+
          '</small>'+isNew+'</div>'+
        '<a class="mission-ember-post-title" target="_blank" rel="noopener noreferrer" href="'+escape(link)+'">'+
          escape(item.title||'Untitled')+' ↗</a>'+
        '<span>By '+escape(item.author||'Contributor')+'</span>'+
        '<p>'+escape(item.excerpt||'No description provided.')+'</p>'+
        '<div class="mission-ember-views"><small>Post page views</small><b>'+formatted(item.views)+'</b>'+
        '<span>'+escape(item.viewsPeriod||'Wix reporting unavailable')+'</span></div>'+
      '</div>';
    }).join(''):
      '<div class="mission-ember-empty">'+(ready?
        'No approved, published Ember Hall posts yet.':
        snapshot.stories.status==='loading'?'Checking approved Ember Hall posts…':
        'Approved Ember Hall posts unavailable · N/A')+'</div>';
    return '<article class="mission-intel-card mission-ember-hall-card">'+
      '<header class="mission-intel-card-head">'+
        '<div><small>COMMUNITY · LATEST STORIES</small><h3>Ember Hall</h3></div>'+
        statusLight(color,label)+
      '</header>'+
      '<div class="mission-ember-approval-summary" aria-label="Ember Hall submission status">'+
        '<span><strong>New submissions · 7d</strong><b>'+formatted(newSubmissions)+'</b></span>'+
        '<a class="mission-ember-approval-link" href="'+reviewUrl+'" target="_blank" rel="noopener noreferrer" aria-label="Open Ember Hall collection in Wix CMS to review pending posts">'+
        '<strong>Awaiting approval ↗</strong><b>'+formatted(pending)+'</b></a>'+
      '</div>'+
      '<div class="mission-ember-grid">'+body+'</div>'+
      '<p class="mission-intel-muted">Latest two approved posts. NEW means published within 7 days. Page views do not prove a full read; N/A means no verified individual-page count.</p>'+
      '<div class="mission-intel-actions">'+
        '<a href="'+reviewUrl+'" target="_blank" rel="noopener noreferrer">Review pending posts ↗</a>'+ 
        '<a href="https://www.docjaks.com/ember-hall" target="_blank" rel="noopener noreferrer">Visit Ember Hall ↗</a>'+
      '</div>'+
    '</article>';
  }

  function audioTime(value) {
    if(!Number.isFinite(value)||value<0)return 'N/A';
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
  // Only verified dated Wix page views or explicitly historical Radio.co data.
  function pulseLineGraph(key) {
    const titles={radio:'OUTLAW RADIO PAGE VIEWS',music:'MUSIC PAGE VIEWS',store:'TRADING POST PAGE VIEWS',book:'BOOK PAGE VIEWS'};
    const dated=snapshot.interests.status==='ok'?snapshot.interests.data?.trend:null;
    let points=[],source='',granularity='';
    if(dated?.status==='reported'&&dated?.available?.[key]===true) {
      points=(dated.points||[]).filter(p=>typeof p.date==='string'&&measurable(p[key])).map(p=>({date:p.date,value:p[key]}));
      source='Wix page views · Selected dates · Not sales, music plays or listeners';
      granularity=dated.granularity==='week'?'WEEKLY':'DAILY';
    } else if(key==='radio'&&snapshot.radio.status==='ok') {
      points=(snapshot.radio.data?.rows||[]).filter(p=>p.coverage==='daily-row'&&measurable(p.connections))
        .map(p=>({date:p.date,value:p.connections}));
      source='Radio.co imported CSV · UTC · Historical, not live · Different dates';
      granularity='IMPORTED DAILY';
    }
    const title=key==='radio'&&source.startsWith('Radio.co')?'STREAM CONNECTIONS':titles[key];
    const chart=points.length>=2&&typeof trendChart==='function'
      ?trendChart(points.map(p=>p.value),title):'<div class="mission-pulse-empty"><b>N/A</b><span>At least two verified dated values needed</span></div>';
    const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)
      ?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):value;
    const first=points.length?dateLabel(points[0].date):'N/A';
    const last=points.length?dateLabel(points[points.length-1].date):'N/A';
    const peak=points.length>=2?Math.max(...points.map(p=>p.value)):null;
    const axis=points.length>=2?'<div class="mission-pulse-axis"><span>'+escape(first)+'</span><b>'+escape(granularity+' · PEAK '+show(peak))+'</b><span>'+escape(last)+'</span></div>':'';
    return '<aside class="mission-pulse-line" aria-label="'+escape(title)+' historical trend">'
      +'<div class="mission-pulse-line-head"><strong>'+escape(title)+'</strong><small>LINE GRAPH</small></div>'
      +chart+axis+'<p class="mission-pulse-line-source">'+escape(source||'Wix historical page views not yet available · N/A')+'</p></aside>';
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


  // Both IDs were verified against Wix Media Manager. PDF file_download
  // events cannot measure actual PDF reading duration.
  const FREE_CHAPTER_FILES=[
    {id:'cf21c8_27ee63f049e5479b8d37c885f638bb2b',
      title:'The Wooden Token - Free Chapter 1 Collector Edition.pdf'},
    {id:'cf21c8_820e9d8324194c49ba99ba918f145fe4',
      title:'Free Collection Edition Chapter 1 Master (1).pdf'}
  ];
  function chapterPdfEvents(){
    const unavailable={status:'unavailable',events:null,files:[]};
    const reportEntry=window.djomsVerifiedReports?.ga4;
    if(reportEntry?.query!==period().query)return unavailable;
    const r=reportEntry.data,actions=r?.actions,details=actions?.downloadFiles;
    if(r?.connected!==true||r?.status!=='connected'||
       actions?.status!=='reported'||details?.status!=='reported'||
       !measurable(actions.counts?.fileDownload)||!measurable(details.subtotal)||
       !Array.isArray(details.rows)||details.subtotal!==actions.counts.fileDownload)
      return unavailable;
    // Do not call missing, truncated, or ambiguous file evidence "zero".
    if(details.rows.some(row=>!measurable(row.events)||
      (!String(row.fileName||'').trim()&&!String(row.linkUrl||'').trim())||
      (row.fileName==='(not set)'&&!row.linkUrl)))return unavailable;
    const files=FREE_CHAPTER_FILES.map(file=>({
      name:file.title,
      events:details.rows.filter(row=>(String(row.fileName||'')+' '+String(row.linkUrl||''))
        .toLowerCase().includes(file.id)).reduce((total,row)=>total+row.events,0)
    }));
    const events=files.reduce((total,file)=>total+file.events,0);
    return events<=details.subtotal?{status:'reported',events,files}:unavailable;
  }
  function libraryPageStay(interest){
    const p=Array.isArray(interest?.pages)?
      interest.pages.find(row=>linked(row.path)==='/emberhold-library'):null;
    return p&&measurable(p.views)&&p.views>0&&measurable(p.avgTimeSeconds)
      ?p.avgTimeSeconds:null;
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
    const pdf=chapterPdfEvents();
    const pageStay=libraryPageStay(interest);
    const problems=[snapshot.interests,snapshot.chapter,snapshot.sales].filter(x=>x.status==='error').length;
    const color=problems===3?'red':problems || !interest?.verified || chapter?.status!=='reported' || !store?.complete?'yellow':'green';
    const warnings=[snapshot.interests.error,snapshot.chapter.error,snapshot.sales.error].filter(Boolean);
    return `<article class="mission-intel-card">
      <header class="mission-intel-card-head">
        <div><small>BOOK · CHAPTER 1</small><h3>The Wooden Token</h3></div>
        ${statusLight(color,color.toUpperCase())}
      </header>
      <div class="mission-intel-overview">
      <div class="mission-intel-meters mission-intel-4">
        ${meter('Page views',show(interest?.views))}
        ${meter('Visitors',show(visitors))}
        ${meter('Chapter clicks',show(clicks))}
        ${meter('Wix book units',show(bookUnits))}
        ${meter('Chapter PDF events',show(pdf.events),'GA4 · 2 Chapter 1 files')}
        ${meter('Avg. Library page stay',audioTime(pageStay),'Wix page · not PDF')}
      </div>
        ${pulseLineGraph('book')}
      </div>
      <p class="mission-intel-muted">PDF reading time: <strong>N/A</strong>. Wix tracks average stay on Emberhold Library, not how long a visitor reads an opened PDF.</p>
      ${pdf.status==='reported'?
        '<details class="mission-intel-data-notes mission-chapter-file-evidence"><summary>Chapter 1 PDF breakdown</summary>'+
        '<div class="mission-chapter-files">'+pdf.files.map(file=>
          '<div><span>'+escape(file.name)+'</span><strong>'+show(file.events)+'</strong></div>'
        ).join('')+'</div><p>Events, not distinct readers or completed reads.</p></details>'
        :'<p class="mission-intel-muted">Individual PDF counts: N/A until GA4 verifies the filenames.</p>'}

      <div class="mission-intel-actions">
        <button type="button" data-view="Website Analytics">Book details ›</button>
        <a href="https://www.docjaks.com/_files/ugd/cf21c8_27ee63f049e5479b8d37c885f638bb2b.pdf" target="_blank" rel="noopener noreferrer">Chapter 1 ↗</a>
      </div>
      ${warnings.length?'<p class="mission-intel-error">'+escape(warnings.join(' · '))+'</p>':''}
    </article>`;
  }
  function musicCard() {
    const interest=snapshot.interests;
    const group=findGroup('music');
    // Radio visits and music visits are distinct signals. The existing Wix
    // music theme includes radio pages, so count non-radio page views only.
    const isRadio=path=>['/outlaw-radio-5150','/kjak-24-7'].includes(linked(path));
    const songs=Array.isArray(group?.pages)
      ?group.pages.filter(p=>!isRadio(p.path)):null;
    const pageViews=songs && songs.every(p=>measurable(p.views))
      ?(songs.length?songs.reduce((n,p)=>n+p.views,0)
        :interest.data?.reconciled===true?0:null)
      :null;
    // Named albums in paid Wix web orders. This is not streaming or all sales.
    const store=snapshot.sales.status==='ok' ?snapshot.sales.data:null;
    const albumUnits=store?.complete && Array.isArray(store.products)
      ?store.products.filter(p=>/\b(songs? of emberhold|back porch rebellion|album)\b/i.test(String(p.name||'')))
          .reduce((n,p)=>n+(measurable(p.units)?p.units:0),0)
      :null;
    const warnings=[snapshot.interests.error,snapshot.sales.error].filter(Boolean);
    const color=snapshot.interests.status==='error'&&snapshot.sales.status==='error'?'red':'yellow';
    return `<article class="mission-intel-card mission-pulse-music">
      <header class="mission-intel-card-head">
        <div><small>MUSIC · ALBUMS &amp; SONGS</small><h3>Music</h3></div>
        ${statusLight(color,color.toUpperCase())}
      </header>
      <div class="mission-intel-overview">
      <div class="mission-intel-meters">
        ${meter('Music page views',show(pageViews),'Excludes Outlaw Radio page')}
        ${meter('Music-only visitors','N/A','Not separately verified')}
        ${meter('Wix named album units',show(albumUnits),'Approved paid web orders')}
        ${meter('Song preview plays','N/A','Player tracking not connected')}
      </div>
        ${pulseLineGraph('music')}
      </div>

      <p class="mission-intel-muted">Page views do not prove music was played. Album units exclude unverified external sales and bundles not identifiable as albums.</p>
      <div class="mission-intel-actions">
        <button type="button" data-view="Website Analytics">Music website details ›</button>
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
      <div class="mission-intel-overview">
      <div class="mission-intel-meters mission-intel-3">
        ${meter('Paid orders',show(ready?data.paidOrders:null))}
        ${meter('Items sold',show(ready?data.units:null))}
        ${meter('Item sales',money(ready?data.itemSalesCents:null))}
      </div>
        ${pulseLineGraph('store')}
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
    // A verified Wix top-page count beats treating an absent interest-group
    // match as zero. Both views use the same selected website date range.
    const views=measurable(page?.views)?page.views
      :measurable(fallback?.views)?fallback.views
      :(interest.status==='ok'&&interest.data?.reconciled&&!interest.data.partial&&!page?0:null);
    const visitors=measurable(page?.visitors)?page.visitors
      :measurable(fallback?.visitors)?fallback.visitors:null;
    const connected=typeof localData!=='undefined'&&localData?.website?.connected===true;
    const color=interest.status==='error'&&!connected?'red':'yellow';
    const report=snapshot.radio.status==='ok'?snapshot.radio.data:null;
    const stats=report?.summary||{};
    const period=report?.range
      ?report.range.start+' through '+report.range.end+' (UTC)'
      :'Period not confirmed';
    const live=snapshot.stationLive.status==='ok'?snapshot.stationLive.data:null;
    const liveText=live?.broadcastStatus==='online'?'ON AIR'
      :live?.broadcastStatus==='offline'?'OFF AIR':'N/A';
    const liveNote=live?'Radio.co live station status'
      :snapshot.stationLive.status==='error'?'Status unavailable'
      :'Checking status…';
    const playing=live?.broadcastStatus==='online'&&live.nowPlaying
      ?'<p class="mission-intel-muted"><strong>NOW PLAYING · </strong>'+escape(live.nowPlaying)+'</p>':'';
    const oldReport=report
      ?`<details class="mission-intel-data-notes">
          <summary>More radio statistics · imported CSV</summary>
          <div class="mission-intel-meters">
            ${meter('Peak simultaneous',show(stats.peak))}
            ${meter('Total listened',audioTime(stats.totalDurationRaw))}
          </div>
          <p><strong>HISTORICAL RADIO.CO CSV · ${escape(period)}</strong>
          This import does not update automatically and does not follow the Wix reporting-date selector.
          Daily unique counts cannot establish different listeners over the entire period.</p>
          ${report.screenComparison?.note
            ?'<p>Radio.co source discrepancy: '+escape(report.screenComparison.note)+'</p>':''}
        </details>`
      :'<p class="mission-intel-muted">'+(snapshot.radio.status==='error'
        ?'Radio.co CSV unavailable: '+escape(snapshot.radio.error)
        :snapshot.radio.status==='loading'?'Loading the last Radio.co export…'
        :'No Radio.co CSV has been loaded.')+'</p>';
    return `<article class="mission-intel-card">
      <header class="mission-intel-card-head">
        <div><small>RADIO · 51.50</small><h3>Outlaw Radio 5150</h3></div>
        ${statusLight(color,color.toUpperCase())}
      </header>
      <div class="mission-intel-overview">
      <div class="mission-intel-meters">
        ${meter('Website page views',show(views))}
        ${meter('Station broadcast',liveText,liveNote)}
        ${meter('Stream connections',show(report?stats.connections:null),'Last imported CSV')}
        ${meter('Avg. listening time',audioTime(report?stats.averageDurationRaw:null),'Last imported CSV')}
      </div>
        ${pulseLineGraph('radio')}
      </div>

      ${playing}
      <p class="mission-intel-muted">Website visitors: <strong>${show(visitors)}</strong> · Live listener count: <strong>N/A</strong> (not connected)</p>
      ${snapshot.stationLive.status==='error'
        ?'<p class="mission-intel-error">Radio.co status unavailable: '+escape(snapshot.stationLive.error)+'</p>':''}
      ${oldReport}
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
    // From Doc's Porch is authored and refreshed by the original Mission Control
    // renderer. Move that existing interactive element directly after the fourth
    // Business Pulse card, without copying it or losing its delegated actions.
    // Keep a reference before rebuilding the panel, since some refreshes call
    // paint() several times without rebuilding Mission Control.
    const blog=panel.querySelector('.mission-blog-section')
      || document.querySelector('#connectionStrip .mission-blog-section');
    const selected=period();
    const periodName=selected.range==='custom'
      ? selected.start+' to '+selected.endInclusive
      : ({today:'TODAY','7d':'LAST 7 DAYS','30d':'LAST 30 DAYS','365d':'LAST 365 DAYS'})[selected.range]||'SELECTED DATES';
    panel.innerHTML=`<div class="mission-intel-title">
        <div><strong>BUSINESS PULSE</strong><small>${escape(periodName)}</small></div>
        <button type="button" data-mission-pulse-refresh="1" aria-label="Refresh radio, music, Trading Post and book website statistics">Check activity</button>
      </div>
      <div class="mission-intel-grid">${radioCard()}${musicCard()}${storeCard()}${bookCard()}</div>
      <section class="mission-ember-hall-section" aria-label="Ember Hall latest approved posts">${emberHallCard()}</section>
      <details class="mission-intel-data-notes">
        <summary>About these numbers</summary>
        <p>Selected Wix dates: ${escape(selected.start)} through ${escape(selected.endInclusive)}. Missing data stays unavailable. Chapter clicks do not prove reading. Wix paid store sales exclude tax and shipping, refunds and outside channels. Radio webpage views are not listener counts. Music-page views exclude the station page but are not confirmed song plays. The Music panel uses named Wix album products, not outside sales. The Radio.co historical export uses its own explicitly labelled UTC dates and is not live or filtered by Wix selection. Current station status and song come from Radio.co's public API, but listener counts do not. Testing traffic may be included.</p>
      </details>`;
    // Keep the Blog on its own full-width row immediately below The Wooden Token.
    // The source section is physically moved, not duplicated.
    if(blog) {
      syncPorchRecentPost(blog);
      panel.querySelector('.mission-intel-grid')?.after(blog);
    }
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
    snapshot.stories={status:'loading',data:null,error:null};
    paint();
    getLatestStories().then(data=>{
      if(ticket!==sequence)return;
      snapshot.stories={status:'ok',data,error:null};
      paint();
    }).catch(error=>{
      if(ticket!==sequence)return;
      snapshot.stories={status:'error',data:null,error:String(error.message||'Latest Wix stories unavailable.')};
      paint();
    });
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
      panel.setAttribute('aria-label','Business Pulse: Outlaw Radio, Music, Trading Post, and Book');
      if(anchor) anchor.before(panel); else strip.append(panel);
    }
    paint();
    refresh(false);
    return value;
  };
  document.addEventListener('djoms:verified-report',event=>{
    if(event.detail?.source==='ga4'&&typeof owner!=='undefined'&&owner&&
       typeof activeView!=='undefined'&&activeView==='Mission Control'&&
       document.getElementById('missionBusinessPulse'))paint();
  });
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-mission-pulse-refresh]');
    if(!b) return;
    event.preventDefault();
    refresh(true);
  });
  if(typeof activeView!=='undefined'&&activeView==='Mission Control'
    &&typeof owner!=='undefined'&&owner) window.renderConnectionStrip();
})();