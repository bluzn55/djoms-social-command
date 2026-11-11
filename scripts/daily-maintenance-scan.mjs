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
const notes = [], visited = new Set();
const seoChecks = [], backendChecks = [], autoRecovered = [];
const MAX_PUBLIC_LINKS = 50;
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
        if(attempt===2)autoRecovered.push({url,trigger:firstFailure||'Network failure',outcome:'Retry returned HTTP '+response.status});
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
            'The '+device+' automated browser measured only '+snapshot.textLength+' visible text characters. This may be delayed Wix rendering, not a confirmed blank page.',
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
  const selected=[...external].filter(u=>/(youtube|spotify|apple|instagram|facebook|twitter|x\.com|outlaw|radio|square|amazon)/i.test(u)).slice(0,18);
  for(const address of selected) {
    try {
      const response=await fetchWithTimeout(address,9000);
      linksChecked++;
      if([404,410].includes(response.status))
        issue('yellow','External destination missing','External link returned HTTP '+response.status+'.',address,'Open it in a browser and replace the outdated destination.');
      else if(!response.ok){unverified++;notes.push('External service blocked automated verification: '+address+' ('+response.status+')');}
    }catch(e){unverified++;notes.push('Unable to verify external link '+address);}
  }
}
function determineStatus(){
  const issues=[...issueMap.values()];
  if(issues.some(x=>x.severity==='red'))return 'red';
  if(issues.length||unverified||!browserPagesChecked)return 'yellow';
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
  if((previous.data.history||[]).some(x=>localDay(x.checkedAt)===today)) {
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
  }catch(e){unverified++;issue('red','Scan failed','The morning scan was interrupted: '+String(e.message||e),SITE,'Review scanner logs and retry the website inspection.');}
  const issues=[...issueMap.values()],status=determineStatus();
  const checkedAt=new Date().toISOString();
  const run={id:'webscan-'+checkedAt,checkedAt,startedAt,completedAt:checkedAt,
    durationSeconds:Math.max(0,Math.round((Date.parse(checkedAt)-Date.parse(startedAt))/1000)),
    triggerEvent:runMode,source:'github-actions-technical-scan',status,
    summary: status==='green'?'The automated public web checks passed.':status==='red'?
    'Critical website problem detected. Review the red repair items.':'Review flagged items or parts that could not be verified.',
    coverage:{pagesChecked,linksChecked,browserPagesChecked,imagesChecked,unverified},issues,notes:notes.slice(0,35)};
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
