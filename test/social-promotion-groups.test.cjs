const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const code=fs.readFileSync(path.join(__dirname,'..','mission-social.js'),'utf8');
const period={query:'range=custom&start=2026-11-10&end=2026-11-16',start:'2026-11-10',end:'2026-11-17',endInclusive:'2026-11-16',days:7};
function report(posts,complete=true){
  return {period:{startDate:period.start,endDate:period.endInclusive},checkedAt:'2026-11-16T12:00:00Z',posts,
    coverage:{recordInventoryComplete:complete},platforms:Object.fromEntries(['facebook','instagram','x'].map(platform=>{
      const rows=posts.filter(row=>row.platform===platform);
      return [platform,{posts:rows.length,inventory:{complete},coverage:{}}];
    }))};
}
const post=(id,group,platform='facebook',views=0,clicks=0)=>({recordId:id,postId:id+'-post',platform,acquisitionGroup:group,
  campaign:'MUSIC',title:'Post '+id,publishedAt:'2026-11-12T12:00:00Z',views,clicks,allClicks:99999});
async function harness(source,options={}){
  let labels=options.labels||{};
  const events=new Map();
  const prior={...source,period:{startDate:'2026-11-03',endDate:'2026-11-09'}};
  const window={addEventListener:(name,fn)=>events.set(name,fn),djomsPostAcquisitionGroups:()=>labels};
  const document={addEventListener(){},dispatchEvent(){}};
  const context=vm.createContext({window,document,CustomEvent:class{constructor(type){this.type=type;}},analyticsData:source,
    api:async query=>{if(query.includes('start=2026-11-03')){if(options.priorError)throw new Error('Prior report unavailable');return prior;}return source;}});
  vm.runInContext(code,context);
  window.djomsSocialPeriod(period);
  await new Promise(resolve=>setImmediate(resolve));
  return {read:()=>window.djomsSocialPeriod(period),classify:next=>{labels=next;events.get('djoms-acquisition-group-updated')?.();}};
}

test('Radio, other posts, and unknown music posts remain disjoint; manual X and allClicks are excluded',async()=>{
  const h=await harness(report([post('radio','olr5150','facebook',100,4),post('other','docjaks','facebook',200,6),
    post('radio-ig','olr5150','instagram',50,null),post('unknown',null,'facebook',60,2),post('manual','olr5150','x',9000,90)]));
  const groups=h.read().promotionGroups;
  assert.equal(groups.olr5150.totals.views.value,150);
  assert.equal(groups.olr5150.totals.clicks.value,4);
  assert.equal(groups.olr5150.totals.clicks.status,'partial');
  assert.equal(groups.docjaks.totals.views.value,200);
  assert.equal(groups.social_unclassified.totals.views.value,60);
  assert.equal(groups.olr5150.platforms.x.totals.views.value,null);
  assert.equal(groups.olr5150.platforms.youtube.totals.views.value,null);
  assert.equal(groups.social_unclassified.posts[0].campaign,'MUSIC');
  assert.match(groups.olr5150.note,/not website visits/);
});

test('Verified zeros survive, but missing inventory or unknown group membership cannot invent an empty group',async()=>{
  const zero=await harness(report([post('other','docjaks','facebook',0,0)]));
  assert.equal(zero.read().promotionGroups.docjaks.totals.views.value,0);
  assert.equal(zero.read().promotionGroups.olr5150.totals.views.value,0);
  const unavailable=await harness(report([],false));
  assert.equal(unavailable.read().promotionGroups.olr5150.totals.views.value,null);
  const unknown=await harness(report([post('legacy',null,'facebook',60,3)]));
  assert.equal(unknown.read().promotionGroups.olr5150.totals.views.value,null);
  assert.equal(unknown.read().promotionGroups.docjaks.totals.views.value,null);
  assert.equal(unknown.read().promotionGroups.social_unclassified.totals.views.value,60);
});

test('A metadata edit immediately regroups the same cached measurements, including clearing a label',async()=>{
  const h=await harness(report([post('saved','docjaks','facebook',12,2)]));
  assert.equal(h.read().promotionGroups.docjaks.totals.views.value,12);
  h.classify({saved:'olr5150'});
  assert.equal(h.read().promotionGroups.olr5150.totals.views.value,12);
  assert.equal(h.read().promotionGroups.docjaks.totals.views.value,0);
  h.classify({saved:null});
  assert.equal(h.read().promotionGroups.olr5150.totals.views.value,null);
  assert.equal(h.read().promotionGroups.social_unclassified.totals.views.value,12);
});

test('A prior-period failure leaves current post measurements visible without creating score signals',async()=>{
  const h=await harness(report([post('radio','olr5150','facebook',8,1)]),{priorError:true});
  const result=h.read();
  assert.equal(result.status,'unavailable');
  assert.equal(result.promotionGroups.olr5150.totals.views.value,8);
  assert.equal(result.scoreSignals.length,0);
});

test('Duplicate provider IDs are counted once and invalidate complete platform coverage',async()=>{
  const same=post('same','olr5150','facebook',8,1);
  const h=await harness(report([same,{...same}]));
  const group=h.read().promotionGroups.olr5150;
  assert.equal(group.totals.views.value,8);
  assert.equal(group.platforms.facebook.totals.views.status,'partial');
  assert.equal(group.posts.length,1);
});

test('A mismatched current publishing window provides no grouped measurements',async()=>{
  const source=report([post('wrong','olr5150','facebook',80,2)]);
  source.period={startDate:'2026-10-01',endDate:'2026-10-07'};
  const h=await harness(source);
  assert.equal(h.read().promotionGroups.olr5150.totals.views.value,null);
});
