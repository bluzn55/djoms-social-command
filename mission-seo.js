/* DJOMS · Google Search Console, read-only SEO view using shared Wix dates.
   Only confirmed Google values are shown. Auth stays on the owner-only backend. */
(function missionSeoModule() {
  'use strict';
  const delay=2*60*1000;
  const results=new Map();
  const inFlight=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const fmt=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
    ?new Intl.NumberFormat('en-US').format(Math.round(value)):'N/A';
  const dec=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
    ?value.toFixed(1):'N/A';
  const pct=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
    ?(value*100).toFixed(1)+'%':'N/A';
  const current=()=>typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
  const sourceLink='https://search.google.com/search-console';
  const checkRange=(report,selection)=>report?.range?.start===selection?.start &&
    report?.range?.end===selection?.end;
  const stateFor=value=>{
    if(value?.status==='connected')return {light:'green',label:'CONNECTED'};
    if(value?.status==='needs-attention'||value?.status==='reconnect'||value?.status==='error')
      return {light:'red',label:'NEEDS ATTENTION'};
    if(value?.status==='delayed')return {light:'yellow',label:'REPORT DELAYED'};
    if(value?.status==='verify')return {light:'yellow',label:'VERIFY SITE'};
    return {light:'yellow',label:'NOT CONNECTED'};
  };
  const metric=(label,value)=>'<span class="mission-seo-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></span>';
  const periodLabel=period=>period?.range==='custom'
    ?(period.start+' to '+period.endInclusive)
    :({today:'Today','7d':'Last 7 days','30d':'Last 30 days','365d':'Last 365 days'})[period?.range]||'Selected dates';


  function searchTermPreview(report) {
    const terms=Array.isArray(report?.topQueries)
      ?report.topQueries.filter(row=>row&&typeof row.query==='string'&&row.query.trim()).slice(0,5):[];
    const pages=Array.isArray(report?.topPages)
      ?report.topPages.filter(row=>row&&typeof row.page==='string'&&row.page.trim()).slice(0,5):[];
    const showPages=!terms.length&&pages.length>0;
    const data=showPages?pages:terms;
    const name=row=>{
      if(!showPages)return row.query;
      const short=String(row.page).replace(/^https?:\/\/(?:www\.)?docjaks\.com\/?/i,'/');
      return short==='/'?'Home page':short;
    };
    return '<section class="mission-seo-queries" aria-label="Google search terms and impressions">'+
      '<div class="mission-seo-queries-head"><strong>'+
        (showPages?'PAGES APPEARING ON GOOGLE':'WHAT PEOPLE SEARCHED ON GOOGLE')+'</strong>'+
        '<small>'+(showPages?'Exact searches not reported':'Top 5 reported search terms')+'</small></div>'+
      (data.length
        ?'<div class="mission-seo-table-scroll"><table class="mission-seo-query-table">'+
          '<thead><tr><th scope="col">'+(showPages?'Website page':'Google search phrase')+'</th>'+
          '<th scope="col">Impressions</th><th scope="col">Clicks</th></tr></thead>'+
          '<tbody>'+data.map((row,index)=>
            '<tr><th scope="row"><em>'+(index+1)+'.</em> '+esc(name(row))+'</th>'+
            '<td>'+esc(fmt(row.impressions))+'</td><td>'+esc(fmt(row.clicks))+'</td></tr>'
          ).join('')+'</tbody></table></div>'
        :'<p class="mission-seo-no-queries">Google has not provided individual search phrases for these dates.</p>')+
      '<p class="mission-seo-queries-note">'+
        (showPages
          ?'Google has not shared the exact search words. These are the pages that appeared, not the words someone typed.'
          :'Google may hide rare searches for privacy, so the listed impressions might not add up to the total above.')+
      '</p></section>';
  }

  // Four genuine Google Search Console daily signals, each in its own band.
  // Different units must not share an invented numeric Y axis.
  // One shared plot for four different Google Search units. Each colored
  // line has its own actual-value scale printed immediately to the side.
  // Counts accumulate through the selected period; CTR and position are
  // running weighted results. The main KPI totals remain Google's authority.
  function searchHistoryGraph(report) {
    const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
    const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
    const rows=(Array.isArray(report?.trend?.points)?report.trend.points:[])
      .filter(row=>row&&dayPattern.test(row.date||''))
      .sort((a,b)=>a.date.localeCompare(b.date));
    const head=report?.metrics||{};
    const configs=[
      {key:'impressions',style:'impressions',label:'Impressions',format:fmt},
      {key:'clicks',style:'clicks',label:'Google clicks',format:fmt},
      {key:'ctr',style:'ctr',label:'Search CTR',format:pct},
      {key:'position',style:'position',label:'Avg. position',format:dec}
    ];
    const dayNumber=date=>Date.parse(date+'T12:00:00Z')/86400000;
    const formatDate=date=>date?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'})
      .format(new Date(date+'T12:00:00Z')):'N/A';
    let cumulativeViews=0,cumulativeClicks=0,weightedPosition=0;
    let viewComplete=true,clickComplete=true,positionComplete=true;
    const history=rows.map(day=>{
      const hasImpressions=valid(day.impressions),hasClicks=valid(day.clicks);
      if(!hasImpressions)viewComplete=false;
      if(!hasClicks)clickComplete=false;
      if(viewComplete)cumulativeViews+=day.impressions;
      if(clickComplete)cumulativeClicks+=day.clicks;
      if(!hasImpressions||(day.impressions>0&&!valid(day.position)))positionComplete=false;
      if(positionComplete&&hasImpressions&&day.impressions>0)
        weightedPosition+=day.impressions*day.position;
      const impressionValue=viewComplete?cumulativeViews:null;
      const clickValue=clickComplete?cumulativeClicks:null;
      return {date:day.date,
        impressions:impressionValue,clicks:clickValue,
        ctr:valid(impressionValue)&&impressionValue>0&&valid(clickValue)?clickValue/impressionValue:null,
        position:positionComplete&&valid(impressionValue)&&impressionValue>0?
          weightedPosition/impressionValue:null
      };
    });
    const start=dayPattern.test(report?.range?.start||'')?report.range.start:history[0]?.date;
    const end=dayPattern.test(report?.reportedThrough||'')?report.reportedThrough:history[history.length-1]?.date;
    const span=start&&end?Math.max(1,dayNumber(end)-dayNumber(start)):1;
    const W=520,H=245,L=32,R=10,T=12,B=13,plotW=W-L-R,plotH=H-T-B;
    const x=date=>L+(dayNumber(date)-dayNumber(start))/span*plotW;
    const scales={};
    for(const config of configs){
      const values=history.map(row=>row[config.key]).filter(valid);
      const box=valid(head[config.key])?head[config.key]:null;
      let low=config.key==='position'&&values.length?Math.min(...values):0;
      let high=values.length?Math.max(...values):0;
      if(box!==null){high=Math.max(high,box);if(config.key==='position')low=Math.min(low,box);}
      if(config.key!=='position')low=0;
      const observed=history.length&&valid(history[history.length-1]?.[config.key])?
        history[history.length-1][config.key]:null;
      const matches=box!==null&&observed!==null?
        config.format(box)===config.format(observed):null;
      scales[config.key]={low,high,box,observed,matches,values};
    }
    const y=(value,config)=>{
      const scale=scales[config.key];
      if(scale.high===scale.low)return config.key==='position'?T+plotH/2:T+plotH;
      return T+plotH-(value-scale.low)/(scale.high-scale.low)*plotH;
    };
    const grid=[0,.25,.5,.75,1].map(fraction=>{
      const gy=(T+(1-fraction)*plotH).toFixed(1);
      return '<line class="mission-seo-combined-grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+gy+'" y2="'+gy+'"></line>';
    }).join('');
    const dateLines=history.length>1&&report?.trend?.status==='reported';
    const renderSeries=config=>{
      const observed=history.filter(row=>valid(row[config.key]));
      if(!dateLines||!observed.length)return '';
      const segments=[];
      let series=[],previous=null;
      for(const row of history){
        if(!valid(row[config.key])){if(series.length>1)segments.push(series);series=[];previous=null;continue;}
        const tick=dayNumber(row.date);
        if(previous!==null&&tick-previous>1){if(series.length>1)segments.push(series);series=[];}
        series.push({date:row.date,value:row[config.key]});
        previous=tick;
      }
      if(series.length>1)segments.push(series);
      const paths=segments.map(segment=>{
        const d=segment.map((row,i)=>(i?'L':'M')+x(row.date).toFixed(1)+' '+y(row.value,config).toFixed(1)).join(' ');
        return '<path class="mission-seo-combined-line" d="'+d+'"></path>';
      }).join('');
      const last=observed[observed.length-1];
      const tip=esc(config.label+' · '+formatDate(last.date)+' · '+config.format(last[config.key]));
      return '<g class="mission-seo-combined-series mission-seo-plot-'+config.style+'">'+paths+
        '<circle cx="'+x(last.date).toFixed(1)+'" cy="'+y(last[config.key],config).toFixed(1)+'" r="4"><title>'+tip+'</title></circle></g>';
    };
    const sharedChart=dateLines?
      '<svg class="mission-seo-combined-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="One graph with impressions, clicks, click-through rate and average position trends, each with its own labeled scale">'+
        '<title>Google Search Console cumulative selected-period trends, four colored lines</title>'+
        grid+configs.map(renderSeries).join('')+'</svg>':
      '<div class="mission-seo-combined-empty">N/A · Need at least two Google-reported dates for one line graph.</div>';
    // Compact color-keyed legend. Selected-period figures come from the same
    // authoritative Google metrics used in the four boxes above.
    const side=configs.map(config=>{
      const scale=scales[config.key];
      const boxLabel=scale.box===null?'N/A':config.format(scale.box);
      const rangeLabel=scale.values.length?
        'Line scale '+config.format(scale.low)+' to '+config.format(scale.high):
        'No verified daily values';
      return '<div class="mission-seo-wide-legend-item mission-seo-plot-'+config.style+'">'+
        '<i class="mission-seo-wide-legend-color" aria-hidden="true"></i>'+
        '<div class="mission-seo-wide-legend-copy"><strong>'+esc(config.label)+'</strong>'+
          '<small>'+esc(rangeLabel)+'</small></div>'+
        '<b class="mission-seo-wide-legend-value">'+esc(boxLabel)+'</b></div>';
    }).join('');
    const mismatch=configs.filter(config=>scales[config.key].matches===false);
    const reconcileNote=mismatch.length?
      '<p class="mission-seo-reconcile">Google daily values do not completely match the period totals for '+
      esc(mismatch.map(config=>config.label).join(', '))+'. The graph uses reported daily history; '+
      'the boxes retain Google’s summary figures.</p>':'';
    return '<div class="mission-seo-trends mission-seo-trends-combined mission-seo-trends-wide" role="group" aria-label="Wide Google Search graph with four color-coded lines and selected-period values">'+
      '<div class="mission-seo-trends-heading"><strong>GOOGLE SEARCH TRENDS</strong>'+
        '<small>Same selected dates as the four boxes</small></div>'+
      '<div class="mission-seo-combined-layout">'+
        '<div class="mission-seo-combined-main">'+
          '<div class="mission-seo-wide-graph-caption">Four metrics · each line has its own scale</div>'+
          sharedChart+
          '<div class="mission-seo-plot-dates"><span>'+esc(formatDate(start))+'</span>'+
            '<span>'+esc(formatDate(end))+'</span></div>'+
        '</div>'+
        '<div class="mission-seo-side-values mission-seo-wide-legend" aria-label="Four graph colors and Google selected-period values">'+
          '<strong class="mission-seo-wide-legend-title">SELECTED PERIOD</strong>'+side+'</div>'+
      '</div>'+
      reconcileNote+
      '<p class="mission-seo-trend-explainer">Faint lines mark relative levels for each color. '+
        'Impressions and clicks accumulate; CTR and position are running averages. '+
        'Flat zero lines can overlap. Google data may lag two days.</p>'+
    '</div>';
  }

  function renderBar(element,report,selection,error) {
    const {light,label}=stateFor(report);
    const pending=!report&&!error;
    const metrics=report?.metrics||{};
    const connected=report?.status==='connected';
    const status=pending?'CHECKING':error?'UNAVAILABLE':label;
    const color=pending?'yellow':error?'red':light;
    const note=error?String(error):report?.message||'Checking Search Console permission.';
    const dataThrough=report?.reportedThrough ?'Google data through '+esc(report.reportedThrough):'Google data usually lags by 2 days';
    if(report) {
      window.djomsVerifiedReports ||= {};
      const old=window.djomsVerifiedReports.seo;
      window.djomsVerifiedReports.seo={query:selection?.query||null,data:report};
      const stamp=String(selection?.query||'')+'|'+String(report.checkedAt||'')+'|'+String(report.status||'');
      if(old?.stamp!==stamp) {
        window.djomsVerifiedReports.seo.stamp=stamp;
        document.dispatchEvent(new CustomEvent('djoms:verified-report',{detail:{source:'seo'}}));
      } else window.djomsVerifiedReports.seo.stamp=stamp;
    }
    element.innerHTML='<div class="mission-seo-head">'+
       '<div class="mission-seo-title"><strong>STEP 1 · GOOGLE SEARCH (SEO)</strong><small>'+esc(periodLabel(selection))+'</small></div>'+
       '<span class="mission-seo-status"><i class="gyr-light '+color+'" aria-hidden="true"></i><b>'+esc(status)+'</b></span>'+
       '</div>'+
       '<div class="mission-seo-path" aria-label="Journey from Google search to a website visit">'+
         '<span>Someone searches</span><b aria-hidden="true">→</b>'+
         '<span>Doc Jaks appears (impression)</span><b aria-hidden="true">→</b>'+
         '<span>Click or no click</span><b aria-hidden="true">→</b>'+
         '<span>Website visit if clicked</span>'+
       '</div>'+
       '<div class="mission-seo-metrics">'+
          metric('Impressions',connected?fmt(metrics.impressions):'N/A')+
          metric('Google clicks',connected?fmt(metrics.clicks):'N/A')+
          metric('Search CTR',connected?pct(metrics.ctr):'N/A')+
          metric('Avg. position',connected?dec(metrics.position):'N/A')+
       '</div>'+
       (connected?'<div class="mission-seo-insights mission-seo-insights-stacked">'+searchHistoryGraph(report)+searchTermPreview(report)+'</div>':'')+
       '<div class="mission-seo-actions">'+
         (connected?'<small>'+dataThrough+'</small>':'<small>'+esc(note)+'</small>')+
         (connected?'':'<a href="/api/meta/seo-connect" class="mission-seo-connect">Connect Search Console ↗</a>')+
         '<button type="button" data-view="SEO Analytics">SEO Details ›</button>'+
       '</div>';
  }

  function read(selection,force=false) {
    if(!selection?.query||!selection?.start||!selection?.end)return Promise.resolve(null);
    const key=selection.query;
    const cached=results.get(key);
    if(!force&&cached&&Date.now()-cached.at<delay)return Promise.resolve(cached);
    if(!force&&inFlight.has(key))return inFlight.get(key);
    const job=(async()=>{
      let value=null,error=null;
      try{
        const response=await fetch('/api/meta/seo-status?'+key,{
          credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)
        });
        value=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(value.error||'SEO report could not be read.');
        if(!checkRange(value,selection))throw new Error('SEO dates do not match the Wix report.');
      }catch(e){error=e.name==='TimeoutError'?'Google Search Console took too long.':(e.message||'SEO report unavailable.');}
      const snapshot={at:Date.now(),value,error};
      results.set(key,snapshot);
      return snapshot;
    })().finally(()=>inFlight.delete(key));
    inFlight.set(key,job);
    return job;
  }

  function paintPanel(force=false) {
    const node=document.getElementById('missionSeoPanel');
    if(!node)return;
    const selection=current();
    if(!selection?.start||!selection?.end||!selection.query) {
      renderBar(node,null,selection,'Waiting for Wix reporting dates.');
      return;
    }
    const key=selection.query;
    const cached=results.get(key);
    renderBar(node,cached?.value||null,selection,cached?.error);
    void read(selection,force).then(snapshot=>{
      if(!node.isConnected||current()?.query!==key)return;
      renderBar(node,snapshot?.value||null,selection,snapshot?.error);
      if(typeof activeView!=='undefined'&&activeView==='SEO Analytics')renderDetails(false);
    });
  }

  const table=(rows,type)=>{
    if(!Array.isArray(rows)||!rows.length)
      return '<p class="mission-seo-empty">No verified '+(type==='query'?'search terms':'search pages')+' reported for these dates.</p>';
    const showName=row=>type==='query'?row.query:row.page;
    return '<div class="seo-detail-rows">'+rows.slice(0,5).map((row,index)=>
      '<div class="seo-detail-row"><span><em>'+(index+1)+'.</em> '+esc(showName(row)||'Unnamed')+'</span>'+
      '<strong>'+fmt(row.impressions)+' impressions</strong><small>'+fmt(row.clicks)+' clicks</small></div>'
    ).join('')+'</div>';
  };

  function renderDetails(force=false) {
    const host=document.getElementById('content');
    if(!host||typeof activeView==='undefined'||activeView!=='SEO Analytics')return;
    const selection=current();
    const snapshot=selection?.query?results.get(selection.query):null;
    const report=snapshot?.value;
    const state=stateFor(report);
    const busy=!snapshot;
    const metrics=report?.metrics||{};
    const connected=report?.status==='connected';
    host.innerHTML='<section class="seo-detail-page">'+
      '<div class="seo-detail-heading"><div><small>DOC JAKS · SEARCH DISCOVERY</small><h2>SEO ANALYTICS</h2>'+
      '<p>Google Search Console for DOCJAKS.COM · '+esc(periodLabel(selection))+'</p></div>'+
      '<span class="mission-seo-status"><i class="gyr-light '+(snapshot?.error?'red':state.light)+'" aria-hidden="true"></i><b>'+esc(snapshot?.error?'UNAVAILABLE':busy?'CHECKING':state.label)+'</b></span></div>'+
      '<div class="seo-detail-toolbar">'+
       '<button type="button" data-view="Mission Control">‹ Mission Control</button>'+
       (typeof websiteRangeButtons==='function'?websiteRangeButtons():'')+
       '<button type="button" data-seo-refresh="1">Refresh SEO</button>'+
      '</div>'+
      '<div class="seo-detail-statgrid">'+
       metric('Impressions',connected?fmt(metrics.impressions):'N/A')+
       metric('Search clicks',connected?fmt(metrics.clicks):'N/A')+
       metric('Search CTR',connected?pct(metrics.ctr):'N/A')+
       metric('Average position',connected?dec(metrics.position):'N/A')+
      '</div>'+
      '<p class="seo-detail-hint">'+esc(snapshot?.error||report?.message||(busy?'Checking the verified search report.':'Connect Google Search Console to see verified results.'))+'</p>'+
      (!connected?'<a class="mission-seo-connect" href="/api/meta/seo-connect">Connect Search Console ↗</a>':'')+
      '<div class="seo-detail-columns">'+
       '<section><h3>Top Google searches</h3>'+table(connected?report?.topQueries:[],'query')+'</section>'+
       '<section><h3>Top pages from Google</h3>'+table(connected?report?.topPages:[],'page')+'</section>'+
      '</div>'+
      '<p class="seo-detail-indexing"><strong>Indexing and sitemap issues:</strong> Use '+
        '<a href="'+sourceLink+'" target="_blank" rel="noopener noreferrer">Google Search Console ↗</a>'+
        '. Index coverage is not reported by the Search Analytics endpoint. Search Console days use Google’s reporting time zone and often lag by two days.</p>'+
      '</section>';
    if((force||!snapshot)&&selection?.query&&selection?.start&&selection?.end){
      void read(selection,force).then(()=>{
        if(typeof activeView!=='undefined'&&activeView==='SEO Analytics'&&current()?.query===selection?.query)
          renderDetails(false);
      });
    }
  }

  const previousStrip=window.renderConnectionStrip;
  if(typeof previousStrip==='function') {
    window.renderConnectionStrip=function(...args){
      const value=previousStrip.apply(this,args);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control')paintPanel(false);
      return value;
    };
  }
  const previousRender=window.render;
  if(typeof previousRender==='function') {
    window.render=function(...args){
      const value=previousRender.apply(this,args);
      if(typeof activeView!=='undefined'&&activeView==='SEO Analytics')renderDetails();
      return value;
    };
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-seo-refresh]');
    if(!button)return;
    event.preventDefault();
    if(typeof activeView!=='undefined'&&activeView==='SEO Analytics')renderDetails(true);
    else paintPanel(true);
  });
})();