'use strict';
// Isolated Sales review. No live requests, account access, charges, or database writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const root = process.env.DJOMS_WORKSPACE_ROOT
  ? path.resolve(process.env.DJOMS_WORKSPACE_ROOT)
  : path.resolve(__dirname, fs.existsSync(path.join(__dirname, '..', 'sales.js')) ? '../..' : '..');
const modulePath = root + '/djoms-social-command/sales.js';
const source = fs.readFileSync(modulePath, 'utf8');
const exportNames = ['state', 'calculate', 'blankSale', 'businessSales', 'filteredSales', 'summary', 'listMarkup', 'editMarkup', 'detailMarkup', 'csvCell', 'csvText', 'readAllSales', 'saveDraft', 'mutate', 'recordIssues', 'reset', 'requestFor', 'unresolvedRequest', 'editableSale', 'recordPayment'];
const instrumentation = source.replace(/window\.djomsSales\s*=/, 'globalThis.__salesQA = {' + exportNames.map(name => name + ':typeof ' + name + '==="undefined"?undefined:' + name).join(',') + '};\n  window.djomsSales =');
assert.notEqual(instrumentation, source, 'Sales lifecycle export is present');
const clone = value => JSON.parse(JSON.stringify(value));
const businessList = [{id: 'conestoga', name: 'Colo Distillery LLC'}, {id: 'doc_jaks', name: "Doc Jak's"}];
const page = (sales = [], businessId = 'conestoga', nextCursor = null) => ({sales, businessId, businesses: businessList, timezone: 'America/Chicago', nextCursor, connections: {inventory: false, accounting: false, reports: false}});

