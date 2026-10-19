/* Owner Command Center · source-verified Wix trends, read-only.
   Put a single wide graph between existing Wix metrics and Pages/Visitors.
   This module never modifies the Wix metrics, authorization or site content. */
(function () {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
  const dayNum=date=>Date.parse(date+'T12:00:00Z')/86400000;
  const numDate=number=>new Date(number*86400000).toISOString().slice(0,10);
  const dateText=(date,style='short')=>new Intl.DateTimeFormat('en-US',{
    timeZone:'UTC',month:'short',day:style==='month'?undefined:'numeric',
    ...(style==='year'?{year:'2-digit'}:{})
  }).format(new Date(date+'T12:00:00Z'));
  const configs=[
    {key:'visitors',style:'visitors',name:'Visitors',unit:'people',value:value=>value},
    {key:'returningVisitors',style:'returning',name:'Returning visitors',unit:'people',value:value=>value},
    {key:'pageViews',style:'views',name:'Page views',unit:'views',value:value=>value},
    {key:'avgStaySeconds',style:'stay',name:'Average stay',unit:'seconds',value:value=>value},
    {key:'bounceRate',style:'bounce',name:'Bounce rate',unit:'%',value:value=>value*100}
  ];
  function chart(site) {
    const trend=site?.missionTrend||{};
    const granularity=trend.granularity==='week'?'week':'day';
    const rows=(Array.isArray(trend.points)?trend.points:[])
      .filter(row=>row&&dayPattern.test(row.date||''))
      .slice().sort((a,b)=>a.date.localeCompare(b.date));
    const range=site?.range||{};
    const first=dayPattern.test(range.start||'')?range.start:rows[0]?.date;
    const reportedLast=rows[rows.length-1]?.date;
    const selectedEnd=dayPattern.test(range.end||'')?numDate(dayNum(range.end)-1):reportedLast;
    const last=first&&selectedEnd&&selectedEnd>=first?selectedEnd:reportedLast;
    const maxSpan=first&&last?Math.max(1,dayNum(last)-dayNum(first)):1;
    const xFor=date=>L+(Math.max(0,Math.min(maxSpan,dayNum(date)-dayNum(first)))/maxSpan)*plotWidth;
    const W=1200,H=456,L=72,R=22,T=24,B=54;
    const plotWidth=W-L-R,plotHeight=H-T-B;
    const measurements=configs.flatMap(config=>rows
      .map(row=>valid(row[config.key])?config.value(row[config.key]):null).filter(valid));
    const peak=Math.max(0,...measurements);
    // Deliberately non-linear: 0..10 occupies slightly more than half the
    // chart, allowing 1, 2, 3 etc. to be read even when bounce is near 100%.
    // Above 10, the graph compresses the higher numbers in a clearly marked
    // second scale. Every point uses the same piecewise mapping.
    const expanded=peak>10;
    const increments=[10,20,50,100,200,500,1000,2000,5000,10000,20000,50000,100000,200000,500000,1000000];
    const highStep=increments.find(v=>Math.ceil(Math.max(20,peak)/v)<=5)||
      Math.ceil(peak/5000000)*1000000;
    const highLimit=expanded?Math.max(20,Math.ceil(peak/highStep)*highStep):10;
    const lowerHeight=plotHeight*(expanded?.58:1);
    const upperHeight=plotHeight-lowerHeight;
    const dividerY=T+upperHeight;
    const yFor=value=>!expanded
      ?T+plotHeight-(value/10)*plotHeight
      :value<=10
        ?dividerY+(10-value)/10*lowerHeight
        :dividerY-(value-10)/(highLimit-10)*upperHeight;
    const num=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
    const yTicks=[];
    const tick=(value,kind)=>{
      const y=yFor(value).toFixed(1);
      yTicks.push('<g><line class="djoms-wix-chart-grid djoms-wix-chart-'+kind+
        '" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"></line>'+
        '<text class="djoms-wix-chart-y-label'+(value===10?' djoms-wix-chart-ten':'')+
        '" x="'+(L-12)+'" y="'+(+y+5).toFixed(1)+'" text-anchor="end">'+num(value)+
        '</text></g>');
    };
    for(let n=0;n<=10;n++)tick(n,n%2===0?'low-major':'low-minor');
    if(expanded)for(let n=highStep;n<=highLimit+highStep/1000;n+=highStep) {
      if(n>10)tick(n,'high');
    }
    const tintedBand=expanded?
      '<rect class="djoms-wix-chart-low-zone" x="'+L+'" y="'+dividerY.toFixed(1)+
      '" width="'+plotWidth+'" height="'+lowerHeight.toFixed(1)+'"></rect>':'';
    const scaleDivider=expanded?
      '<line class="djoms-wix-chart-zoom-divider" x1="'+L+'" x2="'+(W-R)+
      '" y1="'+dividerY.toFixed(1)+'" y2="'+dividerY.toFixed(1)+'"></line>':'';
    const xTicks=[];
    if(first&&last) {
      const span=Math.max(0,dayNum(last)-dayNum(first));
      const dates=[];
      if(span<=32) {
        for(let d=dayNum(first);d<=dayNum(last);d++)dates.push(numDate(d));
      }else if(span<=180) {
        const increment=span<=90?7:14;
        for(let d=dayNum(first);d<=dayNum(last);d+=increment)dates.push(numDate(d));
        if(dates[dates.length-1]!==last)dates.push(last);
      }else {
        dates.push(first);
        const month=new Date(Date.UTC(Number(first.slice(0,4)),Number(first.slice(5,7))-1,1));
        month.setUTCMonth(month.getUTCMonth()+1);
        for(let i=0;i<14;i++) {
          const candidate=month.toISOString().slice(0,10);
          if(candidate>last)break;
          if(candidate>first)dates.push(candidate);
          month.setUTCMonth(month.getUTCMonth()+1);
        }
        if(dates[dates.length-1]!==last) {
          if(dates.length>1&&dayNum(last)-dayNum(dates[dates.length-1])<21)
            dates[dates.length-1]=last;
          else dates.push(last);
        }
      }
      dates.forEach((date,index)=>{
        const anchor=index===0?'start':index===dates.length-1?'end':'middle';
        const dateObj=new Date(date+'T12:00:00Z');
        const day=dateObj.getUTCDate();
        const label=span<=32?
          (index===0||day===1?dateText(date):String(day)):
          span<=180?dateText(date):
          (index===0||date.slice(5,7)==='01'?dateText(date,'month')+" '"+date.slice(2,4):dateText(date,'month'));
        const x=xFor(date).toFixed(1);
        xTicks.push('<g><line class="djoms-wix-chart-date-tick" x1="'+x+'" x2="'+x+
          '" y1="'+(H-B)+'" y2="'+(H-B+6)+'"></line>'+
          '<text class="djoms-wix-chart-x-label" x="'+x+'" y="'+(H-12)+
          '" text-anchor="'+anchor+'">'+esc(label)+'</text></g>');
      });
    }
    // Paint page views last so the yellow curve stays on top when two
    // metrics have identical values (as on Oct 14-16).
    const paintingOrder=configs.filter(c=>c.key!=='pageViews')
      .concat(configs.filter(c=>c.key==='pageViews'));
    const curves=paintingOrder.map(config=>{
      const sections=[];
      let part=[],previous=null,lastPoint=null;
      const interval=granularity==='week'?7:1;
      for(const row of rows) {
        const raw=row[config.key];
        const value=valid(raw)?config.value(raw):null;
        if(!valid(value)) {
          if(part.length>=2)sections.push(part);
          part=[];previous=null;
          continue;
        }
        const d=dayNum(row.date);
        if(previous!==null&&d-previous>interval){
          if(part.length>=2)sections.push(part);
          part=[];
        }
        const point={date:row.date,value,raw};
        part.push(point);lastPoint=point;previous=d;
      }
      if(part.length>=2)sections.push(part);
      const paths=sections.map(group=>{
        const path=group.map((point,i)=>(i?'L':'M')+xFor(point.date).toFixed(1)+
          ' '+yFor(point.value).toFixed(1)).join(' ');
        return '<path class="djoms-wix-chart-line" d="'+path+'"></path>';
      }).join('');
      const dot=config.key!=='pageViews'&&lastPoint?'<circle cx="'+
        xFor(lastPoint.date).toFixed(1)+'" cy="'+yFor(lastPoint.value).toFixed(1)+
        '" r="4"><title>'+esc(config.name+' · '+dateText(lastPoint.date)+' · '+
          (config.key==='bounceRate'?lastPoint.value.toFixed(1)+'%':
           config.key==='avgStaySeconds'?lastPoint.value.toFixed(0)+' sec':num(lastPoint.value)))+
        '</title></circle>':'';
      const views=config.key==='pageViews'?rows.filter(row=>valid(row.pageViews)):[];
      const every=Math.max(1,Math.ceil(views.length/14));
      const viewPoints=views.map((point,index)=>{
        const px=xFor(point.date).toFixed(1),py=yFor(point.pageViews).toFixed(1);
        const label=index%every===0||index===views.length-1
          ?'<text class="djoms-wix-chart-view-number" x="'+px+'" y="'+
            (Number(py)-12).toFixed(1)+'" text-anchor="middle">'+num(point.pageViews)+'</text>':'';
        return '<circle class="djoms-wix-chart-view-dot" cx="'+px+'" cy="'+py+
          '" r="5"><title>'+esc(dateText(point.date)+' · Page views: '+num(point.pageViews))+
          '</title></circle>'+label;
      }).join('');
      return '<g class="djoms-wix-chart-series djoms-wix-chart-'+config.style+'">'+
        paths+dot+viewPoints+'</g>';
    }).join('');
    const ready=trend.status==='reported'&&rows.length>=2;
    const illustration=ready?
      '<svg class="djoms-wix-chart-svg" viewBox="0 0 '+W+' '+H+
        '" preserveAspectRatio="none" role="img" aria-label="Wix website activity with expanded vertical values from zero to ten, and compressed larger values. Yellow page views are labeled at each marked date.">'+
        '<title>Wix website activity by '+granularity+'; vertical scale expands values 0 through 10, then changes above 10. Visitor counts are specific to each period.</title>'+
        tintedBand+yTicks.join('')+scaleDivider+
        '<line class="djoms-wix-chart-axis" x1="'+L+'" y1="'+T+'" x2="'+L+'" y2="'+(H-B)+'"></line>'+
        '<line class="djoms-wix-chart-axis" x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'"></line>'+
        xTicks.join('')+curves+'</svg>':
      '<div class="djoms-wix-chart-empty">N/A · Wix needs two verified '+granularity+
      ' measurements to draw this graph.</div>';
    const legend=configs.map(config=>
      '<span class="djoms-wix-chart-legend djoms-wix-chart-'+config.style+
      '"><i aria-hidden="true"></i>'+esc(config.name)+'</span>').join('');
    return '<div class="djoms-wix-chart" role="group" aria-label="Full-width dated Wix website activity graph">'+
      '<div class="djoms-wix-chart-header"><strong>WIX WEBSITE ACTIVITY · TRENDS</strong>'+
        '<small>'+esc(granularity==='week'?'Weekly measurements':'Daily measurements')+
        (expanded?' · 0–10 expanded (steps of 1); above 10 in steps of '+num(highStep):
          ' · 0–10 scale (steps of 1)')+'</small></div>'+
      '<div class="djoms-wix-chart-legend-row">'+legend+
        '<span class="djoms-wix-chart-not-plotted">Contact Actions: no dated series</span></div>'+
      '<div class="djoms-wix-chart-scroll">'+illustration+'</div>'+
      '<p class="djoms-wix-chart-note"><strong>Expanded 0–10 scale:</strong> The bottom section has extra height so small values are readable. '+
        'The scale changes at 10, so the spacing is intentionally not uniform. Yellow labels are actual Page Views for each date. '+
        'The lines use different units (visitors, views, seconds, %); never add date-bucket visitors to claim unique visitors for the whole period. '+
        'Missing observations are not shown as zero.</p>'+
    '</div>';
  }
  window.djomsRenderWixChart=chart;
})();