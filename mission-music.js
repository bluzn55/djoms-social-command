/* DOC JAKS Music Direction: verified listening vs sales vs website interest.
   No music play is inferred from page views or outward radio link clicks.
   Historical CSV is scored ONLY when a full current and previous UTC range
   can be reconciled; commercial streaming services remain N/A until linked. */
(function djomsMusicHealth(){
  'use strict';
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const whole=n=>Number.isSafeInteger(n)&&n>=0;
  const shift=(d,n)=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
    const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);
    return date.toISOString().slice(0,10);
  };
  const name=p=>String(p||'').replace(/\/+$/,'')||'/';
  const notRadio=p=>!['/outlaw-radio-5150','/kjak-24-7'].includes(name(p));
  function exactDays(radio,start,end){
    if(radio?.mode!=='imported'||radio?.station!=='Outlaw Radio 5150'||
      radio.durationUnit!=='seconds'||radio.timezone!=='UTC'||
      !Array.isArray(radio.rows)||!start||!end||start>end)return null;
    const byDate=new Map();
    for(const row of radio.rows){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')||
        !whole(row.connections)||!valid(row.ttslRaw)||byDate.has(row.date))return null;
      byDate.set(row.date,row);
    }
    let connections=0,seconds=0;
    for(let d=start;d<=end;d=shift(d,1)){
      const row=byDate.get(d);
      if(!row)return null; // Missing day is NOT a reported zero
      connections+=row.connections;seconds+=row.ttslRaw;
      if(!whole(connections)||!valid(seconds))return null;
    }
    return {connections,seconds,start,end};
  }
  function movement(previous,current){
    if(!valid(previous)||!valid(current))return null;
    return Math.max(-40,Math.min(40,previous===0?(current===0?0:40):(current-previous)/previous*100));
  }
  function read({period,sales}={}){
    const stored=window.djomsVerifiedReports||{};
    const interests=period?.query&&stored.interests?.query===period.query?stored.interests?.data:null;
    const radio=stored.radioImport?.status==='imported'?stored.radioImport.data:null;
    const group=interests?.connected===true&&interests.range?.start===period?.start&&
      interests.range?.end===period?.end&&Array.isArray(interests.groups)?
      interests.groups.find(x=>x?.id==='music'):null;
    const pages=group?.verified===true&&Array.isArray(group.pages)?group.pages:null;
    const radioPage=pages?.find(p=>name(p?.path)==='/outlaw-radio-5150');
    const musicOnly=pages?.filter(p=>notRadio(p?.path))||null;
    const musicPageViews=musicOnly!==null&&musicOnly.every(p=>whole(p.views))?
      musicOnly.reduce((total,p)=>total+p.views,0):null;
    const radioPageViews=whole(radioPage?.views)?radioPage.views:null;
    const ready=sales?.connected===true&&sales?.complete===true&&
      sales.range?.start===period?.start&&sales.range?.end===period?.end;
    const categories=ready?sales.onlineCategories:null;
    const groups=categories?.status==='reported'&&
      categories.itemSalesCents===sales.itemSalesCents&&
      Array.isArray(categories.groups)?categories.groups:null;
    const musicSales=groups?.find(g=>g.id==='music');
    const musicUnits=whole(musicSales?.units)?musicSales.units:null;
    const musicItemSalesCents=whole(musicSales?.itemSalesCents)?musicSales.itemSalesCents:null;
    const last=period?.start&&Number.isInteger(period?.days)&&period.days>0?
      {start:shift(period.start,-period.days),end:shift(period.start,-1)}:null;
    const current=radio&&period?.start&&period?.endInclusive?
      exactDays(radio,period.start,period.endInclusive):null;
    const previous=radio&&last?exactDays(radio,last.start,last.end):null;
    const signals=current&&previous?[
      {label:'Verified Radio.co streaming connections',weight:70,
        previous:previous.connections,current:current.connections},
      {label:'Verified Radio.co listening seconds',weight:30,
        previous:previous.seconds,current:current.seconds}
    ].filter(e=>valid(e.previous)&&valid(e.current)).map(e=>({...e,movement:movement(e.previous,e.current)})):[];
    return {
      status:signals.length?'reported':'unavailable',
      current:current||null,previous:previous||null,
      signals,radioImport:radio?{
        start:radio.range?.start??null,end:radio.range?.end??null,
        connections:whole(radio.summary?.connections)?radio.summary.connections:null,
        averageDurationSeconds:valid(radio.summary?.averageDurationRaw)?radio.summary.averageDurationRaw:null,
        timezone:'UTC'}:null,
      musicPageViews,radioPageViews,musicUnits,musicItemSalesCents,
      spotifyStreams:null,appleMusicStreams:null,youtubeMusicStreams:null,
      uniqueRadioListeners:null,
      note:signals.length?
        'Complete Radio.co imported CSV UTC windows. Streaming connections and duration, not unique listeners.':
        'Radio.co historical import does not cover both selected and preceding UTC dates. Current listening direction N/A.',
      caveat:'Music purchases are already included in the main paid Wix sales stage; do not score them twice. Page views and radio link clicks are not confirmed streams.'
    };
  }
  window.djomsMusicEvidence=read;
})();