function harness(responder, syntheticMutation) {
  const host = {innerHTML: '', querySelectorAll: () => []};
  const elements = new Map();
  const listeners = new Map();
  const calls = [];
  const focused = [];
  const windowListeners = new Map();
  let confirmAnswer = true;
  const context = {
    console, Intl, Date, JSON, Object, Array, String, Number, Map, Set, Math, BigInt,
    URL, URLSearchParams, Uint8Array, crypto: webcrypto,
    activeView: 'Sales', dirty: false,
    confirm: () => confirmAnswer,
    notice() {},
    setTimeout, clearTimeout,
    FormData: class {
      constructor(form) { this.values = form.values || {}; }
      get(key) { return this.values[key] ?? null; }
      has(key) { return Object.hasOwn(this.values, key); }
    },
    document: {
      body: {classList: {add() {}, remove() {}, toggle() {}}},
      getElementById: id => id === 'content' ? host : elements.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: (kind, fn) => listeners.set(kind, fn),
    },
    window: {addEventListener: (kind, fn) => windowListeners.set(kind, fn), print() { throw new Error('Printing is outside this verifier.'); }},
    fetch() { throw new Error('All direct network requests are forbidden.'); },
    api: async (path, body, method) => {
      calls.push({path, body: body === undefined ? undefined : clone(body), method});
      assert.match(path, /^sales(?:\?[^#]*)?$/);
      if (body !== undefined || (method && method !== 'GET')) {
        if (!syntheticMutation) throw new Error('QA blocks every backend mutation.');
        // Optional callback is fixture-only. It has no network or database implementation.
        return syntheticMutation(path, clone(body), calls.length);
      }
      if (responder) return responder(path, calls.length);
      const businessId = new URL(path, 'https://fixture.invalid/').searchParams.get('businessId');
      return page([], businessId);
    },
  };
  vm.createContext(context);
  vm.runInContext(instrumentation, context, {filename: modulePath});
  const qa = context.__salesQA;
  assert(qa?.state && typeof qa.calculate === 'function');
  const click = async (action, data = {}, disabled = false) => {
    const control = {disabled, dataset: {salesAction: action, ...data}, closest: selector => /sales/i.test(selector) ? host : null};
    return listeners.get('click')({preventDefault() {}, target: {closest: selector => selector === '[data-sales-action]' ? control : null}});
  };
  return {qa, context, host, elements, listeners, windowListeners, calls, focused, click, setConfirm(value) {confirmAnswer = value;}};
}

function fixture(overrides = {}) {
  return {businessId: 'conestoga', soldOn: '2020-01-01', dueDate: '', channel: 'retail', location: '', sourceReference: '',
    customer: {name: 'QA customer', email: ''}, notes: '',
    items: [{description: 'QA item', sku: 'QA-SKU', productId: '', batchReference: '', category: 'spirits', quantity: '1', unit: 'bottle', unitPrice: '10.00'}],
    discountAmount: '0.00', taxAmount: '0.00', shippingAmount: '0.00',
    initialPayment: {amount: '', method: '', date: '', reference: '', notes: ''},
    payments: [], history: [], ...overrides};
}

function recorded(id, businessId, total, paid = 0, status = 'recorded') {
  return fixture({id, number: 'QA-' + id, businessId, status, revision: 2, createdAt: '2020-01-01T12:00:00Z',
    paymentStatus: total === paid ? 'paid' : paid ? 'partial' : 'unpaid',
    payments: paid ? [{id: 'qa-payment', requestId: 'qa-payment-request', amount: (paid / 100).toFixed(2), amountCents: paid, date: '2020-01-01', method: 'cash', reference: 'QA', notes: ''}] : [],
    totals: {subtotalCents: total, discountCents: 0, taxCents: 0, shippingCents: 0, totalCents: total, paidCents: paid, balanceCents: total - paid}});
}

function functionSource(text, start, end) {
  const first = text.indexOf(start), last = text.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, 'Host function boundary exists: ' + start);
  return text.slice(first, last);
}

async function verifyHost() {
  const app = fs.readFileSync(root + '/djoms-social-command/app.js', 'utf8');
  const index = fs.readFileSync(root + '/djoms-social-command/index.html', 'utf8');
  const config = JSON.parse(fs.readFileSync(root + '/djoms-social-command/vercel.json', 'utf8'));
  const router = fs.readFileSync(root + '/djoms-meta-bridge/api/meta/[action].js', 'utf8');
  assert(index.includes('data-view="Sales"'));
  assert(index.includes('src="/sales.js?') && index.includes('href="/sales.css?'));
  assert(config.rewrites.some(rule => rule.source === '/sales' && rule.destination === '/index.html'));
  assert(router.includes("action === 'sales'") && router.includes("import('../../lib/sales.js')"));
  const events = [], elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, {hidden: false, innerHTML: '', textContent: '', value: '', close() {}, focus() {}, setAttribute() {}, showModal() {}});
    return elements.get(key);
  };
  const context = {console, URLSearchParams, owner: 'QA owner', csrf: 'QA token', dirty: true, activeView: 'Sales',
    campaigns: [], selected: null, campaignFilter: '', searchTerm: '', inboxChangingView: false, inboxDirty: new Set(),
    location: {pathname: '/sales', search: ''}, history: {replaceState(_state, _title, path) {events.push('path:' + path);context.location.pathname = path;}},
    $: element, confirm: () => false, notice(message) {events.push('notice:' + message);},
    document: {body: {classList: {toggle() {}, remove() {}}}, querySelector: () => ({hidden: false}), querySelectorAll: () => []},
    window: {djomsReportFilings: {reset() {events.push('reports-reset');}}, djomsSales: {reset() {events.push('sales-reset');}, leaveDraft() {return !context.dirty || context.confirm('QA discard prompt');}, onLeave() {events.push('sales-leave');}, render() {events.push('sales-render');context.dirty = true;}}},
    renderConnectionStrip() {}, render() {events.push('render:' + context.activeView);},
    async saveInboxFieldsAll() {},
    async api() {throw new Error('Synthetic unrelated social startup failure');},
    async loadRecords() {}, async loadAnalytics() {}, async loadLocalStatus() {}, async refreshConnection() {},
    loadComments() {return Promise.resolve();},
  };
  vm.createContext(context);
  vm.runInContext(functionSource(app, 'function authScreen(', 'async function api('), context);
  context.showLogin('QA session expired');
  assert.equal(context.owner, ''); assert.equal(context.csrf, '');
  assert(events.includes('sales-reset') && events.includes('reports-reset'));
  assert(element('content').innerHTML.includes('Owner sign-in required'));
  vm.runInContext(functionSource(app, 'async function signedIn(', 'function badge('), context);
  events.length = 0;
  await context.signedIn({user: 'QA owner', csrf: 'QA csrf'});
  await new Promise(resolve => setImmediate(resolve));
  assert(events.includes('render:Sales'), 'Sales opens before unrelated startup resolves');
  assert(!events.some(event => event.startsWith('notice:')), 'Unrelated startup error does not overwrite Sales');
  vm.runInContext(functionSource(app, 'async function setView(', 'function preparePlacecardPreviewCopy('), context);
  context.dirty = true; context.activeView = 'Sales'; events.length = 0;
  await context.setView('Reports & Filing');
  assert.equal(context.activeView, 'Sales'); assert(!events.includes('sales-leave'));
  context.confirm = () => {events.push('confirmed');return true;};
  await context.setView('Reports & Filing');
  assert(events.indexOf('confirmed') < events.indexOf('sales-leave'));
  assert.equal(context.activeView, 'Reports & Filing');
  context.activeView = 'Sales'; context.dirty = true; events.length = 0;
  await context.setView('Sales');
  assert.equal(events.length, 0, 'Same-view selection preserves current work');
  vm.runInContext(functionSource(app, 'function render() {', 'async function setView('), context);
  context.activeView = 'Sales'; context.dirty = true;
  context.render();
  assert(events.includes('sales-render'));
  assert.equal(context.dirty, true, 'Host allows module render to restore its private dirty state');
  const logout = app.slice(app.indexOf("if (action === 'logout')"), app.indexOf("else if (action === 'new')", app.indexOf("if (action === 'logout')")));
  assert(logout.indexOf('djomsSales') >= 0 && logout.indexOf('djomsSales') < logout.indexOf("await api('session'"), 'Logout invalidates Sales before its network await');
  assert(app.includes("activeView === 'Sales' && window.djomsSales) { await window.djomsSales.load(true); return;"));
  context.AbortSignal = {timeout() {return null;}};
  vm.runInContext(functionSource(app, 'async function api(', 'function updateRecord('), context);
  context.fetch = async () => {throw new Error('QA network interruption');};
  await assert.rejects(context.api('sales', {action: 'save'}), error => error.uncertain === true);
  for (const [status, serverUncertain, expected] of [[503,false,true],[400,false,false],[409,true,true]]) {
    context.fetch = async () => ({ok:false,status,json:async()=>({error:'QA server message',uncertain:serverUncertain})});
    await assert.rejects(context.api('sales', {action:'save'}), error => error.status === status && error.uncertain === expected);
  }
}

