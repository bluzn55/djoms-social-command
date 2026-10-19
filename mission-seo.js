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
  function searchHistoryGraph(report) {
    const rows=Array.isArray(report?.trend?.points)?report.trend.points:[];
    const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
    const points=rows.filter(row=>row&&typeof row.date==='string'&&dayPattern.test(row.date))
      .sort((a,b)=>a.date.localeCompare(b.date));
    const first=points[0]?.date||null,last=points[points.length-1]?.date||null;
    const dateLabel=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'})
      .format(new Date(value+'T12:00:00Z')):'N/A';
    const configs=[
      {key:'impressions',label:'Impressions',style:'impressions',format:fmt},
      {key:'clicks',label:'Google clicks',style:'clicks',format:fmt},
      {key:'ctr',label:'Search CTR',style:'ctr',format:pct},
      {key:'position',label:'Avg. position',style:'position',format:dec}
    ];
    const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
    const totalDays=first&&last?Math.round((Date.parse(last+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/86400000):0;
    const chartWidth=428,chartHeight=55,pad=5,plotWidth=chartWidth-pad*2;
    const graph=config=>{
      const measurements=points.filter(row=>valid(row[config.key]));
      if(totalDays<1||measurements.length<2)
        return '<span class="mission-seo-plot-empty">N/A · insufficient daily history</span>';
      const values=measurements.map(row=>row[config.key]);
      const minimum=Math.min(...values),maximum=Math.max(...values);
      const x=day=>pad+((Date.parse(day+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/86400000)/totalDays*plotWidth;
      const y=value=>maximum===minimum?chartHeight/2:
        chartHeight-11-(value-minimum)/(maximum-minimum)*(chartHeight-22);
      const segments=[];
      let currentPoints=[],previousDate=null;
      for(const row of measurements){
        const dateTime=Date.parse(row.date+'T12:00:00Z');
        if(previousDate!==null&&dateTime-previousDate>86400000){
          if(currentPoints.length>1)segments.push(currentPoints);
          currentPoints=[];
        }
        currentPoints.push([x(row.date),y(row[config.key])]);
        previousDate=dateTime;
      }
      if(currentPoints.length>1)segments.push(currentPoints);
      const seriesLines=segments.map(segment=>'<polyline points="'+segment.map(pair=>
        pair.map(n=>n.toFixed(1)).join(',')).join(' ')+'"></polyline>').join('');
      const lastPoint=measurements[measurements.length-1];
      const lastX=x(lastPoint.date).toFixed(1),lastY=y(lastPoint[config.key]).toFixed(1);
      const tip=esc(dateLabel(lastPoint.date)+' · '+config.label+': '+config.format(lastPoint[config.key]));
      return '<svg class="mission-seo-plot-svg" viewBox="0 0 '+chartWidth+' '+chartHeight+'" preserveAspectRatio="none" aria-hidden="true">'+
        '<line class="mission-seo-plot-grid" x1="5" y1="27.5" x2="423" y2="27.5"></line>'+
        seriesLines+'<circle cx="'+lastX+'" cy="'+lastY+'" r="3.5"><title>'+tip+'</title></circle></svg>';
    };
    const lanes=configs.map(config=>{
      const measurements=points.filter(row=>valid(row[config.key]));
      const lastValue=measurements.length?measurements[measurements.length-1][config.key]:null;
      return '<div class="mission-seo-plot-row mission-seo-plot-'+config.style+'">'+
        '<div class="mission-seo-plot-label"><strong><i aria-hidden="true"></i>'+esc(config.label)+'</strong>'+
        '<small>'+(lastValue===null?'N/A':'Latest day: '+esc(config.format(lastValue)))+'</small></div>'+
        '<div class="mission-seo-plot-canvas">'+graph(config)+'</div></div>';
    }).join('');
    return '<div class="mission-seo-trends" role="group" aria-label="Four verified Google Search daily line charts">'+
      '<div class="mission-seo-trends-heading"><strong>GOOGLE SEARCH TRENDS</strong><small>4 colored daily lines</small></div>'+
      '<div class="mission-seo-plot-rows">'+lanes+'</div>'+
      '<div class="mission-seo-plot-dates"><span>'+esc(dateLabel(first))+'</span><span>'+esc(dateLabel(last))+'</span></div>'+
      '<p class="mission-seo-trend-explainer">Each line has its own scale. Lower average position is better. '+
        'Missing Google days are not counted as zero.</p>'+
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
       (connected?'<div class="mission-seo-insights">'+searchTermPreview(report)+searchHistoryGraph(report)+'</div>':'')+
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