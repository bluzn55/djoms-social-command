/* Trading Post presentation and read-only product sales. Other reports unchanged. */
(function () {
  'use strict';
  const VERSION = '2026-10-05.trading.1';
  const SHOP = 'https://www.docjaks.com/trading-post-1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const count = value => Number.isSafeInteger(value) && value >= 0 ? new Intl.NumberFormat('en-US').format(value) : 'Not available';
  const money = value => Number.isSafeInteger(value) && value >= 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100) : 'Not available';
  const active = new Map();
  function draw(box, data, error) {
    let output = '<h5>What sold</h5><p class="tps-note">Product quantities from Wix website orders, separate from the page visits above. Uses the 7-day / 28-day selection.</p>';
    if (error) output += '<p class="tps-warning" role="alert">' + esc(error) + '</p>';
    else if (!data) output += '<p role="status">Checking paid store orders...</p>';
    else {
      const status = data.sourceOrderCount === 0 ? 'No orders returned for this period.' : data.products.length ? 'Paid product sales reported.' : 'No qualifying paid product sales for this period.';
      output += '<p class="tps-status">' + esc(status) + '</p><div class="tps-kpis">' + [['Paid orders', count(data.paidOrders)], ['Items sold', count(data.units)], ['Item sales', money(data.itemSalesCents)]].map(([label, value]) => '<div><small>' + esc(label) + '</small><b>' + esc(value) + '</b></div>').join('') + '</div>';
      output += '<div class="tps-scroll"><table><caption>Paid, non-refunded website orders. Quantities are purchased units; one bundle counts as one unit.</caption><thead><tr><th scope="col">Product</th><th scope="col">Qty sold</th><th scope="col">Orders</th><th scope="col">Item sales</th></tr></thead><tbody>';
      output += data.products.length ? data.products.map(p => '<tr><td><b>' + esc(p.name) + '</b>' + (p.sku ? '<small>SKU: ' + esc(p.sku) + '</small>' : '') + '</td><td>' + esc(count(p.units)) + '</td><td>' + esc(count(p.orderCount)) + '</td><td>' + esc(money(p.itemSalesCents)) + '</td></tr>').join('') : '<tr><td colspan="4">Products will appear here when qualifying orders are recorded. No sample sales are shown.</td></tr>';
      output += '</tbody></table></div>';
      const e = data.excluded || {};
      output += '<details><summary>Excluded orders and counting rules</summary><p>Canceled/rejected: <b>' + esc(count(e.canceled)) + '</b>. Refund/dispute review: <b>' + esc(count(e.refundReview)) + '</b>. Not fully paid: <b>' + esc(count(e.unpaid)) + '</b>. Other channels: <b>' + esc(count(e.nonWebsite)) + '</b>. Other apps: <b>' + esc(count(e.nonStore)) + '</b>. Data review: <b>' + esc(count(e.needsReview)) + '</b>.</p>';
      if (data.review?.length) output += '<ul>' + data.review.map(row => '<li>Order ' + esc(row.orderNumber) + ': ' + esc(row.reason) + '</li>').join('') + '</ul>';
      output += '<p>Only approved, fully paid website orders are counted. Entire refunded or partially refunded orders are held out in this first version, not treated as net product sales. Item sales exclude tax and shipping. This is not profit or a bank-deposit total.</p><p>All Wix Stores products can appear here, including Soss, books and music. This does not prove that a sale began on the Trading Post page. Outside Amazon, Radio.co and market/POS sales are not included.</p><p>Paid test orders cannot be recognized automatically. Refunded and canceled tests are excluded by their order status.</p><p>Variants stay separate where the order identifies them. Product-level order counts may overlap, so do not add them to get total orders.</p></details>';
      output += '<p class="tps-note">Orders created from ' + esc(data.range.start) + ' through the selected end date, including today so far. Last checked ' + esc(new Date(data.checkedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })) + ' Central. Results may be reused for two minutes.</p>';
    }
    output += '<button type="button" class="tps-check">Check product sales</button>';
    box.innerHTML = output;
    box.querySelector('.tps-check').addEventListener('click', () => load(box));
  }
  async function load(box) {
    if (box.dataset.loading === '1') return;
    box.dataset.loading = '1';
    const days = box.closest('#wdaInterests')?.querySelector('[data-interest-days][aria-pressed="true"]')?.dataset.interestDays === '28' ? '28' : '7';
    draw(box, null, null);
    try {
      let job = active.get(days);
      if (!job) {
        job = (async () => {
          const response = await fetch('/api/meta/trading-post-sales?days=' + days, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000) });
          const data = await response.json();
          if (!response.ok || !data.connected || !data.complete || !Array.isArray(data.products)) throw new Error(data.error || 'Product sales could not be checked. Other reports are unchanged.');
          return data;
        })().finally(() => active.delete(days));
        active.set(days, job);
      }
      const data = await job;
      if (box.isConnected) draw(box, data, null);
    } catch (error) {
      if (box.isConnected) draw(box, null, error.name === 'TimeoutError' ? 'Wix took too long. Retry this report later.' : error.message);
    } finally { box.dataset.loading = ''; }
  }
  function decorate(card) {
    if (card.dataset.tradingPost === VERSION) return;
    card.dataset.tradingPost = VERSION;
    const title = card.querySelector(':scope > h4');
    if (title) title.textContent = 'Trading Post';
    const subtitle = card.querySelector(':scope > .wi-subtitle');
    if (subtitle) subtitle.textContent = 'Online store, products, pricing and related Soss pages';
    const shortcut = document.createElement('a');
    shortcut.className = 'tps-shop'; shortcut.href = SHOP; shortcut.target = '_blank'; shortcut.rel = 'noopener noreferrer'; shortcut.textContent = 'Open Trading Post ↗';
    if (subtitle) subtitle.after(shortcut); else card.prepend(shortcut);
    const box = document.createElement('section');
    box.className = 'tps-sales'; box.setAttribute('aria-label', 'Trading Post product sales'); card.appendChild(box);
    load(box);
  }
  const CSS = `
.wda .tps-shop{display:inline-block;margin:0 0 15px;padding:11px 16px;border:1px solid #80602b;border-radius:6px;color:#fff;background:#76573e;font:700 17px/1.4 Arial,sans-serif;text-decoration:none}
.wda .tps-shop:focus-visible{outline:3px solid #496b60;outline-offset:3px}
.wda .tps-sales{border-top:2px solid #9c742e;margin-top:24px;padding-top:22px;min-width:0}
.wda .tps-sales h5{font:700 23px/1.3 Arial,sans-serif;margin:0 0 10px}
.wda .tps-sales .tps-note{font-size:15px;line-height:1.5;color:#625238}
.wda .tps-status{background:#edf1e9;border:1px solid #496b60;border-radius:6px;padding:12px;font-weight:700}
.wda .tps-warning{background:#fff0c9;border:1px solid #a77729;border-radius:6px;padding:12px}
.wda .tps-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:15px 0}
.wda .tps-kpis>div{padding:13px;border:1px solid #d7c6a5;border-radius:6px;background:#fffdf7;min-width:0}
.wda .tps-kpis small,.wda .tps-kpis b{display:block}.wda .tps-kpis small{font-size:15px}.wda .tps-kpis b{font-size:26px;margin-top:7px;overflow-wrap:anywhere}
.wda .tps-scroll{overflow-x:auto;margin-bottom:16px}.wda .tps-scroll table{min-width:500px}.wda .tps-scroll td small{font-size:14px}
.wda .tps-sales details{border-top:1px solid #d7c6a5;padding-top:9px}.wda .tps-sales details p,.wda .tps-sales li{font-size:16px;line-height:1.5}
@media(max-width:550px){.wda .tps-kpis{grid-template-columns:1fr}.wda .tps-kpis b{font-size:25px}}
`;
  function start() {
    const root = document.getElementById('content');
    if (!root) return;
    if (!document.getElementById('tpsStyles')) { const style = document.createElement('style'); style.id = 'tpsStyles'; style.textContent = CSS; document.head.appendChild(style); }
    function refresh() {
      root.querySelectorAll('.wda .wi-card.wi-soss').forEach(decorate);
      const heading = root.querySelector('.wi-heading h3');
      if (heading?.textContent === 'Book. Music. Soss. What are they exploring?') heading.textContent = 'Book. Music. Trading Post. What are they exploring?';
      root.querySelectorAll('.wi-explain p').forEach(p => {
        if (p.textContent.includes('The homepage, Trading Post, KJAK lobby')) p.innerHTML = '<b>General / Unknown is not "by mistake."</b> The homepage, KJAK lobby, Ember Hall and mixed bundles do not prove one specific interest. Trading Post entry-page traffic is now included in the Trading Post box.';
      });
    }
    new MutationObserver(refresh).observe(root, { childList: true, subtree: true });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