async function verifyRequests() {
  let createAttempts = 0;
  const uncertainCreate = harness(() => page(), (_path, body) => {
    createAttempts++;
    if (createAttempts === 1) throw Object.assign(new Error('QA storage operation failed.'), {status:503,uncertain:true});
    return {success:true,sale:{...fixture(body.sale),id:'qa-created',status:'draft',revision:1,createRequestId:body.requestId,number:'QA-CREATE'}};
  });
  const {qa,context} = uncertainCreate;
  qa.state.loaded = true; qa.state.current = fixture(); qa.state.mode = 'edit'; qa.state.changed = false;
  const payload = qa.editableSale(qa.state.current), request = qa.requestFor('create', payload);
  assert.equal(qa.requestFor('create', clone(payload)).id, request.id, 'Unchanged create keeps its request ID');
  assert.equal(await qa.mutate('save', {sale:payload,requestId:request.id}), false);
  assert.equal(request.uncertain, true, 'HTTP uncertainty metadata preserves unknown result');
  assert.equal(qa.state.changed, true, 'Uncertain creation remains guarded even without input events');
  assert.equal(context.dirty, true);
  assert.throws(() => qa.requestFor('create', {...payload,notes:'changed'}), /previous request/);
  await context.window.djomsSales.load(true);
  assert.equal(qa.state.createRequest.id,request.id,'Refresh preserves unresolved create retry ID');
  assert.equal(qa.state.current.businessId,'conestoga');
  assert.equal(qa.state.changed,true);
  uncertainCreate.setConfirm(false);
  assert.equal(context.window.djomsSales.leaveDraft(), false, 'Unknown create cannot be silently abandoned');
  let unloadGuarded = false;
  uncertainCreate.windowListeners.get('beforeunload')({preventDefault() {unloadGuarded = true;},returnValue:null});
  assert(unloadGuarded);
  await uncertainCreate.click('retry-request');
  const createPosts = uncertainCreate.calls.filter(call => call.body);
  assert.equal(createPosts.length,2);
  assert.equal(createPosts[0].body.requestId,createPosts[1].body.requestId);
  assert.deepEqual(createPosts[0].body.sale,createPosts[1].body.sale);
  assert.equal(qa.state.current.id,'qa-created'); assert.equal(qa.state.createRequest,null); assert.equal(qa.state.changed,false);

  let paymentAttempts = 0;
  const original = recorded('qa-payment-sale','conestoga',1000);
  const uncertainPayment = harness(() => page([original]), (_path, body) => {
    paymentAttempts++;
    if (paymentAttempts === 1) throw Object.assign(new Error('QA receipt operation failed.'), {status:503,uncertain:true});
    const result = recorded(original.id,'conestoga',1000,200);
    result.payments[0].requestId = body.requestId;
    return {success:true,sale:result};
  });
  uncertainPayment.qa.state.loaded = true; uncertainPayment.qa.state.current = original; uncertainPayment.qa.state.mode = 'detail';
  const payment = {amount:'2.00',method:'cash',date:'2020-01-01',reference:'QA',notes:''};
  const paymentRequest = uncertainPayment.qa.requestFor('payment',payment);
  await uncertainPayment.qa.mutate('recordPayment',{payment,requestId:paymentRequest.id});
  assert(paymentRequest.uncertain && uncertainPayment.qa.state.changed);
  assert.throws(() => uncertainPayment.qa.requestFor('payment',{...payment,amount:'3.00'}),/previous request/);
  await uncertainPayment.click('retry-request');
  const paymentPosts = uncertainPayment.calls.filter(call => call.body);
  assert.equal(paymentPosts.length,2); assert.equal(paymentPosts[0].body.requestId,paymentPosts[1].body.requestId);
  assert.deepEqual(paymentPosts[0].body.payment,paymentPosts[1].body.payment);
  assert.equal(uncertainPayment.qa.state.paymentRequest,null);

  let savedReceipt;
  const recovered = harness(() => page([savedReceipt]), (_path,body) => {
    savedReceipt = recorded('qa-recovered','conestoga',1000,200);
    savedReceipt.payments[0].requestId = body.requestId;
    throw Object.assign(new Error('QA response was lost.'),{uncertain:true});
  });
  recovered.qa.state.loaded = true; recovered.qa.state.current = recorded('qa-recovered','conestoga',1000); recovered.qa.state.mode='detail';
  const recoverRequest = recovered.qa.requestFor('payment',payment);
  assert.equal(await recovered.qa.mutate('recordPayment',{payment,requestId:recoverRequest.id}),true,'Lost receipt response is found in reconciliation');
  assert.equal(recovered.qa.state.current.totals.paidCents,200);
  assert.equal(recovered.calls.filter(call=>call.body).length,1);
  assert.equal(recovered.qa.state.paymentRequest,null);

  let finish;
  const pending = harness(undefined, () => new Promise(resolve => {finish=resolve;}));
  pending.qa.state.loaded = true; pending.qa.state.current=fixture(); pending.qa.state.mode='edit';
  const pendingRequest=pending.qa.requestFor('create',pending.qa.editableSale(pending.qa.state.current));
  const pendingCall=pending.qa.mutate('save',{sale:pendingRequest.payload,requestId:pendingRequest.id});
  assert.equal(pending.context.window.djomsSales.leaveDraft(),false,'In-flight mutation blocks navigation');
  pending.context.window.djomsSales.reset();
  finish({success:true,sale:{...fixture(),id:'qa-stale',status:'draft',revision:1}});
  assert.equal(await pendingCall,false);
  assert.equal(pending.qa.state.current,null); assert.equal(pending.qa.state.sales.length,0);
}

