import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../website-security-watch.js',import.meta.url),'utf8');

async function render(data) {
  const items={content:{innerHTML:''},securityWatchResult:{innerHTML:''}};
  const document={
    getElementById:name=>items[name]||null,
    addEventListener:()=>{},
    querySelectorAll:()=>[]
  };
  const window={};
  new Function('window','document','activeView','api',script)(
    window,document,'Website Security',async()=>data
  );
  window.djomsWebsiteSecurity.render();
  await new Promise(resolve=>setImmediate(resolve));
  return items.securityWatchResult.innerHTML;
}

const report={
  status:'reported',checkedAt:'2026-11-12T12:00:00Z',
  range:{selection:'7d',start:'2026-11-06',endInclusive:'2026-11-12'},
  coverage:{analyzedRows:120,partial:false},totalPatterns:1,
  flaggedVisitEvents:24,priorityPatterns:0,observationsNotEvaluated:0,
  history:{
    status:'saved',networkCount:1,totalSweepsStored:1,newSweepsSaved:1,
    note:'Data only collected by owner-initiated checks.',
    networks:[{
      ipAddress:'192.0.2.6',cities:['Phoenix'],firstSeen:'2026-11-11T17:00:00Z',
      lastSeen:'2026-11-11T17:01:00Z',observedSweeps:1,flaggedVisitEvents:24
    }],
    latest:[]
  },
  visitHistory:{
    status:'saved',networkCount:2,networksShown:2,recordedSessions:28,newSessionsSaved:28,
    note:'Available records only.',
    networks:[
      {ipAddress:'192.0.2.6',firstObservedAt:'2026-10-11T17:00:00Z',
       lastObservedAt:'2026-11-11T17:00:00Z',recordedSessions:27,
       recordedVisitDays:2,previouslySeenInRecords:true,locations:['Phoenix'],
       latestReturn:{gapDays:31,previousSeenAt:'2026-10-11T17:00:00Z',returnedAt:'2026-11-11T17:00:00Z'}},
      {ipAddress:'198.51.100.8',firstObservedAt:'2026-11-11T15:00:00Z',
       lastObservedAt:'2026-11-11T15:00:00Z',recordedSessions:1,
       recordedVisitDays:1,previouslySeenInRecords:false,locations:['Slidell'],latestReturn:null}
    ]
  },
  relatedRoutes:[{firstIndex:1,secondIndex:2,score:100,differentNetworks:true}],
  alerts:[{
    priority:'review',visitEvents:24,location:'Phoenix, AZ',
    start:'2026-11-11T17:00:00Z',end:'2026-11-11T17:01:00Z',
    uniquePages:12,durationSeconds:60,signature:'desktop',source:'direct',
    networkVerified:true,ipAddress:'192.0.2.6',distinctSessions:24,
    repeatedPairs:12,
    timeline:[{path:'/',openedAt:'2026-11-11T17:00:00Z',gapFromPriorSeconds:null,pageAverageSeconds:null}]
  }]
};

test('Owner security report contains IP history, route comparisons and all flagged details',async()=>{
  const html=await render(report);
  for(const evidence of [
    'IP WATCH','192.0.2.6','stored sweeps',
    'consecutive duplicate pairs','dj-security-alert',
    'MATCHING PAGE ROUTES','PAGE-BY-PAGE DETAILS',
    'Export latest 100 sweeps'
  ])assert.ok(html.includes(evidence),'Missing '+evidence);
});

test('Missing history is not incorrectly reported as zero security events',async()=>{
  const html=await render({...report,history:{status:'unavailable',error:'Protected evidence storage offline'}});
  assert.match(html,/IP HISTORY · NOT SAVED/);
  assert.match(html,/Protected evidence storage offline/);
  assert.doesNotMatch(html,/0<\/b> stored sweeps/);
});

test('Untrusted location text is escaped',async()=>{
  const injected='<img src=x onerror=alert(1)>';
  const html=await render({...report,alerts:[{...report.alerts[0],location:injected}]});
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
});

test('IP lookup shows earlier recorded dates, repeat sightings and a 30+ day return',async()=>{
  const html=await render(report);
  for(const phrase of [
    'HAVE WE SEEN THIS ADDRESS BEFORE?',
    'SEARCH RECORDED IP ADDRESS',
    'SEEN ON PRIOR DATE',
    'FIRST CAPTURED RECORD',
    'RETURNED AFTER 31 DAYS',
    '198.51.100.8'
  ])assert.ok(html.includes(phrase),'Missing '+phrase);
});
test('Missing ordinary-visit history reports unavailable rather than never visited',async()=>{
  const html=await render({...report,visitHistory:{status:'unavailable',error:'Wix evidence incomplete'}});
  assert.match(html,/IP VISIT HISTORY · UNAVAILABLE/);
  assert.match(html,/Wix evidence incomplete/);
});
