/* Free-chapter reporting only. The existing PDF, link and Wix site are unchanged. */
(function () {
  'use strict';
  const VERSION = '2026-10-05.chapter.1';
  const TARGET = 'https://www.docjaks.com/_files/ugd/cf21c8_27ee63f049e5479b8d37c885f638bb2b.pdf';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const count = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) : 'Not available';
  const active = new Map();
  const CSS = `
.wda .bcc{border-top:2px solid #9c742e;margin-top:20px;padding-top:18px;min-width:0}
.wda .bcc h5{font:700 21px/1.3 Arial,sans-serif;margin:0 0 10px}
.wda .bcc p{font-size:16px;line-height:1.5;margin:10px 0}
.wda .bcc-status{display:block;border:1px solid #bc8932;background:#fff1c9;color:#61451c;border-radius:6px;padding:10px 12px;font-weight:700}
.wda .bcc-status.reported{background:#edf1e9;border-color:#496b60;color:#304e42}
.wda .bcc-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}
.wda .bcc-metrics>div{border:1px solid #d7c6a5;border-radius:7px;background:#fffaf0;padding:12px;min-width:0}
.wda .bcc-metrics small{font-size:15px;display:block}.wda .bcc-metrics b{display:block;font-size:23px;margin-top:5px;overflow-wrap:anywhere}
.wda .bcc-note{color:#625238;font-size:15px}.wda .bcc details{margin-top:14px}.wda .bcc summary{font-size:16px}
.wda .bcc a{color:#54401e;text-decoration:underline}.wda .bcc button{margin:8px 0;font-size:16px}
.wda .bcc-scroll{overflow-x:auto}.wda .bcc table{min-width:460px}
.wda .bcc svg{display:block;min-width:430px;width:100%}.wda .bcc svg text{fill:#403521;font:15px Arial,sans-serif}
.wda .bcc-grid{stroke:#dfd0b5;stroke-width:1}.wda .bcc-line{stroke:#76573e;stroke-width:3}.wda .bcc-point{fill:#76573e}
`;
  function graph(rows) {
    if (!rows.length) return '';
    const width = 600, height = 240, left = 46, right = 40, top = 36, bottom = 58;
    const max = Math.max(1, ...rows.map(r => r.clicks));
    const step = Math.max(1, Math.ceil(max / 4));
    const ceiling = Math.ceil(max / step) * step;
    const x = i => rows.length === 1 ? width / 2 : left + i * (width - left - right) / (rows.length - 1);
    const y = v => height - bottom - v / ceiling * (height - top - bottom);
    let svg = '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Reported free chapter clicks by date"><title>Free chapter clicks by date</title><desc>Missing dates are not treated as zero. Only adjacent reported dates are connected.</desc>';
    for (let v = 0; v <= ceiling; v += step) svg += '<line class="bcc-grid" x1="'+left+'" y1="'+y(v)+'" x2="'+(width-right)+'" y2="'+y(v)+'"></line><text x="'+(left-10)+'" y="'+(y(v)+5)+'" text-anchor="end">'+v+'</text>';
    rows.forEach((r, i) => {
      const p = rows[i-1];
      if (p && Date.parse(r.date+'T00:00:00Z')-Date.parse(p.date+'T00:00:00Z') === 86400000) svg += '<line class="bcc-line" x1="'+x(i-1)+'" y1="'+y(p.clicks)+'" x2="'+x(i)+'" y2="'+y(r.clicks)+'"></line>';
      svg += '<circle class="bcc-point" cx="'+x(i)+'" cy="'+y(r.clicks)+'" r="4"><title>'+esc(r.date+': '+count(r.clicks)+' clicks')+'</title></circle><text x="'+x(i)+'" y="'+(y(r.clicks)-12)+'" text-anchor="middle">'+esc(count(r.clicks))+'</text><text x="'+x(i)+'" y="'+(height-26)+'" text-anchor="middle">'+esc(r.date.slice(5))+'</text>';
    });
    return '<div class="bcc-scroll">'+svg+'</svg></div>';
  }
  function draw(box, data, error) {
    let output = '<h5>FREE FIRST CHAPTER</h5>';
    if (error) output += '<p class="bcc-status" role="alert">'+esc(error)+'</p>';
    else if (!data) output += '<p class="bcc-status" role="status">Checking Wix chapter-link clicks...</p>';
    else {
      const reported = data.status === 'reported' && data.clicks > 0;
      output += '<p class="bcc-status '+(reported?'reported':'')+'">'+(reported?'PDF-link clicks reported':'Waiting for first reported click')+'</p>';
      const unique = !reported ? 'Waiting' : data.uniqueClickers === null && data.buttons?.length > 1 ? 'See buttons' : count(data.uniqueClickers);
      output += '<div class="bcc-metrics"><div><small>Free chapter clicks</small><b>'+ (reported?esc(count(data.clicks)):'Waiting')+'</b></div><div><small>Unique clickers</small><b>'+esc(unique)+'</b></div></div>';
      output += '<p class="bcc-note">Tracking enabled October 5, 2026. Earlier activity cannot be recovered by enabling it now. Wix reports can take a couple of hours to appear.</p>';
      if (data.partial) output += '<p class="bcc-status">Some results are incomplete. Counts are not being guessed.</p>';
      if (reported && data.dailyVerified) output += graph(data.daily || []);
      else output += '<p class="bcc-note">The daily line graph will appear when dated clicks reconcile with this report.</p>';
      if (data.buttons?.length) output += '<details><summary>Reported chapter buttons ('+data.buttons.length+')</summary><div class="bcc-scroll"><table><caption>Unique clickers can overlap across buttons. Do not add them together.</caption><thead><tr><th>Button / page</th><th>Clicks</th><th>Unique clickers</th></tr></thead><tbody>'+data.buttons.map(b=>'<tr><td>'+esc(b.title || b.type || 'Chapter link')+'<small>'+esc(b.page || '')+'</small></td><td>'+esc(count(b.clicks))+'</td><td>'+esc(count(b.uniqueClickers))+'</td></tr>').join('')+'</tbody></table></div></details>';
      output += '<p class="bcc-note">Report starts '+esc(data.range.start)+'; includes today so far. Last checked '+esc(new Date(data.checkedAt).toLocaleString('en-US',{timeZone:'America/Chicago'}))+' Central.</p>';
    }
    output += '<p><b>Clicks, not chapters read.</b> This does not measure reading time, completed downloads, or finishing the chapter.</p><button type="button" class="bcc-recheck">Check chapter clicks</button><details><summary>Which PDF is tracked?</summary><p><a href="'+TARGET+'" target="_blank" rel="noopener noreferrer">View the linked first-chapter PDF</a></p><p class="bcc-note">Only matching website button/link clicks are counted. Direct PDF visits and shared PDF links are not measured here. Wix cookie-consent and tracking limits still apply. No PDF content is changed.</p></details>';
    box.innerHTML = output;
    box.querySelector('.bcc-recheck').addEventListener('click', () => load(box));
  }
  async function load(box) {
    if (box.dataset.loading === '1') return;
    box.dataset.loading = '1';
    const panel = box.closest('#wdaInterests');
    const days = panel?.querySelector('[data-interest-days][aria-pressed="true"]')?.dataset.interestDays === '28' ? '28' : '7';
    draw(box, null, null);
    try {
      let job = active.get(days);
      if (!job) {
        job = (async () => {
          const response = await fetch('/api/meta/chapter-clicks?days='+days, { credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(45000) });
          const data = await response.json();
          if (!response.ok || !data.connected || !Array.isArray(data.buttons) || data.target !== TARGET) throw new Error(response.status === 401 ? 'Sign in to read the chapter report.' : 'Chapter-click data could not be checked. Other reports are unchanged.');
          return data;
        })().finally(() => active.delete(days));
        active.set(days, job);
      }
      const data = await job;
      if (box.isConnected) draw(box, data, null);
    } catch (e) {
      if (box.isConnected) draw(box, null, e.name === 'TimeoutError' ? 'Wix took too long. Try this report again later.' : e.message || 'Chapter-click data could not be checked.');
    } finally { delete box.dataset.loading; }
  }
  function start() {
    const root = document.getElementById('content');
    if (!root) return;
    if (!document.getElementById('bookChapterStyles')) {
      const style = document.createElement('style');
      style.id = 'bookChapterStyles'; style.textContent = CSS; document.head.appendChild(style);
    }
    const attach = () => root.querySelectorAll('.wda .wi-card.wi-book').forEach(card => {
      if (card.querySelector('.bcc')) return;
      const box = document.createElement('section'); box.className = 'bcc'; box.dataset.version = VERSION;
      box.setAttribute('aria-label', 'Free first chapter link clicks'); card.appendChild(box); load(box);
    });
    new MutationObserver(attach).observe(root,{childList:true,subtree:true});
    attach();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