async function verifyBusinessSwitch() {
  const h = harness(path => {
    const businessId=new URL(path,'https://fixture.invalid/').searchParams.get('businessId');
    return page([recorded('qa-'+businessId,businessId,500)],businessId);
  });
  h.qa.state.loaded=true; h.qa.state.current=fixture({notes:'Unsaved Colo note'}); h.qa.state.mode='edit';
  h.qa.state.sales=[recorded('old-colo','conestoga',1000)]; h.qa.state.changed=true;
  h.qa.state.search='old filter'; h.qa.state.from='2020-01-01'; h.qa.state.channel='wholesale'; h.qa.state.status='draft';
  const target={id:'salesBusiness',value:'doc_jaks',closest:()=>null};
  h.setConfirm(false);
  await h.listeners.get('change')({target});
  assert.equal(h.qa.state.business,'conestoga'); assert.equal(target.value,'conestoga');
  assert.equal(h.qa.state.current.notes,'Unsaved Colo note'); assert.equal(h.calls.length,0);
  target.value='doc_jaks'; h.setConfirm(true);
  await h.listeners.get('change')({target});
  assert.equal(h.qa.state.business,'doc_jaks'); assert.equal(h.qa.state.current,null); assert.equal(h.qa.state.mode,'list');
  assert.equal(h.qa.state.changed,false); assert.equal(h.qa.state.search,''); assert.equal(h.qa.state.from,'');
  assert.equal(h.qa.state.channel,'all'); assert.equal(h.qa.state.status,'all');
  assert.equal(h.qa.state.sales.length,1); assert.equal(h.qa.state.sales[0].businessId,'doc_jaks');
  assert(h.calls.every(call=>new URL(call.path,'https://fixture.invalid/').searchParams.get('businessId')==='doc_jaks'));
  await h.click('new');
  assert.equal(h.qa.state.current.businessId,'doc_jaks');
  assert.equal(h.qa.state.current.notes,'');
}

