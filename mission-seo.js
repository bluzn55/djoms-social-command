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
    // One actual-value vertical scale for the four lines, with ten-unit
    // steps for smaller ranges. Larger ranges use readable multiples of 10.
    // CTR is shown as percentage points; all other measurements are numbers.
    const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
    const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
    const rows=(Array.isArray(report?.trend?.points)?report.trend.points:[])
      .filter(row=>row&&dayPattern.test(row.date||''))
      .sort((a,b)=>a.date.localeCompare(b.date));
    const head=report?.metrics||{};
    const configs=[
      {key:'impressions',style:'impressions',label:'Impressions',format:fmt},
      {key:'clicks',style:'clicks',label:'Google clicks',format:fmt},
      {key:'ctr',style:'ctr',label:'Search CTR (%)',format:pct},
      {key:'position',style:'position',label:'Avg. position',format:dec}
    ];
    const dayNumber=date=>Date.parse(date+'T12:00:00Z')/86400000;
    const toDate=n=>new Date(n*86400000).toISOString().slice(0,10);
    const shortDate=date=>new Intl.DateTimeFormat('en-US',{
      timeZone:'UTC',month:'short',day:'numeric'
    }).format(new Date(date+'T12:00:00Z'));
    const tickLabel=(date,index,daySpan)=>{
      const dateObject=new Date(date+'T12:00:00Z');
      if(daySpan<=32) {
        const day=dateObject.getUTCDate();
        return index===0||day===1?shortDate(date):String(day);
      }
      if(daySpan<=180)return shortDate(date);
      const monthName=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short'})
        .format(dateObject);
      return index===0||date.slice(5,7)==='01'
        ?monthName+" '"+date.slice(2,4):monthName;
    };
    let cumulativeViews=0,cumulativeClicks=0,weightedPosition=0;
    let viewsComplete=true,clicksComplete=true,positionComplete=true;
    const history=rows.map(day=>{
      const hasViews=valid(day.impressions),hasClicks=valid(day.clicks);
      if(!hasViews)viewsComplete=false;
      if(!hasClicks)clicksComplete=false;
      if(viewsComplete)cumulativeViews+=day.impressions;
      if(clicksComplete)cumulativeClicks+=day.clicks;
      if(!hasViews||(day.impressions>0&&!valid(day.position)))positionComplete=false;
      if(positionComplete&&hasViews&&day.impressions>0)
        weightedPosition+=day.impressions*day.position;
      const views=viewsComplete?cumulativeViews:null;
      const clicks=clicksComplete?cumulativeClicks:null;
      return {date:day.date,impressions:views,clicks,
        ctr:valid(views)&&views>0&&valid(clicks)?clicks/views:null,
        position:positionComplete&&valid(views)&&views>0?weightedPosition/views:null};
    });
    const first=history[0]?.date;
    const start=dayPattern.test(report?.range?.start||'')?report.range.start:first;
    const statedEnd=dayPattern.test(report?.reportedThrough||'')?report.reportedThrough:
      history[history.length-1]?.date;
    const end=start&&statedEnd&&statedEnd>=start?statedEnd:start;
    const span=start&&end?Math.max(1,dayNumber(end)-dayNumber(start)):1;
    const W=1200,H=354,L=59,R=19,T=22,B=44,plotW=W-L-R,plotH=H-T-B;
    const x=date=>L+(dayNumber(date)-dayNumber(start))/span*plotW;
    const nativeValue=(row,key)=>valid(row?.[key])
      ?key==='ctr'?row[key]*100:row[key]:null;
    const observedValues=configs.flatMap(config=>history
      .map(row=>nativeValue(row,config.key)).filter(valid));
    const boxValues=configs.map(config=>nativeValue(head,config.key)).filter(valid);
    const peak=Math.max(0,...observedValues,...boxValues);
    const ticks=[10,20,50,100,200,500,1000,2000,5000,10000,20000,50000,100000,
      200000,500000,1000000];
    const step=ticks.find(n=>Math.ceil(peak/n)<=7)||
      Math.ceil(peak/7000000)*1000000;
    const ceiling=Math.max(step,Math.ceil(peak/step)*step);
    const y=value=>T+plotH-(value/ceiling)*plotH;
    const numberLabel=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
    const yTicks=[];
    for(let n=0;n<=ceiling+step/1000;n+=step) {
      const gy=y(n).toFixed(1);
      yTicks.push('<g><line class="mission-seo-combined-grid" x1="'+L+'" x2="'+(W-R)+
        '" y1="'+gy+'" y2="'+gy+'"></line>'+
        '<text class="mission-seo-y-axis-label" x="'+(L-10)+'" y="'+(+gy+5).toFixed(1)+
        '" text-anchor="end">'+numberLabel(n)+'</text></g>');
    }
    const dateTicks=[];
    if(start&&end) {
      const daySpan=Math.max(0,dayNumber(end)-dayNumber(start));
      const candidates=[];
      if(daySpan<=32) {
        for(let day=dayNumber(start);day<=dayNumber(end);day++)candidates.push(toDate(day));
      }else if(daySpan<=180) {
        const every=daySpan<=90?7:14;
        for(let day=dayNumber(start);day<=dayNumber(end);day+=every)candidates.push(toDate(day));
        if(candidates[candidates.length-1]!==end)candidates.push(end);
      }else{
        candidates.push(start);
        const year=Number(start.slice(0,4)),month=Number(start.slice(5,7));
        let monthDate=new Date(Date.UTC(year,month,1));
        for(let count=0;count<14;count++){
          const date=monthDate.toISOString().slice(0,10);
          if(date>end)break;
          if(date>start)candidates.push(date);
          monthDate.setUTCMonth(monthDate.getUTCMonth()+1);
        }
        if(candidates[candidates.length-1]!==end) {
          // Avoid two almost overlapping labels for the final month.
          const remaining=dayNumber(end)-dayNumber(candidates[candidates.length-1]);
          if(candidates.length>1&&remaining<21)candidates[candidates.length-1]=end;
          else candidates.push(end);
        }
      }
      candidates.forEach((date,index)=>{
        const gx=x(date).toFixed(1);
        const anchor=index===0?'start':index===candidates.length-1?'end':'middle';
        dateTicks.push('<g><line class="mission-seo-date-tick" x1="'+gx+'" x2="'+gx+
          '" y1="'+(H-B)+'" y2="'+(H-B+6)+'"></line>'+
          '<text class="mission-seo-x-axis-label" x="'+gx+'" y="'+(H-12)+
          '" text-anchor="'+anchor+'">'+esc(tickLabel(date,index,daySpan))+'</text></g>');
      });
    }
    const dateLines=history.length>=2&&report?.trend?.status==='reported';
    const lines=configs.map(config=>{
      if(!dateLines)return '';
      const groups=[];
      let group=[],previous=null;
      for(const item of history) {
        const value=nativeValue(item,config.key);
        if(!valid(value)) {
          if(group.length>=2)groups.push(group);
          group=[];previous=null;continue;
        }
        const when=dayNumber(item.date);
        if(previous!==null&&when-previous>1) {
          if(group.length>=2)groups.push(group);
          group=[];
        }
        group.push({date:item.date,value,raw:item[config.key]});
        previous=when;
      }
      if(group.length>=2)groups.push(group);
      const paths=groups.map(nodes=>'<path class="mission-seo-combined-line" d="'+
        nodes.map((item,index)=>(index?'L':'M')+x(item.date).toFixed(1)+' '+
          y(item.value).toFixed(1)).join(' ')+'"></path>').join('');
      const all=history.filter(item=>valid(nativeValue(item,config.key)));
      if(!all.length)return '';
      const last=all[all.length-1];
      const label=shortDate(last.date)+' · '+config.label+': '+config.format(last[config.key]);
      return '<g class="mission-seo-combined-series mission-seo-plot-'+config.style+'">'+
        paths+'<circle cx="'+x(last.date).toFixed(1)+'" cy="'+y(nativeValue(last,config.key)).toFixed(1)+
        '" r="4"><title>'+esc(label)+'</title></circle></g>';
    }).join('');
    const svg=dateLines?
      '<svg class="mission-seo-combined-svg mission-seo-numbered-chart" viewBox="0 0 '+W+' '+H+
        '" preserveAspectRatio="none" role="img" aria-label="Google Search trends with one numbered vertical scale and dates under the graph">'+
        '<title>Google Search trends. Shared vertical scale of counts, CTR percentage points, and average position; dates are along the bottom.</title>'+
        yTicks.join('')+
        '<line class="mission-seo-chart-axis" x1="'+L+'" y1="'+T+'" x2="'+L+'" y2="'+(H-B)+'"></line>'+
        '<line class="mission-seo-chart-axis" x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'"></line>'+
        dateTicks.join('')+lines+'</svg>':
      '<div class="mission-seo-combined-empty">N/A · Two or more Google-reported dates are needed to draw trends.</div>';
    const colorKey=configs.map(config=>'<span class="mission-seo-inline-key mission-seo-plot-'+config.style+
      '"><i aria-hidden="true"></i>'+esc(config.label)+'</span>').join('');
    const mismatched=configs.filter(config=>{
      const endRow=history[history.length-1];
      const box=head[config.key],observed=endRow?.[config.key];
      return valid(box)&&valid(observed)&&config.format(box)!==config.format(observed);
    });
    const warning=mismatched.length?
      '<p class="mission-seo-reconcile">Daily search history and Google’s period summary differ for '+
        esc(mismatched.map(c=>c.label).join(', '))+'. The main boxes use the verified period summary.</p>':'';
    return '<div class="mission-seo-trends mission-seo-trends-combined mission-seo-trends-wide mission-seo-trends-axis" role="group" aria-label="Google Search trends with dated x axis and numeric y axis">'+
      '<div class="mission-seo-trends-heading"><strong>GOOGLE SEARCH TRENDS</strong>'+
        '<small>Value scale in steps of '+numberLabel(step)+'</small></div>'+
      '<div class="mission-seo-inline-keys" aria-label="Color key for the four metrics">'+colorKey+'</div>'+
      '<div class="mission-seo-combined-layout">'+
        '<div class="mission-seo-combined-main">'+
          '<div class="mission-seo-axis-scroll">'+svg+'</div>'+
        '</div>'+
      '</div>'+warning+
      '<p class="mission-seo-trend-explainer">Numbers at left use one shared scale: counts for impressions/clicks, percentage points for CTR, and position for ranking. '+
        'Count lines accumulate within the selected period; Google may report days late. Zero-valued lines can overlap.</p>'+
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