'use strict';
(() => {
  const VIEW = 'Sales';
  const ZONE = 'America/Chicago';
  const MAX_CENTS = 99999999999n;
  const QUANTITY_SCALE = 1000000n;
  const MAX_QUANTITY = 999999999999999n;
  const businesses = [{ id: 'conestoga', name: 'Colo Distillery LLC' }, { id: 'doc_jaks', name: "Doc Jak’s" }];
  const channels = { retail: 'Retail', wholesale: 'Wholesale', event: 'Event', website: 'Website', other: 'Other' };
  const categories = { spirits: 'Spirits', food: 'Food', swag: 'Swag', music: 'Music', books: 'Books', bundles: 'Bundles', other: 'Other' };
  const units = { each: 'Each', bottle: 'Bottle', case: 'Case', gallon: 'Gallon', liter: 'Liter', pound: 'Pound', kilogram: 'Kilogram', service: 'Service' };
  const methods = { cash: 'Cash', card: 'Card', bank: 'Bank transfer', check: 'Check', other: 'Other' };
  const state = { business: 'conestoga', businesses: [...businesses], sales: [], loaded: false, loading: false, saving: false, changed: false, error: '', mode: 'list', current: null, search: '', channel: 'all', status: 'all', from: '', to: '', paymentOpen: false, paymentDraft: {}, paymentRequest: null, voidOpen: false, voidReason: '', createRequest: null, connections: { inventory: false, accounting: false, reports: false } };
  let generation = 0;
  const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const copy = value => JSON.parse(JSON.stringify(value));
  const visible = () => typeof activeView !== 'undefined' && activeView === VIEW;
  const host = () => document.getElementById('content');
  const knownBusiness = id => businesses.some(business => business.id === id);
  const businessName = (id = state.business) => state.businesses.find(business => business.id === id)?.name || businesses.find(business => business.id === id)?.name || 'Unassigned business';
  const nonblank = value => String(value ?? '').trim() !== '';
  const centsKnown = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  function setDirty(value) { state.changed = value; if (visible() && typeof dirty !== 'undefined') dirty = value; }
  function today() { const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-'); }
  function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false; const date = new Date(value + 'T12:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
  function displayDate(value) { return validDate(value) ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not entered'; }
  function displayTime(value) { if (!value) return 'Not recorded'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' : 'Not recorded'; }
  function currency(cents, empty = 'Not entered') { return centsKnown(cents) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) : empty; }
  function moneyText(cents) { return centsKnown(cents) ? Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0') : ''; }
  function moneyCents(value) { const text = String(value ?? '').trim(); if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) return null; const [whole, fraction = ''] = text.split('.'); const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); return amount <= MAX_CENTS ? amount : null; }
  function quantityUnits(value) { const text = String(value ?? '').trim(); if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(text)) return null; const [whole, fraction = ''] = text.split('.'); const quantity = BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(6, '0')); return quantity > 0n && quantity <= MAX_QUANTITY ? quantity : null; }
  function calculate(sale) {
    const errors = [];
    const items = Array.isArray(sale.items) ? sale.items : [];
    const lineTotals = items.map((item, index) => {
      const quantity = quantityUnits(item.quantity), price = moneyCents(item.unitPrice);
      if (nonblank(item.quantity) && quantity === null) errors.push('Line ' + (index + 1) + ': enter a positive quantity with up to six decimals.');
      if (nonblank(item.unitPrice) && price === null) errors.push('Line ' + (index + 1) + ': enter a nonnegative price up to $999,999,999.99.');
      if (quantity === null || price === null) return null;
      const cents = (quantity * price + QUANTITY_SCALE / 2n) / QUANTITY_SCALE;
      if (cents > MAX_CENTS) { errors.push('Line ' + (index + 1) + ' exceeds the maximum sale amount.'); return null; }
      return Number(cents);
    });
    let subtotal = items.length && lineTotals.every(centsKnown) ? lineTotals.reduce((sum, value) => sum + BigInt(value), 0n) : null;
    if (subtotal !== null && subtotal > MAX_CENTS) { errors.push('The subtotal exceeds $999,999,999.99.'); subtotal = null; }
    const discount = moneyCents(sale.discountAmount), tax = moneyCents(sale.taxAmount), shipping = moneyCents(sale.shippingAmount);
    [['discountAmount', 'Discount', discount], ['taxAmount', 'Tax', tax], ['shippingAmount', 'Shipping', shipping]].forEach(([key, label, value]) => { if (nonblank(sale[key]) && value === null) errors.push(label + ' must be a nonnegative amount with up to two decimals.'); });
    let total = subtotal !== null && discount !== null && tax !== null && shipping !== null ? subtotal - discount + tax + shipping : null;
    if (subtotal !== null && discount !== null && discount > subtotal) { errors.push('Discount cannot exceed the item subtotal.'); total = null; }
    if (total !== null && total > MAX_CENTS) { errors.push('The sale total exceeds $999,999,999.99.'); total = null; }
    const payments = Array.isArray(sale.payments) ? sale.payments : [];
    const paid = payments.every(payment => centsKnown(payment.amountCents)) ? payments.reduce((sum, payment) => sum + BigInt(payment.amountCents), 0n) : null;
    const balance = total !== null && paid !== null && paid <= total ? total - paid : null;
    return { lineTotals, errors, totals: { subtotalCents: subtotal === null ? null : Number(subtotal), discountCents: discount === null ? null : Number(discount), taxCents: tax === null ? null : Number(tax), shippingCents: shipping === null ? null : Number(shipping), totalCents: total === null ? null : Number(total), paidCents: paid === null ? null : Number(paid), balanceCents: balance === null ? null : Number(balance) } };
  }
  function saleTotals(sale) { return sale.totals || calculate(sale).totals; }
  function overdue(sale) { return sale.status === 'recorded' && saleTotals(sale).balanceCents > 0 && validDate(sale.dueDate) && sale.dueDate < today(); }
  function statusLabel(sale) { return sale.status === 'voided' ? 'Voided' : sale.status === 'recorded' ? (overdue(sale) ? 'Overdue' : sale.paymentStatus === 'paid' ? 'Paid' : sale.paymentStatus === 'partial' ? 'Part paid' : 'Unpaid') : 'Draft'; }
  function statusColor(sale) { return overdue(sale) ? 'red' : sale.status === 'recorded' && sale.paymentStatus === 'paid' ? 'green' : 'yellow'; }
  function badge(sale) { return '<span class="sales-badge sales-badge-' + e(sale.status || 'draft') + '"><i class="sales-status-dot sales-dot-' + statusColor(sale) + '" aria-hidden="true"></i>' + e(statusLabel(sale)) + '</span>'; }
  function optionList(options, selected) { return Object.entries(options).map(([value, label]) => '<option value="' + e(value) + '"' + (value === selected ? ' selected' : '') + '>' + e(label) + '</option>').join(''); }
  function button(action, label, className = '', extra = '') { return '<button type="button" class="sales-button ' + className + '" data-sales-action="' + action + '" ' + extra + '>' + label + '</button>'; }
  function input(name, label, value, opts = '') { return '<label>' + label + '<input name="' + name + '" value="' + e(value) + '" ' + opts + '></label>'; }
  const moneyAttrs = 'type="text" inputmode="decimal" pattern="[0-9]{1,9}(\\.[0-9]{1,2})?" maxlength="12" placeholder="Not entered"';
  function newId() { const crypto = globalThis.crypto || window.crypto; if (crypto?.randomUUID) return crypto.randomUUID(); if (crypto?.getRandomValues) return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); return 'sales-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  function blankItem() { return { description: '', sku: '', productId: '', batchReference: '', category: 'spirits', quantity: '1', unit: 'bottle', unitPrice: '' }; }
  function blankSale() { return { businessId: state.business, soldOn: today(), dueDate: '', channel: 'retail', location: '', sourceReference: '', customer: { name: '', email: '' }, notes: '', items: [blankItem()], discountAmount: '0.00', taxAmount: '', shippingAmount: '0.00', initialPayment: { amount: '', method: '', date: '', reference: '', notes: '' } }; }
  function businessSales() { return state.sales.filter(sale => sale.businessId === state.business); }
  function filteredSales() {
    const query = state.search.trim().toLowerCase();
    return businessSales().filter(sale => (!state.from || sale.soldOn >= state.from) && (!state.to || (sale.soldOn && sale.soldOn <= state.to)) && (state.channel === 'all' || sale.channel === state.channel) && (state.status === 'all' || state.status === 'overdue' ? state.status !== 'overdue' || overdue(sale) : ['unpaid', 'partial', 'paid'].includes(state.status) ? sale.status === 'recorded' && sale.paymentStatus === state.status : sale.status === state.status) && (!query || [sale.number, sale.customer?.name, sale.customer?.email, sale.sourceReference, sale.location, ...(sale.items || []).flatMap(item => [item.description, item.sku, item.batchReference])].join(' ').toLowerCase().includes(query))).sort((a, b) => String(b.soldOn || '').localeCompare(String(a.soldOn || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  function summary(sales) {
    const recorded = sales.filter(sale => sale.status === 'recorded');
    const sum = getter => { if (!recorded.every(sale => centsKnown(getter(saleTotals(sale))))) return null; const total = recorded.reduce((value, sale) => value + BigInt(getter(saleTotals(sale))), 0n); return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null; };
    return { count: recorded.length, beforeTax: sum(total => centsKnown(total.subtotalCents) && centsKnown(total.discountCents) ? total.subtotalCents - total.discountCents : null), receipts: sum(total => total.paidCents), balance: sum(total => total.balanceCents), drafts: sales.filter(sale => sale.status === 'draft').length, overdue: sales.filter(overdue).length, voided: sales.filter(sale => sale.status === 'voided').length };
  }
  function heading() { return '<div class="sales-heading"><div class="sales-title-plaque"><span class="sales-eyebrow">DOC JAKS · SALES STATION</span><h2>Sales</h2><p>Sale records · Received payments · History</p></div><div>' + (state.mode === 'list' ? button('new', '+ New sale', 'sales-primary') : button('back', 'Back to sales')) + '</div></div>'; }
  function businessSelector() { return '<div class="sales-business-bar"><label for="salesBusiness">Business<select id="salesBusiness">' + optionList(Object.fromEntries(state.businesses.filter(business => knownBusiness(business.id)).map(business => [business.id, business.name])), state.business) + '</select></label><div><strong>' + e(businessName()) + '</strong><span>Separate sales, payments, and history</span></div>' + (state.business === 'doc_jaks' && state.mode === 'list' ? button('website-report', 'Website sales report', 'sales-small-button') : '') + '</div>'; }
  function connectionsMarkup() { return '<div class="sales-connections"><strong>Manual sales ledger</strong><p>Record sales and payments already received. Inventory, accounting, and report feeds are not connected.</p><div><span>Inventory · Not connected</span><span>Accounting · Not connected</span><span>Reports · Not connected</span></div></div>'; }
  function listMarkup() {
    const list = filteredSales(), metrics = summary(list);
    const signal = metrics.overdue ? 'red' : metrics.drafts || metrics.balance || !metrics.count ? 'yellow' : 'green';
    const signalLabel = metrics.overdue ? metrics.overdue + ' overdue sale' + (metrics.overdue === 1 ? '' : 's') : metrics.drafts || metrics.balance ? 'Drafts or outstanding balances need attention' : metrics.count ? 'Matching sales have no outstanding balance' : 'No recorded sales in this view';
    const invalidRange = state.from && state.to && state.from > state.to;
    return '<div class="sales-overview-title"><span class="sales-lamp sales-lamp-' + signal + '" role="img" aria-label="' + e(signalLabel) + '" title="' + e(signalLabel) + '"></span><div><h3>Sales overview</h3><p>' + metrics.drafts + ' draft' + (metrics.drafts === 1 ? '' : 's') + ' · ' + metrics.overdue + ' overdue · ' + metrics.voided + ' voided</p></div></div><div class="sales-metrics"><div><span>Sales before tax</span><strong>' + currency(metrics.beforeTax, 'Unavailable') + '</strong><small>Items less discounts</small></div><div><span>Recorded receipts</span><strong>' + currency(metrics.receipts, 'Unavailable') + '</strong><small>Payments already received</small></div><div class="' + (metrics.balance ? 'sales-balance-open' : '') + '"><span>Outstanding balance</span><strong>' + currency(metrics.balance, 'Unavailable') + '</strong><small>Recorded sales only</small></div><div><span>Recorded sales</span><strong>' + metrics.count + '</strong><small>Drafts and voids excluded</small></div></div><section class="sales-panel sales-ledger"><div class="sales-panel-heading"><div><h3>Sales ledger</h3><p>' + list.length + ' of ' + businessSales().length + ' saved records shown</p></div><div class="sales-toolbar-actions">' + button('refresh', 'Refresh') + button('export', 'Export CSV', '', list.length ? '' : 'disabled') + '</div></div><div class="sales-filters"><label>Search<input id="salesSearch" type="search" value="' + e(state.search) + '" placeholder="Sale, customer, item, or reference"></label><label>From sale date<input id="salesFrom" type="date" value="' + e(state.from) + '"></label><label>Through sale date<input id="salesTo" type="date" value="' + e(state.to) + '"></label><label>Channel<select id="salesChannel">' + optionList({ all: 'All channels', ...channels }, state.channel) + '</select></label><label>Status<select id="salesStatus">' + optionList({ all: 'All statuses', draft: 'Drafts', recorded: 'Recorded', unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid', overdue: 'Overdue', voided: 'Voided' }, state.status) + '</select></label>' + button('clear-filters', 'Clear', 'sales-text-button') + '</div>' + (invalidRange ? '<p class="sales-inline-error" role="alert">The start date must be on or before the end date.</p>' : '') + '<p class="sales-scope-note">Totals follow these filters and use the sale date. Receipts include all saved payments on matching sales. Sales before tax excludes tax and shipping.</p>' + (list.length ? '<div class="sales-table-scroll" tabindex="0"><table class="sales-table"><thead><tr><th scope="col">Sale / customer</th><th scope="col">Sale date</th><th scope="col">Channel</th><th scope="col">Total</th><th scope="col">Received</th><th scope="col">Balance / due</th><th scope="col">Status</th><th scope="col"><span class="sales-sr">Open sale</span></th></tr></thead><tbody>' + list.map(sale => { const total = saleTotals(sale); return '<tr class="' + (sale.status === 'voided' ? 'sales-voided-row' : '') + '"><td><strong>' + e(sale.number || 'Saved draft') + '</strong><span>' + e(sale.customer?.name || 'Customer not entered') + '</span>' + (sale.sourceReference ? '<small>' + e(sale.sourceReference) + '</small>' : '') + '</td><td>' + e(displayDate(sale.soldOn)) + '</td><td>' + e(channels[sale.channel] || 'Not entered') + '</td><td class="sales-money">' + currency(total.totalCents, '—') + '</td><td class="sales-money">' + currency(total.paidCents, '—') + '</td><td class="sales-money' + (overdue(sale) ? ' sales-overdue' : '') + '">' + currency(total.balanceCents, '—') + (sale.dueDate ? '<small>Due ' + e(displayDate(sale.dueDate)) + '</small>' : '') + '</td><td>' + badge(sale) + '</td><td>' + button('open', 'Open', '', 'data-sale-id="' + e(sale.id) + '"') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="sales-empty"><div class="sales-empty-icon" aria-hidden="true">$</div><h3>' + (businessSales().length ? 'No matching sales' : 'Your sales ledger is ready') + '</h3><p>' + (businessSales().length ? 'Change the date, channel, status, or search filters to see more records.' : 'Add the first sale for ' + e(businessName()) + '. Save a draft, review its details, then record the sale and any payment already received.') + '</p>' + (businessSales().length ? button('clear-filters', 'Clear filters') : button('new', '+ New sale', 'sales-primary')) + '</div>') + '</section>' + connectionsMarkup() + '<p class="sales-footnote">All amounts are USD. Dates use Central Time. This page records activity; it does not charge a card or move money.</p>';
  }
  function totalsMarkup(sale, live = false) {
    const totals = live ? calculate(sale).totals : saleTotals(sale);
    const initial = moneyCents(sale.initialPayment?.amount);
    return '<div class="sales-totals"' + (live ? ' id="salesLiveTotals" aria-live="polite"' : '') + '><dl><div><dt>Item subtotal</dt><dd>' + currency(totals.subtotalCents) + '</dd></div><div><dt>Discount</dt><dd>' + currency(totals.discountCents) + '</dd></div><div><dt>Tax</dt><dd>' + currency(totals.taxCents) + '</dd></div><div><dt>Shipping</dt><dd>' + currency(totals.shippingCents) + '</dd></div><div class="sales-grand-total"><dt>Sale total</dt><dd>' + currency(totals.totalCents) + '</dd></div><div><dt>Payments recorded</dt><dd>' + currency(totals.paidCents) + '</dd></div><div class="sales-balance-total"><dt>Saved balance</dt><dd>' + currency(totals.balanceCents) + '</dd></div></dl>' + ((!sale.status || sale.status === 'draft') && initial !== null && initial > 0n ? '<p class="sales-draft-payment-note">Draft payment to record with this sale: <strong>' + currency(Number(initial)) + '</strong>. It is not in recorded receipts yet.</p>' : '') + (totals.totalCents === null ? '<p class="sales-help">The total stays unknown until quantities, prices, discount, tax, and shipping are entered. Enter 0 explicitly where appropriate.</p>' : '') + '</div>';
  }
  function lineMarkup(item, index, lineTotal) {
    return '<div class="sales-line-card" data-sales-line="' + index + '"><div class="sales-line-heading"><h4>Item ' + (index + 1) + '</h4>' + button('remove-line', 'Remove', 'sales-text-button', 'data-line-index="' + index + '" aria-label="Remove item ' + (index + 1) + '"') + '</div><div class="sales-item-grid"><label class="sales-description">Description<input data-line-key="description" value="' + e(item.description) + '" maxlength="300" placeholder="Item or service sold"></label><label>Category<select data-line-key="category">' + optionList(categories, item.category) + '</select></label><label>Quantity<input data-line-key="quantity" value="' + e(item.quantity) + '" type="text" inputmode="decimal" pattern="[0-9]{1,9}(\\.[0-9]{1,6})?" maxlength="16" placeholder="Not entered"></label><label>Unit<select data-line-key="unit">' + optionList(units, item.unit) + '</select></label><label>Unit price (USD)<input data-line-key="unitPrice" value="' + e(item.unitPrice) + '" ' + moneyAttrs + '></label><div class="sales-line-total"><span>Line total</span><strong data-line-total>' + currency(lineTotal, '—') + '</strong></div><label>SKU / item code <small>Optional</small><input data-line-key="sku" value="' + e(item.sku) + '" maxlength="100"></label><label>Batch reference <small>Optional</small><input data-line-key="batchReference" value="' + e(item.batchReference) + '" maxlength="100"></label><label>Product reference <small>Optional</small><input data-line-key="productId" value="' + e(item.productId) + '" maxlength="100"></label></div></div>';
  }
  function editMarkup() {
    const sale = state.current || blankSale(), calculation = calculate(sale), payment = sale.initialPayment || {};
    return '<form id="salesEditForm" class="sales-form"><section class="sales-panel"><div class="sales-panel-heading"><div><span class="sales-eyebrow">' + (sale.id ? 'EDIT SAVED DRAFT' : 'NEW SALE DRAFT') + '</span><h3>' + e(sale.number || 'Sale details') + '</h3><p>' + e(businessName(sale.businessId)) + ' · This sale stays with this business.</p></div>' + badge({ status: 'draft' }) + '</div><div class="sales-form-grid">' + input('soldOn', 'Sale date', sale.soldOn, 'type="date"') + input('dueDate', 'Payment due date (optional)', sale.dueDate, 'type="date"') + '<label>Sales channel<select name="channel">' + optionList(channels, sale.channel) + '</select></label>' + input('location', 'Location / event (optional)', sale.location, 'maxlength="200"') + input('customerName', 'Customer name (optional)', sale.customer?.name, 'maxlength="200" autocomplete="off"') + input('customerEmail', 'Customer email (optional)', sale.customer?.email, 'type="email" maxlength="254" autocomplete="off"') + input('sourceReference', 'Order / receipt reference (optional)', sale.sourceReference, 'maxlength="200"') + '</div></section><div class="sales-savebar"><span>Draft · save at any point</span><div><button type="submit" class="sales-button">Save draft</button>' + button('save-review', 'Save &amp; review', 'sales-primary') + '</div></div><section class="sales-panel sales-items-panel"><div class="sales-panel-heading"><div><h3>Items sold</h3><p>Each line rounds to the nearest cent. No inventory is deducted.</p></div>' + button('add-line', '+ Add item', '', sale.items.length >= 100 ? 'disabled' : '') + '</div><div id="salesItemLines">' + sale.items.map((item, index) => lineMarkup(item, index, calculation.lineTotals[index])).join('') + '</div>' + (!sale.items.length ? '<p class="sales-help">Add an item when ready. An empty draft can still be saved.</p>' : '') + '</section><section class="sales-panel sales-adjustments"><div class="sales-panel-heading"><div><h3>Amounts</h3><p>Enter the actual tax amount. No tax rate is assumed.</p></div></div><div class="sales-form-grid">' + input('discountAmount', 'Discount amount (USD)', sale.discountAmount, moneyAttrs) + input('taxAmount', 'Tax amount (USD)', sale.taxAmount, moneyAttrs) + input('shippingAmount', 'Shipping amount (USD)', sale.shippingAmount, moneyAttrs) + '</div><div id="salesCalculationErrors" class="sales-calculation-errors" role="status">' + calculation.errors.map(message => '<p>' + e(message) + '</p>').join('') + '</div>' + totalsMarkup(sale, true) + '</section><section class="sales-panel"><div class="sales-panel-heading"><div><h3>Optional payment already received</h3><p>Leave blank for an unpaid sale. These payment details join the ledger only when you record the sale. No charge is processed.</p></div></div><div class="sales-form-grid">' + input('initialAmount', 'Amount received (USD)', payment.amount, moneyAttrs) + '<label>Payment method<select name="initialMethod">' + optionList({ '': 'No payment entered', ...methods }, payment.method) + '</select></label>' + input('initialDate', 'Actual received date', payment.date, 'type="date"') + input('initialReference', 'Receipt / transaction reference', payment.reference, 'maxlength="200"') + '</div><label class="sales-notes">Payment notes<textarea name="initialNotes" rows="2" maxlength="2000">' + e(payment.notes) + '</textarea></label></section><section class="sales-panel"><label>Sale notes<textarea name="notes" rows="4" maxlength="4000" placeholder="Additional details for this sale">' + e(sale.notes) + '</textarea></label></section><div class="sales-editor-footer"><p>Saving creates a draft. Review the saved values before choosing Record sale.</p><div><button type="submit" class="sales-button">Save draft</button>' + button('save-review', 'Save &amp; review', 'sales-primary') + '</div></div></form>';
  }
  function recordIssues(sale) {
    const calculation = calculate(sale), issues = [...calculation.errors];
    if (!knownBusiness(sale.businessId)) issues.push('Choose a business for this sale.');
    if (!validDate(sale.soldOn)) issues.push('Enter the actual sale date.'); else if (sale.soldOn > today()) issues.push('The sale date cannot be in the future.');
    if (sale.dueDate && !validDate(sale.dueDate)) issues.push('Enter a valid payment due date.');
    if (!Object.hasOwn(channels, sale.channel)) issues.push('Choose a sales channel.');
    if (!Array.isArray(sale.items) || !sale.items.length) issues.push('Add at least one item.');
    (sale.items || []).forEach((item, index) => { if (!nonblank(item.description)) issues.push('Line ' + (index + 1) + ' needs a description.'); if (quantityUnits(item.quantity) === null) issues.push('Line ' + (index + 1) + ' needs a valid positive quantity.'); if (moneyCents(item.unitPrice) === null) issues.push('Line ' + (index + 1) + ' needs its unit price.'); if (!Object.hasOwn(units, item.unit) || !Object.hasOwn(categories, item.category)) issues.push('Line ' + (index + 1) + ' needs a unit and category.'); });
    [['discountAmount', 'Discount'], ['taxAmount', 'Tax'], ['shippingAmount', 'Shipping']].forEach(([key, label]) => { if (moneyCents(sale[key]) === null) issues.push(label + ' must be entered explicitly, including 0 if appropriate.'); });
    const payment = sale.initialPayment || {};
    if (Object.values(payment).some(nonblank)) {
      const amount = moneyCents(payment.amount);
      if (amount === null || amount <= 0n) issues.push('The draft received payment needs a positive amount.');
      if (!Object.hasOwn(methods, payment.method)) issues.push('Choose the draft payment method.');
      if (!validDate(payment.date) || payment.date > today()) issues.push('Enter the actual received-payment date, on or before today.');
      if (amount !== null && centsKnown(calculation.totals.totalCents) && amount > BigInt(calculation.totals.totalCents)) issues.push('The received payment cannot exceed the sale total.');
    }
    return [...new Set(issues)];
  }
  function itemsTable(sale) {
    const local = calculate(sale);
    return '<div class="sales-table-scroll" tabindex="0"><table class="sales-table sales-detail-items"><thead><tr><th scope="col">Item</th><th scope="col">Quantity / unit</th><th scope="col">Unit price</th><th scope="col">Line total</th></tr></thead><tbody>' + (sale.items || []).map((item, index) => '<tr><td><strong>' + e(item.description || 'Description not entered') + '</strong><span>' + e(categories[item.category] || 'Category not entered') + (item.sku ? ' · SKU ' + e(item.sku) : '') + '</span>' + (item.batchReference ? '<small>Batch: ' + e(item.batchReference) + '</small>' : '') + (item.productId ? '<small>Product reference: ' + e(item.productId) + '</small>' : '') + '</td><td>' + e(item.quantity || 'Not entered') + ' ' + e(units[item.unit] || '') + '</td><td class="sales-money">' + currency(moneyCents(item.unitPrice) === null ? null : Number(moneyCents(item.unitPrice))) + '</td><td class="sales-money">' + currency(centsKnown(item.lineTotalCents) ? item.lineTotalCents : local.lineTotals[index]) + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function paymentsMarkup(sale) {
    const payments = Array.isArray(sale.payments) ? sale.payments : [];
    const initial = sale.initialPayment || {};
    return '<section class="sales-panel sales-payments"><div class="sales-panel-heading"><div><h3>Received payments</h3><p>Recorded receipts only. This ledger does not process a charge or transfer money.</p></div><strong>' + currency(saleTotals(sale).paidCents, '—') + '</strong></div>' + (payments.length ? '<div class="sales-table-scroll" tabindex="0"><table class="sales-table sales-payments-table"><thead><tr><th scope="col">Received date</th><th scope="col">Method</th><th scope="col">Reference / notes</th><th scope="col">Amount</th></tr></thead><tbody>' + payments.map(payment => '<tr><td>' + e(displayDate(payment.date)) + '</td><td>' + e(methods[payment.method] || payment.method) + '</td><td>' + e(payment.reference || 'No reference entered') + (payment.notes ? '<span>' + e(payment.notes) + '</span>' : '') + '<small>Recorded ' + e(displayTime(payment.recordedAt)) + '</small></td><td class="sales-money">' + currency(payment.amountCents) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="sales-help">No received payments have been recorded.</p>') + (sale.status !== 'recorded' && Object.values(initial).some(nonblank) ? '<div class="sales-pending-payment"><h4>' + (sale.status === 'voided' ? 'Unrecorded draft payment information' : 'Draft payment to include when recording this sale') + '</h4><dl><div><dt>Amount</dt><dd>' + currency(moneyCents(initial.amount) === null ? null : Number(moneyCents(initial.amount))) + '</dd></div><div><dt>Method</dt><dd>' + e(methods[initial.method] || 'Not entered') + '</dd></div><div><dt>Received date</dt><dd>' + e(displayDate(initial.date)) + '</dd></div><div><dt>Reference</dt><dd>' + e(initial.reference || 'Not entered') + '</dd></div></dl>' + (initial.notes ? '<p>' + e(initial.notes) + '</p>' : '') + '</div>' : '') + paymentFormMarkup(sale) + '</section>';
  }
  function paymentFormMarkup(sale) {
    if (!state.paymentOpen || sale.status !== 'recorded') return '';
    const payment = state.paymentDraft;
    return '<form id="salesPaymentForm" class="sales-inline-form"><h4>Record a received payment</h4><p>Record money you have already received. Remaining balance: <strong>' + currency(saleTotals(sale).balanceCents) + '</strong>.</p><div class="sales-form-grid">' + input('amount', 'Amount received (USD)', payment.amount, moneyAttrs + ' required') + '<label>Method<select name="method" required>' + optionList({ '': 'Choose payment method', ...methods }, payment.method) + '</select></label>' + input('date', 'Actual received date', payment.date, 'type="date" max="' + today() + '" required') + input('reference', 'Receipt / transaction reference', payment.reference, 'maxlength="200"') + '</div><label class="sales-notes">Payment notes<textarea name="notes" rows="2" maxlength="2000">' + e(payment.notes) + '</textarea></label><div class="sales-inline-actions"><button class="sales-button sales-primary" type="submit">Record received payment</button>' + button('cancel-payment', 'Cancel') + '</div></form>';
  }
  function canVoid(sale) { return ['draft', 'recorded'].includes(sale.status) && Array.isArray(sale.payments) && sale.payments.length === 0 && (!sale.totals || sale.totals.paidCents === 0); }
  function voidMarkup(sale) {
    if (!state.voidOpen || !canVoid(sale)) return '';
    return '<form id="salesVoidForm" class="sales-inline-form sales-void-form"><h4>Void this unpaid sale</h4><p>The original values and history stay saved. A void excludes the sale from totals and does not issue a refund.</p><label>Reason for voiding<textarea name="reason" rows="3" maxlength="2000" required>' + e(state.voidReason) + '</textarea></label><div class="sales-inline-actions"><button type="submit" class="sales-button sales-danger">Void this sale</button>' + button('cancel-void', 'Cancel') + '</div></form>';
  }
  function historyMarkup(sale) {
    const history = [...(sale.history || [])].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return '<details class="sales-history"><summary>Saved history <span>' + history.length + ' event' + (history.length === 1 ? '' : 's') + '</span></summary>' + (history.length ? '<ol>' + history.map(item => '<li><div><strong>' + e(item.message || item.type || 'Updated') + '</strong>' + (item.user ? '<small>' + e(item.user) + '</small>' : '') + '</div><span>' + e(displayTime(item.at)) + '</span></li>').join('') + '</ol>' : '<p>Activity appears here when this record is saved.</p>') + '</details>';
  }
  function detailMarkup() {
    const sale = state.current;
    if (!sale) return listMarkup();
    const issues = sale.status === 'draft' ? recordIssues(sale) : [];
    const canPay = sale.status === 'recorded' && saleTotals(sale).balanceCents > 0 && (sale.payments || []).length < 200;
    return '<section class="sales-panel sales-sale-document"><div class="sales-panel-heading"><div><span class="sales-eyebrow">' + e(businessName(sale.businessId)) + ' · SAVED VERSION ' + e(sale.revision) + '</span><h3>' + e(sale.number || 'Sale record') + '</h3></div>' + badge(sale) + '</div><div class="sales-preview-grid"><div><span>Sale date</span><strong>' + e(displayDate(sale.soldOn)) + '</strong></div><div><span>Payment due</span><strong>' + e(displayDate(sale.dueDate)) + '</strong></div><div><span>Channel / location</span><strong>' + e(channels[sale.channel] || 'Not entered') + (sale.location ? ' · ' + e(sale.location) : '') + '</strong></div><div><span>Customer</span><strong>' + e(sale.customer?.name || 'Not entered') + '</strong>' + (sale.customer?.email ? '<small>' + e(sale.customer.email) + '</small>' : '') + '</div><div><span>Order / receipt reference</span><strong>' + e(sale.sourceReference || 'Not entered') + '</strong></div><div><span>' + (sale.status === 'recorded' ? 'Recorded' : sale.status === 'voided' ? 'Voided' : 'Draft saved') + '</span><strong>' + e(displayTime(sale.status === 'recorded' ? sale.recordedAt : sale.status === 'voided' ? sale.voidedAt : sale.updatedAt)) + '</strong></div></div>' + itemsTable(sale) + totalsMarkup(sale) + (sale.notes ? '<div class="sales-sale-notes"><h4>Sale notes</h4><p>' + e(sale.notes) + '</p></div>' : '') + '</section>' + paymentsMarkup(sale) + (sale.status === 'draft' ? '<div class="sales-record-box"><div><span class="sales-eyebrow">REVIEW THIS SAVED DRAFT</span><h3>Ready to record this sale?</h3><p>Recording saves these exact values to the ledger' + (Object.values(sale.initialPayment || {}).some(nonblank) ? ' and records the received payment shown above' : '') + '. Financial details become fixed. This does not charge a customer or update inventory, accounting, or reports.</p>' + (issues.length ? '<ul class="sales-review-issues">' + issues.map(issue => '<li>' + e(issue) + '</li>').join('') + '</ul>' : '') + '</div><div>' + button('record', 'Record sale', 'sales-primary', issues.length ? 'disabled' : '') + '</div></div>' : sale.status === 'voided' ? '<div class="sales-void-notice"><strong>This sale is voided and excluded from financial totals.</strong><p>Its original details and history remain saved.</p></div>' : '') + '<section class="sales-panel sales-record-tools"><div class="sales-tool-buttons">' + (sale.status === 'draft' ? button('edit', 'Edit draft') : '') + (canPay ? button('payment', 'Record received payment', 'sales-primary') : '') + button('print', 'Print / save PDF') + (canVoid(sale) ? button('void', 'Void unpaid sale', 'sales-text-button') : '') + '</div>' + voidMarkup(sale) + historyMarkup(sale) + '<p class="sales-help">Refunds are handled by management; amounts over $200 require Jay’s approval. Refund processing is not available on this page.</p></section>';
  }
  function unresolvedRequest() { return !state.current?.id && state.createRequest?.uncertain ? state.createRequest : state.paymentRequest?.uncertain ? state.paymentRequest : null; }
  function redraw() {
    if (!visible() || !host()) return;
    setDirty(state.changed || Boolean(unresolvedRequest()));
    document.body.classList.add('sales-view');
    const unresolved = unresolvedRequest();
    host().innerHTML = '<div id="salesHub" class="sales-hub" aria-busy="' + String(state.loading || state.saving) + '">' + heading() + (state.loaded ? businessSelector() : '') + (state.error ? '<div class="sales-error" role="alert">' + e(state.error) + '</div>' : '') + (unresolved ? '<div class="sales-uncertain"><strong>The previous request is not confirmed yet.</strong><p>Retry the same request to check its result without creating a duplicate. Its fields are held until that result is known.</p>' + button('retry-request', 'Retry the same request', 'sales-primary') + '</div>' : '') + (!state.loaded && state.loading ? '<section class="sales-panel sales-loading" role="status">Loading saved sales…</section>' : !state.loaded && state.error ? '<section class="sales-panel"><p>The ledger could not be loaded completely.</p>' + button('refresh', 'Try again') + '</section>' : state.mode === 'edit' ? editMarkup() : state.mode === 'detail' ? detailMarkup() : listMarkup()) + '</div>';
    if (state.saving || state.loading) host().querySelectorAll('#salesHub button, #salesHub input, #salesHub select, #salesHub textarea').forEach(control => { control.disabled = true; });
    else if (unresolved) host().querySelectorAll(unresolved.kind === 'create' ? '#salesEditForm input, #salesEditForm select, #salesEditForm textarea, #salesEditForm button' : '#salesPaymentForm input, #salesPaymentForm select, #salesPaymentForm textarea, #salesPaymentForm button').forEach(control => { control.disabled = true; });
  }
  async function readAllSales(businessId, requestGeneration) {
    const byId = new Map(), seen = new Set(['0']);
    let cursor = null, metadata = null;
    do {
      const result = await api('sales?businessId=' + encodeURIComponent(businessId) + (cursor === null ? '' : '&cursor=' + encodeURIComponent(cursor)));
      if (requestGeneration !== generation || businessId !== state.business) return null;
      if (!Array.isArray(result.sales)) throw new Error('The sales list could not be read.');
      if (result.businessId && result.businessId !== businessId) throw new Error('The sales response belongs to a different business. Refresh before continuing.');
      for (const sale of result.sales) { if (!sale || typeof sale.id !== 'string' || sale.businessId !== businessId) throw new Error('A sales record could not be safely matched to this business.'); byId.set(sale.id, sale); }
      if (!metadata) metadata = { businesses: Array.isArray(result.businesses) ? result.businesses.filter(business => knownBusiness(business.id)) : businesses, connections: result.connections || { inventory: false, accounting: false, reports: false } };
      const next = result.nextCursor;
      if (next === null || next === undefined) { if (result.limited) throw new Error('Only part of the sales history was returned. Refresh after the service update finishes.'); return { sales: [...byId.values()], ...metadata }; }
      if (typeof next !== 'string' || !/^\d+$/.test(next) || seen.has(next)) throw new Error('The sales history could not be loaded completely. Refresh to try again.');
      seen.add(next); cursor = next;
    } while (true);
  }
  function adoptList(result) { state.sales = result.sales; if (result.businesses?.length) state.businesses = result.businesses; state.connections = result.connections || state.connections; }
  async function load(force = false) {
    if (state.loading || state.saving) return;
    const unresolved = unresolvedRequest();
    if (state.changed && !force) { redraw(); return; }
    if (state.changed && force && !unresolved) { if (!leaveDraft()) return; discardWork(); }
    const requestGeneration = generation, businessId = state.business;
    state.loading = true; state.error = ''; redraw();
    try {
      const result = await readAllSales(businessId, requestGeneration);
      if (!result || requestGeneration !== generation || businessId !== state.business) return;
      adoptList(result); state.loaded = true;
      if (unresolved) {
        const saved = unresolved.kind === 'create' ? state.sales.find(sale => sale.createRequestId === unresolved.id) : state.sales.find(sale => sale.id === unresolved.saleId);
        const confirmed = saved && (unresolved.kind === 'create' || (saved.payments || []).some(payment => payment.requestId === unresolved.id));
        if (confirmed) { acceptSale(saved); if (typeof notice === 'function') notice('The saved result was found. Review the current record below.'); }
        else { if (saved && unresolved.kind === 'payment') state.current = copy(saved); state.error = 'The previous request is not confirmed yet. Its retry ID is preserved. Use Retry the same request to check the result without creating a duplicate.'; setDirty(true); }
      } else if (state.current?.id && !state.changed) { const saved = state.sales.find(sale => sale.id === state.current.id); state.current = saved ? copy(saved) : null; if (!saved) state.mode = 'list'; }
    } catch (error) { if (requestGeneration === generation) state.error = error.message; }
    finally { if (requestGeneration === generation) { state.loading = false; redraw(); } }
  }
  function clearInlineForms() { state.paymentOpen = false; state.paymentDraft = {}; state.paymentRequest = null; state.voidOpen = false; state.voidReason = ''; }
  function clearWork() { state.current = null; state.mode = 'list'; state.error = ''; state.createRequest = null; clearInlineForms(); setDirty(false); }
  function discardWork() { const saved = state.current?.id && state.sales.find(sale => sale.id === state.current.id); state.current = saved ? copy(saved) : null; state.mode = saved ? 'detail' : 'list'; state.error = ''; state.createRequest = null; clearInlineForms(); setDirty(false); }
  function leaveDraft() { if (state.saving) { if (typeof notice === 'function') notice('Wait for this request to finish before leaving the sale.', true); return false; } if (unresolvedRequest()) return confirm('This request may already be saved. Leaving does not cancel it. Leave this entry and check the saved history before creating another?'); return !state.changed || confirm('Leave without saving these sale or payment details?'); }
  function onLeave() { generation++; state.loading = false; state.saving = false; state.loaded = false; clearWork(); document.body.classList.remove('sales-view'); }
  function reset() { generation++; state.business = 'conestoga'; state.businesses = [...businesses]; state.sales = []; state.loaded = false; state.loading = false; state.saving = false; state.search = ''; state.channel = 'all'; state.status = 'all'; state.from = ''; state.to = ''; state.connections = { inventory: false, accounting: false, reports: false }; clearWork(); document.body.classList.remove('sales-view'); }
  function render() { if (!state.loaded && !state.loading) void load(); else redraw(); }
  function readEditForm() {
    const form = document.getElementById('salesEditForm');
    if (!form) return state.current;
    const data = new FormData(form), sale = { ...state.current };
    ['soldOn', 'dueDate', 'channel', 'location', 'sourceReference', 'discountAmount', 'taxAmount', 'shippingAmount', 'notes'].forEach(key => { if (data.has(key)) sale[key] = String(data.get(key)); });
    sale.customer = { ...(sale.customer || {}) };
    if (data.has('customerName')) sale.customer.name = String(data.get('customerName'));
    if (data.has('customerEmail')) sale.customer.email = String(data.get('customerEmail'));
    sale.items = [...form.querySelectorAll('[data-sales-line]')].map(row => Object.fromEntries(['description', 'sku', 'productId', 'batchReference', 'category', 'quantity', 'unit', 'unitPrice'].map(key => [key, row.querySelector('[data-line-key="' + key + '"]')?.value || ''])));
    sale.initialPayment = { ...(sale.initialPayment || {}) };
    Object.entries({ amount: 'initialAmount', method: 'initialMethod', date: 'initialDate', reference: 'initialReference', notes: 'initialNotes' }).forEach(([key, name]) => { if (data.has(name)) sale.initialPayment[key] = String(data.get(name)); });
    return sale;
  }
  function editableSale(sale) { const output = {}; ['businessId', 'soldOn', 'dueDate', 'channel', 'location', 'sourceReference', 'notes', 'discountAmount', 'taxAmount', 'shippingAmount'].forEach(key => { output[key] = String(sale[key] ?? ''); }); output.customer = { name: String(sale.customer?.name || ''), email: String(sale.customer?.email || '') }; output.items = (sale.items || []).map(item => Object.fromEntries(['description', 'sku', 'productId', 'batchReference', 'category', 'quantity', 'unit', 'unitPrice'].map(key => [key, String(item[key] ?? '')]))); output.initialPayment = Object.fromEntries(['amount', 'method', 'date', 'reference', 'notes'].map(key => [key, String(sale.initialPayment?.[key] ?? '')])); return output; }
  function readPaymentForm() { const form = document.getElementById('salesPaymentForm'); if (!form) return state.paymentDraft; const data = new FormData(form); return Object.fromEntries(['amount', 'method', 'date', 'reference', 'notes'].map(key => [key, String(data.get(key) || '')])); }
  function requestFor(kind, payload) {
    const key = kind === 'create' ? 'createRequest' : 'paymentRequest', fingerprint = JSON.stringify(payload), previous = state[key];
    if (previous?.fingerprint === fingerprint) return previous;
    if (previous?.uncertain) throw new Error('Confirm the previous request before changing its values. Use Retry the same request.');
    return state[key] = { kind, id: newId(), fingerprint, payload: copy(payload), uncertain: false, saleId: state.current?.id || null };
  }
  function acceptSale(sale) { const index = state.sales.findIndex(item => item.id === sale.id); if (index < 0) state.sales.unshift(sale); else state.sales[index] = sale; state.current = copy(sale); state.mode = 'detail'; state.createRequest = null; clearInlineForms(); setDirty(false); }
  async function mutate(action, extra = {}, message = '') {
    if (state.saving || state.loading) return false;
    const requestGeneration = generation, businessId = state.business, id = state.current?.id, expectedRevision = state.current?.revision, wasChanged = state.changed;
    if (!knownBusiness(businessId) || (state.current?.businessId && state.current.businessId !== businessId)) { state.error = 'Choose the business that owns this sale.'; redraw(); return false; }
    const pendingRequest = action === 'save' && !id ? state.createRequest : action === 'recordPayment' ? state.paymentRequest : null;
    state.saving = true; state.error = ''; setDirty(true); redraw();
    try {
      const result = await api('sales', { action, businessId, ...(id ? { id, expectedRevision } : {}), ...extra });
      if (requestGeneration !== generation || businessId !== state.business) return false;
      if (result.success === false || !result.sale || result.sale.businessId !== businessId) throw new Error(result.error || 'The saved result could not be confirmed. Refresh before trying again.');
      acceptSale(result.sale); if (message && typeof notice === 'function') notice(message); return true;
    } catch (error) {
      if (requestGeneration !== generation || businessId !== state.business) return false;
      let reconciled = false;
      if (pendingRequest) pendingRequest.uncertain = pendingRequest.uncertain || error.uncertain === true || Number(error.status) >= 500 || /interrupted|timeout|timed out|connection|network|could not be confirmed|not confirmed saved|storage could not be reached/i.test(error.message || '');
      try {
        const result = await readAllSales(businessId, requestGeneration);
        if (!result || requestGeneration !== generation) return false;
        adoptList(result);
        const saved = id ? state.sales.find(sale => sale.id === id) : pendingRequest ? state.sales.find(sale => sale.createRequestId === pendingRequest.id) : null;
        const paymentFound = saved && action === 'recordPayment' && (saved.payments || []).some(payment => payment.requestId === pendingRequest?.id);
        const exactSave = saved && action === 'save' && (!id || JSON.stringify(editableSale(saved)) === JSON.stringify(extra.sale));
        const finalState = saved && ((action === 'record' && saved.status === 'recorded') || (action === 'void' && saved.status === 'voided'));
        if (paymentFound || exactSave || finalState) { acceptSale(saved); reconciled = true; if (typeof notice === 'function') notice('The saved result was found. Review the current record below.'); }
        else if (saved && action !== 'save') state.current = copy(saved);
      } catch { if (requestGeneration !== generation || businessId !== state.business) return false; if (pendingRequest) pendingRequest.uncertain = true; }
      if (requestGeneration !== generation || businessId !== state.business) return false;
      if (!reconciled) { state.error = error.message; setDirty(wasChanged || Boolean(unresolvedRequest())); }
      return reconciled;
    } finally { if (requestGeneration === generation) { state.saving = false; redraw(); } }
  }
  async function saveDraft(review = false) {
    const form = document.getElementById('salesEditForm');
    if (!form || state.saving || !form.reportValidity() || (state.current?.id && state.current.status !== 'draft')) return;
    state.current = readEditForm();
    const calculation = calculate(state.current);
    if (calculation.errors.length) { state.error = calculation.errors.join(' '); redraw(); return; }
    const sale = editableSale(state.current);
    try { const request = state.current.id ? null : requestFor('create', sale); if (await mutate('save', { sale, ...(request ? { requestId: request.id } : {}) }, 'Sale draft saved. Review it before recording.')) { if (review) document.querySelector('[data-sales-action="record"]')?.focus({ preventScroll: true }); } }
    catch (error) { state.error = error.message; redraw(); }
  }
  async function recordPayment() {
    const form = document.getElementById('salesPaymentForm'), sale = state.current;
    if (!form || !form.reportValidity() || sale?.status !== 'recorded' || state.saving) return;
    const payment = readPaymentForm(), amount = moneyCents(payment.amount), balance = saleTotals(sale).balanceCents;
    state.paymentDraft = payment;
    if (amount === null || amount <= 0n || !centsKnown(balance) || amount > BigInt(balance) || !Object.hasOwn(methods, payment.method) || !validDate(payment.date) || payment.date > today()) { state.error = 'Enter a positive received payment within the remaining balance, its method, and its actual date on or before today.'; redraw(); return; }
    try { const request = requestFor('payment', payment); await mutate('recordPayment', { payment, requestId: request.id }, 'Received payment recorded. No charge was processed.'); }
    catch (error) { state.error = error.message; redraw(); }
  }
  function csvCell(value) { let text = String(value ?? '').replace(/\u0000/g, ''); if (/^[\s\u0001-\u001f\u007f\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; }
  function csvText(sales) {
    const headers = ['Business', 'Sale number', 'Status', 'Payment status', 'Sale date', 'Payment due date', 'Channel', 'Location', 'Customer', 'Customer email', 'Order / receipt reference', 'Items', 'Subtotal USD', 'Discount USD', 'Sales before tax USD', 'Tax USD', 'Shipping USD', 'Total USD', 'Received USD', 'Balance USD', 'Notes'];
    const rows = sales.filter(sale => sale.businessId === state.business).map(sale => { const totals = saleTotals(sale), net = centsKnown(totals.subtotalCents) && centsKnown(totals.discountCents) ? totals.subtotalCents - totals.discountCents : null; return [businessName(sale.businessId), sale.number || '', sale.status || 'draft', sale.paymentStatus || '', sale.soldOn || '', sale.dueDate || '', channels[sale.channel] || sale.channel || '', sale.location || '', sale.customer?.name || '', sale.customer?.email || '', sale.sourceReference || '', (sale.items || []).map(item => [item.description, item.quantity, units[item.unit] || item.unit, item.sku ? 'SKU ' + item.sku : ''].filter(Boolean).join(' · ')).join('\n'), moneyText(totals.subtotalCents), moneyText(totals.discountCents), moneyText(net), moneyText(totals.taxCents), moneyText(totals.shippingCents), moneyText(totals.totalCents), moneyText(totals.paidCents), moneyText(totals.balanceCents), sale.notes || '']; });
    return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  function exportCsv() { const list = filteredSales(); if (!list.length) return; const blob = new Blob(['\uFEFF' + csvText(list)], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sales-' + state.business + '-' + today() + '.csv'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function updateLiveTotals() { const form = document.getElementById('salesEditForm'); if (!form || !state.current) return; const result = calculate(state.current); form.querySelectorAll('[data-line-total]').forEach((control, index) => { control.textContent = currency(result.lineTotals[index], '—'); }); const totals = document.getElementById('salesLiveTotals'); if (totals) totals.outerHTML = totalsMarkup(state.current, true); const errors = document.getElementById('salesCalculationErrors'); if (errors) errors.innerHTML = result.errors.map(error => '<p>' + e(error) + '</p>').join(''); }
  document.addEventListener('click', async event => {
    const control = event.target.closest('[data-sales-action]');
    if (!control || !control.closest('#salesHub')) return;
    event.preventDefault(); if (state.saving || state.loading || control.disabled) return;
    const action = control.dataset.salesAction;
    if (action === 'new') { if (!leaveDraft()) return; clearWork(); state.current = blankSale(); state.mode = 'edit'; redraw(); document.querySelector('#salesEditForm [name="soldOn"]')?.focus(); }
    else if (action === 'back') { if (!leaveDraft()) return; clearWork(); redraw(); }
    else if (action === 'open') { if (!leaveDraft()) return; const sale = businessSales().find(item => item.id === control.dataset.saleId); if (sale) { clearWork(); state.current = copy(sale); state.mode = 'detail'; redraw(); } }
    else if (action === 'edit') { if (!leaveDraft() || state.current?.status !== 'draft') return; clearInlineForms(); state.mode = 'edit'; state.error = ''; setDirty(false); redraw(); }
    else if (action === 'add-line') { if (unresolvedRequest()) return; state.current = readEditForm(); if (state.current.items.length >= 100) return; state.current.items.push(blankItem()); setDirty(true); redraw(); const descriptions = document.querySelectorAll('#salesEditForm [data-line-key="description"]'); descriptions[descriptions.length - 1]?.focus(); }
    else if (action === 'remove-line') { if (unresolvedRequest()) return; state.current = readEditForm(); state.current.items.splice(Number(control.dataset.lineIndex), 1); setDirty(true); redraw(); }
    else if (action === 'save-review') await saveDraft(true);
    else if (action === 'record') { if (state.mode !== 'detail' || state.changed || state.current?.status !== 'draft' || recordIssues(state.current).length) return; await mutate('record', {}, 'Sale recorded in the ledger.'); }
    else if (action === 'payment') { if (state.paymentOpen) { document.querySelector('#salesPaymentForm [name="amount"]')?.focus(); return; } if (!leaveDraft() || state.current?.status !== 'recorded' || !(saleTotals(state.current).balanceCents > 0)) return; clearInlineForms(); state.paymentOpen = true; state.paymentDraft = { amount: '', method: '', date: '', reference: '', notes: '' }; state.error = ''; redraw(); document.querySelector('#salesPaymentForm [name="amount"]')?.focus(); }
    else if (action === 'cancel-payment') { if (unresolvedRequest() && !leaveDraft()) return; clearInlineForms(); state.error = ''; setDirty(false); redraw(); }
    else if (action === 'void') { if (state.voidOpen) { document.querySelector('#salesVoidForm [name="reason"]')?.focus(); return; } if (!leaveDraft() || !canVoid(state.current)) return; clearInlineForms(); state.voidOpen = true; state.error = ''; redraw(); document.querySelector('#salesVoidForm [name="reason"]')?.focus(); }
    else if (action === 'cancel-void') { clearInlineForms(); state.error = ''; setDirty(false); redraw(); }
    else if (action === 'refresh') await load(true);
    else if (action === 'clear-filters') { state.search = ''; state.channel = 'all'; state.status = 'all'; state.from = ''; state.to = ''; redraw(); }
    else if (action === 'export') exportCsv();
    else if (action === 'print') { if (!state.changed && state.mode === 'detail') window.print(); else if (typeof notice === 'function') notice('Save or cancel the current entry before printing the saved sale.', true); }
    else if (action === 'website-report' && state.business === 'doc_jaks' && typeof setView === 'function') await setView('Website Analytics');
    else if (action === 'retry-request') { const request = unresolvedRequest(); if (!request) return; if (request.kind === 'create') await mutate('save', { sale: request.payload, requestId: request.id }, 'Sale draft confirmed.'); else if (state.current?.id === request.saleId) await mutate('recordPayment', { payment: request.payload, requestId: request.id }, 'Received payment confirmed. No charge was processed.'); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.closest('#salesHub') || !['salesEditForm', 'salesPaymentForm', 'salesVoidForm'].includes(form.id)) return;
    event.preventDefault(); if (state.saving || state.loading || !form.reportValidity()) return;
    if (form.id === 'salesEditForm') return saveDraft();
    if (form.id === 'salesPaymentForm') return recordPayment();
    if (form.id === 'salesVoidForm' && canVoid(state.current)) { const reason = String(new FormData(form).get('reason') || '').trim(); state.voidReason = reason; if (!reason) { state.error = 'Enter a reason before voiding this sale.'; redraw(); return; } await mutate('void', { reason }, 'Sale voided. Original details and history remain saved.'); }
  });
  function rememberForm(event) { if (state.saving || state.loading || unresolvedRequest()) return; if (event.target.closest('#salesEditForm')) { state.current = readEditForm(); setDirty(true); updateLiveTotals(); } if (event.target.closest('#salesPaymentForm')) { state.paymentDraft = readPaymentForm(); setDirty(true); } if (event.target.closest('#salesVoidForm')) { state.voidReason = event.target.value; setDirty(true); } }
  document.addEventListener('input', event => { rememberForm(event); if (event.target.id === 'salesSearch') { state.search = event.target.value; const cursor = event.target.selectionStart; redraw(); const control = document.getElementById('salesSearch'); control?.focus(); if (typeof cursor === 'number') control?.setSelectionRange(cursor, cursor); } });
  document.addEventListener('change', async event => {
    if (state.saving || state.loading) return;
    rememberForm(event);
    const filters = { salesChannel: 'channel', salesStatus: 'status', salesFrom: 'from', salesTo: 'to' };
    if (filters[event.target.id]) { state[filters[event.target.id]] = event.target.value; const id = event.target.id; redraw(); document.getElementById(id)?.focus({ preventScroll: true }); }
    if (event.target.id === 'salesBusiness') { const business = event.target.value; if (!knownBusiness(business) || !leaveDraft()) { event.target.value = state.business; return; } generation++; clearWork(); state.business = business; state.sales = []; state.loaded = false; state.loading = false; state.search = ''; state.channel = 'all'; state.status = 'all'; state.from = ''; state.to = ''; await load(); document.getElementById('salesBusiness')?.focus({ preventScroll: true }); }
  });
  window.addEventListener('beforeunload', event => { if (state.changed || state.saving || unresolvedRequest()) { event.preventDefault(); event.returnValue = ''; } });
  window.djomsSales = { render, load, reset, onLeave, isDirty: () => state.changed || state.saving || Boolean(unresolvedRequest()), leaveDraft, clearDirty: () => setDirty(false) };
})();
