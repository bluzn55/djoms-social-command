'use strict';
// Report links and month selection use fixtures only. Every write/send is blocked.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.env.DJOMS_WORKSPACE_ROOT?path.resolve(process.env.DJOMS_WORKSPACE_ROOT):path.resolve(__dirname,fs.existsSync(path.join(__dirname,'..','sales.js'))?'../..':'..');
const source=fs.readFileSync(root+'/djoms-social-command/report-filings.js','utf8');
const templates=['excise','production','storage','processing'].map(name=>JSON.parse(fs.readFileSync(root+'/djoms-meta-bridge/lib/report-templates/ttb-'+name+'.json','utf8')));
const clone=value=>JSON.parse(JSON.stringify(value));
function harness(){
  const host={innerHTML:'',querySelectorAll:()=>[]},listeners=new Map(),calls=[],routes=[];
  let approveLeave=true;
  const context={console,Intl,Date,JSON,Object,Array,String,Number,Map,Set,Math,BigInt,activeView:'Reports & Filing',dirty:false,
    confirm:()=>approveLeave,notice(){},location:{pathname:'/reports'},history:{replaceState:(...args)=>routes.push(args)},
    document:{body:{classList:{add(){},remove(){}}},getElementById:id=>id==='content'?host:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(kind,fn)=>listeners.set(kind,fn)},
    window:{addEventListener(){},print(){throw new Error('No browser printing in this test.');}},
    FormData:class{constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}has(key){return Object.hasOwn(this.values,key);}},
    api:async(route,body)=>{calls.push({route,body});assert.equal(body,undefined,'Every mutation and send is blocked');return {reports:[],templates:clone(templates),businessProfiles:[],nextCursor:null,delivery:{emailConfigured:false}};}
  };
  const instrumented=source.replace('  window.djomsReportFilings = {','  globalThis.__qa={state,scopedReports,openSalesPeriod,clearSalesContext};\n  window.djomsReportFilings = {');
  assert.notEqual(instrumented,source);vm.createContext(context);vm.runInContext(instrumented,context);
  const state=context.__qa.state;state.loaded=true;state.templates=clone(templates);
  state.businessProfiles=[{id:'conestoga',name:'Colo Distillery LLC',stage:'active',revision:1,values:{legalName:'SYNTHETIC CO LEGAL',address:'Synthetic address A'}},{id:'doc_jaks',name:'Doc Jak’s',stage:'setup',revision:1,values:{legalName:'SYNTHETIC DJ LEGAL',address:'Synthetic address B'}}];
  const click=async(action,data={})=>{const control={disabled:false,dataset:{reportAction:action,...data},closest:selector=>selector==='#reportFilingHub'?host:null};return listeners.get('click')({preventDefault(){},target:{closest:selector=>selector==='[data-report-action]'?control:null}});};
  return {context,state,qa:context.__qa,api:context.window.djomsReportFilings,calls,routes,listeners,click,setConfirm:value=>{approveLeave=value;}};
}
const report=(id,businessId,templateId,start,end,extra={})=>({id,businessId,templateId,jurisdiction:'federal',name:'Synthetic report',status:'draft',revision:1,templateValues:{},fields:[],periodStart:start,periodEnd:end,updatedAt:'2024-03-01T12:00:00Z',...extra});
(async()=>{
  const h=harness();
  h.state.reports=[report('wanted','doc_jaks','ttb_storage','2024-02-01','2024-02-29'),report('other-company','conestoga','ttb_storage','2024-02-01','2024-02-29'),report('other-type','doc_jaks','ttb_production','2024-02-01','2024-02-29'),report('other-month','doc_jaks','ttb_storage','2024-01-01','2024-01-31')];
  assert.equal(await h.api.openForBusiness('doc_jaks','ttb_storage','2024-02'),true);
  assert.equal(h.state.business,'doc_jaks');assert.equal(h.state.section,'federal');
  assert.deepEqual(Array.from(h.qa.scopedReports(),r=>r.id),['wanted']);
  const before=clone(h.state.reports);h.qa.openSalesPeriod();
  assert.equal(h.state.current.id,'wanted');assert.equal(h.state.mode,'preview');assert.equal(h.state.changed,false);
  assert.deepEqual(clone(h.state.reports),before);assert.equal(h.calls.length,0);
  h.state.reports=[];h.qa.openSalesPeriod();
  assert.equal(h.state.mode,'edit');assert.equal(h.state.current.id,undefined);assert.equal(h.state.current.businessId,'doc_jaks');
  assert.equal(h.state.current.periodStart,'2024-02-01');assert.equal(h.state.current.periodEnd,'2024-02-29');
  assert.equal(h.state.current.targetDate,'2024-03-05');assert.equal(h.state.current.dueDate,'2024-03-15');
  assert.equal(h.state.changed,true);assert.equal(h.state.reports.length,0);assert.equal(h.calls.length,0);
  assert(!JSON.stringify(h.state.current).includes('SYNTHETIC CO LEGAL'),'No other-business profile is copied');
  assert(JSON.stringify(h.state.current).includes('SYNTHETIC DJ LEGAL'));
  h.setConfirm(false);const current=clone(h.state.current);
  assert.equal(await h.api.openForBusiness('conestoga','ttb_production','2024-01'),false);assert.deepEqual(clone(h.state.current),current);
  h.setConfirm(true);
  for(const template of ['ttb_excise','ttb_production','ttb_storage','ttb_processing'])assert.equal(await h.api.openForBusiness('conestoga',template,'2024-02'),true);
  for(const args of [['other','ttb_storage','2024-02'],['conestoga','other','2024-02'],['conestoga','ttb_storage','2024-13'],['conestoga','ttb_storage','2024-2']])assert.equal(await h.api.openForBusiness(...args),false);
  h.state.saving=true;assert.equal(await h.api.openForBusiness('doc_jaks','ttb_storage','2024-02'),false);h.state.saving=false;
  await h.api.openForBusiness('conestoga','ttb_excise','2024-02');
  h.qa.openSalesPeriod('first');assert.equal(h.state.current.periodStart,'2024-02-01');assert.equal(h.state.current.periodEnd,'2024-02-15');
  assert.equal(h.state.current.dueDate,'');assert.equal(h.state.current.targetDate,'');assert.equal(h.state.current.frequency,'twice_monthly');
  h.qa.openSalesPeriod('second');assert.equal(h.state.current.periodStart,'2024-02-16');assert.equal(h.state.current.periodEnd,'2024-02-29');
  assert.equal(h.state.current.dueDate,'');assert.equal(h.state.current.targetDate,'');
  await h.click('clear-sales-context');assert.equal(h.state.salesContext,null);assert.equal(h.routes.at(-1)[2],'/reports');
  await h.api.openForBusiness('doc_jaks','ttb_storage','2024-02');await h.click('section',{reportSection:'state'});
  assert.equal(h.state.salesContext,null);assert.equal(h.state.section,'state');assert.equal(h.routes.at(-1)[2],'/reports');
  await h.api.openForBusiness('doc_jaks','ttb_storage','2024-02');
  await h.listeners.get('change')({target:{id:'rfBusinessSelect',value:'conestoga',closest:()=>null}});
  assert.equal(h.state.salesContext,null);assert.equal(h.state.business,'conestoga');assert.equal(h.routes.at(-1)[2],'/reports');
  assert.equal(h.calls.length,0,'Link and form preparation do not save or file reports');
  await h.api.openForBusiness('doc_jaks','ttb_storage','2024-02');h.api.reset();assert.equal(h.state.salesContext,null);assert.equal(h.state.current,null);

  const app=fs.readFileSync(root+'/djoms-social-command/app.js','utf8');
  const start=app.indexOf('window.djomsOpenSalesReport ='),end=app.indexOf('\n};',start)+3;
  assert(start>=0&&end>start);const opened=[],routes=[];
  const bridge={URLSearchParams,owner:'Synthetic owner',activeView:'Sales',history:{replaceState:(...args)=>routes.push(args)},window:{djomsReportFilings:{openForBusiness:async(...args)=>{opened.push(args);return true;}}}};
  bridge.setView=async view=>{bridge.activeView=view;};vm.createContext(bridge);vm.runInContext(app.slice(start,end),bridge);
  assert.equal(await bridge.window.djomsOpenSalesReport('doc_jaks','ttb_processing','2024-02'),true);
  assert.deepEqual(opened,[['doc_jaks','ttb_processing','2024-02']]);assert.equal(routes[0][2],'/reports?business=doc_jaks&template=ttb_processing&month=2024-02');
  bridge.owner='';assert.equal(await bridge.window.djomsOpenSalesReport('doc_jaks','ttb_storage','2024-02'),false);assert.equal(opened.length,1);
  bridge.owner='Synthetic owner';bridge.activeView='Sales';bridge.setView=async()=>{};
  assert.equal(await bridge.window.djomsOpenSalesReport('conestoga','ttb_excise','2024-02'),false);assert.equal(opened.length,1);
  console.log('PASS: Sales report links preserve business/type/month; existing periods open without duplicates; new monthly/half-month forms stay unsaved; excise deadlines remain explicit; identity, dirty/save guards, URL clearing, reset and owner/navigation gates pass. No writes or sends.');
})().catch(error=>{console.error(error);process.exitCode=1;});
