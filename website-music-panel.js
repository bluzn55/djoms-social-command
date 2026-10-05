/* Music / KJAK layout. Radio analytics were removed at the owner's request.
   Website measurements and the song-preview section are preserved.
   The optional Radio.co dashboard shortcut is saved only in this browser. */
(function () {
  'use strict';
  const VERSION = '2026-10-05.music-layout.2';
  const LINK_KEY = 'djoms:radio-dashboard-link:v1';
  function dashboardUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      if (url.hostname !== 'radio.co' && !url.hostname.endsWith('.radio.co')) return null;
      return url.href;
    } catch (_) { return null; }
  }
  function makeShortcut() {
    const wrap = document.createElement('div');
    wrap.className = 'wim-shortcut';
    wrap.innerHTML = '<div class="wim-shortcut-actions"><a class="wim-dashboard-link" target="_blank" rel="noopener noreferrer" hidden>Radio.co Dashboard ↗</a><button type="button" class="wim-edit-dashboard">Radio.co Dashboard · Add link</button></div><form class="wim-dashboard-form" hidden><label>Radio.co dashboard address<input type="url" inputmode="url" autocomplete="off" placeholder="Paste your Radio.co dashboard address" required></label><div class="wim-shortcut-actions"><button type="submit">Save link</button><button type="button" class="wim-cancel-dashboard">Cancel</button></div><small>The shortcut is saved only in this browser. Use a dashboard address, not a sign-in code or secret link.</small></form><p class="wim-link-status" role="status"></p>';
    const link = wrap.querySelector('a');
    const edit = wrap.querySelector('.wim-edit-dashboard');
    const form = wrap.querySelector('form');
    const input = wrap.querySelector('input');
    const status = wrap.querySelector('.wim-link-status');
    let saved = null;
    try { saved = dashboardUrl(localStorage.getItem(LINK_KEY)); } catch (_) {}
    function showLink(url) {
      saved = url;
      if (url) link.href = url;
      else link.removeAttribute('href');
      link.hidden = !url;
      edit.textContent = url ? 'Edit link' : 'Radio.co Dashboard · Add link';
    }
    showLink(saved);
    edit.addEventListener('click', () => {
      form.hidden = false;
      input.value = saved || '';
      status.textContent = '';
      input.focus();
    });
    wrap.querySelector('.wim-cancel-dashboard').addEventListener('click', () => {
      form.hidden = true;
      status.textContent = '';
      edit.focus();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const url = dashboardUrl(input.value);
      if (!url) {
        status.textContent = 'Use the HTTPS address of your Radio.co dashboard.';
        input.focus();
        return;
      }
      showLink(url);
      try {
        localStorage.setItem(LINK_KEY, url);
        status.textContent = 'Saved in this browser.';
      } catch (_) {
        status.textContent = 'The link works for this visit, but this browser could not save it.';
      }
      form.hidden = true;
      link.focus();
    });
    return wrap;
  }
  const CSS = `
.wda .wi-cards.wim-organized > .wi-music,
.wda .wi-cards.wim-organized > .wi-general{grid-column:1/-1}
.wda .wi-music[data-music-layout]{padding:24px;background:#fffdf7}
.wda .wim-header{margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}
.wda .wim-header-copy{flex:1;min-width:220px}
.wda .wim-header h4{font:700 28px/1.25 Georgia,serif;margin:5px 0 9px}
.wda .wim-eyebrow{font-size:14px;letter-spacing:1px;font-weight:700;color:#496b60}
.wda .wim-header p{font-size:18px;line-height:1.5;margin:0;color:#51432d}
.wda .wim-shortcut{max-width:460px;min-width:0}
.wda .wim-shortcut-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wda .wim-dashboard-link{display:inline-block;background:#496b60;color:#fff;border:1px solid #496b60;border-radius:6px;padding:12px 18px;font:700 17px/1.4 Arial,sans-serif;text-decoration:none}
.wda .wim-dashboard-link[hidden],.wda .wim-dashboard-form[hidden]{display:none!important}
.wda .wim-dashboard-link:focus-visible{outline:3px solid #9c742e;outline-offset:3px}
.wda .wim-dashboard-form{margin-top:12px;padding:14px;background:#f6efdf;border:1px solid #d7c6a5;border-radius:8px}
.wda .wim-dashboard-form input{display:block;width:100%;font:17px/1.5 Arial,sans-serif;margin:8px 0 12px;padding:10px;background:#fff;color:#302719;border:1px solid #80602b;border-radius:5px}
.wda .wim-dashboard-form small{display:block;margin-top:10px;font-size:14px}
.wda .wim-header .wim-link-status{font-size:15px;line-height:1.4;margin:8px 0 0}
.wda .wim-link-status:empty{display:none}
.wda .wim-block{min-width:0;padding:20px;border:1px solid #d7c6a5;border-radius:9px;background:#fffaf0}
.wda .wim-block h5{font:700 21px/1.3 Arial,sans-serif;margin:0}
.wda .wim-block-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.wda .wim-badge{display:inline-block;border:1px solid #c3b28e;border-radius:16px;padding:5px 11px;font:700 14px/1.3 Arial,sans-serif;background:#f3ebdc;color:#57482e}
.wda .wim-badge-pending{background:#fff0c9;border-color:#be923b;color:#725113}
.wda .wim-web-content .wi-big{font-size:36px;margin-top:8px}
.wda .wim-web-content .wi-share{margin-bottom:6px}
.wda .wim-web-content details{margin-top:8px}
.wda .wim-block .wim-note{font-size:16px;line-height:1.5;color:#625238;margin:8px 0 0}
.wda .wim-listening-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;margin-top:18px}
.wda .wim-previews{border-top:4px solid #9c742e}
.wda .wim-status-copy{font-size:18px;font-weight:700;line-height:1.5;margin:10px 0 6px}
.wda .wim-source{font-size:16px;line-height:1.5;color:#625238;margin:8px 0}
.wda .wim-topics{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.wda .wim-topics span{font-size:15px;font-weight:700;border:1px solid #dccdae;background:#f6efdf;border-radius:5px;padding:7px 10px}
.wda .wim-block details{border-top:1px solid #dfd0b5;padding-top:6px;margin-top:14px}
.wda .wim-block details p{font-size:16px;line-height:1.55}
.wda .wim-rule{padding:14px 16px;margin:18px 0 0!important;border-left:4px solid #496b60;background:#edf1e9;font-size:16px!important;line-height:1.5}
@media(max-width:700px){.wda .wi-music[data-music-layout]{padding:16px}.wda .wim-block{padding:16px}.wda .wim-header h4{font-size:25px}.wda .wim-block h5{font-size:20px}.wda .wim-shortcut{max-width:100%;width:100%}}
`;
  function decorate(card) {
    if (card.dataset.musicLayout === VERSION) return;
    const title = card.querySelector(':scope > h4');
    if (!title || !card.querySelector(':scope > .wi-big')) return;
    const subtitle = card.querySelector(':scope > .wi-subtitle');
    const body = document.createElement('div');
    body.className = 'wim-web-content';
    // Preserve the original website measurements and page details.
    Array.from(card.childNodes).forEach(node => {
      if (node !== title && node !== subtitle) body.appendChild(node);
    });
    card.dataset.musicLayout = VERSION;
    const header = document.createElement('div');
    header.className = 'wim-header';
    const copy = document.createElement('div');
    copy.className = 'wim-header-copy';
    copy.innerHTML = '<span class="wim-eyebrow">WEBSITE MUSIC ACTIVITY</span>';
    copy.appendChild(title);
    const intro = document.createElement('p');
    intro.textContent = 'Website visits and individual song previews. Measured separately.';
    copy.appendChild(intro);
    header.append(copy, makeShortcut());
    const web = document.createElement('section');
    web.className = 'wim-block wim-web';
    web.setAttribute('aria-label', 'Music website visits');
    web.innerHTML = '<div class="wim-block-head"><h5>Website Visits</h5><span class="wim-badge">Wix page activity</span></div><p class="wim-note">These are visits to music pages, not confirmed listens. The 7-day / 28-day selection above applies here.</p>';
    web.appendChild(body);
    const listening = document.createElement('div');
    listening.className = 'wim-listening-grid';
    listening.innerHTML = `
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
    rule.innerHTML = '<b>Keep the counts separate:</b> Opening a music page is a website visit. Choosing an individual sample is a song preview.';
    card.replaceChildren(header, web, listening, rule);
    const grid = card.parentElement;
    if (grid && grid.classList.contains('wi-cards')) {
      grid.classList.add('wim-organized');
      const soss = grid.querySelector(':scope > .wi-soss');
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
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