async function main() {
  const h = harness();
  const {normalizeSale} = await import(root + '/djoms-meta-bridge/lib/sales.js');
  for (const [quantity, price, expected] of [['1','0.10',10], ['0.5','0.01',1], ['0.499999','0.01',0], ['1.005','1.00',101], ['0.000001','10000.00',1], ['2.333333','3.00',700]]) {
    const sale = fixture({items: [{...fixture().items[0], quantity, unitPrice: price}]});
    assert.equal(h.qa.calculate(sale).lineTotals[0], expected);
    assert.equal(normalizeSale(sale, 'conestoga').items[0].lineTotalCents, expected);
  }
  const rounded = fixture({items: [0,1].map(() => ({...fixture().items[0], quantity: '0.5', unitPrice: '0.01'}))});
  assert.equal(h.qa.calculate(rounded).totals.totalCents, 2, 'Round each line before adding');
  const unknown = h.qa.calculate(fixture({taxAmount: ''}));
  assert.equal(unknown.totals.taxCents, null); assert.equal(unknown.totals.totalCents, null);
  assert.equal(h.qa.calculate(fixture({taxAmount: '0'})).totals.taxCents, 0);
  assert(h.qa.calculate(fixture({discountAmount: '10.01'})).errors.length);
  const initial = fixture({initialPayment: {amount: '5.00', method: 'cash', date: '2020-01-01', reference: '', notes: ''}});
  assert.equal(h.qa.calculate(initial).totals.paidCents, 0, 'Draft initial payment is not a saved receipt');
  const a = recorded('a', 'conestoga', 1000, 400);
  const b = recorded('b', 'doc_jaks', 9999, 9999);
  h.qa.state.sales = [a, b, recorded('draft','conestoga',5000,0,'draft'), recorded('void','conestoga',7000,0,'voided')];
  h.qa.state.business = 'conestoga'; h.qa.state.loaded = true;
  assert(h.qa.filteredSales().every(sale => sale.businessId === 'conestoga'));
  const totals = h.qa.summary(h.qa.filteredSales());
  assert.equal(totals.count, 1); assert.equal(totals.beforeTax, 1000); assert.equal(totals.receipts, 400); assert.equal(totals.balance, 600);
  const ledger = h.qa.listMarkup();
  assert(!ledger.includes('QA-b'));
  assert(ledger.includes('Inventory · Not connected') && ledger.includes('Accounting · Not connected') && ledger.includes('Reports · Not connected'));
  for (const text of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) assert(!/^"?[\s]*[=+\-@]/.test(h.qa.csvCell(text)), 'CSV formula neutralized');
  assert.equal(h.qa.recordIssues(fixture()).length, 0);
  assert(h.qa.recordIssues(fixture({taxAmount: ''})).length, 'Explicit tax required for recording');
  assert(h.qa.recordIssues(fixture({soldOn: '2199-01-01'})).length, 'Future sale cannot be recorded');
  assert(h.qa.recordIssues(fixture({initialPayment: {amount: '10.01', method: 'cash', date: '2020-01-01', reference: '', notes: ''}})).length);
  h.qa.state.current = a;
  let detail = h.qa.detailMarkup();
  assert(!detail.includes('data-sales-action="edit"'), 'Recorded sale has no edit control');
  assert(!detail.includes('data-sales-action="void"'), 'Sale with received payment has no void control');
  assert(detail.includes('data-sales-action="payment"'), 'Partial sale accepts received-payment entry');
  h.qa.state.current = recorded('unpaid', 'conestoga', 1000);
  assert(h.qa.detailMarkup().includes('data-sales-action="void"'));
  h.qa.state.current = recorded('free', 'conestoga', 0);
  assert(h.qa.detailMarkup().includes('data-sales-action="void"'), 'Zero-total sale without payments remains voidable');
  h.qa.state.current = {...recorded('void-date', 'conestoga', 1000, 0, 'voided'), recordedAt: '2020-01-01T18:00:00Z', voidedAt: '2020-01-03T18:00:00Z'};
  detail = h.qa.detailMarkup();
  assert.match(detail.match(/<span>Voided<\/span><strong>([^<]+)<\/strong>/)?.[1] || '', /Jan 3/, 'Voided date uses the void timestamp');
  h.qa.state.current = {...a, customer: {name: '<img src=x onerror=alert(1)>', email: ''}, notes: '<script>QA</script>'};
  assert(!h.qa.detailMarkup().includes('<img src=x'));
  assert(!h.qa.detailMarkup().includes('<script>QA</script>'));
  const many = Array.from({length: 51}, (_, i) => recorded('page-' + i, 'conestoga', 100));
  const pages = harness(path => new URL(path, 'https://fixture.invalid/').searchParams.has('cursor') ? page(many.slice(50), 'conestoga') : page(many.slice(0,50), 'conestoga', '50'));
  const all = await pages.qa.readAllSales('conestoga', 0);
  assert.equal(all.sales.length, 51);
  assert.equal(pages.calls.length, 2);
  const cycle = harness(() => page([], 'conestoga', '50'));
  await assert.rejects(cycle.qa.readAllSales('conestoga', 0));
  assert.equal(cycle.calls.length, 2);
  const wrongBusiness = harness(() => page([b], 'conestoga'));
  await assert.rejects(wrongBusiness.qa.readAllSales('conestoga', 0), 'Mixed-business API data must fail closed');
  let resolveOld;
  const stale = harness(() => new Promise(resolve => {resolveOld = resolve;}));
  const pending = stale.qa.readAllSales('conestoga', 0);
  stale.context.window.djomsSales.reset();
  resolveOld(page([a], 'conestoga'));
  assert.equal(await pending, null);
  assert.equal(stale.qa.state.sales.length, 0);
  h.qa.state.current = fixture({notes: 'QA unsaved editor text'}); h.qa.state.mode = 'edit'; h.qa.state.changed = true;
  h.context.dirty = false;
  h.context.window.djomsSales.render();
  assert.equal(h.context.dirty, true, 'Module restores private dirty state after host render clears global flag');
  assert.equal(h.qa.state.current.notes, 'QA unsaved editor text');
  h.setConfirm(false);
  assert.equal(h.context.window.djomsSales.leaveDraft(), false);
  assert.equal(h.qa.state.current.notes, 'QA unsaved editor text');
  h.setConfirm(true);
  assert.equal(h.context.window.djomsSales.leaveDraft(), true);
  h.context.window.djomsSales.onLeave();
  assert.equal(h.qa.state.changed, false);
  h.context.window.djomsSales.reset();
  assert.equal(h.qa.state.sales.length, 0); assert.equal(h.qa.state.current, null);
  assert.equal(h.qa.state.paymentRequest, null); assert.equal(h.qa.state.createRequest, null);
  await verifyHost();
  await verifyRequests();
  await verifyBusinessSwitch();
  assert(h.calls.every(call => call.body === undefined));
  console.log('PASS: Sales arithmetic/rounding, blank tax, business switching, recorded-only totals, CSV protection, honest connections, uncertainty/retry/reconciliation, reset guards, and host lifecycle/error metadata. No network or database access; fixture-only mutations.');
}

if (require.main === module) main().catch(error => {console.error(error);process.exitCode = 1;});
module.exports = {harness, fixture, recorded, page, verifyHost};
