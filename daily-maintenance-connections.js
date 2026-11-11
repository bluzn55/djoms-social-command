/* Owner-only connection diagnostics. GET requests only; no publishing or purchases. */
(function(){
  'use strict';
  var state={started:false,running:false,checkedAt:null,rows:[],history:[],saveError:''};
  var SOURCES=[
    {path:'/api/meta/seo-status',kind:'gsc'},
    {path:'/api/meta/bing-status',kind:'bing'},
    {path:'/api/meta/ga4-status',kind:'ga4'},
    {path:'/api/meta/ga4-verify',kind:'ga4-tag'},
    {path:'/api/meta/status',kind:'meta'},
    {path:'/api/meta/local-status',kind:'local'},
    {path:'/api/meta/radio-live-status',kind:'radio'},
    {path:'/api/x/status',kind:'x'},
    {path:'/api/youtube/status',kind:'youtube'}
  ];
  var NAMES={
    gsc:'Google Search Console',bing:'Bing Webmaster',ga4:'Google Analytics data',
    'ga4-tag':'Wix / GA4 measurement ID',facebook:'Facebook connection',
    instagram:'Instagram connection',x:'X connection',youtube:'YouTube connection',
    gbp:'Google Business Profile',yelp:'Yelp reporting connection',
    tripadvisor:'Tripadvisor reporting connection',wix:'Wix website reporting',
    radio:'Outlaw Radio 5150 broadcast'
  };
  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function dateFmt(value){
    if(!value||!Number.isFinite(Date.parse(value)))return 'Not recorded';
    return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',
      year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))+' CT';
  }
  function row(id,level,message){
    return {id,label:NAMES[id],state:level,message:String(message||'No explanation returned.').slice(0,300)};
  }
  function simpleConnection(id,data){
    if(data?.connected===true)return row(id,'green',String(data.message||'Authenticated provider data was returned.'));
    var status=String(data?.status||'not-connected');
    return row(id,status==='unavailable'?'unverified':'yellow',String(data?.message||('Connection status: '+status)));
  }
  function parse(kind,data){
    if(kind==='gsc'||kind==='bing'||kind==='ga4')return [simpleConnection(kind,data)];
    if(kind==='ga4-tag'){
      var tag=String(data?.status||'unavailable');
      return [row(kind,tag==='matched'?'green':tag==='mismatch'?'red':'unverified',
        data?.message||('GA4 tag status: '+tag))];
    }
    if(kind==='meta'){
      return ['facebook','instagram'].map(function(id){
        var d=data?.[id]||{};
        return row(id,d.connected&&d.canPublish?'green':d.connected?'yellow':'yellow',
          d.connected ? (d.canPublish?'Connected and publishing permission returned.':
            'Connected; publishing permissions need review.') : String(d.message||'Not connected.'));
      });
    }
    if(kind==='local'){
      var google=data?.google||{};
      var website=data?.website||{};
      return [
        row('gbp',google.connected&&!google.needsLocation?'green':'yellow',
          String(google.message||'Business profile connection needs review.')),
        row('yelp',data?.yelp?.connected?'green':'optional',
          data?.yelp?.connected ? String(data.yelp.message||'Yelp API reporting is connected.') :
            'Optional API reporting not connected. '+String(data?.yelp?.message||'No paid API reporting configured.')),
        row('tripadvisor',data?.tripadvisor?.connected?'green':'optional',
          data?.tripadvisor?.connected ? String(data.tripadvisor.message||'Tripadvisor API reporting is connected.') :
            'Optional API reporting not connected. '+String(data?.tripadvisor?.message||'No API reporting configured.')),
        row('wix',website.connected===true?'green':'unverified',
          website.connected===true?'Website reporting connection returned data.':
            'Website reporting endpoint replied; Wix reporting health not independently verified.')
      ];
    }
    if(kind==='radio')return [row(kind,
      data?.connected&&data?.broadcastStatus==='online'?'green':
      data?.broadcastStatus==='offline'?'red':'unverified',
      data?.broadcastStatus==='online'?'Station public status says online. Not proof audio is audible.':
      data?.broadcastStatus==='offline'?'Radio.co station status says offline.':
      data?.note||'Live broadcast status was not confirmed.')];
    if(kind==='x'||kind==='youtube'){
      return [row(kind,data?.connected&&data?.canPublish?'green':'yellow',
        data?.connected?(data.canPublish?'Connection and publishing access confirmed.':
          String(data.message||'Connection exists but publishing permission needs review.')):
          String(data?.message||'Connection not confirmed.'))];
    }
    return [];
  }
  function failRows(kind,error){
    var ids=kind==='meta'?['facebook','instagram']:kind==='local'?['gbp','yelp','tripadvisor','wix']:[kind];
    var message=String(error?.message||error||'Read-only check could not complete.').slice(0,180);
    return ids.map(function(id){return row(id,'unverified',message);});
  }
  async function readOnly(url){
    var response=await fetch(url,{credentials:'same-origin',cache:'no-store',
      signal:AbortSignal.timeout(30000),headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('HTTP '+response.status+' when checking '+url);
    return response.json();
  }
  async function loadPrivateHistory(){
    try{
      var data=await readOnly('/api/meta/maintenance-health');
      state.history=Array.isArray(data?.history)?data.history:[];
      if(!state.checkedAt&&data?.latest?.checkedAt){
        state.checkedAt=data.latest.checkedAt;
        state.rows=Array.isArray(data.latest.rows)?data.latest.rows:[];
      }
    }catch(e){state.saveError='Could not load the signed-in history: '+String(e.message||e);}
  }
  function redraw(){
    if(typeof activeView==='undefined'||activeView!=='Daily Maintenance')return;
    if(typeof window.djomsDailyMaintenance?.render==='function')window.djomsDailyMaintenance.render();
  }
  async function run(){
    if(state.running)return;
    state.running=true;state.saveError='';redraw();
    var output=[];
    // Small batches prevent many simultaneous provider API requests.
    for(var i=0;i<SOURCES.length;i+=3){
      var results=await Promise.all(SOURCES.slice(i,i+3).map(async function(source){
        try {return parse(source.kind,await readOnly(source.path));}
        catch(e){return failRows(source.kind,e);}
      }));
      results.forEach(function(items){output.push.apply(output,items);});
    }
    state.rows=output;
    state.checkedAt=new Date().toISOString();
    try{
      if(typeof api!=='function')throw new Error('Owner session is not available for saving results.');
      var saved=await api('maintenance-health',{rows:output});
      if(!saved?.success)throw new Error('Server did not confirm the save.');
      await loadPrivateHistory();
    }catch(e){state.saveError='Checks completed, but history saving was not verified: '+String(e.message||e);}
    state.running=false;redraw();
  }
  function issueRepeats(){
    var history=state.history||[],now=Date.now(),results=[];
    Object.keys(NAMES).forEach(function(id){
      var failedDays=new Set(),latestIssue=null;
      history.forEach(function(report){
        var item=(report.rows||[]).find(function(x){return x.id===id;});
        if(!item||item.state==='green'||['yelp','tripadvisor'].includes(id))return;
        var day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',
          month:'2-digit',day:'2-digit'}).format(new Date(report.checkedAt));
        failedDays.add(day);latestIssue=item;
      });
      if(failedDays.size>=2){
        var newest=(history.find(function(x){return x.rows?.some(function(r){return r.id===id&&r.state!=='green';});}))?.checkedAt;
        if(newest&&now-Date.parse(newest)<14*86400000)
          results.push({id,name:NAMES[id],days:failedDays.size,latest:latestIssue});
      }
    });
    return results.sort(function(a,b){return b.days-a.days;});
  }

  function fixGuide(id) {
    // Each warning should name the actual place to act, not just announce a problem.
    if(id==='gbp')return {
      explanation:'The Google Business Profile reporting connection is not authorized in DJOMS. This does NOT mean your public Google listing has disappeared.',
      steps:'Connect your Google account and select the Doc Jaks business location, then run Check Connections Now again.',
      action:'Connect Google Business Profile',
      url:'/api/meta/local-google-connect',
      secondary:'Open Reviews & Local',
      view:'Mission Control'
    };
    if(id==='yelp')return {
      explanation:'The Yelp developer API trial has expired. Your normal Yelp listing is not necessarily affected. Automatic review reporting may require a paid API plan.',
      steps:'Review API access and cost before deciding. No upgrade is needed just to keep a normal Yelp business listing.',
      action:'Review Yelp API options',
      url:'https://www.yelp.com/developers/v3/manage_app',
      secondary:'Manage regular Yelp listing',
      secondaryUrl:'https://biz.yelp.com/'
    };
    if(id==='tripadvisor')return {
      explanation:'The DJOMS reporting integration is missing a Tripadvisor API key and location ID. This is separate from your regular public listing.',
      steps:'If you want automated Tripadvisor data, review the API offering and configure the key and location ID privately in the DJOMS backend. Never paste API keys into chat or this report.',
      action:'Review Tripadvisor API access',
      url:'https://www.tripadvisor.com/developers',
      optional:true
    };
    var view=({gsc:'SEO Analytics',bing:'SEO Analytics',ga4:'Website Analytics',
      'ga4-tag':'Website Analytics',facebook:'Platforms',instagram:'Platforms',
      youtube:'Platforms',x:'Platforms',wix:'Website Analytics',radio:'Mission Control'})[id];
    return {
      explanation:'This connected service needs a closer check. Read the error above and inspect the provider settings.',
      steps:'Open the related DJOMS section and reconnect or correct settings as needed. Then rerun Check Connections Now.',
      view:view||'Platforms',
      action:'Open '+(view||'Platforms'),
      optional:false
    };
  }
  function fixHtml(item){
    var guide=fixGuide(item.id);
    var isOptional=item.id==='yelp'||item.id==='tripadvisor';
    var links='';
    if(guide.url)links+='<a class="dj-maint-fix-link" href="'+escapeHtml(guide.url)+'"'+
      (/^https:/.test(guide.url)?' target="_blank" rel="noopener noreferrer"':'')+'>'+
      escapeHtml(guide.action)+' ↗</a>';
    else if(guide.view)links+='<button type="button" class="dj-maint-fix-link" data-dj-maint-go-view="'+
      escapeHtml(guide.view)+'">'+escapeHtml(guide.action)+'</button>';
    if(guide.secondaryUrl)links+='<a class="dj-maint-fix-secondary" href="'+escapeHtml(guide.secondaryUrl)+
      '" target="_blank" rel="noopener noreferrer">'+escapeHtml(guide.secondary)+' ↗</a>';
    else if(guide.secondary&&guide.view)links+='<button type="button" class="dj-maint-fix-secondary"'+
      ' data-dj-maint-go-view="'+escapeHtml(guide.view)+'" data-dj-maint-focus-local="1">'+
      escapeHtml(guide.secondary)+'</button>';
    return '<details class="dj-maint-remedy">'+
      '<summary>'+(item.state==='optional'?'VIEW API OPTIONS':'FIX / VIEW SETUP')+' <span aria-hidden="true">▾</span></summary>'+
      '<div class="dj-maint-remedy-body"><p><b>What this means:</b> '+escapeHtml(guide.explanation)+'</p>'+
      '<p><b>What to do:</b> '+escapeHtml(guide.steps)+'</p>'+
      (isOptional?'<p class="dj-maint-optional-note">OPTIONAL API REPORTING. Do not buy a plan just to clear this warning.</p>':'')+
      '<div class="dj-maint-remedy-actions">'+links+'</div></div></details>';
  }
  function rowHtml(item){
    var status=item.state||'unverified';
    var nice={green:'VERIFIED CONNECTED',yellow:'NEEDS ATTENTION',
      red:'SERVICE PROBLEM',unverified:'UNVERIFIED',
      optional:'OPTIONAL · NOT CONNECTED'}[status]||'UNVERIFIED';
    var needs=status!=='green';
    return '<article class="dj-maint-secure-check dj-maint-tone-'+escapeHtml(status)+'" id="dj-maint-source-'+
      escapeHtml(item.id)+'">'+
      '<div><b>'+escapeHtml(item.label)+'</b><strong>'+escapeHtml(nice)+'</strong></div>'+
      '<p>'+escapeHtml(item.message||'No details available.')+'</p>'+
      (needs?fixHtml(item):'')+'</article>';
  }

  function renderHtml(){
    var rows=state.rows||[],attention=rows.filter(function(x){return x.state!=='green'&&x.state!=='optional';}),
      passed=rows.filter(function(x){return x.state==='green';}),
      optional=rows.filter(function(x){return x.state==='optional';});
    var counts={green:0,yellow:0,red:0,unverified:0,optional:0};
    rows.forEach(function(r){if(Object.prototype.hasOwnProperty.call(counts,r.state))counts[r.state]++;});
    var repeats=issueRepeats(),last=state.history.slice(0,15);
    return '<section class="dj-maint-secure-section">'+
      '<p class="dj-maint-register-note"><b>OWNER-ONLY CONNECTION CHECK.</b> These requests test live provider data using your existing signed-in access. '+
      'They run when you open this page or click Check Connections, not automatically during the unattended public 4 AM scan. '+
      'Nothing is posted, bought, deleted or changed.</p>'+
      '<div class="dj-maint-page-actions"><button type="button" data-dj-maint-connections="1"'+
      (state.running?' disabled':'')+'>'+(state.running?'Checking providers…':'Check Connections Now')+'</button>'+
      '<span>'+(state.checkedAt?'Last completed: '+escapeHtml(dateFmt(state.checkedAt)):'No owner connection check on record')+'</span></div>'+
      (state.saveError?'<p class="dj-maint-secure-error">'+escapeHtml(state.saveError)+'</p>':'')+
      (rows.length?'<p class="dj-maint-connection-counts"><b>'+counts.green+' connected</b> · '+
        counts.yellow+' need attention · '+counts.optional+' optional · '+counts.red+' problems · '+counts.unverified+' unverified</p>'+
        (attention.length?'<h3 class="dj-maint-attention-header">NEEDS ATTENTION · FIX IT HERE</h3>'+
        '<p class="dj-maint-register-note">Open <b>FIX / VIEW SETUP</b> on each warning below. '+
        'Only connections that require action are listed here. Optional API reporting is separate below.</p>'+
        '<div class="dj-maint-secure-grid dj-maint-fix-grid">'+attention.map(rowHtml).join('')+'</div>':'')+
        '<h3>WORKING CONNECTIONS</h3>'+
        '<div class="dj-maint-secure-grid">'+passed.map(rowHtml).join('')+'</div>'+
        (optional.length?'<h3>OPTIONAL REPORTING · NOT CONNECTED</h3>'+
          '<p class="dj-maint-register-note">Yelp and Tripadvisor API access is optional. Your public business listings are separate, and no subscription is needed just to clear these notices.</p>'+
          '<div class="dj-maint-secure-grid dj-maint-optional-grid">'+optional.map(rowHtml).join('')+'</div>':''):
        '<p class="dj-maint-empty">The signed-in provider checks have not completed yet.</p>')+
      '<h3>REPEATED CONNECTION FAILURES</h3>'+
      (repeats.length?'<div class="dj-maint-repeat-list">'+repeats.map(function(x){
        return '<article class="dj-maint-repeat-entry"><b>'+escapeHtml(x.name)+'</b>'+
          '<strong class="dj-maint-secure-repeat-tag">FLAGGED ON '+x.days+' DIFFERENT DAYS</strong>'+
          '<p>'+escapeHtml(x.latest?.message||'Check provider permissions, token refresh and API response logs.')+'</p>'+
          '<p><b>Likely reason or next diagnostic:</b> '+escapeHtml(x.id==='yelp'?'Developer API trial expired. This is a subscription access issue, not an unexpected outage.':x.id==='tripadvisor'?'No Tripadvisor API key or location ID is configured in the backend.':x.id==='gbp'?'No working Google Business Profile authorization or selected location was returned.':'Investigate permissions, provider response errors, and backend configuration changes.')+'</p></article>';
      }).join('')+'</div>':'<p class="dj-maint-empty">No provider check has been recorded as unhealthy on two separate days in the saved owner history.</p>')+
      '<h3>PRIVATE CONNECTION HISTORY</h3>'+
      '<p class="dj-maint-register-note">Older saved reports retain their original status labels from before optional services were reclassified.</p>'+
      (last.length?'<div class="dj-maint-history">'+last.map(function(report){
        var totals=report.summary||{};
        return '<details class="dj-maint-history-entry"><summary><b>'+escapeHtml(dateFmt(report.checkedAt))+'</b>'+
          '<span>'+Number(totals.green||0)+' connected · '+Number(totals.yellow||0)+' need attention · '+
          Number(totals.optional||0)+' optional · '+Number(totals.red||0)+' red · '+
          Number(totals.unverified||0)+' unverified</span></summary>'+
          '<div class="dj-maint-history-body">'+(report.rows||[]).map(function(x){
            return '<p><b>'+escapeHtml(x.label)+'</b> · '+escapeHtml(x.state||'unverified')+
              ' · '+escapeHtml(x.message||'')+'</p>';
          }).join('')+'</div></details>';
      }).join('')+'</div>':'<p class="dj-maint-empty">No saved owner connection checks yet.</p>')+
      '</section>';
  }
  function onPageOpen(){
    if(state.started)return;
    state.started=true;
    loadPrivateHistory().then(function(){
      redraw();
      // Don't create repeated automatic history entries when someone refreshes the page.
      // The explicit Check Connections Now button always forces a fresh run.
      var last=state.history[0]?.checkedAt;
      var oldOptionalPolicy=state.rows.some(function(r){
        return ['yelp','tripadvisor'].includes(r.id)&&r.state!=='green'&&r.state!=='optional';
      });
      if(!oldOptionalPolicy&&last&&Number.isFinite(Date.parse(last))&&Date.now()-Date.parse(last)<5*60000)return;
      return run();
    }).catch(function(e){
      state.saveError=String(e.message||e);redraw();
    });
  }
  document.addEventListener('click',function(event){
    if(event.target.closest('[data-dj-maint-connections]')){
      event.preventDefault();run();return;
    }
    var go=event.target.closest('[data-dj-maint-go-view]');
    if(go&&typeof setView==='function'){
      event.preventDefault();
      var view=go.getAttribute('data-dj-maint-go-view');
      var local=go.hasAttribute('data-dj-maint-focus-local');
      Promise.resolve(setView(view)).then(function(){
        if(local){
          var target=document.querySelector('.reviews-local-card.reviews-google');
          target?.scrollIntoView({behavior:'smooth',block:'center'});
        }
      });
    }
  });
  window.djomsMaintenanceConnections={renderHtml:renderHtml,onPageOpen:onPageOpen,checkNow:run};
})();