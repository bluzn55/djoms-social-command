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
    const W=1200,H=356,L=65,R=20,T=24,B=52;
    const plotWidth=W-L-R,plotHeight=H-T-B;
    const measurements=configs.flatMap(config=>rows
      .map(row=>valid(row[config.key])?config.value(row[config.key]):null).filter(valid));
    const peak=Math.max(0,...measurements);
    const increments=[10,20,50,100,200,500,1000,2000,5000,10000,20000,50000,100000,200000,500000,1000000];
    const step=increments.find(v=>Math.ceil(peak/v)<=7)||
      Math.ceil(peak/7000000)*1000000;
    const limit=Math.max(step,Math.ceil(peak/step)*step);
    const yFor=value=>T+plotHeight-(value/limit)*plotHeight;
    const num=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
    const yTicks=[];
    for(let n=0;n<=limit+step/1000;n+=step) {
      const y=yFor(n).toFixed(1);
      yTicks.push('<g><line class="djoms-wix-chart-grid" x1="'+L+'" x2="'+(W-R)+
        '" y1="'+y+'" y2="'+y+'"></line><text class="djoms-wix-chart-y-label" x="'+(L-12)+
        '" y="'+(+y+5).toFixed(1)+'" text-anchor="end">'+num(n)+'</text></g>');
    }
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
    const curves=configs.map(config=>{
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
      const dot=lastPoint?'<circle cx="'+xFor(lastPoint.date).toFixed(1)+
        '" cy="'+yFor(lastPoint.value).toFixed(1)+'" r="4"><title>'+
        esc(config.name+' · '+dateText(lastPoint.date)+' · '+
          (config.key==='bounceRate'?(lastPoint.value).toFixed(1)+'%':
           config.key==='avgStaySeconds'?(lastPoint.value).toFixed(0)+' sec':num(lastPoint.value)))+
        '</title></circle>':'';
      return '<g class="djoms-wix-chart-series djoms-wix-chart-'+config.style+'">'+
        paths+dot+'</g>';
    }).join('');
    const ready=trend.status==='reported'&&rows.length>=2;
    const illustration=ready?
      '<svg class="djoms-wix-chart-svg" viewBox="0 0 '+W+' '+H+
        '" preserveAspectRatio="none" role="img" aria-label="Wix website visitors, returning visitors, page views, average stay and bounce rate against actual calendar dates">'+
        '<title>Wix website activity by '+granularity+'; shared numbered scale. Visitor counts are specific to each period.</title>'+
        yTicks.join('')+
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
        ' · numbered scale: '+num(step)+' per line</small></div>'+
      '<div class="djoms-wix-chart-legend-row">'+legend+
        '<span class="djoms-wix-chart-not-plotted">Contact Actions: no dated series</span></div>'+
      '<div class="djoms-wix-chart-scroll">'+illustration+'</div>'+
      '<p class="djoms-wix-chart-note">Shared vertical scale: people, page views, seconds of average stay, and bounce percentage points. '+
        'These have different units. A day or week measures its own visitors; do not add them to calculate unique visitors for the entire selected period. '+
        'Unavailable points are not shown as zero.</p>'+
    '</div>';
  }
  window.djomsRenderWixChart=chart;
})();