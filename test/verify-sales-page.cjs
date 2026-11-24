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
const exportNames = ['state', 'calculate', 'blankSale', 'businessSales', 'filteredSales', 'summary', 'listMarkup', 'editMarkup', 'detailMarkup', 'csvCell', 'csvText', 'readAllSales', 'saveDraft', 'readEditForm', 'mutate', 'recordIssues', 'reset', 'requestFor', 'unresolvedRequest', 'editableSale', 'recordPayment', 'monthBounds', 'periodRange', 'periodStats', 'periodSales', 'bottleMetrics', 'bottleBreakdown', 'bottleEditorMarkup', 'lineMarkup', 'abvText', 'scaledText', 'operationsMarkup', 'dailyRowsMarkup', 'blankDay', 'dayPayload', 'dayInputErrors', 'readDaysMonth', 'readDay', 'openDay', 'saveDay', 'mutateDay', 'dayHistoryMarkup', 'divisionOf', 'divisionSales', 'masterStats', 'masterMarkup', 'productsForDivision', 'catalogMarkup', 'blankProduct', 'productPayload', 'itemFromProduct', 'productMarkup', 'readProducts', 'readProduct', 'openProduct', 'acceptProduct', 'mutateProduct', 'saveProduct'];
const instrumentation = source.replace(/window\.djomsSales\s*=/, 'globalThis.__salesQA = {' + exportNames.map(name => name + ':typeof ' + name + '==="undefined"?undefined:' + name).join(',') + '};\n  window.djomsSales =');
assert.notEqual(instrumentation, source, 'Sales lifecycle export is present');
const clone = value => JSON.parse(JSON.stringify(value));
const businessList = [{id: 'conestoga', name: 'Colo Distillery LLC'}, {id: 'doc_jaks', name: "Doc Jak's"}];
const page = (sales = [], businessId = 'conestoga', nextCursor = null) => ({sales, businessId, businesses: businessList, timezone: 'America/Chicago', nextCursor, connections: {inventory: false, accounting: false, reports: false}});
const dailyPage = (days = [], businessId = 'conestoga', month = '2024-02') => ({days, businessId, month, timezone:'America/Chicago'});
const dailyFixture = (date, values = {}, businessId = 'conestoga') => ({id:date, businessId, date, revision:1, visitors:'', tastings:'', cocktails:'', tipsAmount:'', tipsCents:null, notes:'', createdAt:date+'T18:00:00Z', updatedAt:date+'T18:00:00Z', createdBy:'QA owner', updatedBy:'QA owner', history:[], historyCount:0, ...values});
const productFixture=(values={})=>({id:'a'.repeat(36),businessId:'conestoga',revision:1,division:'food',name:'Synthetic product',sku:'QA-FOOD',packageLabel:'12 oz bottle',unit:'bottle',defaultPrice:'',bottleSizeMl:'',bottlesPerUnit:'',proof:'',active:true,createRequestId:'qa-product-created',lastRequestId:'qa-product-created',history:[{type:'created',revision:1,user:'QA owner',at:'2024-02-15T18:00:00Z',requestId:'qa-product-created',before:null,after:{name:'Synthetic product'}}],...values});
const productsPage=(products=[],businessId='conestoga')=>({businessId,products:products.map(({history,...product})=>({...product,historyCount:history?.length||0}))});

