/* Imported KJAK station report. Does not collect playback or alter other reports. */
(function () {
  'use strict';
  const VERSION = '2026-10-05.radio-import.1';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const count = v => valid(v) ? new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(v) : 'Not available';
  const day = (v, weekday = false) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? new Date(v + 'T12:00:00Z').toLocaleDateString('en-US', {timeZone:'UTC',month:'short',day:'numeric',...(weekday?{weekday:'short'}:{})}) : 'Unknown date';
  function time(v) {
    if (!valid(v)) return 'Not available';
    const s = Math.round(v), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return (h ? h + 'h ' : '') + (h || m ? m + 'm ' : '') + s % 60 + 's';
  }
  function chart(rows, key, title) {
    const max = Math.max(1, ...rows.map(r => valid(r[key]) ? r[key] : 0));
    const step = Math.max(1, Math.ceil(max / 6));
    const ceiling = Math.max(1, Math.ceil(max / step) * step);
    const W=860,H=270,L=54,R=42,T=40,B=75;
    const x=i=>rows.length===1?W/2:L+i*(W-L-R)/Math.max(rows.length-1,1);
    const y=n=>T+(1-n/ceiling)*(H-T-B);
    let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title><desc>Daily UTC values. Whole-number scale, starting at zero. Dashed links touch a partial or unverified boundary day.</desc>';
    for(let n=0;n<=ceiling;n+=step) svg+='<line class="wrr-grid" x1="'+L+'" y1="'+y(n)+'" x2="'+(W-R)+'" y2="'+y(n)+'"/><text class="wrr-tick" x="'+(L-10)+'" y="'+(y(n)+5)+'" text-anchor="end">'+n+'</text>';
    rows.forEach((r,i)=>{
      const prev=rows[i-1],value=r[key];
      const contiguous=prev && Date.parse(r.date+'T00:00:00Z')-Date.parse(prev.date+'T00:00:00Z')===86400000;
      if(contiguous&&valid(value)&&valid(prev[key])) svg+='<line class="wrr-line'+(r.coverage==='daily-row'&&prev.coverage==='daily-row'?'':' wrr-dashed')+'" x1="'+x(i-1)+'" y1="'+y(prev[key])+'" x2="'+x(i)+'" y2="'+y(value)+'"/>';
      if(valid(value)) svg+='<circle class="wrr-dot" cx="'+x(i)+'" cy="'+y(value)+'" r="5"><title>'+esc(day(r.date,true)+': '+count(value))+'</title></circle><text class="wrr-value" x="'+x(i)+'" y="'+(y(value)-13)+'" text-anchor="middle">'+count(value)+'</text>';
      svg+='<text x="'+x(i)+'" y="'+(H-43)+'" text-anchor="middle">'+esc(day(r.date))+'</text>';
      if(r.coverage!=='daily-row') svg+='<text class="wrr-boundary" x="'+x(i)+'" y="'+(H-19)+'" text-anchor="middle">'+(r.coverage==='partial'?'Partial':'Boundary')+'</text>';
    });
    return '<div class="wrr-chart"><h6>'+esc(title)+'</h6><div class="wrr-chart-scroll">'+svg+'</svg></div></div>';
  }
  function breakdown(title, values, transform = v => v) {
    return '<div class="wrr-breakdown"><h6>'+esc(title)+'</h6>'+Object.entries(values || {}).filter(([,n])=>valid(n)&&n>0).sort((a,b)=>b[1]-a[1]).map(([label,n])=>'<p><span>'+esc(transform(label))+'</span><b>'+count(n)+' connections</b></p>').join('')+'</div>';
  }
  function draw(box, report) {
    const rows=report.rows, s=report.summary;
    const busiest=(s.busiestDates||[]).map(v=>day(v,true)).join(', ');
    const peaks=(s.peakDates||[]).map(v=>day(v,true)).join(', ');
    box.innerHTML='<div class="wim-block-head"><h5>KJAK 24.7 · Live Radio</h5><span class="wim-badge wim-badge-pending">Imported report · not live</span></div>'+
      '<p class="wrr-period"><b>'+esc(day(report.range.start))+' through '+esc(day(report.range.end))+', 2026 · UTC daily totals</b></p>'+
      '<p class="wim-note">This is your uploaded Radio.co report, not sample data. Listening now will not update these figures. The website 7-day / 28-day buttons do not change this import.</p>'+
      '<div class="wrr-kpis"><div><small>Recorded connections</small><strong>'+count(s.connections)+'</strong><span>Not unique people</span></div><div><small>Peak at one time</small><strong>'+count(s.peak)+'</strong><span>Highest reported daily peak</span></div><div><small>Busiest recorded day</small><strong class="wrr-date">'+esc(busiest||'No connections')+'</strong><span>'+count(s.busiestConnections)+' connections</span></div></div>'+
      '<p class="wrr-caution"><b>Baseline, not a trend yet.</b> The export includes 8 dated rows, not a complete month or year. October 5 is partial; September 28 boundary coverage is unverified. All dates stay in UTC because daily totals cannot be split accurately into Central-time hours.</p>'+
      chart(rows,'connections','Listening connections by day')+
      '<details><summary>Peak audience graph and daily details</summary>'+chart(rows,'peak','Highest simultaneous connections by day')+
      '<div class="wrr-table-scroll"><table><caption>Unique listeners apply to each day only. Do not add them to calculate unique people for the full report.</caption><thead><tr><th>Date (UTC)</th><th>Connections</th><th>Daily unique</th><th>Peak at once</th><th>Coverage</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(day(r.date,true))+'</td><td>'+count(r.connections)+'</td><td>'+count(r.dailyUnique)+'</td><td>'+count(r.peak)+'</td><td>'+(r.coverage==='partial'?'Partial day':r.coverage==='boundary-unverified'?'Boundary unverified':'Daily row')+'</td></tr>').join('')+'</tbody></table></div></details>'+
      '<div class="wrr-two">'+breakdown('Reported countries',s.countries,v=>v==='US'?'United States':v)+breakdown('Listening devices',s.devices)+'</div>'+
      '<p class="wim-note"><b>Peak audience:</b> '+count(s.peak)+' at once on '+esc(peaks||'no reported date')+'. The busiest date in this file does not establish a recurring busiest weekday.</p>'+
      '<details><summary>Listening duration: provisional estimates</summary><p class="wrr-caution"><b>CSV duration units still need confirmation.</b> The values below assume seconds. They are estimates, not verified time measurements for business decisions.</p><div class="wrr-two"><div><h6>Estimated total listening</h6><strong>'+esc(time(s.totalDurationRaw))+'</strong></div><div><h6>Estimated average / connection</h6><strong>'+esc(time(s.averageDurationRaw))+'</strong></div></div><p class="wim-note">Computed from the sum of the CSV ttsl field divided by connections, not an unweighted average of daily averages. Raw duration fields are preserved with the report.</p></details>'+
      '<details><summary>Browser breakdown and data cautions</summary>'+breakdown('Reported player clients',s.clients)+'<p class="wim-note">'+count(s.clients?.['Headless Chrome'])+' connections are labeled Headless Chrome by the source. They may be automated; this report does not prove that, or identify an attack. Counts have not been subtracted. Your own listening and repeat connections may be included.</p></details>'+
      '<details><summary>Source and future additions</summary><p class="wim-note"><b>Source:</b> '+esc(report.sourceFile)+'</p><p class="wim-note"><b>Imported:</b> '+esc(new Date(report.importedAt).toLocaleString('en-US',{timeZone:'America/Chicago'}))+' Central. One saved report; no automatic Radio.co synchronization.</p><p class="wim-note"><b>Not available from this file:</b> busiest hour, time-of-day patterns, city-level locations, current live listeners, period-wide unique listeners, and reliable monthly/yearly comparisons.</p><p class="wim-note">Later exports can extend the history. Overlapping dates must be reconciled rather than added twice.</p></details>';
    box.classList.add('wrr-loaded');
    box.dataset.radioImport=VERSION;
  }
  let cached=null, pending=null;
  function reportRequest() {
    if(cached) return Promise.resolve(cached);
    if(pending) return pending;
    pending=(async()=>{
      const response=await fetch('/api/meta/radio-report',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if(!response.ok) throw new Error(response.status===401?'Sign in to Social Command to read the radio report.':'The imported radio report could not be loaded.');
      if(data.mode!=='imported'||!Array.isArray(data.rows)||!data.summary||!data.range) throw new Error('The radio report format needs checking.');
      cached=data; return data;
    })().finally(()=>{pending=null;});
    return pending;
  }
  async function load(box) {
    box.dataset.radioImport='loading';
    box.innerHTML='<div class="wim-block-head"><h5>KJAK 24.7 · Live Radio</h5><span class="wim-badge">Reading imported report</span></div><p role="status">Loading your saved Radio.co export...</p>';
    try { const report=await reportRequest(); if(box.isConnected) draw(box,report); }
    catch(e) {
      if(!box.isConnected) return;
      box.dataset.radioImport='error';
      box.innerHTML='<h5>KJAK 24.7 · Live Radio</h5><p role="alert">'+esc(e.message)+'</p><button type="button" class="wrr-retry">Retry imported report</button><p class="wim-note">Other website measurements and song previews are unchanged.</p>';
      box.querySelector('.wrr-retry').addEventListener('click',()=>load(box));
    }
  }
  const CSS=`
.wda .wim-listening-grid:has(.wrr-loaded){grid-template-columns:1fr}
.wda .wrr-loaded{font:17px/1.5 Arial,sans-serif}
.wda .wrr-loaded h6{font:700 18px/1.35 Arial,sans-serif;margin:0 0 12px}
.wda .wrr-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0}
.wda .wrr-kpis>div{padding:16px;background:#fffdf7;border:1px solid #d4c19b;border-radius:8px;min-width:0}
.wda .wrr-kpis strong,.wda .wrr-kpis span{display:block}.wda .wrr-kpis strong{font-size:34px;line-height:1.25;margin:8px 0}.wda .wrr-kpis .wrr-date{font-size:24px}.wda .wrr-kpis small,.wda .wrr-kpis span{font-size:16px;color:#51432d}
.wda .wrr-caution{font-size:16px!important;line-height:1.55!important;background:#fff1d0;border-left:4px solid #a67a2d;padding:13px 15px}
.wda .wrr-chart{border:1px solid #d4c19b;border-radius:8px;padding:16px;margin:18px 0;background:#fffdf7;min-width:0}
.wda .wrr-chart-scroll,.wda .wrr-table-scroll{overflow-x:auto;max-width:100%}
.wda .wrr-chart svg{display:block;width:100%;min-width:690px;max-height:330px}
.wda .wrr-chart text{font:16px Arial,sans-serif;fill:#43371f}.wda .wrr-value{font-weight:700!important}.wda .wrr-chart .wrr-boundary{font-size:14px}
.wda .wrr-grid{stroke:#dfd1b9;stroke-width:1}.wda .wrr-line{stroke:#496b60;stroke-width:3;vector-effect:non-scaling-stroke}.wda .wrr-dashed{stroke-dasharray:7 5}.wda .wrr-dot{fill:#496b60;stroke:#fffdf7;stroke-width:2}
.wda .wrr-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:18px 0}.wda .wrr-breakdown{background:#fffdf7;border:1px solid #dfd1b9;border-radius:7px;padding:15px}.wda .wrr-breakdown p{display:flex;justify-content:space-between;gap:15px;font-size:16px;flex-wrap:wrap}
.wda .wrr-table-scroll table{min-width:650px;font-size:16px}.wda .wrr-table-scroll caption{font-size:15px}.wda .wrr-loaded details summary{font-size:17px;padding:10px 0}.wda .wrr-period{font-size:18px}
@media(max-width:750px){.wda .wrr-kpis,.wda .wrr-two{grid-template-columns:1fr}.wda .wrr-loaded{padding:16px}.wda .wrr-kpis .wrr-date{font-size:24px}}
`;
  function start() {
    const root=document.getElementById('content'); if(!root) return;
    if(!document.getElementById('wrrStyles')) { const style=document.createElement('style'); style.id='wrrStyles'; style.textContent=CSS; document.head.appendChild(style); }
    const check=()=>root.querySelectorAll('.wda .wim-radio:not([data-radio-import])').forEach(load);
    new MutationObserver(check).observe(root,{childList:true,subtree:true}); check();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
