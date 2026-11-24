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
  const businessId = route.searchParams.get('businessId') || 'conestoga';
  if (!['conestoga', 'doc_jaks'].includes(businessId)) throw new Error('Choose a business.');
  if (route.pathname === '/sales-days') {
    if (route.searchParams.has('date')) return {day: null};
    return {businessId, month: route.searchParams.get('month'), timezone: 'America/Chicago', days: []};
  }
  if (route.pathname === '/sales-products') {
    const products = [
      {id: 'starter_food_boss_soss', name: 'Boss Soss'},
      {id: 'starter_food_sweet_bayou', name: 'Sweet Bayou'}
    ].map(product => ({...product, businessId, revision: 0, division: 'food', sku: '',
      packageLabel: '12 oz bottle', unit: 'bottle', defaultPrice: '', bottleSizeMl: '',
      bottlesPerUnit: '', proof: '', active: true, createdAt: null, updatedAt: null,
      createdBy: null, updatedBy: null, createRequestId: null, lastRequestId: null, historyCount: 0}));
    if (route.searchParams.has('id')) {
      const product = products.find(item => item.id === route.searchParams.get('id'));
      if (!product) throw new Error('This product is not in the layout preview.');
      return {product: {...product, history: []}};
    }
    return {businessId, products};
  }
  if (route.pathname !== '/sales') throw new Error('Open the owner workspace to use this connection.');
  return {
    sales: [], businessId, timezone: 'America/Chicago', nextCursor: null,
    businesses: [{id: 'conestoga', name: 'Colo Distillery LLC'}, {id: 'doc_jaks', name: 'Doc Jak’s'}],
    connections: {inventory: false, accounting: false, reports: false}
  };
}
function setView() {
  notice('Open the owner Sales page to use the rest of your workspace.');
}
window.djomsOpenSalesReport = function (businessId, templateId, month) {
  if (!['conestoga', 'doc_jaks'].includes(businessId) ||
      !['ttb_excise', 'ttb_production', 'ttb_storage', 'ttb_processing'].includes(templateId) ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) return false;
  const query = new URLSearchParams({business: businessId, template: templateId, month});
  window.location.assign('/reports?' + query);
  return true;
};
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
