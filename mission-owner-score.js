/* DJOMS Social Command · Owner-first 100-point direction index.
   A directional model for verified online signals, NOT company profit.
   Each stage has a baseline of 100; evidence changes it up or down.
   Missing Last/Current pairs stay N/A and are never scored as 100.
   Sections have 100 importance points altogether, but metric percentages
   themselves are NOT added together as a purported business growth rate. */
(function ownerScoreModule(){
  'use strict';
  const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
  // Social influence is meaningful but cannot overwhelm measured store outcomes.
  // The six existing site boxes stay as they are; SOCIAL is a seventh
  // independently verified contributor to the owner direction index.
  const WEIGHTS=[
    {id:'search',name:'SEARCH',weight:15},
    {id:'sources',name:'TRAFFIC',weight:15},
    {id:'visitors',name:'VISITORS',weight:20},
    {id:'engagement',name:'ENGAGE',weight:10},
    {id:'social',name:'SOCIAL',weight:15},
    {id:'actions',name:'ACTIONS',weight:10},
    {id:'sales',name:'SALES',weight:15}
  ];
  const tone=score=>!Number.isInteger(score)?'unknown':
    score>100?'up':score<100?'down':'hold';
  // +/-40-point cap limits extreme changes from tiny visitor bases, yet
  // displays any sufficiently meaningful (>=0.5 point) move off 100.
  function movement(previous,current,inverse=false){
    if(!valid(previous)||!valid(current))return null;
    let change=previous===0?(current===0?0:40):(current-previous)/previous*100;
    if(inverse)change=-change;
    return Number.isFinite(change)?Math.min(40,Math.max(-40,change)):null;
  }
  function section(meta,signals){
    const evidence=signals.map(row=>({
      label:row.label,weight:row.weight,
      movement:typeof row.movement==='number'&&Number.isFinite(row.movement)
        ?Math.max(-40,Math.min(40,row.movement))
        :movement(row.previous,row.current,row.inverse===true)
    })).filter(v=>v.movement!==null&&v.weight>0);
    const used=evidence.reduce((sum,m)=>sum+m.weight,0);
    const score=used>0?Math.round(100+
      evidence.reduce((sum,m)=>sum+m.movement*m.weight,0)/used):null;
    return {...meta,score,tone:tone(score),status:tone(score),
      measured:evidence.length,metricWeight:used,evidence};
  }
  function evaluate(site,ga4,seo,sales,period,social){
    const wix=site?.connected===true;
    const cmp=wix?site.metricComparisons||{}:{};
    const current=field=>wix&&valid(site?.[field])?site[field]:null;
    const compare=(name,field=name)=>({
      previous:cmp[name]?.previous??null,
      current:current(field)
    });
    const visitors={
      previous:cmp.visitors?.previousVisitors??null,
      current:current('visitors')??cmp.visitors?.currentVisitors??null
    };
    const returns={
      previous:cmp.returningVisitors?.previous??null,
      current:cmp.returningVisitors?.current??null
    };
    const gc=seo?.status==='connected'&&seo.comparison?.status==='reported'?
      seo.comparison:null;
    const gm=gc?seo.metrics||{}:{};
    const searchPair=name=>({
      previous:gc?.[name]?.previous??null,current:gm[name]??null
    });
    const impressions=searchPair('impressions'),clicks=searchPair('clicks');
    const ctr={
      previous:gc?.ctr?.previous??(valid(impressions.previous)&&
        impressions.previous>0&&valid(clicks.previous)?
        clicks.previous/impressions.previous:null),
      current:gm.ctr??null
    };
    const gaCmp=ga4?.status==='connected'&&ga4.actions?.status==='reported'&&
      ga4.actions.comparison?.status==='reported'?
      ga4.actions.comparison.counts||{}:{};
    const eventPair=name=>({
      previous:gaCmp?.[name]?.previous??null,
      current:gaCmp?.[name]?.current??null
    });
    const salesCmp=sales?.salesComparison;
    const goodSales=sales?.connected===true&&sales?.complete===true&&
      sales?.range?.start===period?.start&&sales?.range?.end===period?.end&&
      salesCmp?.status==='reported'&&salesCmp?.previousRange?.end===sales.range.start&&
      ['paidOrders','itemSalesCents'].every(key=>
        Number.isSafeInteger(salesCmp.previous?.[key])&&salesCmp.previous[key]>=0&&
        Number.isSafeInteger(salesCmp.current?.[key])&&salesCmp.current[key]>=0&&
        salesCmp.current[key]===sales[key]);
    const salesPair=field=>({
      previous:goodSales?salesCmp.previous[field]:null,
      current:goodSales?salesCmp.current[field]:null
    });
    const stages=[
      section(WEIGHTS[0],[
        {label:'Google search clicks',weight:50,...clicks},
        {label:'Google search appearances',weight:25,...impressions},
        {label:'Google click-through rate',weight:15,...ctr},
        {label:'Google average position',weight:10,inverse:true,...searchPair('position')}
      ]),
      section(WEIGHTS[1],[
        {label:'Wix sessions',weight:100,...compare('sessions')}
      ]),
      section(WEIGHTS[2],[
        {label:'Wix visitors',weight:75,...visitors},
        {label:'Page views',weight:20,...compare('pageViews')},
        {label:'Returning visitors',weight:5,...returns}
      ]),
      section(WEIGHTS[3],[
        {label:'Average website stay',weight:65,...compare('avgTimeSeconds')},
        {label:'Bounce rate',weight:25,inverse:true,...compare('bounceRate')},
        {label:'Pages per session',weight:10,...compare('pagesPerSession')}
      ]),
      section(WEIGHTS[4],
        social?.status==='reported'&&Array.isArray(social.scoreSignals)
          ?social.scoreSignals:[]),
      section(WEIGHTS[5],[
        {label:'Form submission events',weight:35,...eventPair('formSubmit')},
        {label:'Sign-up events (not verified Krewe members)',weight:25,...eventPair('signUp')},
        {label:'Add-to-cart events',weight:20,...eventPair('addToCart')},
        {label:'Checkout start events',weight:15,...eventPair('beginCheckout')},
        {label:'File download events',weight:5,...eventPair('fileDownload')}
      ]),
      section(WEIGHTS[6],[
        {label:'Gross paid web item sales',weight:70,...salesPair('itemSalesCents')},
        {label:'Paid web orders',weight:30,...salesPair('paidOrders')}
      ])
    ];
    const found=stages.filter(v=>v.score!==null);
    const availableWeight=found.reduce((sum,v)=>sum+v.weight,0);
    // Demand 50+ importance points of actual comparisons before an overall
    // FORWARD/BACKWARD call. N/A stages are excluded, not counted as neutral.
    const score=availableWeight>=50?Math.round(found.reduce(
      (sum,v)=>sum+v.score*v.weight,0)/availableWeight):null;
    const status=tone(score);
    const verdict=status==='up'?'FORWARD':
      status==='down'?'BACKWARD':status==='hold'?'AT 100':'UNVERIFIED';
    const distance=score===null||score===100?0:
      7+Math.min(36,Math.abs(score-100)*.9);
    const position=score===null?50:50-Math.sign(score-100)*distance;
    return {score,kind:status,verdict,position,stages,
      covered:found.length,availableWeight,totalWeight:100,
      incomplete:found.length<stages.length,
      note:'Verified online-activity direction only. Social compares as-of-now per-post '+
        'lifetime results on published-post cohorts, not social interactions by date; older posts '+
        'have had more time to accumulate engagement. X manual numbers are not scored. '+
        'Comparisons are normalized and capped. Not profit or company-wide growth.'};
  }
  window.djomsOwnerScore=evaluate;
  window.djomsOwnerScoreWeights=WEIGHTS.map(({id,name,weight})=>({id,name,weight}));
})();