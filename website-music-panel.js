/* Music / KJAK layout only. Retains the existing website measurements.
   No requests, credentials, analytics collection, or listening totals are added. */
(function () {
  'use strict';
  const VERSION = '2026-10-05.music-layout.1';
  const CSS = `
.wda .wi-cards.wim-organized > .wi-music,
.wda .wi-cards.wim-organized > .wi-general{grid-column:1/-1}
.wda .wi-music[data-music-layout]{padding:24px;background:#fffdf7}
.wda .wim-header{margin-bottom:20px}
.wda .wim-header h4{font:700 28px/1.25 Georgia,serif;margin:5px 0 9px}
.wda .wim-eyebrow{font-size:14px;letter-spacing:1px;font-weight:700;color:#496b60}
.wda .wim-header p{font-size:18px;line-height:1.5;margin:0;color:#51432d}
.wda .wim-block{min-width:0;padding:20px;border:1px solid #d7c6a5;border-radius:9px;background:#fffaf0}
.wda .wim-block h5{font:700 21px/1.3 Arial,sans-serif;margin:0}
.wda .wim-block-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.wda .wim-badge{display:inline-block;border:1px solid #c3b28e;border-radius:16px;padding:5px 11px;font:700 14px/1.3 Arial,sans-serif;background:#f3ebdc;color:#57482e}
.wda .wim-badge-pending{background:#fff0c9;border-color:#be923b;color:#725113}
.wda .wim-web-content .wi-big{font-size:36px;margin-top:8px}
.wda .wim-web-content .wi-share{margin-bottom:6px}
.wda .wim-web-content details{margin-top:8px}
.wda .wim-block .wim-note{font-size:16px;line-height:1.5;color:#625238;margin:8px 0 0}
.wda .wim-listening-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:18px}
.wda .wim-radio{border-top:4px solid #496b60}
.wda .wim-previews{border-top:4px solid #9c742e}
.wda .wim-status-copy{font-size:18px;font-weight:700;line-height:1.5;margin:10px 0 6px}
.wda .wim-source{font-size:16px;line-height:1.5;color:#625238;margin:8px 0}
.wda .wim-topics{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.wda .wim-topics span{font-size:15px;font-weight:700;border:1px solid #dccdae;background:#f6efdf;border-radius:5px;padding:7px 10px}
.wda .wim-block details{border-top:1px solid #dfd0b5;padding-top:6px;margin-top:14px}
.wda .wim-block details p{font-size:16px;line-height:1.55}
.wda .wim-rule{padding:14px 16px;margin:18px 0 0!important;border-left:4px solid #496b60;background:#edf1e9;font-size:16px!important;line-height:1.5}
@media(max-width:950px){.wda .wim-listening-grid{grid-template-columns:1fr}}
@media(max-width:700px){.wda .wi-music[data-music-layout]{padding:16px}.wda .wim-block{padding:16px}.wda .wim-header h4{font-size:25px}.wda .wim-block h5{font-size:20px}}
`;
  function decorate(card) {
    if (card.dataset.musicLayout === VERSION) return;
    const title = card.querySelector(':scope > h4');
    if (!title || !card.querySelector(':scope > .wi-big')) return;
    const subtitle = card.querySelector(':scope > .wi-subtitle');
    const body = document.createElement('div');
    body.className = 'wim-web-content';
    // Move the original nodes, preserving data, details, and event handlers.
    Array.from(card.childNodes).forEach(node => {
      if (node !== title && node !== subtitle) body.appendChild(node);
    });
    card.dataset.musicLayout = VERSION;
    const header = document.createElement('div');
    header.className = 'wim-header';
    header.innerHTML = '<span class="wim-eyebrow">ALL MUSIC ACTIVITY</span>';
    header.appendChild(title);
    const intro = document.createElement('p');
    intro.textContent = 'Website visits, live radio and song previews. Together here, measured separately.';
    header.appendChild(intro);
    const web = document.createElement('section');
    web.className = 'wim-block wim-web';
    web.setAttribute('aria-label', 'Music website visits');
    web.innerHTML = '<div class="wim-block-head"><h5>Website Visits</h5><span class="wim-badge">Wix page activity</span></div><p class="wim-note">These are visits to music pages, not confirmed listens. The 7-day / 28-day selection above applies here.</p>';
    web.appendChild(body);
    const listening = document.createElement('div');
    listening.className = 'wim-listening-grid';
    listening.innerHTML = `
<section class="wim-block wim-radio" aria-label="KJAK live radio listening">
  <div class="wim-block-head"><h5>KJAK 24.7 · Live Radio</h5><span class="wim-badge wim-badge-pending">Not connected</span></div>
  <p class="wim-status-copy">Radio listening figures will appear here.</p>
  <p class="wim-source">Source to connect: Radio.co station reports. Includes the live broadcast played from this website or other players.</p>
  <div class="wim-topics" aria-label="Planned radio measurements"><span>Time of day</span><span>Listening duration</span><span>Listener locations</span><span>Current &amp; peak connections</span></div>
  <p class="wim-note">No station listening data has been loaded into this box.</p>
  <details><summary>Radio reporting plan</summary><p>Connect verified station reports for listening by hour, session duration, total listening hours, approximate locations and devices, wherever the source supports them. Confirm report dates and time zones before comparing periods.</p><p>Website radio connections are part of the station audience, not an extra count to add to the station total.</p></details>
</section>
<section class="wim-block wim-previews" aria-label="Individual website song previews">
  <div class="wim-block-head"><h5>Website Song Previews</h5><span class="wim-badge wim-badge-pending">Not connected</span></div>
  <p class="wim-status-copy">Individual song-preview figures will appear here.</p>
  <p class="wim-source">Source to connect: the website's preview player. This is for selected song samples, not the live radio broadcast.</p>
  <div class="wim-topics" aria-label="Planned preview measurements"><span>Which song</span><span>Preview starts</span><span>Measured play time</span><span>Time &amp; location</span></div>
  <p class="wim-note">Preview playback has not been verified or connected to this box.</p>
  <details><summary>Song-preview reporting plan</summary><p>Check what the actual player can measure: song title, playback starts, measured play time, completions and buying-link clicks. Add time-of-day, device and approximate location breakdowns only where supported.</p><p>A music-page view is not a preview play. A buying-link click is not a confirmed purchase.</p></details>
</section>`;
    const rule = document.createElement('p');
    rule.className = 'wim-rule';
    rule.innerHTML = '<b>Keep the counts separate:</b> Opening a music page is a website visit. Playing the live station is radio listening. Choosing an individual sample is a song preview.';
    card.replaceChildren(header, web, listening, rule);
    const grid = card.parentElement;
    if (grid && grid.classList.contains('wi-cards')) {
      grid.classList.add('wim-organized');
      const soss = grid.querySelector(':scope > .wi-soss');
      // Keep Book and Soss side by side, then the full-width music report.
      if (soss) soss.after(card);
    }
  }
  function start() {
    const root = document.getElementById('content');
    if (!root) return;
    if (!document.getElementById('wimStyles')) {
      const style = document.createElement('style');
      style.id = 'wimStyles'; style.textContent = CSS;
      document.head.appendChild(style);
    }
    const refresh = () => root.querySelectorAll('.wda .wi-card.wi-music').forEach(decorate);
    // Interest reports arrive asynchronously and are replaced on range changes.
    // The version marker makes decoration idempotent and prevents observer loops.
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