function harness(responder, syntheticMutation, dailyResponder, productResponder) {
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
      querySelector: selector => elements.get(selector) || null,
      querySelectorAll: () => [],
      addEventListener: (kind, fn) => listeners.set(kind, fn),
    },
    window: {addEventListener: (kind, fn) => windowListeners.set(kind, fn), print() { throw new Error('Printing is outside this verifier.'); }},
    fetch() { throw new Error('All direct network requests are forbidden.'); },
    api: async (path, body, method) => {
      calls.push({path, body: body === undefined ? undefined : clone(body), method});
      assert.match(path, /^(?:sales|sales-days|sales-products)(?:\?[^#]*)?$/);
      if (body !== undefined || (method && method !== 'GET')) {
        if (!syntheticMutation) throw new Error('QA blocks every backend mutation.');
        // Optional callback is fixture-only. It has no network or database implementation.
        return syntheticMutation(path, clone(body), calls.length);
      }
      const route = new URL(path, 'https://fixture.invalid/');
      const businessId = route.searchParams.get('businessId');
      if (route.pathname === '/sales-days') {
        if (dailyResponder) return dailyResponder(path,calls.length);
        return route.searchParams.has('date') ? {day:null} : dailyPage([],businessId,route.searchParams.get('month'));
      }
      if (route.pathname === '/sales-products') {
        if(productResponder)return productResponder(path,calls.length);
        if(route.searchParams.has('id'))throw Object.assign(new Error('No synthetic product for this ID.'),{status:404,uncertain:false});
        return {businessId,products:[]};
      }
      if (responder) return responder(path, calls.length);
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
  assert(router.includes("action === 'sales-days'") && router.includes("import('../../lib/sales-days.js')"));
  assert(router.includes("action === 'sales-products'") && router.includes("import('../../lib/sales-products.js')"));
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
    window: {djomsReportFilings: {reset() {events.push('reports-reset');},render() {events.push('reports-render');}}, djomsSales: {reset() {events.push('sales-reset');}, leaveDraft() {return !context.dirty || context.confirm('QA discard prompt');}, onLeave() {events.push('sales-leave');}, render() {events.push('sales-render');context.dirty = true;}}},
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
  context.window.djomsReportFilings.openForBusiness = (...args) => {events.push('reports-open:'+args.join('|'));return true;};
  context.activeView='Sales'; context.owner='QA owner'; context.dirty=true; context.confirm=()=>false;
  events.length=0;
  assert.equal(await context.window.djomsOpenSalesReport('doc_jaks','ttb_storage','2024-02'),false);
  assert(!events.some(event=>event.startsWith('reports-open:')),'Declined Sales leave does not open report context');
  context.confirm=()=>true;
  assert.equal(await context.window.djomsOpenSalesReport('doc_jaks','ttb_storage','2024-02'),true);
  assert(events.includes('reports-open:doc_jaks|ttb_storage|2024-02'),'Report bridge retains business, template and calendar month');
  for(const [businessId,templateId,month] of [['other','ttb_storage','2024-02'],['doc_jaks','other','2024-02'],['doc_jaks','ttb_storage','2024-13']]){
    events.length=0;
    assert.equal(await context.window.djomsOpenSalesReport(businessId,templateId,month),false); assert.equal(events.length,0);
  }
  context.owner=''; events.length=0;
  assert.equal(await context.window.djomsOpenSalesReport('doc_jaks','ttb_excise','2024-02'),false); assert.equal(events.length,0);
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
  const target={id:'salesBusiness',value:'doc_jaks',dataset:{},closest:()=>null};
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

async function verifyVolumeMath() {
  const h=harness();
  const {normalizeSale}=await import(root+'/djoms-meta-bridge/lib/sales.js');
  const line=overrides=>({...fixture().items[0],purpose:'bottle_sale',bottleSizeMl:'750',bottlesPerUnit:'',proof:'80',unitPrice:'0.00',...overrides});
  const fields=['bottleCount','volumeMl','wineGallonsMicros','proofGallonsMicros'];
  const values=item=>fields.map(field=>item[field]);
  for(const [input,expected] of [
    [{},[1,750,198129,158503]],
    [{unit:'case',quantity:'3',bottlesPerUnit:'12',bottleSizeMl:'350'},[36,12600,3328566,2662853]],
    [{quantity:'36',bottleSizeMl:'350'},[36,12600,3328567,2662854]],
    [{quantity:'9',bottleSizeMl:'150'},[9,1350,356632,285306]],
    [{bottleSizeMl:'1000',proof:'80.125'},[1,1000,264172,211668]],
    [{proof:''},[1,750,198129,null]],
    [{bottleSizeMl:'1',proof:'0.001'},[1,1,264,0]],
  ]){
    const item=line(input),local=h.qa.bottleMetrics(item),saved=normalizeSale(fixture({items:[item]}),'conestoga').items[0];
    assert.deepEqual(values(local),expected,'Frontend volume conversion for '+JSON.stringify(input));
    assert.deepEqual(values(saved),expected,'Backend volume conversion for '+JSON.stringify(input));
  }
  assert.equal(h.qa.abvText('80.125'),'40.0625% ABV');
  assert.equal(h.qa.abvText(''),'ABV unknown');
  assert.equal(h.qa.scaledText(198129,6),'0.198129');
  assert.equal(h.qa.scaledText(null,6),'Unknown');
  assert.equal(h.qa.scaledText(0,6),'0.000000','A known rounded zero is not missing proof');
  for(const overrides of [{purpose:''},{purpose:'tasting'},{purpose:'cocktail'},{purpose:'sample'},{purpose:'other'},
    {category:'food'},{unit:'each'},{quantity:''},{quantity:'1.5'},{bottleSizeMl:''},{unit:'case',bottlesPerUnit:''}]){
    assert.deepEqual(values(h.qa.bottleMetrics(line(overrides))),[null,null,null,null]);
  }
  for(const overrides of [{bottleSizeMl:'0'},{bottleSizeMl:'100001'},{unit:'case',bottlesPerUnit:'1001'},{unit:'case',bottlesPerUnit:'1.5'},
    {proof:'0'},{proof:'200.001'},{proof:'80.0001'},{quantity:'200000000',bottleSizeMl:'100000',proof:'200'}]){
    const item=line(overrides);
    assert(h.qa.bottleMetrics(item).issues.length,'Invalid or unsafe bottle metadata is visible');
    assert.throws(()=>normalizeSale(fixture({items:[item]}),'conestoga'));
  }
  h.qa.state.business='conestoga'; h.qa.state.division='alcohol'; h.qa.state.month='2024-02'; h.qa.state.loaded=true;
  const sale=(id,items,extra={})=>({...recorded(id,'conestoga',100),division:'alcohol',soldOn:'2024-02-15',items,...extra});
  h.qa.state.sales=[sale('known',[line({productId:'qa-product',quantity:'2',bottleSizeMl:'150'})]),
    sale('custom',[line({productId:'qa-custom',bottleSizeMl:'350'})]),
    ...['tasting','cocktail','sample','other'].map(purpose=>sale('excluded-'+purpose,[line({purpose})])),
    sale('draft',[line({quantity:'99'})],{status:'draft'}),sale('voided',[line({quantity:'99'})],{status:'voided'}),
    sale('outside-month',[line({quantity:'99'})],{soldOn:'2024-03-01'}),sale('other-business',[line({quantity:'99'})],{businessId:'doc_jaks'})];
  let total=h.qa.bottleBreakdown('month','all');
  assert.equal(total.bottleCount,3); assert.equal(total.volumeMl,650); assert.equal(total.excludedUses,4);
  assert.deepEqual(clone(total.sizes).slice(0,5),['50','100','150','375','750']); assert(total.sizes.includes('350'));
  h.qa.state.sales.push(sale('missing-proof',[line({productId:'qa-no-proof',proof:''})]));
  total=h.qa.bottleBreakdown('month','all');
  assert.equal(total.bottleCount,4); assert.equal(total.volumeMl,1400); assert.equal(total.missingProof,1); assert.equal(total.proofGallonsMicros,null);
  assert(Number.isSafeInteger(total.wineGallonsMicros));
  h.qa.state.sales.push(sale('legacy',[line({purpose:'',bottleSizeMl:'',proof:''})]));
  total=h.qa.bottleBreakdown('month','all');
  assert.equal(total.unclassified,1); assert.equal(total.bottleCount,null); assert.equal(total.volumeMl,null); assert.equal(total.proofGallonsMicros,null);
  assert(total.rows.some(row=>row.sizes['150']===2),'Known size cells survive an unknown overall total');
  h.qa.state.sales=[sale('catering-bottles',[line({quantity:'2'})],{division:'catering',outlet:'catering'}),
    sale('event-bottles',[line({quantity:'3'})],{division:'events',outlet:'event'}),
    sale('food-package',[line({category:'food',purpose:'',bottleSizeMl:'',proof:'',packageLabel:'12 oz bottle',quantity:'50'})],{division:'food',outlet:'event'})];
  total=h.qa.bottleBreakdown('month','all');
  assert.equal(total.bottleCount,5,'Physical spirit lines in Catering and Events count once across all divisions');
  assert.equal(total.volumeMl,3750);assert.equal(total.unclassified,0,'Food package labels never become alcohol volume');
  // Reproduce one concrete overflow propagation risk across valid saved records.
  const huge=line({quantity:'999999999',unit:'case',bottlesPerUnit:'1000',bottleSizeMl:'1',proof:'0.001',productId:'qa-overflow'});
  h.qa.state.sales=Array.from({length:91},(_,i)=>sale('overflow-'+i,Array(i===90?9:100).fill(huge)));
  total=h.qa.bottleBreakdown('month','all');
  assert.equal(total.bottleCount,null); assert.equal(total.rows[0].sizes['1'],null,'An overflowed size subtotal must not reset to zero on its next line');
}

function verifyPeriodsAndCoverage() {
  const h=harness(),s=h.qa.state;
  for(const [month,last] of [['2023-02',28],['2024-02',29],['2024-12',31],['2024-04',30]]){
    assert.equal(h.qa.monthBounds(month).last,last);
    const first=h.qa.periodRange('first',month),second=h.qa.periodRange('second',month);
    assert.equal(first.start,month+'-01');assert.equal(first.end,month+'-15');assert.equal(first.days,15);
    assert.equal(second.start,month+'-16');assert.equal(second.end,month+'-'+last);assert.equal(second.days,last-15);
  }
  assert.equal(h.qa.monthBounds('2024-13'),null); assert.equal(h.qa.monthBounds('2024-2'),null);
  Object.assign(s,{business:'conestoga',division:'alcohol',month:'2024-02',loaded:true,daysLoaded:true});
  const sale=(id,date,total,extra={})=>({...recorded(id,'conestoga',total),soldOn:date,division:'alcohol',channel:'retail',outlet:'in_store',...extra});
  s.sales=[sale('first','2024-02-15',1001),sale('second','2024-02-16',1999),sale('last','2024-02-29',0),
    sale('food','2024-02-15',500000,{division:'food'}),sale('catering','2024-02-15',500000,{division:'catering'}),
    sale('legacy','2024-02-15',500000,{division:''}),sale('wholesale','2024-02-16',500000,{channel:'wholesale'}),
    sale('draft','2024-02-15',500000,{status:'draft'}),sale('voided','2024-02-15',500000,{status:'voided'}),
    sale('previous-month','2024-01-31',500000),sale('next-month','2024-03-01',500000),sale('previous-year','2023-02-15',500000),
    sale('other-business','2024-02-15',900,{businessId:'doc_jaks'})];
  s.days=[dailyFixture('2024-02-15',{visitors:'4',tastings:'',cocktails:'0',tipsAmount:'1.00',tipsCents:100}),
    dailyFixture('2024-02-16',{visitors:'6',tastings:'2',cocktails:'',tipsAmount:'0.50',tipsCents:50}),
    dailyFixture('2024-02-29',{visitors:'0',tastings:'0',cocktails:'0',tipsAmount:'0.00',tipsCents:0}),
    dailyFixture('2024-03-01',{visitors:'999',tipsCents:99900}),dailyFixture('2023-02-15',{visitors:'999',tipsCents:99900}),
    dailyFixture('2024-02-15',{visitors:'3',tipsCents:500},'doc_jaks')];
  const first=h.qa.periodStats('first'),second=h.qa.periodStats('second'),month=h.qa.periodStats('month');
  assert.equal(first.retailSpend,1001); assert.equal(second.retailSpend,1999); assert.equal(month.retailSpend,3000);
  assert.equal(first.visitors,4);assert.equal(second.visitors,6);assert.equal(month.visitors,10);
  assert.equal(month.visitorDays,3);assert.equal(month.tips,150);assert.equal(month.tipDays,3);
  assert.equal(first.average,250);assert.equal(second.average,333);assert.equal(month.average,300,'Period average uses summed spend and visitors');
  assert.equal(first.tastings,null);assert.equal(first.cocktails,0);assert.equal(month.tastings,2);
  assert.equal(month.missingVisitorDates.length,0);
  Object.assign(s,{search:'no matching sale',channel:'wholesale',status:'draft',from:'2025-01-01',to:'2025-01-31'});
  assert.equal(h.qa.filteredSales().length,0);assert.equal(h.qa.periodStats('month').retailSpend,3000,'Ledger filters do not change the Alcohol operating month');
  s.days=s.days.filter(day=>!(day.businessId==='conestoga'&&day.date==='2024-02-16'));
  let stats=h.qa.periodStats('month');
  assert.equal(stats.average,null);assert.deepEqual(clone(stats.missingVisitorDates),['2024-02-16']);assert.equal(stats.visitors,4);
  s.days.push(dailyFixture('2024-02-16',{visitors:'',tipsCents:null}));
  stats=h.qa.periodStats('month');assert.equal(stats.average,null);assert.equal(stats.visitors,4);assert.equal(stats.tips,100);
  for(const day of s.days)if(day.businessId==='conestoga'&&day.date.startsWith('2024-02'))day.visitors='0';
  stats=h.qa.periodStats('month');assert.equal(stats.visitors,0);assert.equal(stats.average,null,'No division by an explicit zero visitor total');
  for(const day of s.days)if(day.businessId==='conestoga'&&day.date.startsWith('2024-02'))day.visitors='';
  stats=h.qa.periodStats('month');assert.equal(stats.visitors,null);assert.equal(stats.average,null);
  s.daysLoaded=false;stats=h.qa.periodStats('month');assert.equal(stats.visitors,null);assert.equal(stats.tips,null);assert.equal(stats.retailSpend,3000);
  s.daysLoaded=true;s.business='doc_jaks';stats=h.qa.periodStats('month');assert.equal(stats.retailSpend,900);assert.equal(stats.visitors,3);assert.equal(stats.average,300);
  s.business='conestoga';s.month='2025-02';stats=h.qa.periodStats('month');assert.equal(stats.retailSpend,0);assert.equal(stats.visitors,null);
}

async function verifyMaster() {
  const h=harness(),s=h.qa.state;
  Object.assign(s,{loaded:true,day:'2024-02-15',month:'2024-02',division:'master'});
  const sale=(id,division,total,extra={})=>({...recorded(id,'conestoga',total,total),division,outlet:'event',soldOn:'2024-02-15',...extra});
  s.sales=[sale('food','food',1000),sale('alcohol','alcohol',2000),sale('swag','swag',3000),sale('events','events',4000),sale('catering','catering',5000),
    sale('legacy','',6000),sale('draft','food',7000,{status:'draft'}),sale('void','food',8000,{status:'voided'}),
    sale('adjacent','food',9000,{soldOn:'2024-02-16'}),sale('prior-year','food',10000,{soldOn:'2023-02-15'}),
    sale('other-business','food',11000,{businessId:'doc_jaks'})];
  let sum=0;
  for(const [division,total] of [['food',1000],['alcohol',2000],['swag',3000],['events',4000],['catering',5000]]){
    const totals=h.qa.masterStats(division);assert.equal(totals.count,1);assert.equal(totals.amount,total);sum+=totals.amount;
  }
  assert.equal(sum,15000,'Each primary division contributes its sale once, regardless of outlet');
  assert.equal(h.qa.masterStats('food','2024-02-16').amount,9000);
  assert.equal(h.qa.masterStats('food').drafts,1);assert.equal(h.qa.divisionOf(s.sales[5]),'unassigned');
  const markup=h.qa.listMarkup();
  const cards=[...markup.matchAll(/<button[^>]*class="sales-master-card"[^>]*>/g)].map(match=>match[0]);
  assert.equal(cards.length,5);
  assert.deepEqual(cards.map(tag=>tag.match(/data-sales-division="([^"]+)"/)[1]),['food','alcohol','swag','events','catering']);
  assert(cards.every(tag=>tag.includes('type="button"')&&tag.includes('aria-label=')));
  assert(markup.includes('Unassigned')&&!markup.includes('sales-operations'),'Landing stays compact and preserves an Unassigned history path');
  s.division='food';assert.equal(h.qa.divisionSales().length,5);assert(!h.qa.listMarkup().includes('sales-operations'));
  s.division='alcohol';assert(h.qa.listMarkup().includes('sales-operations'));
  s.division='all';assert.equal(h.qa.divisionSales().length,10);assert(h.qa.listMarkup().includes('Unassigned'));
  assert(!h.qa.listMarkup().includes('sales-operations'));
  s.division='food';const fresh=h.qa.blankSale();assert.equal(fresh.division,'food');assert.equal(fresh.soldOn,'2024-02-15');
  assert.equal(fresh.items[0].category,'food');assert.equal(fresh.items[0].unit,'bottle');assert.equal(fresh.items[0].proof,'');
  assert(!h.qa.lineMarkup(fresh.items[0],0,null).includes('data-line-key="proof"'),'Food has package fields without irrelevant proof controls');
  const heading={focus(){h.focused.push('section');}};h.elements.set('salesSectionHeading',heading);
  s.search='old';s.status='draft';s.from='2020-01-01';s.division='master';
  await h.click('division',{salesDivision:'alcohol'});
  assert.equal(s.division,'alcohol');assert.equal(s.search,'');assert.equal(s.status,'all');assert.equal(s.from,'');
  assert(h.focused.includes('section'),'Keyboard section navigation moves focus to its heading');
  const reports=[];h.context.window.djomsOpenSalesReport=(...args)=>reports.push(args);
  await h.click('report',{templateId:'ttb_storage'});
  assert.deepEqual(reports,[['conestoga','ttb_storage','2024-02']]);
  s.changed=true;h.setConfirm(false);await h.click('division',{salesDivision:'master'});assert.equal(s.division,'alcohol');
  const target={id:'salesMasterDay',value:'2024-02-16',dataset:{},closest:()=>null};
  await h.listeners.get('change')({target});assert.equal(s.day,'2024-02-15','Declined date navigation preserves the active work');
}

async function verifyDaily() {
  const date='2024-02-15',old=dailyFixture(date,{revision:7,visitors:'4',tipsAmount:'0.00',tipsCents:0,
    history:[{type:'created',revision:7,user:'QA owner',at:date+'T18:00:00Z',requestId:'qa-previous-day',before:null,after:{visitors:'4',tipsCents:0}}]});
  const scope=harness(undefined,undefined,()=>dailyPage([old]));scope.qa.state.month='2024-02';
  assert.equal((await scope.qa.readDaysMonth('2024-02','conestoga',0)).length,1);
  for(const result of [dailyPage([old],'doc_jaks'),dailyPage([old],'conestoga','2023-02'),dailyPage([old,old]),
    dailyPage([{...old,businessId:'doc_jaks'}]),dailyPage([{...old,date:'2024-02-30'}]),dailyPage([{...old,date:'2024-03-01'}])]){
    const h=harness(undefined,undefined,()=>result);h.qa.state.month='2024-02';
    await assert.rejects(h.qa.readDaysMonth('2024-02','conestoga',0));
  }
  for(const day of [{...old,businessId:'doc_jaks'},{...old,date:'2024-02-16'},{...old,history:undefined}]){
    const h=harness(undefined,undefined,()=>({day}));await assert.rejects(h.qa.readDay(date,'conestoga',0));
  }
  const open=harness(undefined,undefined,()=>({day:old}));open.qa.state.loaded=true;
  await open.qa.openDay(date);assert.equal(open.calls.length,1);assert(open.calls[0].path.includes('&date='+date));
  assert.equal(open.qa.state.dayCurrent.revision,7);assert.equal(open.qa.state.dayCurrent.history.length,1);
  assert.equal(open.qa.state.dayDraft.visitors,'4');assert.equal(open.qa.state.dayDraft.tipsAmount,'0.00');
  assert.equal(open.qa.state.changed,false);assert(open.qa.dayHistoryMarkup(old).includes('QA owner'));
  const blank=open.qa.blankDay('2024-02-16');assert.equal(blank.visitors,'');assert.equal(blank.tipsCents,null);
  assert.equal(open.qa.dayPayload({...blank,visitors:0,tipsAmount:0}).visitors,'0');
  for(const extra of [{visitors:'-1'},{visitors:'1.5'},{visitors:'1000001'},{tipsAmount:'0.001'},{date:'2024-02-30'},{date:'2199-01-01'}])
    assert(open.qa.dayInputErrors({...open.qa.dayPayload(blank),...extra}).length);
  assert.equal(open.qa.dayInputErrors({...open.qa.dayPayload(blank),visitors:'0',tipsAmount:'0'}).length,0);
  let attempts=0;
  const retry=harness(undefined,(_path,body)=>{
    assert.equal(_path,'sales-days');attempts++;
    if(attempts===1)throw Object.assign(new Error('Synthetic uncertain daily response'),{status:503,uncertain:true});
    return {success:true,day:{...old,...body.day,revision:8,tipsCents:0,history:[{type:'updated',revision:8,user:'QA owner',at:date+'T19:00:00Z',requestId:body.requestId,before:old,after:body.day},...old.history]}};
  },path=>new URL(path,'https://fixture.invalid/').searchParams.has('date')?{day:old}:dailyPage([old]));
  Object.assign(retry.qa.state,{loaded:true,month:'2024-02',dayCurrent:clone(old),dayDraft:{...retry.qa.dayPayload(old),visitors:'5'},mode:'daily'});
  const payload=retry.qa.dayPayload(retry.qa.state.dayDraft),request=retry.qa.requestFor('day',payload);
  assert.equal(request.expectedRevision,7);assert.equal(retry.qa.requestFor('day',clone(payload)).id,request.id);
  assert.equal(await retry.qa.mutateDay(request),false);assert.equal(request.uncertain,true);assert.equal(retry.context.dirty,true);
  assert.throws(()=>retry.qa.requestFor('day',{...payload,visitors:'6'}),/previous request/);
  retry.setConfirm(false);assert.equal(retry.context.window.djomsSales.leaveDraft(),false);
  await retry.context.window.djomsSales.load(true);assert.equal(retry.qa.state.dayRequest.id,request.id);assert.equal(retry.qa.state.dayDraft.visitors,'5');
  await retry.click('retry-request');
  const posts=retry.calls.filter(call=>call.body);assert.equal(posts.length,2);
  assert.deepEqual(posts[0].body,posts[1].body,'Daily retry keeps payload, business, revision and request ID');
  assert.equal(retry.qa.state.dayCurrent.revision,8);assert.equal(retry.qa.state.dayRequest,null);assert.equal(retry.qa.state.changed,false);
  assert.equal(retry.qa.state.sales.length,0,'Logging visitors and tips never creates a sale');
  assert.equal(retry.qa.state.days[0].history,undefined,'Monthly summaries do not retain full daily history');
  const later={...old,revision:9,visitors:'8',history:[{...old.history[0],requestId:'qa-later-request'},{...old.history[0],requestId:'qa-lost-day'}]};
  const found=harness(undefined,()=>{throw Object.assign(new Error('Synthetic lost daily save'),{uncertain:true});},()=>({day:later}));
  Object.assign(found.qa.state,{loaded:true,month:'2024-02',dayCurrent:clone(old),dayDraft:payload,mode:'daily'});
  const lost=found.qa.requestFor('day',payload);lost.id='qa-lost-day';
  assert.equal(await found.qa.mutateDay(lost),true);assert.equal(found.qa.state.dayCurrent.revision,9);assert.equal(found.qa.state.dayDraft.visitors,'8');
  let resolveGet;
  const staleGet=harness(undefined,undefined,()=>new Promise(resolve=>{resolveGet=resolve;}));
  const pendingGet=staleGet.qa.openDay(date);staleGet.qa.reset();resolveGet({day:old});await pendingGet;
  assert.equal(staleGet.qa.state.dayCurrent,null);assert.equal(staleGet.qa.state.changed,false);
  let resolvePost;
  const stalePost=harness(undefined,()=>new Promise(resolve=>{resolvePost=resolve;}));
  Object.assign(stalePost.qa.state,{loaded:true,month:'2024-02',dayCurrent:clone(old),dayDraft:payload,mode:'daily'});
  const pendingPost=stalePost.qa.mutateDay(stalePost.qa.requestFor('day',payload));
  stalePost.qa.reset();resolvePost({success:true,day:later});await pendingPost;
  assert.equal(stalePost.qa.state.dayCurrent,null);assert.equal(stalePost.qa.state.dayRequest,null);assert.equal(stalePost.qa.state.days.length,0);assert.equal(stalePost.qa.state.error,'');
  let rejectReconcile;
  const staleRead=harness(undefined,()=>{throw Object.assign(new Error('Synthetic daily timeout'),{uncertain:true});},()=>new Promise((_resolve,reject)=>{rejectReconcile=reject;}));
  Object.assign(staleRead.qa.state,{loaded:true,month:'2024-02',dayCurrent:clone(old),dayDraft:payload,mode:'daily'});
  const pendingRead=staleRead.qa.mutateDay(staleRead.qa.requestFor('day',payload));
  await new Promise(resolve=>setImmediate(resolve));staleRead.qa.reset();rejectReconcile(new Error('Synthetic stale read'));await pendingRead;
  assert.equal(staleRead.qa.state.dayCurrent,null);assert.equal(staleRead.qa.state.dayRequest,null);assert.equal(staleRead.qa.state.changed,false);assert.equal(staleRead.qa.state.error,'');
}

async function verifyPreview() {
  const js=fs.readFileSync(root+'/djoms-social-command/sales-preview.js','utf8');
  const html=fs.readFileSync(root+'/djoms-social-command/sales-preview.html','utf8');
  assert(!/<script[^>]+src="\/?app\.js/i.test(html),'The preview never loads the owner authentication application');
  assert(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/.test(js),'The preview has no network data transport');
  const destinations=[],node={};
  const context={URL,URLSearchParams,document:{getElementById:()=>node,addEventListener(){}},
    window:{addEventListener(){},location:{assign:value=>destinations.push(value)}},
    fetch(){throw new Error('Preview network transport is forbidden');}};
  vm.createContext(context);vm.runInContext(js,context);
  for(const businessId of ['conestoga','doc_jaks']){
    const sales=await context.api('sales?businessId='+businessId);assert.equal(sales.sales.length,0);assert.equal(sales.businessId,businessId);
    const products=await context.api('sales-products?businessId='+businessId);assert.equal(products.products.length,2);
    assert(products.products.every(product=>product.businessId===businessId&&product.revision===0&&product.defaultPrice===''&&product.proof===''));
    assert.deepEqual(clone(products.products.map(product=>product.name)),['Boss Soss','Sweet Bayou']);
    assert.equal((await context.api('sales-days?businessId='+businessId+'&month=2024-02')).days.length,0);
    assert.equal((await context.api('sales-days?businessId='+businessId+'&date=2024-02-15')).day,null);
    for(const route of ['sales','sales-days','sales-products'])await assert.rejects(context.api(route,{action:'save',businessId}));
  }
  assert.equal(context.window.djomsOpenSalesReport('doc_jaks','ttb_excise','2024-02'),true);
  const url=new URL(destinations[0],'https://fixture.invalid');assert.equal(url.pathname,'/reports');
  assert.equal(url.searchParams.get('business'),'doc_jaks');assert.equal(url.searchParams.get('template'),'ttb_excise');assert.equal(url.searchParams.get('month'),'2024-02');
  assert.equal(context.window.djomsOpenSalesReport('other','ttb_excise','2024-02'),false);assert.equal(destinations.length,1);
}

async function verifyCatalog() {
  const h=harness(),s=h.qa.state;
  const food=productFixture(),spirit=productFixture({id:'b'.repeat(36),division:'alcohol',name:'Synthetic spirit',sku:'QA-SPIRIT',defaultPrice:'0.00',packageLabel:'750 mL bottle',bottleSizeMl:'750',proof:'80'});
  const archived=productFixture({id:'c'.repeat(36),name:'Synthetic archived choice',active:false});
  const other=productFixture({id:'d'.repeat(36),businessId:'doc_jaks',name:'Other business private choice'});
  Object.assign(s,{loaded:true,productsLoaded:true,division:'food',products:[food,spirit,archived,other]});
  assert.equal(h.qa.productsForDivision().length,2);
  let markup=h.qa.catalogMarkup();assert(markup.includes(food.name));assert(!markup.includes(other.name));assert(!markup.includes(archived.name));
  s.showArchived=true;markup=h.qa.catalogMarkup();assert(markup.includes(archived.name));
  assert(markup.includes('data-product-id="'+archived.id+'" disabled'),'Archived choices cannot start a new sale');
  const foodItem=h.qa.itemFromProduct(food),spiritItem=h.qa.itemFromProduct(spirit);
  assert.equal(foodItem.packageLabel,'12 oz bottle');assert.equal(foodItem.unitPrice,'');assert.equal(foodItem.category,'food');assert.equal(foodItem.proof,'');
  assert.equal(h.qa.bottleMetrics(foodItem).qualifies,false);
  const foodCase=h.qa.itemFromProduct(productFixture({unit:'case',bottlesPerUnit:'12'}));
  const caseMarkup=h.qa.lineMarkup(foodCase,0,null);
  assert(caseMarkup.includes('data-line-key="bottlesPerUnit"'));
  assert(!caseMarkup.includes('data-line-key="proof"')&&!caseMarkup.includes('data-line-key="bottleSizeMl"'));
  s.current=fixture({division:'food',items:[foodCase]});
  h.elements.set('salesEditForm',{values:{notes:'Synthetic edit'},querySelectorAll:()=>[{querySelector:selector=>{
    const key=selector.match(/data-line-key="([^"]+)"/)[1];
    return caseMarkup.includes('data-line-key="'+key+'"')?{value:foodCase[key]}:null;
  }}]});
  assert.equal(h.qa.readEditForm().items[0].bottlesPerUnit,'12','A non-spirit case pack survives normal form reads');
  h.elements.delete('salesEditForm');s.current=null;
  assert.equal(spiritItem.unitPrice,'0.00');assert.equal(spiritItem.proof,'80');assert.equal(spiritItem.bottleSizeMl,'750');
  assert.equal(h.qa.bottleMetrics(spiritItem).proofGallonsMicros,158503);
  food.name='Synthetic revised name';food.defaultPrice='12.00';assert.equal(foodItem.description,'Synthetic product');assert.equal(foodItem.unitPrice,'','Copied sale defaults do not alias catalog edits');
  assert.equal(h.qa.productPayload({...food,defaultPrice:0}).defaultPrice,'0');
  const historySale={...recorded('snapshot','conestoga',0),items:[clone(foodItem)]};s.sales=[historySale];
  const before=clone(s.sales);h.qa.acceptProduct({...food,active:false,revision:2});assert.deepEqual(clone(s.sales),before,'Accepting a catalog edit cannot rewrite a sale snapshot');
  for(const result of [productsPage([other]),productsPage([food],'doc_jaks')]){
    const wrong=harness(undefined,undefined,undefined,()=>result);await assert.rejects(wrong.qa.readProducts('conestoga',0));
  }
  for(const product of [{...food,businessId:'doc_jaks'},{...food,id:spirit.id},{...food,history:undefined}]){
    const wrong=harness(undefined,undefined,undefined,()=>({product}));await assert.rejects(wrong.qa.readProduct(food.id,'conestoga',0));
  }
  const opened=harness(undefined,undefined,undefined,()=>({product:food}));opened.qa.state.loaded=true;
  await opened.qa.openProduct(food.id);assert.equal(opened.qa.state.productCurrent.id,food.id);assert.equal(opened.qa.state.productCurrent.history.length,1);
  assert(opened.calls[0].path.includes('&id='+food.id),'Product editing loads its full current history');
  let attempts=0;
  const retry=harness(undefined,(path,body)=>{
    assert.equal(path,'sales-products');attempts++;
    if(attempts===1)throw Object.assign(new Error('Synthetic lost product response'),{status:503,uncertain:true});
    return {success:true,product:productFixture({...body.product,createRequestId:body.requestId,lastRequestId:body.requestId,history:[{type:'created',revision:1,user:'QA owner',at:'2024-02-15T18:00:00Z',requestId:body.requestId,before:null,after:body.product}]})};
  },undefined,()=>productsPage());
  Object.assign(retry.qa.state,{loaded:true,productsLoaded:true,division:'food',productCurrent:retry.qa.blankProduct('food'),mode:'product'});
  retry.qa.state.productDraft=retry.qa.productPayload(productFixture({name:'Synthetic new choice'}));
  const payload=retry.qa.productPayload(),request=retry.qa.requestFor('product',payload);
  assert.equal(request.expectedRevision,0);assert.equal(retry.qa.requestFor('product',clone(payload)).id,request.id);
  assert.equal(await retry.qa.mutateProduct(request),false);assert.equal(request.uncertain,true);assert.equal(retry.context.dirty,true);
  assert.throws(()=>retry.qa.requestFor('product',{...payload,name:'Changed'}),/previous request/);
  retry.setConfirm(false);assert.equal(retry.context.window.djomsSales.leaveDraft(),false);
  await retry.context.window.djomsSales.load(true);assert.equal(retry.qa.state.productRequest.id,request.id);assert.equal(retry.qa.state.productDraft.name,payload.name);
  await retry.click('retry-request');const posts=retry.calls.filter(call=>call.body);assert.equal(posts.length,2);assert.deepEqual(posts[0].body,posts[1].body);
  assert.equal(retry.qa.state.productCurrent.revision,1);assert.equal(retry.qa.state.productRequest,null);assert.equal(retry.qa.state.changed,false);
  assert.equal(retry.qa.state.products.length,1);assert.equal(retry.qa.state.products[0].history,undefined);
  const later=productFixture({revision:4,name:'Synthetic later product',active:false,lastRequestId:'qa-later-product',history:[{requestId:'qa-later-product'},{requestId:'qa-lost-product'}]});
  const found=harness(undefined,()=>{throw Object.assign(new Error('Synthetic product timeout'),{uncertain:true});},undefined,path=>new URL(path,'https://fixture.invalid/').searchParams.has('id')?{product:later}:productsPage([later]));
  Object.assign(found.qa.state,{loaded:true,productCurrent:productFixture(),productDraft:payload,mode:'product'});
  const lost=found.qa.requestFor('product',payload);lost.id='qa-lost-product';
  assert.equal(await found.qa.mutateProduct(lost),true);assert.equal(found.qa.state.productCurrent.revision,4);assert.equal(found.qa.state.productDraft.active,false);
  let resolveGet;
  const staleGet=harness(undefined,undefined,undefined,()=>new Promise(resolve=>{resolveGet=resolve;}));
  const pendingGet=staleGet.qa.openProduct(food.id);staleGet.qa.reset();resolveGet({product:food});await pendingGet;
  assert.equal(staleGet.qa.state.productCurrent,null);assert.equal(staleGet.qa.state.products.length,0);
  let resolvePost;
  const stalePost=harness(undefined,()=>new Promise(resolve=>{resolvePost=resolve;}));
  Object.assign(stalePost.qa.state,{loaded:true,productCurrent:productFixture(),productDraft:payload,mode:'product'});
  const pendingPost=stalePost.qa.mutateProduct(stalePost.qa.requestFor('product',payload));stalePost.qa.reset();resolvePost({success:true,product:later});await pendingPost;
  assert.equal(stalePost.qa.state.productCurrent,null);assert.equal(stalePost.qa.state.productRequest,null);assert.equal(stalePost.qa.state.products.length,0);assert.equal(stalePost.qa.state.changed,false);
  let rejectFull;
  const staleFull=harness(undefined,()=>{throw Object.assign(new Error('Synthetic uncertain product update'),{uncertain:true});},undefined,path=>new URL(path,'https://fixture.invalid/').searchParams.has('id')?new Promise((_resolve,reject)=>{rejectFull=reject;}):productsPage([later]));
  Object.assign(staleFull.qa.state,{loaded:true,productCurrent:productFixture(),productDraft:payload,mode:'product'});
  const pendingFull=staleFull.qa.mutateProduct(staleFull.qa.requestFor('product',payload));await new Promise(resolve=>setImmediate(resolve));
  staleFull.qa.reset();rejectFull(new Error('Synthetic stale product read'));await pendingFull;
  assert.equal(staleFull.qa.state.productCurrent,null);assert.equal(staleFull.qa.state.products.length,0);assert.equal(staleFull.qa.state.changed,false);assert.equal(staleFull.qa.state.error,'');
}

function verifyCsvDetails() {
  const h=harness();
  const food={...fixture().items[0],description:'Synthetic sauce',category:'food',purpose:'',packageLabel:'12 oz bottle',quantity:'4',unitPrice:'0.00'};
  const alcohol={...fixture().items[0],description:'Synthetic spirit',category:'spirits',purpose:'bottle_sale',packageLabel:'750 mL bottle',quantity:'1',bottleSizeMl:'750',bottlesPerUnit:'',proof:'80'};
  const company='=SUM(1,2) "Synthetic company"',address='Synthetic first line\nSecond "quoted" line';
  const sale={...recorded('csv','conestoga',1000),division:'catering',outlet:'event',customer:{name:'QA person',email:'',companyName:company,contactName:'QA contact',phone:'+1 555 0100',address},items:[food,alcohol]};
  const legacy={...recorded('legacy-csv','conestoga',1000),division:'',items:[fixture().items[0]]};
  const unknown={...recorded('unknown-csv','conestoga',1000),division:'alcohol',items:[{...alcohol,proof:''}]};
  const text=h.qa.csvText([sale,legacy,unknown,{...sale,id:'private-other',businessId:'doc_jaks',number:'OTHER-BUSINESS-CSV'}]);
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(char===','&&!quoted){row.push(cell);cell='';}
    else if(char==='\r'&&!quoted&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}
    else cell+=char;
  }
  row.push(cell);rows.push(row);assert.equal(quoted,false);
  assert.equal(rows.length,4);assert(rows.every(row=>row.length===34));
  const [headers,...entries]=rows,read=(record,key)=>record[headers.indexOf(key)];
  assert.equal(headers[20],'Notes','Original CSV column order is preserved');
  assert.equal(read(entries[0],'Primary section'),'Catering');assert.equal(read(entries[0],'Selling outlet'),'Events');
  assert.equal(read(entries[0],'Company name'),"'"+company);assert.equal(read(entries[0],'Contact name'),'QA contact');
  assert.equal(read(entries[0],'Customer address'),address);assert.equal(read(entries[0],'Customer phone'),"'+1 555 0100");
  assert(read(entries[0],'Item package labels').includes('1. Synthetic sauce: 12 oz bottle'));
  assert(read(entries[0],'Item package labels').includes('2. Synthetic spirit: 750 mL bottle'));
  const details=read(entries[0],'Alcohol item size and proof details');
  assert(!details.includes('Synthetic sauce'));assert(details.includes('Bottle size: 750 mL')&&details.includes('U.S. proof: 80')&&details.includes('40% ABV'));
  assert.equal(read(entries[0],'Alcohol bottle count'),'1');assert.equal(read(entries[0],'Alcohol volume mL'),'750');
  assert.equal(read(entries[0],'Alcohol volume liters'),'0.750');assert.equal(read(entries[0],'Wine gallons'),'0.198129');assert.equal(read(entries[0],'Proof gallons'),'0.158503');
  assert.equal(read(entries[1],'Primary section'),'Unassigned');
  for(const key of ['Alcohol bottle count','Alcohol volume mL','Alcohol volume liters','Wine gallons','Proof gallons'])assert.equal(read(entries[1],key),'','Legacy unknown volume stays blank');
  assert.equal(read(entries[2],'Alcohol bottle count'),'1');assert.equal(read(entries[2],'Wine gallons'),'0.198129');assert.equal(read(entries[2],'Proof gallons'),'');
  assert(!text.includes('OTHER-BUSINESS-CSV'));
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
  h.qa.state.business = 'conestoga'; h.qa.state.loaded = true; h.qa.state.division = 'all';
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
  await verifyVolumeMath();
  verifyPeriodsAndCoverage();
  await verifyMaster();
  await verifyDaily();
  await verifyPreview();
  await verifyCatalog();
  verifyCsvDetails();
  assert(h.calls.every(call => call.body === undefined));
  console.log('PASS: Sales cents and proof-volume math; business/day/division scope; visitor coverage and separate tips; daily/catalog snapshots, replay and reset; complete histories; CSV protection; report navigation; honest connections; isolated preview; host lifecycle. No network or database access; fixture-only mutations.');
}

if (require.main === module) main().catch(error => {console.error(error);process.exitCode = 1;});
module.exports = {harness, fixture, recorded, page, dailyPage, dailyFixture, productFixture, productsPage, verifyHost, verifyVolumeMath, verifyPeriodsAndCoverage, verifyMaster, verifyDaily, verifyPreview, verifyCatalog, verifyCsvDetails};
