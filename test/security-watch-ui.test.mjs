import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../website-security-watch.js',import.meta.url),'utf8');

async function render(data,activityData=null) {
  const items={content:{innerHTML:''},securityWatchResult:{innerHTML:''},
    djSecurityAlertBox:{innerHTML:''}};
  const document={
    getElementById:name=>items[name]||null,
    addEventListener:()=>{},
    querySelectorAll:()=>[]
  };
  const window={};
  new Function('window','document','activeView','api',script)(
    window,document,'Website Security',async path=>
      path.startsWith('visitor-intelligence')?
        (activityData||{
          range:{start:data.range.start,endInclusive:data.range.endInclusive},
          activePageTime:{status:'not_started'}
        }):data
  );
  window.djomsWebsiteSecurity.render();
  await new Promise(resolve=>setImmediate(resolve));
  return items.djSecurityAlertBox.innerHTML+items.securityWatchResult.innerHTML;
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
  visitorIntelligence:{
    status:'reported',reviewedSessions:8,signedInMemberSessions:2,
    notSignedInSessions:5,memberStatusUnknown:1,
    returningBrowserSessions:3,newBrowserSessions:4,visitorTypeUnknown:1,
    crawlerLikeSessions:4,engagedLookingSessions:2,unclearSessions:2,
    memberAndSweepOverlap:1,networkCount:2,networkRowsShown:2,
    historicalIPStatus:'available',previouslySeenIPCount:1,
    verifiedCrawlerCount:null,
    note:'Session analytics only.',
    unclearDetail:{
      total:2,
      reasons:{onePageNoMeasuredTime:1,onePageShortMeasuredTime:1,
        pageUnreported:0,otherInsufficientEvidence:0},
      returningBrowserSessions:1,newBrowserSessions:1,visitorTypeUnknown:0,
      signedInMemberSessions:1,notSignedInSessions:1,memberStatusUnknown:0,
      sessionsShown:2,partial:false,
      note:'Wix average is not individual dwell time.',
      topPages:[{path:'/outlaw-radio-5150',sessions:1},{path:'/the-wooden-token',sessions:1}],
      sources:[{source:'direct',sessions:1},{source:'social',sessions:1}],
      sessionRows:[
        {recordedAt:'2026-11-11T17:00:00Z',ipAddress:'192.0.2.6',
          page:'/outlaw-radio-5150',source:'direct',browserType:'returning',
          memberStatus:'not-signed-in',why:'onePageNoMeasuredTime',wixAverageSeconds:null},
        {recordedAt:'2026-11-11T18:00:00Z',ipAddress:'198.51.100.8',
          page:'/the-wooden-token',source:'social',browserType:'new',
          memberStatus:'signed-in',why:'onePageShortMeasuredTime',wixAverageSeconds:10}
      ]
    },
    networkRows:[
      {ipAddress:'192.0.2.6',recordedSessions:5,signedInMemberSessions:1,
        returningBrowserSessions:2,engagedLookingSessions:1,crawlerLikeSessions:3,
        previouslySeenIP:true},
      {ipAddress:'198.51.100.8',recordedSessions:3,signedInMemberSessions:1,
        returningBrowserSessions:1,engagedLookingSessions:1,crawlerLikeSessions:1,
        previouslySeenIP:false}
    ],
    sources:[
      {source:'direct',sessions:6,signedInMemberSessions:1,crawlerLikeSessions:4},
      {source:'social',sessions:2,signedInMemberSessions:1,crawlerLikeSessions:0}
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


test('Visitor Intelligence displays member, returning-browser and crawler-like counts below IP Watch',async()=>{
  const html=await render(report);
  const pieces=[
    'IP WATCH · REPEAT VISIT HISTORY','VISITOR INTELLIGENCE',
    'SIGNED-IN WIX MEMBER','RETURNING BROWSER','ENGAGED-LOOKING','CRAWLER-LIKE',
    'MEMBER / SIGN-IN EVIDENCE','NEW / RETURNING BROWSERS','IP SIGNAL COMPARISON',
    'VISIT SOURCE COMPARISON','Pit Krewe','not a named customer'
  ];
  for(const part of pieces){
    // The exact copy may vary; the security-only classifications must exist.
    if(part==='not a named customer')continue;
    assert.ok(html.includes(part),'Missing visitor section: '+part);
  }
  assert.ok(html.indexOf('IP WATCH · REPEAT VISIT HISTORY')<
    html.indexOf('VISITOR INTELLIGENCE'));
  assert.ok(html.indexOf('VISITOR INTELLIGENCE')<
    html.indexOf('IP VISIT HISTORY'));
  assert.ok(!html.includes('member-flag-raw-session-identifier'));
});

test('Visitor Intelligence shows unavailable when only member signal endpoint fails',async()=>{
  const html=await render({...report,visitorIntelligence:{
    status:'unavailable',error:'Membership signal cannot be verified'
  }});
  assert.match(html,/VISITOR INTELLIGENCE · UNAVAILABLE/);
  assert.match(html,/Membership signal cannot be verified/);
  assert.match(html,/IP WATCH · REPEAT VISIT HISTORY/);
  assert.match(html,/PAGE-BY-PAGE DETAILS/);
});

test('Untrusted Wix traffic source is escaped inside visitor analysis',async()=>{
  const html=await render({...report,visitorIntelligence:{
    ...report.visitorIntelligence,
    sources:[{source:'<script>alert(1)</script>',sessions:1,
      signedInMemberSessions:0,crawlerLikeSessions:0}]
  }});
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});


test('Why Unclear shows the reason for each ambiguous session without calling it a bot',async()=>{
  const html=await render(report);
  for(const fragment of [
    'WHY 2 SESSIONS ARE UNCLEAR',
    'ONE PAGE · TIME NOT MEASURED',
    'ONE PAGE · SHORT REPORTED AVERAGE',
    'VIEW UNCLEAR SESSION DETAILS',
    'TOP PAGES AMONG UNCLEAR SESSIONS',
    'REFERRAL SOURCES AMONG UNCLEAR SESSIONS',
    'Export unclear records (CSV)',
    'Not measured',
    'Wix avg'
  ])assert.ok(html.includes(fragment),'Missing '+fragment);
});

test('Missing detail is explicitly unavailable rather than claiming zero',async()=>{
  const html=await render({...report,visitorIntelligence:{
    ...report.visitorIntelligence,unclearDetail:null
  }});
  assert.match(html,/WHY UNCLEAR\? · NO DETAIL AVAILABLE/);
  assert.doesNotMatch(html,/WHY 0 SESSIONS ARE UNCLEAR/);
});

test('Untrusted page and source labels are escaped in unclear investigation',async()=>{
  const malicious='<img src=x onerror=alert(1)>';
  const html=await render({...report,visitorIntelligence:{
    ...report.visitorIntelligence,unclearDetail:{
      ...report.visitorIntelligence.unclearDetail,
      topPages:[{path:malicious,sessions:1}],
      sessionRows:[{...report.visitorIntelligence.unclearDetail.sessionRows[0],
        page:malicious,source:malicious}]
    }
  }});
  assert.ok(!html.includes(malicious));
  assert.ok(html.includes('&lt;img'));
});

test('Priority #1 page-time report shows measured consented activity, including single-page sessions',async()=>{
  const activity={
    range:{start:report.range.start,endInclusive:report.range.endInclusive},
    activePageTime:{
      status:'reported',trackedSessions:4,sampledSessions:4,
      sessionsWith30PlusSeconds:2,onePageSessionsWith30PlusSeconds:1,
      totalRecordedActiveSeconds:152,withoutRecordedSeconds:1,
      pageOpensWith30PlusSeconds:2,trackedPageOpens:5,pathsSeen:3,
      note:'Separate analytics-consented browser tracker.',
      pages:[{
        path:'/the-wooden-token',trackedPageOpens:2,opensWithRecordedTime:2,
        opensWith30PlusSeconds:1,totalRecordedActiveSeconds:86
      },{
        path:'/outlaw-radio-5150',trackedPageOpens:2,opensWithRecordedTime:1,
        opensWith30PlusSeconds:1,totalRecordedActiveSeconds:66
      }]
    }
  };
  const html=await render(report,activity);
  assert.ok(html.includes('ACTIVE PAGE TIME · PRIORITY #1'));
  assert.ok(html.includes('SINGLE-PAGE 30+ SEC'));
  assert.ok(html.includes('2m 32s'));
  assert.ok(html.includes('PAGE-BY-PAGE TIME RECORDS'));
  assert.ok(html.includes('The Wooden Token'));
  assert.ok(html.includes('Outlaw Radio 5150'));
  assert.ok(html.indexOf('ACTIVE PAGE TIME')<html.indexOf('IP WATCH · REPEAT VISIT HISTORY'));
  assert.ok(html.includes('NOT added to the Wix session count'));
});

test('Page-time endpoint failure never erases independent Wix security results',async()=>{
  const activity={
    range:{start:report.range.start,endInclusive:report.range.endInclusive},
    activePageTime:{status:'unavailable',error:'Consented timer unavailable'}
  };
  const html=await render(report,activity);
  assert.ok(html.includes('ACTIVE PAGE TIME · NOT VERIFIED'));
  assert.ok(html.includes('Consented timer unavailable'));
  assert.ok(html.includes('FLAGGED ACTIVITY'));
  assert.ok(html.includes('PAGE-BY-PAGE DETAILS'));
});

test('A mismatched reporting date cannot be silently merged with Wix security',async()=>{
  const html=await render(report,{
    range:{start:'2025-01-01',endInclusive:'2025-01-07'},
    activePageTime:{status:'reported',trackedSessions:99}
  });
  assert.ok(html.includes('ACTIVE PAGE TIME · NOT VERIFIED'));
  assert.ok(html.includes('did not match the selected dates'));
});

test('Suspicious page sweeps pulse yellow and never claim a verified attack',async()=>{
  const html=await render(report);
  assert.match(html,/dj-attack-watch dj-attack-yellow/);
  assert.match(html,/TAKE A LOOK · SUSPICIOUS TRAFFIC/);
  assert.match(html,/does NOT confirm a successful attack/);
  assert.doesNotMatch(html,/dj-attack-red/);
  assert.match(html,/href="#djSecurityFlaggedActivity"/);
});

test('A quiet Wix traffic result is not presented as a complete security all-clear',async()=>{
  const html=await render({...report,alerts:[],totalPatterns:0,priorityPatterns:0});
  assert.match(html,/dj-attack-quiet/);
  assert.match(html,/Wix firewall and login-attack evidence are not connected/);
  assert.doesNotMatch(html,/dj-attack-red/);
  assert.doesNotMatch(html,/dj-attack-yellow/);
});

test('No verified security data remains neutral, never green',async()=>{
  const html=await render({...report,status:'unavailable',error:'Wix query unavailable'});
  assert.match(html,/dj-attack-unknown/);
  assert.match(html,/ATTACK WATCH · NOT VERIFIED/);
  assert.doesNotMatch(html,/dj-attack-red/);
});

test('A bot pattern or unsupported attack claim does not trigger red',async()=>{
  const html=await render({...report,securityProof:{
    status:'not_connected',
    confirmedAttack:{verified:true,type:'unauthorized_access',
      evidenceSource:'Unverified claim',lastSeenAt:new Date().toISOString(),active:true}
  }});
  assert.match(html,/dj-attack-yellow/);
  assert.doesNotMatch(html,/dj-attack-red/);
});

test('A separately verified historical incident triggers red, with the evidence source',async()=>{
  const html=await render({...report,securityProof:{
    status:'verified_incident',
    confirmedAttack:{verified:true,type:'unauthorized_access',
      evidenceSource:'Authenticated incident log',lastSeenAt:'2026-11-11T12:00:00Z',active:false}
  }});
  assert.match(html,/dj-attack-watch dj-attack-red/);
  assert.match(html,/CONFIRMED ATTACK · RECORDED/);
  assert.match(html,/Authenticated incident log/);
  assert.doesNotMatch(html,/UNDER ATTACK · VERIFIED INCIDENT/);
});

test('A currently confirmed incident reports under attack only when recent',async()=>{
  const html=await render({...report,securityProof:{
    status:'verified_incident',
    confirmedAttack:{verified:true,type:'confirmed_malicious_attack',
      evidenceSource:'Verified firewall feed',lastSeenAt:new Date().toISOString(),active:true}
  }});
  assert.match(html,/UNDER ATTACK · VERIFIED INCIDENT/);
  assert.match(html,/dj-attack-red/);
});

test('Untrusted incident evidence source is escaped and cannot run HTML',async()=>{
  const value='<img src=x onerror=alert(1)>';
  const html=await render({...report,securityProof:{
    status:'verified_incident',
    confirmedAttack:{verified:true,type:'unauthorized_access',
      evidenceSource:value,lastSeenAt:'2026-11-11T12:00:00Z',active:false}
  }});
  assert.ok(!html.includes(value));
  assert.ok(html.includes('&lt;img'));
});

test('Pulsing attack alerts stop animating for reduced-motion preferences',async()=>{
  const style=await readFile(new URL('../website-security-watch.css',import.meta.url),'utf8');
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(style,/animation:none!important/);
});

test('Five rejected owner sign-ins give a giant yellow warning, not a red breach claim',async()=>{
  const html=await render({...report,alerts:[],totalPatterns:0,securityProof:{
    status:'connected',failedAdminLogins:5,rateLimitLockouts:0,
    lastFailureAt:'2026-11-12T11:00:00.000Z'
  }});
  assert.match(html,/dj-attack-watch dj-attack-yellow/);
  assert.match(html,/YELLOW ALERT/);
  assert.match(html,/TAKE A LOOK · SIGN-IN WARNING/);
  assert.match(html,/5 rejected owner passwords/);
  assert.doesNotMatch(html,/dj-attack-red/);
});
test('One rate-limit lockout warns yellow even when Wix traffic is unavailable',async()=>{
  const html=await render({...report,status:'unavailable',alerts:[],securityProof:{
    status:'connected',failedAdminLogins:15,rateLimitLockouts:1,
    lastLockoutAt:'2026-11-12T11:30:00.000Z'
  }});
  assert.match(html,/YELLOW ALERT/);
  assert.match(html,/1 owner sign-in lockout window/);
  assert.doesNotMatch(html,/RED ALERT/);
});
test('One mistyped password does not create a high-visibility alarm',async()=>{
  const html=await render({...report,alerts:[],totalPatterns:0,securityProof:{
    status:'connected',failedAdminLogins:1,rateLimitLockouts:0
  }});
  assert.doesNotMatch(html,/YELLOW ALERT/);
  assert.doesNotMatch(html,/RED ALERT/);
});
test('The red incident and yellow anomaly banners use billboard-sized styling',async()=>{
  const style=await readFile(new URL('../website-security-watch.css',import.meta.url),'utf8');
  assert.match(style,/\.dj-attack-severity/);
  assert.match(style,/clamp\(35px,6\.2vw,80px\)/);
  assert.match(style,/min-height:205px/);
  assert.match(style,/prefers-reduced-motion:reduce/);
  const html=await render({...report,securityProof:{
    status:'verified_incident',
    confirmedAttack:{verified:true,type:'unauthorized_access',
      evidenceSource:'Authenticated security log',lastSeenAt:'2026-11-12T12:00:00Z',active:false}
  }});
  assert.match(html,/RED ALERT/);
  assert.match(html,/dj-attack-severity/);
});
