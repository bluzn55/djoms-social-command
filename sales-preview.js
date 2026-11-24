'use strict';
// An isolated, empty layout preview. No app credentials, network data, or writes.
let activeView = 'Sales';
let dirty = false;
function notice(message, bad = false) {
  const node = document.getElementById('notice');
  node.textContent = message;
  node.hidden = !message;
  node.className = bad ? 'bad-notice' : 'good-notice';
}
async function api(path, body, method) {
  if (body !== undefined || (method && method !== 'GET')) {
    throw new Error('This is a layout preview. Open the owner Sales page and sign in to save a sale.');
  }
  const route = new URL(path, 'https://preview.invalid/');
  if (route.pathname !== '/sales') throw new Error('Open the owner workspace to use this connection.');
  const businessId = route.searchParams.get('businessId') || 'conestoga';
  if (!['conestoga', 'doc_jaks'].includes(businessId)) throw new Error('Choose a business.');
  return {
    sales: [], businessId, timezone: 'America/Chicago', nextCursor: null,
    businesses: [{id: 'conestoga', name: 'Colo Distillery LLC'}, {id: 'doc_jaks', name: 'Doc Jak’s'}],
    connections: {inventory: false, accounting: false, reports: false}
  };
}
function setView() {
  notice('Open the owner Sales page to use the rest of your workspace.');
}
document.addEventListener('DOMContentLoaded', () => window.djomsSales?.render());
document.addEventListener('click', event => {
  if (event.target.closest('[data-view]')) setView();
  if (event.target.closest('[data-sales-preview-home]')) {
    if (dirty && !confirm('Leave the preview form without saving?')) return;
    window.djomsSales?.reset();
    window.djomsSales?.render();
  }
});
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
