/* Radio.co listener analytics from the station's CSV exports.
   Import is owner-only. New and returning listeners remain unknown. */
(function(){
  'use strict';
  const cache=new Map(),pending=new Map(),conflicts=new Map();
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const good=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
  const number=x=>good(x)?new Intl.NumberFormat('en-US').format(x):'N/A';
  const day=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')?x.slice(5,7)+'-'+x.slice(8,10)+'-'+x.slice(0,4):'N/A';
  const time=x=>{
    if(!good(x))return 'N/A';
    const n=Math.floor(x),h=Math.floor(n/3600),m=Math.floor(n%3600/60);
    return (h?h+'h ':'')+(h||m?m+'m ':'')+n%60+'s';
  };
  function country(c){
    try{
      const v=String(c).toUpperCase();
      return /^[A-Z]{2}$/.test(v)&&Intl.DisplayNames?
        new Intl.DisplayNames(['en'],{type:'region'}).of(v):String(c);
    }catch{return String(c);}
  }
  function refreshPanels(q){
    document.querySelectorAll('.mj-radio-intel').forEach(node=>{
      if(node.dataset.rliQuery!==q)return;
      const was=[...node.querySelectorAll('.rli-details')].map(x=>x.open);
      node.innerHTML=content(q);
      node.querySelectorAll('.rli-details').forEach((x,i)=>{if(was[i]!==undefined)x.open=was[i];});
    });
  }
  function getReport(q,force=false){
    if(pending.has(q))return pending.get(q);
    const old=cache.get(q);
    if(!force&&old&&Date.now()-old.at<90000)return Promise.resolve(old.data);
    const job=(async()=>{
      const r=await fetch('/api/meta/radio-intelligence?'+q,{
        credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)});
      const data=await r.json().catch(()=>null);
      if(!r.ok||data?.status!=='reported')throw new Error(data?.error||'Radio.co imported report unavailable.');
      cache.set(q,{data,at:Date.now()});
      document.dispatchEvent(new CustomEvent('djoms:verified-report',
        {detail:{source:'radioIntelligence'}}));
      return data;
    })().catch(e=>{
      cache.set(q,{data:null,error:String(e?.message||'Radio.co report unavailable'),at:Date.now()});
      return null;
    }).finally(()=>{
      pending.delete(q);
      refreshPanels(q);
    });
    pending.set(q,job);
    return job;
  }
  window.djomsRadioListenerData=p=>cache.get(p?.query)?.data||null;
  function kpi(title,val,note){
    return '<div class="rli-kpi"><span>'+esc(title)+'</span>'+
      '<strong>'+esc(val)+'</strong><small>'+esc(note)+'</small></div>';
  }
  function group(title,values,formatter){
    const list=Object.entries(values||{}).filter(([,n])=>good(n)&&n>0)
      .sort((a,b)=>b[1]-a[1]);
    return '<section><h5>'+esc(title)+'</h5>'+
      (list.length?list.map(([key,n])=>'<p><span>'+esc(formatter?formatter(key):key)+
        '</span><b>'+number(n)+' connections</b></p>').join(''):
        '<p>Not available for these dates.</p>')+'</section>';
  }
  function daily(rows){
    if(!rows.length)return '<p>No imported day-level data yet.</p>';
    return '<div class="rli-table-wrap"><table><thead><tr>'+
      '<th>Date (UTC)</th><th>Connections</th><th>Daily unique</th>'+
      '<th>Listening time</th><th>Peak</th></tr></thead><tbody>'+
      rows.slice(-50).reverse().map(r=>
        '<tr><td>'+day(r.date)+'</td><td>'+number(r.connections)+
        '</td><td>'+number(r.dailyUnique)+'</td><td>'+time(r.listeningSeconds)+
        (r.durationConflict?' ⚠':'')+'</td><td>'+number(r.peak)+'</td></tr>').join('')+
      '</tbody></table></div>';
  }
  function hourly(rows){
    if(!rows.length)return '<p>No hourly data imported. Export one calendar day from Radio.co Overview to see hour-by-hour activity when provided.</p>';
    return '<div class="rli-table-wrap"><table><thead><tr>'+
      '<th>Date</th><th>Hour (Central)</th><th>Connections</th><th>Listening time</th></tr></thead><tbody>'+
      rows.slice(-48).map(r=>{
        const hour=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',hour12:true}).format(new Date(r.stamp));
        return '<tr><td>'+day(r.date)+'</td><td>'+esc(hour)+'</td><td>'+
          number(r.connections)+'</td><td>'+time(r.listeningSeconds)+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  function content(q){
    const stored=cache.get(q),data=stored?.data||null,s=data?.summary||null;
    const covered=data?
      number(s?.overviewDays)+'/'+number(s?.requestedDays)+' UTC overview days · '+
      number(s?.listeningDays)+'/'+number(s?.requestedDays)+' listening days':
      'No complete selected-period import checked yet';
    return '<div class="rli-toolbar"><b>OUTLAW RADIO 5150 · LISTENER REPORTS</b>'+
      '<small>'+esc(covered)+' · Manual Radio.co CSV, not live statistics</small></div>'+
      (data?'<details class="rli-details"><summary>DAILY LISTENING · '+
        number(data.rows?.length)+' IMPORTED DAYS</summary>'+
        daily(data.rows||[])+'</details>'+
        '<details class="rli-details"><summary>TIME OF DAY · HOURLY LISTENING'+
        (data.hourly?.length?' · '+number(data.hourly.length)+' ROWS':' · N/A')+
        '</summary>'+hourly(data.hourly||[])+'</details>'+
        '<details class="rli-details"><summary>COUNTRIES · DEVICES · LISTENING APPS</summary>'+
          '<div class="rli-groups">'+group('Country',s?.countries,country)+
          group('Device',s?.devices)+group('Client / app',s?.clients)+
          '</div><p class="rli-note">These figures count stream connections, not individual people.</p></details>':
        '<p class="rli-note">'+esc(stored?.error||'Checking saved Radio.co listening reports…')+'</p>')+
      '<details class="rli-details rli-import-details">'+
        '<summary>IMPORT / UPDATE RADIO.CO REPORT · OVERVIEW OR TTSL CSV</summary>'+
        '<section class="rli-upload"><h5>IMPORT RADIO.CO REPORT</h5>'+
          '<p>Export an Overview or TTSL CSV from Radio.co Statistics. '+
          'The selected daily and listening figures update after import. '+
          'Missing UTC days remain unreported, not zero.</p>'+
          '<div class="rli-controls"><label>Report type<select data-rli-kind>'+
            '<option value="overview">Overview · connections / geography / devices</option>'+
            '<option value="ttsl">TTSL · listening duration</option></select></label>'+
            '<label>CSV file<input type="file" data-rli-file accept=".csv,text/csv"></label>'+
            '<button type="button" data-rli-import>IMPORT CSV</button></div>'+
          '<p class="rli-status" role="status"></p><div class="rli-conflict" hidden></div>'+
        '</section></details>'+
      '<p class="rli-note">Daily Radio.co dates are UTC. The full period and growth trend '+
      'remain N/A until every selected and comparison day is imported. '+
      'Period-unique, new and returning listeners cannot be derived from these aggregate files. ' +
      'Your own listening sessions may also be included.</p>';
  }
  window.djomsRadioListenerSection=period=>{
    const q=period?.query;
    if(!q)return '<section class="mj-radio-intel">Select your report dates.</section>';
    if(typeof owner!=='undefined'&&owner&&!pending.has(q)&&
      (!cache.has(q)||Date.now()-cache.get(q).at>90000))
      queueMicrotask(()=>getReport(q));
    return '<section class="mj-radio-intel" data-rli-query="'+esc(q)+'">'+content(q)+'</section>';
  };
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-rli-import],[data-rli-confirm]');
    if(!button)return;
    const panel=button.closest('.mj-radio-intel');
    if(!panel)return;
    event.preventDefault();
    if(button.disabled)return;
    const q=panel.dataset.rliQuery,status=panel.querySelector('.rli-status');
    const confirming=button.hasAttribute('data-rli-confirm');
    let file=confirming?conflicts.get(q):null;
    if(!confirming){
      const picked=panel.querySelector('[data-rli-file]')?.files?.[0];
      if(!picked){status.textContent='Choose the downloaded CSV file first.';return;}
      if(picked.size>350000){status.textContent='CSV must be smaller than 350 KB.';return;}
      file={filename:picked.name,kind:panel.querySelector('[data-rli-kind]').value,
        csv:await picked.text()};
    }
    if(!file){status.textContent='Please choose the CSV again.';return;}
    button.disabled=true;status.textContent='Checking Radio.co report…';
    try{
      const result=await api('radio-intelligence',{
        ...file,...(confirming?{replaceConflicts:true}:{})});
      if(result.status==='review_required'){
        conflicts.set(q,file);
        const box=panel.querySelector('.rli-conflict');
        box.hidden=false;
        box.innerHTML='<b>'+number(result.conflictCount)+' previously saved days would change.</b> '+
          '<button type="button" data-rli-confirm>REPLACE THOSE DATES</button>';
        status.textContent='No dates changed. Review conflicts before replacing.';
      }else if(result.status==='saved'){
        conflicts.delete(q);
        cache.delete(q);
        await getReport(q,true);
        const box=[...document.querySelectorAll('.mj-radio-intel')]
          .find(node=>node.dataset.rliQuery===q);
        if(box)box.querySelector('.rli-status').textContent='Imported '+number(result.days)+' dates from '+file.filename+'.';
      }else throw new Error('Import not confirmed.');
    }catch(e){status.textContent=String(e?.message||'Radio.co import failed.');}
    finally{button.disabled=false;}
  });
  const style=document.createElement('style');
  style.id='rliStyles';
  style.textContent="\n.mj-radio-intel{margin:15px 0;padding:15px;border:1px solid #d0bc98;border-radius:8px;background:#fffaf1;color:#2e271b;font:15px/1.5 Arial,sans-serif}\n.rli-title{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}.rli-title b{font-size:18px}.rli-title small,.rli-note{font-size:13px;color:#584934}\n.rli-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.rli-kpi{padding:10px;background:#fff;border:1px solid #e2d4bb;border-radius:7px;min-width:0}\n.rli-kpi span,.rli-kpi small{display:block;font-size:11px;font-weight:700;color:#63523b}.rli-kpi strong{display:block;font-size:25px;margin:4px 0;overflow-wrap:anywhere}\n.rli-details{border-top:1px solid #dfcfb2;margin-top:12px;padding-top:10px}.rli-details summary{font-weight:bold;cursor:pointer}.rli-table-wrap{max-height:380px;overflow:auto;margin-top:8px}\n.rli-table-wrap table{width:100%;border-collapse:collapse;min-width:530px}.rli-table-wrap th,.rli-table-wrap td{font-size:13px;text-align:left;padding:8px;border-bottom:1px solid #eadfcb;white-space:nowrap}.rli-table-wrap th{background:#f2e6d1}\n.rli-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}.rli-groups section{background:#fff;border:1px solid #ebdec9;padding:10px;border-radius:6px}.rli-groups h5{font-size:14px;margin:0 0 8px}.rli-groups p{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin:4px 0}\n.rli-upload{background:#f5e9d5;padding:12px;border-radius:8px;margin-top:12px;border:1px solid #b99c6d}.rli-upload h5{margin:0;font-size:15px}.rli-upload p{font-size:13px}.rli-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:end}\n.rli-controls label{font-size:12px;font-weight:bold}.rli-controls select,.rli-controls input{display:block;max-width:100%;margin-top:5px;padding:8px;font:13px Arial}.rli-controls button,.rli-conflict button{padding:10px 14px;background:#71501f;border:1px solid #71501f;color:white;border-radius:5px;font-weight:bold;cursor:pointer}.rli-controls button:disabled{opacity:.5}\n.rli-status{font-weight:bold!important}.rli-conflict[hidden]{display:none!important}\n@media(max-width:730px){.rli-kpis,.rli-groups{grid-template-columns:repeat(2,minmax(0,1fr))}.rli-kpi strong{font-size:21px}}\n";
  document.head.appendChild(style);
})();
