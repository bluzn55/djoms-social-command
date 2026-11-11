// Doc Jaks daily technical maintenance scan. Runs in GitHub Actions, not in visitors' browsers.
// Writes dated evidence into the maintenance-history branch, not the deployed app branch.
import { chromium } from 'playwright';

const SITE = 'https://www.docjaks.com';
const REPO = process.env.GITHUB_REPOSITORY || 'bluzn55/djoms-social-command';
const TOKEN = process.env.GITHUB_TOKEN;
const HISTORY_BRANCH = 'maintenance-history';
const HISTORY_FILE = 'daily-maintenance-history.json';
const UA = 'DocJaks-MorningMaintenance/1.0 (website-quality-monitor)';
const dateFormat = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
// Use a 00-23 local hour so midnight is never mistaken for hour 24.
const timeFormat = new Intl.DateTimeFormat('en-GB',{timeZone:'America/Chicago',hour:'2-digit',hourCycle:'h23'});
const localDay = (at)=>dateFormat.format(new Date(at)).replaceAll('/','-');
const localHour = ()=>Number(timeFormat.format(new Date()));
const issueMap = new Map();
let pagesChecked = 0, linksChecked = 0, browserPagesChecked = 0, imagesChecked = 0, unverified = 0;
let publicExternalAttempted=0,publicExternalEligible=0,publicExternalFiltered=0;
const notes = [], visited = new Set();
const seoChecks = [], backendChecks = [], autoRecovered = [];
const MAX_PUBLIC_LINKS = 200;
const tracked = new Set([SITE+'/',SITE+'/sm-welcome']);
const external = new Set();
const pageLimit = 180;
function issue(severity,label,problem,url,fix) {
  const key = severity+'|'+label+'|'+url;
  if (!issueMap.has(key)) issueMap.set(key,{severity,label,problem,url,fix});
}
function isLocal(url) {
  try {let u=new URL(url);return (u.hostname==='www.docjaks.com'||u.hostname==='docjaks.com') && /^https?:$/.test(u.protocol);}
  catch {return false;}
}
function normalize(href,base) {
  try {
    const url = new URL(href,base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash='';
    if (isLocal(url)) { url.hostname='www.docjaks.com';url.search=''; }
    return url.href.replace(/\/$/,'') || SITE+'/';
  } catch {return null;}
}
function add(href,base) {
  const url=normalize(href,base);
  if(!url)return;
  if(isLocal(url)) tracked.add(url);
  else if (!/^(?:https?:\/\/)(?:static\.wixstatic\.com|fonts\.|wix\.com)/i.test(url)) external.add(url);
}
function urlsFromHtml(body,base) {
  for(const m of body.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'<>]+)["']/gi)) add(m[1].replace(/&amp;/g,'&'),base);
}
async function fetchWithTimeout(url,timeout=13000) {
  let firstFailure;
  for(let attempt=1;attempt<=2;attempt++){
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),timeout);
    try {
      const response=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xml;q=0.9,*/*;q=0.8'},signal:controller.signal,redirect:'follow'});
      if(attempt===1&&[429,502,503,504].includes(response.status)){
        firstFailure='HTTP '+response.status;
        try{await response.body?.cancel();}catch{}
      }else{
        if(attempt===2&&response.ok)autoRecovered.push({url,trigger:firstFailure||'Network failure',outcome:'Retry succeeded with HTTP '+response.status});
        return response;
      }
    }catch(e){
      if(attempt===2)throw e;
      firstFailure=String(e.message||e);
    }finally{clearTimeout(timer);}
    await new Promise(resolve=>setTimeout(resolve,450));
  }
  throw new Error('Request exhausted both attempts.');
}
async function discoverSitemaps() {
  const queue=[SITE+'/sitemap.xml'];const checked=new Set();
  while(queue.length && checked.size<16){
    const url=queue.shift(); if(checked.has(url))continue;checked.add(url);
    try {
      const response=await fetchWithTimeout(url);if(!response.ok){unverified++;notes.push('Sitemap '+url+' returned HTTP '+response.status);continue;}
      const xml=await response.text();
      for(const m of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
        const v=m[1].trim().replace(/&amp;/g,'&');
        if(/\.xml(?:\?|$)/i.test(v)&&isLocal(v)){if(!checked.has(v))queue.push(v);}else add(v,SITE);
      }
    }catch(e){unverified++;notes.push('Sitemap '+url+' could not be verified: '+String(e.message||e));}
  }
}
function critical(url) {
  return url===SITE || url===SITE+'/' || /(sm-welcome|pit-krewe|music-hall|outlaw|trading-post|wooden-token)/i.test(url);
}
async function checkPage(url){
  if (visited.has(url))return;visited.add(url);
  try{
    const response=await fetchWithTimeout(url);
    linksChecked++;
    if (response.status>=400){
      issue(critical(url)?'red':'yellow','Broken website page',
        'HTTP '+response.status+' returned during the automated check.',url,
        'Restore the page, republish it, or repair the link pointing here.');
      return;
    }
    if(!response.ok){unverified++;notes.push(url+' returned '+response.status);return;}
    pagesChecked++;
    const contentType=response.headers.get('content-type')||'';
    if(!/text\/html/i.test(contentType))return;
    const html=await response.text();
    urlsFromHtml(html,url);
    if(html.length<500)issue('yellow','Suspiciously empty page','The HTTP response contains unusually little HTML.',url,'Open this page in the Wix editor and verify its published content.');
  }catch(e){
    unverified++;
    if(critical(url))issue('red','Critical page unreachable','The public site request failed: '+String(e.message||e),url,
      'Check Wix publishing, domain availability, and whether the page is still public.');
    else notes.push('Unable to verify '+url+': '+String(e.message||e));
  }
}
async function browserChecks(){
  let browser;
  try{browser=await chromium.launch({headless:true});}
  catch(e){unverified++;notes.push('Browser checks unavailable: '+String(e.message||e));return;}
  try {
    const all=[...tracked];
    const pageUrls=[SITE+'/',SITE+'/sm-welcome'];
    const words=['porch','pit-krewe','original-music','music-hall','outlaw-radio','trading-post','wooden-token','words-of-wisdom','emberhold','archives','library','contact','smokehouse'];
    for(const word of words) {const match=all.find(u=>u.toLowerCase().includes(word));if(match&&!pageUrls.includes(match))pageUrls.push(match);}
    for(const address of pageUrls.slice(0,15)){
      for(const device of ['desktop','mobile']){
        const context=await browser.newContext({viewport:device==='mobile'?{width:390,height:844}:{width:1440,height:900},userAgent:UA});
        const page=await context.newPage();
        // The maintenance bot must not inflate Google Analytics / session counters.
        await page.route(/(?:google-analytics\.com|googletagmanager\.com|doubleclick\.net|analytics\.wix\.com|facebook\.net\/en_US\/fbevents)/i, route=>route.abort());
        try{
          const response=await page.goto(address,{waitUntil:'domcontentloaded',timeout:24000});
          await page.waitForTimeout(2800);
          if (!response || response.status()>=400) {unverified++;notes.push(device+' browser unable to open '+address);continue;}
          const snapshot=await page.evaluate(()=>{
            const text=(document.body?.innerText||'').trim();
            const images=[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>25&&r.height>25&&r.top<window.innerHeight*1.5});
            const broken=images.filter(i=>i.complete&&i.naturalWidth===0&&i.currentSrc).map(i=>i.currentSrc).slice(0,5);
            const hrefs=[...document.querySelectorAll('a[href]')].map(a=>a.href).slice(0,200);
            return{textLength:text.length,text:text.slice(0,20000),broken,images:images.length,hrefs};
          });
          browserPagesChecked++; imagesChecked+=snapshot.images;
          for(const u of snapshot.hrefs)add(u,address);
          if(snapshot.textLength<60)issue('yellow','Browser content needs verification',
            'The '+device+' browser measured '+snapshot.textLength+' selectable text characters and '+snapshot.images+' visible images. Image-led design or delayed Wix rendering may trigger this alert; it does not confirm a blank page.',
            address,'Open the page manually on '+device+' and check for missing sections or slow loading.');
          if(snapshot.broken.length)issue('yellow','Broken visible image',
            snapshot.broken.length+' image(s) failed to load in the '+device+' browser view.',
            address,'Check media images and relink any missing assets.');
          if(/porch/i.test(address) && /LATEST FROM THE PORCH/i.test(snapshot.text) &&
            !(/HURRY UP AND WAIT/i.test(snapshot.text))){
            issue('yellow','Porch feed may be empty','The blog heading was found but the recent HURRY UP AND WAIT post was not found in visible text.',
              address,'Open the Post List in the Wix editor and inspect its category and featured-post filters.');
          }
        }catch(e){unverified++;notes.push('Browser could not verify '+address+' on '+device+': '+String(e.message||e));}
        finally{await context.close();}
      }
    }
  }finally{await browser.close();}
}
async function checkExternal(){
  // Test discovered outbound links in bounded parallel groups.
  // A 403/429 from third-party services is UNVERIFIED, not proof the link is broken.
  const candidates=[...external].filter(u=>!/(?:google-analytics|googletagmanager|doubleclick|wixstatic|sentry|cloudflare)/i.test(u));
  const selected=candidates.slice(0,MAX_PUBLIC_LINKS);
  publicExternalEligible=candidates.length;publicExternalAttempted=selected.length;
  publicExternalFiltered=external.size-candidates.length;
  for(let i=0;i<selected.length;i+=5){
    await Promise.all(selected.slice(i,i+5).map(async(address)=>{
      try {
        const response=await fetchWithTimeout(address,8500);
        linksChecked++;
        if([404,410].includes(response.status))
          issue('yellow','External destination missing','External URL returned HTTP '+response.status+'.',address,
            'Check the destination manually and replace the obsolete link.');
        else if(!response.ok){unverified++;notes.push('External destination not verified: '+address+' (HTTP '+response.status+')');}
      }catch(e){unverified++;notes.push('Unable to verify external link '+address);}
    }));
  }
  if(candidates.length>selected.length){
    unverified++;notes.push((candidates.length-selected.length)+' relevant external URLs exceeded the scan limit.');
  }
  if(publicExternalFiltered)notes.push(publicExternalFiltered+' analytics/tracking/infrastructure URLs intentionally excluded from visitor-link testing.');
}

function recordCheck(group,label,state,detail,url){
  (group==='seo'?seoChecks:backendChecks).push({label,state,detail,url,checkedAt:new Date().toISOString()});
}
function htmlAttribute(tag,name){
  const pattern=new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|'+String.fromCharCode(39)+'([^'+String.fromCharCode(39)+']*)'+String.fromCharCode(39)+')','i');
  const found=String(tag||'').match(pattern);
  return found?(found[1]??found[2]):null;
}
function htmlTagByAttribute(html,element,key,value){
  const tagPattern=new RegExp('<'+element+'\\b[^>]*>','gi');
  const tags=String(html||'').match(tagPattern)||[];
  return tags.find(tag=>String(htmlAttribute(tag,key)||'').toLowerCase()===value)||null;
}
async function checkPublicSeo(){
  // HTTP checks establish public SEO configuration, NOT search-engine indexing.
  for(const url of [SITE+'/',SITE+'/sm-welcome']){
    try{
      const response=await fetchWithTimeout(url,14000);
      if(!response.ok){unverified++;recordCheck('seo','HTML SEO tags','unverified','HTTP '+response.status,url);continue;}
      const html=await response.text(),head=html.split(/<\/head>/i)[0];
      const title=head.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,'').trim()||'';
      const meta=htmlTagByAttribute(head,'meta','name','description');
      const description=meta?htmlAttribute(meta,'content'):'';
      const canonicalTag=htmlTagByAttribute(head,'link','rel','canonical');
      const canonical=canonicalTag?htmlAttribute(canonicalTag,'href'):'';
      const robotsTag=htmlTagByAttribute(head,'meta','name','robots');
      const robots=String(robotsTag?htmlAttribute(robotsTag,'content'):'').toLowerCase();
      recordCheck('seo','Page title',title?'pass':'needs-attention',
        title?'Title: '+title.slice(0,100):'No public HTML page title found.',url);
      recordCheck('seo','Meta description',description?'pass':'needs-attention',
        description?'Meta description present.':'No public meta description found.',url);
      recordCheck('seo','Canonical URL',canonical?'pass':'needs-attention',
        canonical?'Canonical: '+canonical.slice(0,150):'No canonical link found in server HTML.',url);
      recordCheck('seo','Noindex check',robots.includes('noindex')?'needs-attention':'pass',
        robots.includes('noindex')?'Meta robots explicitly contains noindex.':'No meta noindex detected; indexing itself not verified.',url);
      if(!title||!description||!canonical){
        issue('yellow','SEO metadata needs verification','A basic SEO tag is absent from the public HTML.',url,
          'Inspect Wix SEO settings for title, description and canonical URL.');
      }
      if(robots.includes('noindex')){
        issue('yellow','SEO noindex directive','Search indexing was disabled in meta robots.',url,
          'Check whether the noindex setting was intentional.');
      }
    }catch(e){unverified++;recordCheck('seo','HTML SEO tags','unverified','Not reachable from scanner: '+String(e.message||e),url);}
  }
  const robotsUrl=SITE+'/robots.txt',sitemapUrl=SITE+'/sitemap.xml';
  try{
    const response=await fetchWithTimeout(robotsUrl);
    if(!response.ok){unverified++;recordCheck('seo','Robots.txt','unverified','HTTP '+response.status,robotsUrl);}
    else {
      const content=await response.text();
      const blocksAll=/user-agent:\s*\*\s*(?:\r?\n[ \t]*)disallow:\s*\/\s*(?:\r?\n|$)/i.test(content);
      recordCheck('seo','Robots.txt',blocksAll?'needs-attention':'pass',
        blocksAll?'Robots rules appear to block the entire site.':'Robots file responded; crawling rules may still require review.',robotsUrl);
      if(blocksAll)issue('yellow','SEO site-wide robots restriction','Robots.txt appears to disallow all pages.',robotsUrl,'Review public Wix robots rules.');
    }
  }catch(e){unverified++;recordCheck('seo','Robots.txt','unverified',String(e.message||e),robotsUrl);}
  try{
    const response=await fetchWithTimeout(sitemapUrl);
    if(!response.ok){unverified++;recordCheck('seo','Sitemap index','unverified','HTTP '+response.status,sitemapUrl);}
    else {
      const content=await response.text(),hasUrls=/<loc>\s*https?:\/\//i.test(content);
      recordCheck('seo','Sitemap index',hasUrls?'pass':'needs-attention',
        hasUrls?'XML sitemap index has location entries.':'Sitemap index contains no location entries.',sitemapUrl);
      if(!hasUrls)issue('yellow','SEO sitemap missing URLs','Sitemap index did not contain loc elements.',sitemapUrl,
        'Check the published Wix sitemap configuration.');
    }
  }catch(e){unverified++;recordCheck('seo','Sitemap index','unverified',String(e.message||e),sitemapUrl);}
}


async function checkPublicBackOffice(){
  // Public probes only: a login gate responding is NOT proof an API token works.
  const targets=[
    {label:'DJOMS owner dashboard',url:'https://djoms-social-command.vercel.app/'},
    {label:'DJOMS Maintenance direct page',url:'https://djoms-social-command.vercel.app/maintenance'},
    {label:'DJOMS account authorization',url:'https://djoms-social-command.vercel.app/api/meta/status',private:true},
    {label:'Owner Maintenance History service',url:'https://djoms-social-command.vercel.app/api/meta/maintenance-health',private:true},
    {label:'Search Console API route',url:'https://djoms-social-command.vercel.app/api/meta/seo-status',private:true},
    {label:'Bing Webmaster API route',url:'https://djoms-social-command.vercel.app/api/meta/bing-status',private:true},
    {label:'GA4 analytics API route',url:'https://djoms-social-command.vercel.app/api/meta/ga4-status',private:true},
    {label:'Outlaw Radio public website',url:'https://outlawradio5150.com/'}
  ];
  await Promise.all(targets.map(async(target)=>{
    try{
      const response=await fetchWithTimeout(target.url,14000),status=response.status;
      if(target.private&&[401,403].includes(status)){
        recordCheck('backend',target.label,'login-required',
          'HTTP '+status+': sign-in required. Underlying service authorization has not been tested.',target.url);
      }else if(status>=500 || status===404){
        recordCheck('backend',target.label,'needs-attention','HTTP '+status,target.url);
        issue('yellow','Back-office service response','Public request to service returned HTTP '+status+'.',target.url,
          'Review the Vercel deployment, routing and private service connectivity.');
      }else if(!response.ok){
        unverified++;
        recordCheck('backend',target.label,'unverified','HTTP '+status+'; private connection still not tested.',target.url);
      }else{
        recordCheck('backend',target.label,target.private?'unverified':'pass',
          target.private?'Public route responded without signed-in verification.':'Public site replied HTTP '+status+'.',target.url);
      }
    }catch(e){
      unverified++;recordCheck('backend',target.label,'unverified',
        'Unable to check this service: '+String(e.message||e),target.url);
    }
  }));
}
function fingerprint(item){
  const label=String(item?.label||'').toLowerCase();
  const family=/browser content needs verification|page appears blank/.test(label)?'wix-visual-content':
    /broken website page|critical page unreachable/.test(label)?'page-unreachable':
    /seo metadata/.test(label)?'seo-metadata':
    /external destination/.test(label)?'external-link':
    label.replace(/[^a-z0-9]+/g,'-');
  return family+'|'+String(item?.url||'').replace(/\/$/,'').toLowerCase();
}
function possibleTrigger(item){
  const label=String(item?.label||'').toLowerCase();
  if(/browser content|page appears blank/.test(label))
    return 'Possible delayed Wix page hydration or image-heavy content. Compare actual loaded desktop/mobile visuals and DOM text. Cause not confirmed.';
  if(/seo|robots|sitemap/.test(label))
    return 'Possible Wix SEO publishing or indexing configuration. Compare Wix site settings and live HTML. Cause not confirmed.';
  if(/back-office|service response/.test(label))
    return 'Possible Vercel deployment, proxy routing or authentication fault. Review exact response codes and logs. Cause not confirmed.';
  if(/external/.test(label))
    return 'Possible changed destination or bot-blocked response. Compare browser and automated requests. Cause not confirmed.';
  return 'Find the common page, integration, or timing change across affected dates. Cause not confirmed.';
}
function recurringIssues(current,previous,checkedAt){
  const nowIssues=[...current,...autoRecovered.map(item=>({label:'Transient service recovered on retry',url:item.url,problem:item.trigger,fix:'Investigate why this URL intermittently needs a retry.'}))];
  const all=[...(Array.isArray(previous.history)?previous.history:[]),{checkedAt,issues:nowIssues}];
  const found=new Map();
  for(const run of all){
    if(!run?.checkedAt)continue;
    const day=localDay(run.checkedAt),seen=new Set();
    const observed=[...(run.issues||[]),...(run.autoRecovered||[]).map(item=>({label:'Transient service recovered on retry',url:item.url,problem:item.trigger,fix:'Investigate intermittent responses.'}))];
    for(const item of observed){
      const key=fingerprint(item);
      if(seen.has(key))continue;seen.add(key);
      const e=found.get(key)||{key,item,first:run.checkedAt,last:run.checkedAt,days:new Set()};
      e.days.add(day);
      if(Date.parse(run.checkedAt)>Date.parse(e.last)){e.last=run.checkedAt;e.item=item;}
      if(Date.parse(run.checkedAt)<Date.parse(e.first))e.first=run.checkedAt;
      found.set(key,e);
    }
  }
  const currentKeys=new Set(nowIssues.map(fingerprint));
  const repairs=Array.isArray(previous.repairs)?previous.repairs:[];
  return [...found.values()].filter(e=>e.days.size>=2 &&
    (Date.parse(checkedAt)-Date.parse(e.last))<=7*86400000).map(e=>{
      const related=repairs.filter(r=>(r.issueKey===e.key||r.relatedIssueKey===e.key)&&r.status==='verified'&&r.verifiedAt);
      return {key:e.key,label:e.item.label,url:e.item.url,firstSeen:e.first,lastSeen:e.last,
        observedDays:e.days.size,current:currentKeys.has(e.key),
        reopenedAfterVerifiedFix:related.some(r=>Date.parse(e.last)>Date.parse(r.verifiedAt)),
        verifiedFixCount:related.length,possibleTrigger:possibleTrigger(e.item)};
    }).sort((a,b)=>Number(b.reopenedAfterVerifiedFix)-Number(a.reopenedAfterVerifiedFix)||
      Number(b.current)-Number(a.current)||b.observedDays-a.observedDays).slice(0,35);
}

function determineStatus(){
  const issues=[...issueMap.values()];
  if(issues.some(x=>x.severity==='red'))return 'red';
  if(issues.length||unverified||autoRecovered.length||!browserPagesChecked)return 'yellow';
  return 'green';
}
async function githubApi(path,method='GET',body){
  if(!TOKEN) throw new Error('GITHUB_TOKEN is required to save a maintenance record.');
  const r=await fetch('https://api.github.com/repos/'+REPO+path,{method,headers:{
    'Authorization':'Bearer '+TOKEN,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'
  },body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw new Error('GitHub history API returned '+r.status+': '+(await r.text()).slice(0,400));
  return r.json();
}
async function currentHistory() {
  const f=await githubApi('/contents/'+HISTORY_FILE+'?ref='+HISTORY_BRANCH);
  const raw=Buffer.from(f.content.replace(/\n/g,''),'base64').toString('utf8');
  return {data:JSON.parse(raw),sha:f.sha};
}
async function scanBatch(urls) {
  for(let i=0;i<urls.length;i+=6) {
    await Promise.all(urls.slice(i,i+6).map(checkPage));
  }
}
async function main() {
  const runMode=process.env.GITHUB_EVENT_NAME||'workflow_dispatch';
  // GitHub may start a scheduled job hours late. Never discard a late check.
  // The two UTC cron entries span daylight-saving changes; the early one
  // must still wait until 4 AM Central before it is allowed to record.
  if(runMode==='schedule' && localHour()<4) {
    console.log('Scheduled candidate started before 4 AM Central; awaiting the 4 AM schedule.');return;
  }
  let previous=await currentHistory();
  const today=localDay(Date.now());
  if(runMode==='schedule' && (previous.data.history||[]).some(x=>localDay(x.checkedAt)===today)) {
    console.log('Already recorded website check for local day '+today);return;
  }
  const startedAt = new Date().toISOString();
  try{
    await discoverSitemaps();
    await scanBatch([...tracked].slice(0,pageLimit));
    // Gather newly found page URLs without an endless crawl.
    await scanBatch([...tracked].filter(u=>!visited.has(u)).slice(0,Math.max(0,pageLimit-visited.size)));
    if(tracked.size>visited.size){unverified++;notes.push((tracked.size-visited.size)+' additional discovered URLs were outside the daily scan limit.');}
    await browserChecks();
    await checkExternal();
    await Promise.all([checkPublicSeo(),checkPublicBackOffice()]);
  }catch(e){unverified++;issue('red','Scan failed','The morning scan was interrupted: '+String(e.message||e),SITE,'Review scanner logs and retry the website inspection.');}
  const issues=[...issueMap.values()],status=determineStatus();
  const checkedAt=new Date().toISOString();
  const recurringAlerts=recurringIssues(issues,previous.data,checkedAt);
  const run={id:'webscan-'+checkedAt,checkedAt,startedAt,completedAt:checkedAt,
    durationSeconds:Math.max(0,Math.round((Date.parse(checkedAt)-Date.parse(startedAt))/1000)),
    triggerEvent:runMode,source:'github-actions-technical-scan',status,
    summary: status==='green'?'The automated public web checks passed.':status==='red'?
    'Critical website problem detected. Review the red repair items.':'Review flagged items or parts that could not be verified.',
    coverage:{pagesChecked,linksChecked,browserPagesChecked,imagesChecked,unverified,
      publicExternalLinksAttempted:publicExternalAttempted,
      publicExternalLinksDiscovered:publicExternalEligible,
      publicExternalLinksExcluded:publicExternalFiltered},
    issues,seoChecks,backendChecks,autoRecovered:autoRecovered.slice(0,60),
    recurringAlerts,notes:notes.slice(0,35)};
  const all=[run,...(previous.data.history||[])];
  // Preserve the separately verified repair ledger and future metadata with every scan.
  // Scans are observations: they must never erase or invent repair confirmations.
  const doc={...previous.data,version:2,updatedAt:checkedAt,latest:run,history:all};
  const content=Buffer.from(JSON.stringify(doc,null,2)+'\n').toString('base64');
  await githubApi('/contents/'+HISTORY_FILE,'PUT',{message:'Record Doc Jaks website maintenance '+today+' ('+status+')',
    branch:HISTORY_BRANCH,sha:previous.sha,content});
  console.log('Recorded',today,'completed at',checkedAt,'Central local date:',localDay(checkedAt),
    'status',status,'durationSeconds',run.durationSeconds,JSON.stringify(run.coverage),'issues',issues.length);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
