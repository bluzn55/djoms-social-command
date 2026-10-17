'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube', website: 'Website Community', blog: "From Doc's Porch" };
const statusPlatforms = ['facebook','instagram','x','youtube'];
const labels = { draft:'Draft', approved:'Approved', scheduled:'Scheduled', queueing:'Confirming schedule', paused:'Paused', publishing:'Publishing', published:'Published', failed:'Needs attention', partial:'Partly published', uncertain:'Check result', processing:'Preparing photo', prepared:'Prepared' };
let records = [], campaigns = [], mediaInbox = [], videoInbox = [], commentStream = [], commentWarnings = [], commentCheckedAt = null, commentPlatformFilter = 'all', commentStatusFilter = 'all', csrf = '', selected = null, connection = null, analyticsData = { platforms:{}, posts:[], history:[] }, localData = { google:{}, yelp:{}, tripadvisor:{}, facebook:{} }, dirty = false, busy = false, activeView = 'Mission Control', campaignFilter = '', searchTerm = '', owner = '';
let pollTimer;
let rotationStatus = null, rotationPreview = null, rotationStartDate = '', rotationStartTime = '';
let xAutoStatus = null;
const rotationZone = 'America/Chicago';
// Media Inbox fields are saved independently of converting pictures into posts.
const inboxDirty = new Set();
const inboxSaveTimers = new Map();
const inboxSaveChains = new Map();
const inboxEditVersions = new Map();
let inboxChangingView = false;
let platformMetricRange = '7d';
let websiteRange = '7d';
const websiteRangeReports = Object.create(null);
const websiteRanges = Object.freeze([['today','Today'],['7d','7 days'],['30d','30 days'],['365d','1 year']]);
function websiteRangeButtons() {
  return '<div class="website-range-toolbar" role="group" aria-label="Website analytics time range"><strong>REPORTING PERIOD</strong>' +
    websiteRanges.map(([key,label]) => '<button type="button" data-website-range="'+key+'" class="'+(websiteRange===key?'active':'')+'" aria-pressed="'+(websiteRange===key)+'">'+label+'</button>').join('') +
    '</div>';
}
function websiteSnapshot() {
  return websiteRange === '7d' ? (localData?.website || websiteRangeReports['7d'] || {})
    : (websiteRangeReports[websiteRange] || {});
}
async function loadWebsiteRange(range = websiteRange) {
  if (!websiteRanges.some(([key]) => key === range)) throw new Error('Choose a supported website reporting period.');
  const data = await api('website-range?range='+encodeURIComponent(range));
  if (data.range?.selection && data.range.selection !== range) throw new Error('Wix returned a different reporting period. No numbers were changed.');
  websiteRangeReports[range] = data;
  if (range === '7d') localData.website = data;
  return data;
}
let selectedStatusPlatform = null;
let connectionCheckedAt = null;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function date(value) { return value ? new Date(value).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'; }
function code(r) { return r.campaign + '-' + r.id.slice(-4).toUpperCase(); }
function notice(message, bad = false) { $('notice').textContent = message; $('notice').hidden = !message; $('notice').className = bad ? 'bad-notice' : 'good-notice'; }
let resetToken = '';
function authScreen(screen) {
  ['login','recovery','reset'].forEach(name => $(name + 'Form').hidden = name !== screen);
  $('loginDialog').setAttribute('aria-labelledby', screen === 'login' ? 'loginTitle' : screen + 'Title');
  if (!$('loginDialog').open) $('loginDialog').showModal();
  $(screen === 'login' ? 'password' : screen === 'reset' ? 'newPassword' : 'sendResetButton').focus();
}
function showLogin(message = '') { $('loginMessage').textContent = message; authScreen('login'); }
async function api(path, body, method) {
  const options = { method: method || (body ? 'POST' : 'GET'), credentials:'same-origin', headers:{}, signal:AbortSignal.timeout(150000) };
  if (options.method !== 'GET') { options.headers['Content-Type'] = 'application/json'; options.headers['X-DJOMS-CSRF'] = csrf; if (body) options.body = JSON.stringify(body); }
  let response, data;
  try { response = await fetch('/api/meta/' + path, options); data = await response.json(); }
  catch { throw new Error('The connection was interrupted. Refresh to check what was saved before retrying.'); }
  if (!response.ok) { if (response.status === 401 && path !== 'session') showLogin('Sign in again to continue.'); throw new Error(data.error || 'The request could not be completed.'); }
  return data;
}
function updateRecord(r) { const index = records.findIndex(x => x.id === r.id); if (index >= 0) records[index] = r; else records.unshift(r); selected = r; }
async function loadRecords() { const data = await api('records'); records = data.records; campaigns = data.campaigns; if (data.limited) notice('Showing the latest 500 posts.'); }
async function loadAnalytics(refresh = false) {
  try {
    analyticsData = await api('analytics?range=' + encodeURIComponent(platformMetricRange) + (refresh ? '&refresh=1' : ''));
  } catch {
    analyticsData = { platforms:{}, posts:[], history:[] };
  }
  return analyticsData;
}
async function loadLocalStatus() {
  try { localData = await api('local-status'); websiteRangeReports['7d'] = localData.website || null; }
  catch { localData = { google:{connected:false,message:'Could not check Google.'}, yelp:{connected:false,message:'Could not check Yelp.'}, tripadvisor:{connected:false,message:'Could not check Tripadvisor.'}, facebook:{connected:false,message:'Not connected.'},website:{connected:false,message:'Could not check Wix.'} }; websiteRangeReports['7d'] = null; }
  return localData;
}
function localCard(key, name) {
  const info = localData?.[key] || {};
  const connected = !!info.connected;
  const needs = connected && (info.needsLocation || info.needsReviewData || info.needsPermission || Number(info.unanswered || 0) > 0);
  const color = connected ? (needs ? 'yellow' : 'green') : 'red';
  const rating = info.rating == null ? '—' : Number(info.rating).toFixed(1);
  const total = info.totalReviewCount == null ? '—' : compactMetric(info.totalReviewCount);
  const reviews = Array.isArray(info.reviews) ? info.reviews : [];
  const recentCutoff = Date.now() - 7*86400000;
  const newCount = reviews.filter(r => Date.parse(r.createTime || r.updateTime || 0) >= recentCutoff).length;
  const unanswered = info.unanswered == null ? reviews.filter(r => !r.reply).length : info.unanswered;
  let action = '';
  if (key === 'google' && !connected) action = '<a class="reviews-local-action" href="/api/meta/local-google-connect">Connect Google</a>';
  else if (key === 'google' && info.needsLocation && Array.isArray(info.locations) && info.locations.length) {
    action = '<label class="reviews-location-picker">Choose location<select data-local-google-location><option value="">Select…</option>' + info.locations.map(x => '<option value="'+esc(x.accountName)+'|'+esc(x.locationName)+'">'+esc(x.title)+'</option>').join('') + '</select></label><button type="button" class="reviews-local-action" data-action="saveGoogleLocation">Use this location</button>';
  } else if (!connected && info.setup) action = '<span class="reviews-setup-note">Setup needed</span>';
  return '<div class="reviews-local-card reviews-'+esc(key)+'">'+
    '<span class="reviews-local-top"><span class="reviews-local-name">'+esc(name)+'</span><i class="gyr-light '+color+'" aria-hidden="true"></i></span>'+
    '<span class="reviews-local-status">'+esc(info.message || (connected ? 'Connected' : 'Not connected yet'))+'</span>'+
    '<span class="reviews-local-metrics">'+
      '<span><small>Rating</small><b>'+esc(rating)+'</b></span>'+
      '<span><small>Reviews</small><b>'+esc(total)+'</b></span>'+
      '<span><small>New 7d</small><b>'+esc(newCount)+'</b></span>'+
      '<span><small>Unanswered</small><b>'+esc(compactMetric(unanswered))+'</b></span>'+
    '</span>'+action+
  '</div>';
}
async function loadMediaInbox() {
  const data = await api('records',{ action:'mediaInboxList' });
  mediaInbox = data.items || [];
  return mediaInbox;
}
async function loadVideoInbox() {
  const data = await platformApi('youtube','video-list','YouTube');
  videoInbox = data.items || [];
  return videoInbox;
}
async function loadComments() {
  const [ytResult, metaResult, xResult, blogResult, webResult] = await Promise.allSettled([
    platformApi('youtube','comments','YouTube'),
    api('comments?platforms=facebook,instagram'),
    platformApi('x','mentions','X'),
    platformApi('meta','wix-blog-comments','From Doc\'s Porch'),
    platformApi('community','moderation','Website Community')
  ]);
  commentStream = [];
  commentWarnings = [];
  const checked = [];
  if (ytResult.status === 'fulfilled') {
    commentStream.push(...(ytResult.value.items || []));
    if (ytResult.value.checkedAt) checked.push(ytResult.value.checkedAt);
  } else commentWarnings.push('YouTube: ' + ytResult.reason.message);
  if (metaResult.status === 'fulfilled') {
    commentStream.push(...(metaResult.value.items || []));
    commentWarnings.push(...(metaResult.value.warnings || []));
    if (metaResult.value.checkedAt) checked.push(metaResult.value.checkedAt);
  } else commentWarnings.push('Facebook / Instagram: ' + metaResult.reason.message);
  if (xResult.status === 'fulfilled') {
    commentStream.push(...(xResult.value.items || []));
    if (xResult.value.checkedAt) checked.push(xResult.value.checkedAt);
  } else commentWarnings.push('X: ' + xResult.reason.message);
  if (blogResult.status === 'fulfilled') {
    if (blogResult.value.connected) {
      commentStream.push(...(blogResult.value.items || []));
    } else {
      commentWarnings.push('Blog: ' + (blogResult.value.message || 'Connect Wix Blog.'));
    }
    if (blogResult.value.checkedAt) checked.push(blogResult.value.checkedAt);
  } else commentWarnings.push('Blog: ' + blogResult.reason.message);
  if (webResult.status === 'fulfilled') {
    const webItems=(webResult.value.items || []).map(x=>({
      platform:'website', id:x.id, parentId:x.parentId || x.id, postId:x.id,
      postTitle:'⚜ ' + (x.topic || 'Doc Jaks Community'),
      author:x.displayName || 'Website visitor', text:x.text || '',
      publishedAt:x.createdAt || null, handled:!!x.handled, handledAt:x.handledAt || null,
      moderationStatus:x.status || 'pending', media:x.media || null,
      reply:x.reply || null, openUrl:'https://www.docjaks.com/community'
    }));
    commentStream.push(...webItems);
    if(webResult.value.checkedAt) checked.push(webResult.value.checkedAt);
  } else commentWarnings.push('Website Community: ' + webResult.reason.message);
  commentStream.sort((a,b)=>Date.parse(b.publishedAt || 0)-Date.parse(a.publishedAt || 0));
  commentCheckedAt = checked.sort().at(-1) || new Date().toISOString();
  return commentStream;
}
async function platformApi(prefix, path, label) {
  const response = await fetch('/api/' + prefix + '/' + path, { credentials:'same-origin', signal:AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || label + ' could not be checked.');
  return data;
}
async function xAutoPost(body){
  const response=await fetch('/api/x/auto',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},
    body:JSON.stringify(body),signal:AbortSignal.timeout(30000)
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error || 'X automatic posting settings could not be changed.');
  return data;
}
async function loadXAuto(){
  xAutoStatus=await platformApi('x','auto','X automation');
  return xAutoStatus;
}
async function youtubePost(path, body) {
  const response = await fetch('/api/youtube/' + path, {
    method:'POST',
    credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},
    body:JSON.stringify(body || {}),
    signal:AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'YouTube could not complete the request.');
  return data;
}
async function wixBlogPost(body) {
  const response = await fetch('/api/meta/wix-blog-comments', {
    method:'POST',
    credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},
    body:JSON.stringify(body || {}),
    signal:AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Wix Blog could not complete the request.');
  return data;
}
function connectionHealth(info = {}) {
  if (info.canPublish) return { color:'green', label:'GREEN', text:'Connected & working' };
  if (info.connected) return { color:'yellow', label:'YELLOW', text:'Needs attention' };
  return { color:'red', label:'RED', text:'Disconnected / needs attention' };
}
function compactMetric(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && !/^[-+]?\d+(\.\d+)?$/.test(value.trim())) return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 10000) return new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(number);
  return new Intl.NumberFormat('en-US').format(number);
}
function metricSeries(source = {}, keys = []) {
  const directContainers = [source.trends, source.trend, source.series, source.daily, source.history].filter(Boolean);
  for (const container of directContainers) {
    for (const key of keys) {
      const value = container?.[key];
      if (Array.isArray(value)) {
        const numbers = value.map(v => Number(typeof v === 'object' && v ? (v.value ?? v.count ?? v.total) : v)).filter(Number.isFinite);
        if (numbers.length >= 2) return numbers.slice(-14);
      }
    }
    if (Array.isArray(container)) {
      for (const key of keys) {
        const numbers = container.map(row => Number(row?.[key])).filter(Number.isFinite);
        if (numbers.length >= 2) return numbers.slice(-14);
      }
    }
  }
  for (const key of keys) {
    const value = source[key + 'Trend'] ?? source[key + 'History'] ?? source[key + 'Series'];
    if (Array.isArray(value)) {
      const numbers = value.map(v => Number(typeof v === 'object' && v ? (v.value ?? v.count ?? v.total) : v)).filter(Number.isFinite);
      if (numbers.length >= 2) return numbers.slice(-14);
    }
  }
  return [];
}
function trendChart(values = [], metric = '') {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length < 2) return '<span class="trend-chart trend-chart-empty"><span>Trend appears when daily data is available</span></span>';
  const width = 300, height = 108, left = 8, right = 34, top = 8, bottom = 24;
  const maxValue = Math.max(...nums,1);
  const step = (width-left-right) / Math.max(1,nums.length-1);
  const y = value => top + (1 - Math.max(0,value) / maxValue) * (height-top-bottom);
  const pts = nums.map((value,index)=>[left + index*step,y(value)]);
  const points = pts.map(([xv,yv])=>xv.toFixed(1)+','+yv.toFixed(1)).join(' ');
  const dots = pts.map(([xv,yv])=>'<circle cx="'+xv.toFixed(1)+'" cy="'+yv.toFixed(1)+'" r="3"></circle>').join('');
  const ref = [maxValue, maxValue/2, 0];
  const refY = [top, top+(height-top-bottom)/2, height-bottom];
  const plotRight = width-right;
  const grid = refY.map((yv,i)=>'<line x1="'+left+'" y1="'+yv+'" x2="'+plotRight+'" y2="'+yv+'" class="trend-gridline"></line><text x="'+(plotRight+3)+'" y="'+(yv+4)+'" class="trend-axis">'+compactMetric(ref[i])+'</text>').join('');
  const rangeText = platformMetricRange === 'today' ? '1 DAY' : platformMetricRange === '7d' ? 'WEEK' : platformMetricRange === '30d' ? 'MONTH' : 'YEAR';
  const labels = '<text x="'+left+'" y="'+(height-5)+'" class="trend-axis">START</text><text text-anchor="middle" x="'+((width-right+left)/2)+'" y="'+(height-5)+'" class="trend-axis">'+rangeText+'</text><text text-anchor="end" x="'+(width-right)+'" y="'+(height-5)+'" class="trend-axis">NOW</text>';
  return '<span class="trend-chart" aria-label="'+esc(metric)+' recent trend"><svg viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" aria-hidden="true">'+grid+'<polyline points="'+points+'" class="trend-polyline"></polyline>'+dots+labels+'</svg></span>';
}
function platformMetricData(info = {}, platform) {
  const aliases = { today:['today','1d','day'], '7d':['7d','7','week'], '30d':['30d','30','month'], '365d':['365d','365','year','12m'] };
  const bases = [info.analytics, info.insights, info.metrics].filter(Boolean);
  let source = {};
  for (const base of bases) {
    const key = (aliases[platformMetricRange] || [platformMetricRange]).find(k => base && typeof base[k] === 'object');
    if (key) { source = base[key]; break; }
    if (['likes','comments','replies','clicks','shares','reposts','reach','views','impressions'].some(k => base?.[k] !== undefined)) { source = base; break; }
  }
  const actual = analyticsData?.platforms?.[platform] || {};
  const top = actual.topPost ?? source.topPost ?? source.bestPost ?? source.topContent ?? info.topPost ?? null;
  const actualHistory = (analyticsData?.history || []).map(row => ({ date:row.date, ...(row.platforms?.[platform] || {}) }));
  return {
    audience: info.followers ?? info.subscribers ?? info.audience ?? source.followers ?? source.subscribers ?? source.audience ?? source.followersCount ?? source.subscriberCount,
    audienceChange: source.audienceChange ?? source.followersChange ?? source.netFollowers ?? source.subscriberGain ?? source.subscribersGained ?? info.audienceChange,
    likes: (platform==='x' ? actual.likes : null) ?? source.likes ?? source.likeCount ?? info.likes,
    replies: (platform==='x' ? actual.replies : null) ?? source.replies ?? source.comments ?? source.replyCount ?? source.commentCount ?? info.replies ?? info.comments,
    clicks: actual.clicks ?? source.clicks ?? source.linkClicks ?? source.clickCount ?? info.clicks ?? info.linkClicks,
    shares: actual.shares ?? source.shares ?? source.reposts ?? source.forwards ?? source.shareCount ?? source.repostCount ?? info.shares ?? info.reposts,
    reach: actual.reach ?? source.reach ?? source.views ?? source.impressions ?? source.viewCount ?? source.reachCount ?? info.reach ?? info.views,
    reactions: source.reactions ?? source.reactionCount ?? info.reactions,
    saves: source.saves ?? source.saveCount ?? info.saves,
    bookmarks: (platform==='x' ? actual.bookmarks : null) ?? source.bookmarks ?? source.bookmarkCount ?? info.bookmarks,
    watchTime: source.watchTimeHours !== undefined ? compactMetric(source.watchTimeHours) + ' hr' : source.watchTimeMinutes !== undefined ? compactMetric(source.watchTimeMinutes) + ' min' : source.watchTime ?? info.watchTime,
    subscriberGain: source.subscriberGain ?? source.subscribersGained ?? source.netSubscribers ?? info.subscriberGain,
    topPostTitle: typeof top === 'string' ? top : top?.title ?? top?.caption ?? top?.name,
    topPostValue: typeof top === 'object' && top ? (top.engagement ?? top.views ?? top.clicks ?? top.likes) : null,
    trends: {
      engagement: actualHistory.map(x => x.engagementRate).filter(v => Number.isFinite(Number(v))).map(Number).length >= 2 ? actualHistory.map(x => Number(x.engagementRate)).filter(Number.isFinite) : metricSeries(source,['engagementRate','engagement']),
      clicks: actualHistory.map(x => x.clicks).filter(v => Number.isFinite(Number(v))).map(Number).length >= 2 ? actualHistory.map(x => Number(x.clicks)).filter(Number.isFinite) : metricSeries(source,['clicks','linkClicks']),
      shares: actualHistory.map(x => x.shares).filter(v => Number.isFinite(Number(v))).map(Number).length >= 2 ? actualHistory.map(x => Number(x.shares)).filter(Number.isFinite) : metricSeries(source,['shares','reposts','forwards']),
      reach: actualHistory.map(x => x.reach).filter(v => Number.isFinite(Number(v))).map(Number).length >= 2 ? actualHistory.map(x => Number(x.reach)).filter(Number.isFinite) : metricSeries(source,['reach','views','impressions'])
    }
  };
}
function audienceChangeHtml(value) {
  if (value === null || value === undefined || value === '') return '<span class="audience-change neutral-change">—</span>';
  const number = Number(value);
  if (!Number.isFinite(number)) return '<span class="audience-change neutral-change">' + esc(value) + '</span>';
  if (number > 0) return '<span class="audience-change positive">▲ +' + esc(compactMetric(number)) + '</span>';
  if (number < 0) return '<span class="audience-change negative">▼ ' + esc(compactMetric(number)) + '</span>';
  return '<span class="audience-change neutral-change">0</span>';
}
function engagementRate(metrics = {}) {
  const reach = Number(metrics.reach);
  if (!Number.isFinite(reach) || reach <= 0) return '—';
  const total = [metrics.likes, metrics.replies, metrics.shares].reduce((sum,value) => {
    const number = Number(value);
    return sum + (Number.isFinite(number) ? number : 0);
  }, 0);
  return (total / reach * 100).toFixed(total && total / reach * 100 < 10 ? 1 : 0) + '%';
}
function metricTrendStatus(values = []) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length < 2) return { color:'neutral', label:'WAITING', arrow:'•' };
  const first = nums[0], last = nums[nums.length - 1];
  const base = Math.max(Math.abs(first), 1);
  const pct = (last - first) / base * 100;
  if (pct >= 5) return { color:'blue', label:'UP', arrow:'▲' };
  if (pct <= -5) return { color:'red', label:'DOWN', arrow:'▼' };
  return { color:'yellow', label:'STABLE', arrow:'→' };
}
function updatedText(value) {
  if (!value) return 'not yet';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return String(value);
  const minutes = Math.max(0,Math.round((Date.now()-time)/60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes/60);
  if (hours < 24) return hours + ' hr ago';
  return date(value);
}
function platformExtraMetrics(platform, metrics) {
  if (platform === 'facebook') return [['Reactions',metrics.reactions]];
  if (platform === 'instagram') return [['Saves',metrics.saves]];
  if (platform === 'x') return [['Bookmarks',metrics.bookmarks],['Reposts',metrics.shares]];
  if (platform === 'youtube') return [['Watch time',metrics.watchTime],['Subscriber gain',metrics.subscriberGain]];
  return [];
}
function renderConnectionStrip() {
  const strip = $('connectionStrip');

  if (activeView === 'Mission Control') {
    strip.hidden = false;
    const ageOver24 = c => !c.handled && Date.now() - Date.parse(c.publishedAt || 0) >= 24*60*60*1000;
    const platformState = p => {
      const health = connectionHealth(connection?.[p] || {});
      const unanswered = commentCheckedAt ? commentStream.filter(c => c.platform === p && !c.handled).length : 0;
      const overdue = commentCheckedAt ? commentStream.filter(c => c.platform === p && ageOver24(c)).length : 0;
      if (health.color === 'red' || overdue > 0) return { color:'red', label:'RED' };
      if (health.color === 'yellow' || unanswered > 0) return { color:'yellow', label:'YELLOW' };
      return { color:'green', label:'GREEN' };
    };
    const purposes = { facebook:'BUILD COMMUNITY', instagram:'GET DISCOVERED', x:'BE HEARD', youtube:'TELL THE STORY' };
    const icons = { facebook:'f', instagram:'◎', x:'𝕏', youtube:'▶' };

    const unanswered = commentCheckedAt ? commentStream.filter(c => !c.handled).length : 0;
    const overdue = commentCheckedAt ? commentStream.filter(ageOver24).length : 0;
    const scheduled = records.filter(r => r.status === 'scheduled').length;
    const failed = records.filter(r => ['failed','partial','uncertain'].includes(r.status)).length;
    const platformIssues = statusPlatforms.filter(p => connectionHealth(connection?.[p] || {}).color !== 'green').length;
    const needsTotal = records.filter(attention).length + platformIssues + unanswered;

    const attentionColor = overdue || failed || platformIssues ? 'red' : unanswered || needsTotal ? 'yellow' : 'green';
    const campaignState = campaign => {
      const list = records.filter(r => r.campaign === campaign.id);
      if (list.some(r => ['failed','partial','uncertain'].includes(r.status))) return 'red';
      if (list.some(r => attention(r) || r.status === 'draft' || r.status === 'paused')) return 'yellow';
      return 'green';
    };

    strip.innerHTML = `
      <button type="button" class="mission-top-attention ${attentionColor}" data-view="Needs Attention">
        <span>
          <b>NEEDS ATTENTION</b>
          <small>${overdue ? overdue + ' overdue · ' : ''}${unanswered} unanswered · ${failed} failed · ${platformIssues} platform issues</small>
        </span>
        <strong>${needsTotal}</strong>
        <span class="mission-attention-arrow">›</span>
      </button>

      <section class="mission-website-section" aria-label="DOCJAKS.COM website connection and activity">
        ${(() => {
          const site=websiteSnapshot();
          const live=site.connected===true;
          const health=live ? (site.partial ? 'yellow':'green') : 'red';
          const label=live ? (site.partial ? 'PARTIAL':'CONNECTED') : 'NEEDS CONNECTION';
          const validNumber=value=>typeof value==='number' && Number.isFinite(value) && value>=0;
          const leads=validNumber(site.contactClicks)||validNumber(site.formsSubmitted)
            ? Number(validNumber(site.contactClicks)?site.contactClicks:0)+Number(validNumber(site.formsSubmitted)?site.formsSubmitted:0) : null;
          const returningRow=Array.isArray(site.visitorTypes)
            ? site.visitorTypes.find(row=>row?.type==='returning_visitor') : null;
          const returningVisitors=returningRow && validNumber(returningRow.visitors)
            ? returningRow.visitors : null;
          const counters=[
            ['Visitors',site.visitors,'visitors'],
            ['Returning visitors',returningVisitors,'returningVisitors'],
            ['Page views',site.pageViews,'pageViews'],
            ['Avg. stay',validNumber(site.avgTimeSeconds) ? wTime(site.avgTimeSeconds) : '—','avgTimeSeconds'],
            ['Bounce rate',validNumber(site.bounceRate) ? wPct(site.bounceRate) : '—','bounceRate'],
            ['Contact Actions',leads,'contactActions']
          ];
          const rangeCaption=({today:'Today','7d':'Last 7 days','30d':'Last 30 days','365d':'Last 365 days'})[websiteRange]||'Last 7 days';
          const pages=Array.isArray(site.topPages)
            ? site.topPages.filter(item=>item && typeof item.path==='string' && item.path.trim()).slice(0,5) : [];
          if (!pages.length && site.topPage) pages.push({path:site.topPage,views:site.topPageViews});
          const locations=Array.isArray(site.geography)
            ? site.geography.filter(item=>item && (item.city||item.region||item.country)).slice(0,5) : [];
          const locationName=item=>[item.city,item.region].filter(Boolean).join(', ')||item.country||'Not reported';
          const periodChoices=[['today','Day'],['7d','Week'],['30d','Month'],['365d','Year']];
          return `<div class="mission-web-console">
            <div class="mission-web-brand">
              <small class="mission-web-overline">⚜ DOC JAKS · WIX</small>
              <strong>DOCJAKS.COM</strong>
              <span class="mission-web-live"><i class="gyr-light ${health}" aria-hidden="true"></i><b>${label}</b></span>
              <small class="mission-web-checked">${esc(rangeCaption)} · Updated ${esc(updatedText(site.checkedAt || localData?.checkedAt))}</small>
            </div>
            <div class="mission-web-gauges" aria-label="Website figures for ${esc(rangeCaption)}">
              ${counters.map(([title,value,key])=>`<div class="mission-web-gauge mission-web-trend-${missionMetricTrendColor(site.metricComparisons?.[key]||(key==='visitors'?site.visitorComparison:null),title)}${title==='Bounce rate'?' mission-web-bounce':''}${title==='Visitors'?' mission-web-visitors':''}">
                <small>${esc(title)}</small>
                <div class="mission-web-value-line"><strong>${esc(compactMetric(value))}</strong>${renderVisitorChangeGauge(site.metricComparisons?.[key]||(key==='visitors'?site.visitorComparison:null),title)}</div>
              </div>`).join('')}
            </div>
            <div class="mission-web-controls">
              <div class="mission-web-range" role="group" aria-label="Website reporting period">
                ${periodChoices.map(([key,name])=>`<button type="button" data-website-range="${key}" aria-pressed="${websiteRange===key}" title="${esc(({today:'Today so far','7d':'Last 7 days','30d':'Last 30 days','365d':'Last 365 days'})[key])}">${name}</button>`).join('')}
              </div>
              <button type="button" class="mission-web-open" data-view="Website Analytics">Website Analytics ›</button>
            </div>
            <div class="mission-web-lists">
              <section class="mission-web-mini" aria-label="Top five website pages">
                <h3>TOP 5 PAGES <small>· Page views</small></h3>
                <div class="mission-web-list">
                  ${pages.length?pages.map((item,index)=>`<div class="mission-web-listrow"><span title="${esc(item.path)}"><em>${index+1}.</em> ${esc(wName(item.path))}</span><strong>${esc(compactMetric(item.views))}</strong></div>`).join(''):'<p class="mission-web-empty">No page details available for this period.</p>'}
                </div>
              </section>
              <section class="mission-web-mini" aria-label="Top five reported visitor locations">
                <h3>WHERE VISITORS ARE FROM <small>· Approximate</small></h3>
                <div class="mission-web-list">
                  ${locations.length?locations.map((item,index)=>`<div class="mission-web-listrow"><span><em>${index+1}.</em> ${esc(locationName(item))}</span><strong>${esc(compactMetric(item.visitors))}</strong></div>`).join(''):'<p class="mission-web-empty">No location details available for this period.</p>'}
                </div>
              </section>
            </div>
          </div>`;
        })()}
      </section>

      <div class="mission-glance-head">
        <div>
          <strong>PLATFORM STATUS</strong>
          <small>Green: keep going. Yellow or Red: inspect it.</small>
        </div>
        <button type="button" data-view="Platform Details">Open full details ›</button>
      </div>

      <div class="mission-glance-grid">
        ${statusPlatforms.map(p => {
          const state = platformState(p);
          const metrics = platformMetricData(connection?.[p] || {},p);
          const quick = [
            ['Engagement',engagementRate(metrics)],
            ['Website clicks',metrics.clicks],
            ['Shares',metrics.shares],
            ['Reach / views',metrics.reach]
          ];
          return `<button class="mission-glance-card platform-${esc(p)}" data-platform-detail="${esc(p)}" aria-label="${esc(names[p])} ${state.label}. Open platform details.">
            <span class="mission-glance-brand"><span class="platform-brand-icon" aria-hidden="true">${icons[p]}</span><b>${esc(names[p])}</b></span>
            <i class="mission-glance-light ${state.color}" aria-hidden="true"></i>
            <strong class="mission-glance-state">${state.label}</strong>
            <small>${esc(purposes[p])}</small>
            <span class="mission-glance-metrics" aria-label="Quick metrics">
              ${quick.map(([label,value]) => `<span><small>${esc(label)}</small><b>${esc(compactMetric(value))}</b></span>`).join('')}
            </span>
          </button>`;
        }).join('')}
      </div>

      <div class="social-action-strip mission-action-strip">
        <button type="button" data-action="openUnansweredComments" class="${unanswered > 0 ? 'yellow-action' : 'green-action'}"><span>💬 Unanswered</span><b>${esc(unanswered)}</b><small>Comments / replies</small></button>
        <button type="button" data-view="Calendar" class="green-action"><span>📅 Scheduled</span><b>${esc(scheduled)}</b><small>Posts</small></button>
        <button type="button" data-view="Needs Attention" class="${failed ? 'red-action' : 'green-action'}"><span>🔴 Failed</span><b>${esc(failed)}</b><small>Posting issues</small></button>
        <button type="button" data-view="Needs Attention" class="${needsTotal ? 'yellow-action' : 'green-action'}"><span>⚠ Needs Attention</span><b>${esc(needsTotal)}</b><small>All issues</small></button>
      </div>

      <section class="mission-blog-section" aria-label="From Doc's Porch blog status">
        ${(() => {
          const blogItems = commentStream.filter(c => c.platform === 'blog');
          const blogUnanswered = blogItems.filter(c => !c.handled).length;
          const blogOver24 = blogItems.filter(ageOver24).length;
          const blogLinked = blogItems.length > 0 || commentWarnings.every(w => !/^Blog:/i.test(w));
          const blogColor = !blogLinked ? 'yellow' : blogOver24 > 0 ? 'red' : blogUnanswered > 0 ? 'yellow' : 'green';
          const blogLabel = !blogLinked ? 'SETUP' : blogColor.toUpperCase();
          const latest = blogItems.slice().sort((a,b) => Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0))[0];
          return `<button type="button" class="mission-blog-card" data-action="${blogLinked ? 'openBlogComments' : 'connectBlog'}">
            <span class="mission-blog-copy">
              <small>BLOG</small>
              <strong>FROM DOC'S PORCH</strong>
              <span>Behind-the-scenes updates from Doc Jaks &amp; Emberhold</span>
            </span>
            <span class="mission-blog-status">
              <i class="mission-glance-light ${blogColor}" aria-hidden="true"></i>
              <b>${blogLabel}</b>
            </span>
            <span class="mission-blog-metrics">
              <span><small>Unanswered</small><b>${blogLinked ? blogUnanswered : '—'}</b></span>
              <span><small>Over 24h</small><b>${blogLinked ? blogOver24 : '—'}</b></span>
              <span><small>Latest activity</small><b>${latest ? esc(updatedText(latest.publishedAt)) : blogLinked ? 'None waiting' : 'Connect blog'}</b></span>
            </span>
            <span class="mission-attention-arrow">›</span>
          </button>`;
        })()}
      </section>

      <section class="reviews-local-section" aria-label="Reviews and local">
        <div class="reviews-local-head">
          <div><strong>REVIEWS &amp; LOCAL</strong><small>Reputation and local presence</small></div>
          <button type="button" data-view="Platform Details">Open details ›</button>
        </div>
        <div class="reviews-local-grid">
          ${localCard('google','Google Business Profile')}
          ${localCard('tripadvisor','Tripadvisor')}
          ${localCard('yelp','Yelp')}
          ${localCard('facebook','Facebook Reviews')}
        </div>
      </section>

      <section class="mission-campaigns-section" aria-label="Campaign status">
        <div class="mission-campaigns-head">
          <div><strong>CAMPAIGNS</strong><small>GYR status only. Open Campaigns for the working details.</small></div>
          <button type="button" data-view="Campaigns">Open campaigns ›</button>
        </div>
        <div class="mission-campaigns-grid">
          ${campaigns.map(c => `<button type="button" class="mission-campaign-card" data-view="Campaigns" aria-label="${esc(c.title)} campaign status ${campaignState(c)}">
            <i class="gyr-light ${campaignState(c)}" aria-hidden="true"></i>
            <b>${esc(c.title)}</b>
          </button>`).join('')}
        </div>
      </section>
    `;
    return;
  }

  if (activeView !== 'Platform Details') {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  const rangeLabels = { today:'Last 1 Day', '7d':'Last 7 Days', '30d':'Last 30 Days', '365d':'Last Year' };
  const unanswered = commentCheckedAt ? commentStream.filter(x => !x.handled).length : '—';
  const scheduled = records.filter(r => r.status === 'scheduled').length;
  const failed = records.filter(r => ['failed','partial','uncertain'].includes(r.status)).length;
  const platformIssues = statusPlatforms.filter(p => connectionHealth(connection?.[p] || {}).color !== 'green').length;
  const needs = records.filter(attention).length + platformIssues;
  strip.innerHTML = `
    <div class="platform-status-toolbar">
      <div><strong>Platform health & engagement</strong><small>${esc(rangeLabels[platformMetricRange] || 'Last 7 Days')}</small></div>
      <div class="platform-range-switch" role="group" aria-label="Engagement time range">
        ${[['today','1 Day'],['7d','Week'],['30d','Month'],['365d','Year']].map(([key,label]) => `<button type="button" data-metric-range="${key}" class="${platformMetricRange === key ? 'active' : ''}" aria-pressed="${platformMetricRange === key}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="platform-status-grid">${statusPlatforms.map(p => {
      const info = connection?.[p] || {};
      const health = connectionHealth(info);
      const account = info.name || (info.connected ? 'Connected account' : 'Connection needs attention');
      const metrics = platformMetricData(info,p);
      const audienceLabel = p === 'youtube' ? 'Subscribers' : 'Followers';
      const unansweredPlatform = commentCheckedAt ? commentStream.filter(item => item.platform === p && !item.handled).length : '—';
      const failedPlatform = records.filter(r => ['failed','partial','uncertain'].includes(r.status) && r.targets?.includes(p)).length;
      const driverPosts = (analyticsData?.posts || []).filter(post => post.platform === p).sort((a,b) => {
        const score = item => Number(item.clicks || 0) * 4 + Number(item.shares || 0) * 3 + Number(item.comments || 0) * 2 + Number(item.reactions || 0) + Number(item.reach || item.views || 0) * .01;
        return score(b) - score(a);
      }).slice(0,3);
      const cells = [
        ['Engagement',engagementRate(metrics),metrics.trends?.engagement],
        ['Website clicks',metrics.clicks,metrics.trends?.clicks],
        ['Shares',metrics.shares,metrics.trends?.shares],
        ['Reach / views',metrics.reach,metrics.trends?.reach]
      ];
      const purpose = { facebook:'BUILD COMMUNITY', instagram:'GET DISCOVERED', x:'BE HEARD', youtube:'TELL THE STORY' }[p];
      const cue = {
        facebook:'💬  Posts · comments · community',
        instagram:'▦  Photos · Reels · discovery',
        x:'✦  Voice · replies · conversation',
        youtube:'▶  Video · watch · return'
      }[p];
      const icon = { facebook:'f', instagram:'◎', x:'𝕏', youtube:'▶' }[p];
      return `<button class="platform-status-card platform-${esc(p)}" data-platform-detail="${esc(p)}" aria-label="${esc(names[p])}: ${esc(health.text)}. Open details below.">
        <span class="platform-row-left">
          <span class="platform-brand-bar"><span class="platform-brand-icon" aria-hidden="true">${icon}</span><span class="platform-purpose">${esc(purpose)}</span></span>
          <span class="platform-status-top"><span class="platform-status-name">${esc(names[p])}</span><i class="gyr-light ${health.color}" aria-hidden="true"></i></span>
          <strong>${esc(health.label)} · ${esc(health.text)}</strong>
          <small>${esc(account)}</small>
          <span class="platform-app-cue">${esc(cue)}</span>
          <span class="platform-audience-row"><span>${esc(audienceLabel)}</span><span class="platform-audience-value"><b>${esc(compactMetric(metrics.audience))}</b>${audienceChangeHtml(metrics.audienceChange)}</span></span>
          <span class="platform-updated">Updated: ${esc(updatedText(connectionCheckedAt))}</span>
        </span>
        <span class="platform-row-right">
          <span class="platform-quick-label">QUICK GLANCE</span>
          <span class="platform-chart-grid">${cells.map(([label,value,trend]) => {
            const trendStatus = metricTrendStatus(trend);
            return `<span class="platform-chart-card trend-${trendStatus.color}">
              <span class="platform-chart-head">
                <span class="platform-chart-title">${esc(label)}</span>
                <span class="platform-chart-current">${esc(compactMetric(value))}</span>
                <span class="platform-chart-status status-${trendStatus.color}">${trendStatus.arrow} ${trendStatus.label}</span>
              </span>
              <span class="platform-chart-subtitle">${esc(label)} trend</span>
              ${trendChart(trend,label)}
            </span>`;
          }).join('')}</span>
          <span class="platform-operational-strip">
            <span class="platform-operational-item platform-top-post">
              <small>TOP POST</small>
              <b>${esc(metrics.topPostTitle || 'Waiting for analytics')}</b>
            </span>
            <span class="platform-operational-item">
              <small>UNANSWERED</small>
              <b>${esc(unansweredPlatform)}</b>
            </span>
            <span class="platform-operational-item ${failedPlatform ? 'has-problem' : ''}">
              <small>POSTING ISSUES</small>
              <b>${esc(failedPlatform)}</b>
            </span>
          </span>
          <span class="platform-drivers">
            <span class="platform-drivers-title">WHAT DROVE THIS?</span>
            ${driverPosts.length ? driverPosts.map((post,index) => `<span class="platform-driver-row">
              <span class="platform-driver-rank">${index+1}</span>
              <span class="platform-driver-copy"><b>${esc(post.title || 'Untitled post')}</b><small>${esc(post.campaign || '')}</small></span>
              <span class="platform-driver-stats">
                <span>${esc(compactMetric(post.reach || post.views))}<small>Reach</small></span>
                <span>${esc(compactMetric(post.clicks))}<small>Clicks</small></span>
                <span>${esc(compactMetric(post.shares))}<small>Shares</small></span>
              </span>
            </span>`).join('') : '<span class="platform-drivers-empty">Post attribution will appear as published-post analytics arrive.</span>'}
          </span>
        </span>
      </button>`;
    }).join('')}</div>
    <div class="social-action-strip">
      <button type="button" data-action="openUnansweredComments" class="${Number(unanswered) > 0 ? 'yellow-action' : 'green-action'}"><span>💬 Unanswered</span><b>${esc(unanswered)}</b><small>Comments</small></button>
      <button type="button" data-view="Calendar" class="green-action"><span>📅 Scheduled</span><b>${esc(scheduled)}</b><small>Posts</small></button>
      <button type="button" data-view="Needs Attention" class="${failed ? 'red-action' : 'green-action'}"><span>🔴 Failed</span><b>${esc(failed)}</b><small>Posting issues</small></button>
      <button type="button" data-view="Needs Attention" class="${needs ? 'red-action' : 'green-action'}"><span>⚠ Needs Attention</span><b>${esc(needs)}</b><small>All issues</small></button>
    </div>
    ${selectedStatusPlatform ? (() => {
      const p = selectedStatusPlatform;
      const info = connection?.[p] || {};
      const health = connectionHealth(info);
      const metrics = platformMetricData(info,p);
      const audienceLabel = p === 'youtube' ? 'Subscribers' : 'Followers';
      const extras = platformExtraMetrics(p,metrics);
      const connectHref = p === 'facebook' || p === 'instagram' ? '/api/meta/connect' : p === 'x' ? '/api/x/connect' : '/api/youtube/connect';
      const connectLabel = p === 'facebook' || p === 'instagram' ? 'Connect / reconnect Facebook & Instagram' : 'Connect / reconnect ' + names[p];
      return `<div class="platform-inline-detail">
        <div class="platform-inline-detail-head"><div><small>PLATFORM DRILL-DOWN</small><h3>${esc(names[p])}</h3></div><div class="platform-inline-detail-actions"><i class="gyr-light ${health.color}" aria-hidden="true"></i><button type="button" data-action="closePlatformDetail">Close</button></div></div>
        <div class="platform-inline-status"><strong>${esc(health.label)} · ${esc(health.text)}</strong><span>${esc(info.name || 'Account not verified')}</span></div>
        <div class="platform-inline-metrics">
          <div><span>${esc(audienceLabel)}</span><b>${esc(compactMetric(metrics.audience))}</b><small>${audienceChangeHtml(metrics.audienceChange)}</small></div>
          <div><span>Likes</span><b>${esc(compactMetric(metrics.likes))}</b></div><div><span>Replies</span><b>${esc(compactMetric(metrics.replies))}</b></div><div><span>Clicks</span><b>${esc(compactMetric(metrics.clicks))}</b></div><div><span>Shares</span><b>${esc(compactMetric(metrics.shares))}</b></div><div><span>Reach / Views</span><b>${esc(compactMetric(metrics.reach))}</b></div>
          ${extras.map(([label,value]) => `<div><span>${esc(label)}</span><b>${esc(compactMetric(value))}</b></div>`).join('')}
        </div>
        <div class="top-performing-post"><span>TOP PERFORMING POST</span><strong>${esc(metrics.topPostTitle || 'Analytics not connected yet')}</strong>${metrics.topPostValue !== null && metrics.topPostValue !== undefined ? `<b>${esc(compactMetric(metrics.topPostValue))}</b>` : ''}</div>
        <p>${esc(info.message || 'Connection and posting permissions checked.')}</p>
        <div class="platform-inline-links"><a class="button approve" href="${connectHref}">${esc(connectLabel)}</a><button type="button" data-action="openFullPlatforms">Full platform settings</button></div>
      </div>`;
    })() : ''}
    <small class="platform-analytics-note">A dash means that metric is not connected from that platform yet.</small>
    <section class="reviews-local-section" aria-label="Reviews and local">
      <div class="reviews-local-head">
        <div><strong>REVIEWS &amp; LOCAL</strong><small>Reputation and local presence</small></div>
      </div>
      <div class="reviews-local-grid">
        ${localCard('google','Google Business Profile')}
        ${localCard('tripadvisor','Tripadvisor')}
        ${localCard('yelp','Yelp')}
        ${localCard('facebook','Facebook Reviews')}
      </div>
    </section>`;
}
async function refreshConnection() {
  try { connection = await api('status?refresh=1'); }
  catch (e) { connection = { facebook:{message:e.message}, instagram:{message:e.message}, scheduler:false }; }
  try { connection.x = await platformApi('x','status?refresh=1','X'); }
  catch (e) { connection.x = { connected:false, canPublish:false, message:e.message }; }
  try { connection.youtube = await platformApi('youtube','status?refresh=1','YouTube'); }
  catch (e) { connection.youtube = { connected:false, canPublish:false, message:e.message }; }
  connectionCheckedAt = new Date().toISOString();
  renderConnectionStrip();
}
async function signedIn(s) {
  owner = s.user; csrf = s.csrf; $('loginDialog').close(); $('password').value = '';
  $('owner').textContent = owner.toUpperCase(); $('identity').textContent = 'Owner · Signed in'; $('live').textContent = '● Owner access'; $('logout').hidden = false;
  await api('records', { action:'initialize' }); await loadRecords(); await loadAnalytics(true); await loadLocalStatus(); await refreshConnection(); render();
  loadComments().then(() => renderConnectionStrip()).catch(() => {});
  const params = new URLSearchParams(location.search);
  const result = params.get('connection');
  const xresult = params.get('xconnection');
  const youtubeResult = params.get('youtubeconnection');
  const localGoogleResult = params.get('localgoogle');
  if (result || xresult || youtubeResult || localGoogleResult) {
    if (localGoogleResult) { await loadLocalStatus(); notice(localGoogleResult === 'saved' ? 'Google Business Profile connected.' : 'Google Business Profile connection was cancelled.'); }
    else if (youtubeResult) notice(youtubeResult === 'saved' ? 'YouTube authorization saved. Check the channel status below.' : 'YouTube connection was cancelled.');
    else if (xresult) notice(xresult === 'saved' ? 'X authorization saved. Check the account status below.' : 'X connection was cancelled.');
    else notice(result === 'saved' ? 'Facebook authorization saved. Check each account’s status below.' : 'Facebook connection was cancelled.');
    history.replaceState({},'',location.pathname);
    setView('Platforms');
  }
}
function badge(status) { return `<span class="status state-${esc(status)}">${esc(labels[status] || status)}</span>`; }
function canDeleteDraft(r) {
  return r?.status === 'draft' && !r.scheduleToken &&
    !Object.values(r.results || {}).some(p => p && (p.postId || ['published','sending','uncertain','processing'].includes(p.status)));
}
function platformsForRow(r) {
  return r.targets.map(platform=>{
    const label=esc(names[platform]||platform);
    if(platform!=='x')return label;
    const status=r.results?.x?.status;
    const text=status==='published'?'Posted':
      status==='failed'?'Failed: check X settings':
      status==='uncertain'?'Uncertain: check X profile':
      r.status==='published'?'Not posted (prepared only)':'Prepared for scheduled use';
    const cls=['published','failed','uncertain'].includes(status)?status:'prepared';
    return label+'<small class="x-result-info '+cls+'">'+esc(text)+'</small>';
  }).join('<br>') || 'Choose platforms';
}
function rowsHtml(list) {
  if (!list.length) return '<div class="empty"><h3>No posts here yet.</h3><p>Use New post to start one.</p></div>';
  const withSelection = activeView === 'Content Library';
  return '<div class="table-wrap"><table><thead><tr>' +
    (withSelection ? '<th scope="col">Select</th>' : '') +
    '<th>Photo</th><th>Post</th><th>Platforms</th><th>Status</th><th>Posting time</th><th></th></tr></thead><tbody>' +
    list.map(r => `<tr>${withSelection ? `<td class="draft-select-cell">${canDeleteDraft(r) ? `<input type="checkbox" class="draft-check" data-draft-id="${esc(r.id)}" aria-label="Select draft ${esc(r.title)}">` : '<span class="draft-not-selectable" title="Only unsent drafts may be selected">—</span>'}</td>` : ''}<td>${r.imageUrl ? `<img class="row-photo" src="${esc(r.imageUrl)}" alt="">` : '<span class="thumb">PHOTO</span>'}</td><td><small class="id">${esc(code(r))}</small><strong>${esc(r.title)}</strong></td><td>${platformsForRow(r)}</td><td>${badge(r.status)}</td><td>${esc(date(r.scheduledAt))}</td><td class="post-row-actions"><button data-open="${esc(r.id)}" aria-label="Open ${esc(r.title)}">Open ›</button>${canDeleteDraft(r) ? `<button class="danger" data-delete-draft="${esc(r.id)}" aria-label="Delete draft ${esc(r.title)}">Delete</button>` : ''}</td></tr>`).join('') +
    '</tbody></table></div>';
}
function updateDraftSelectionControls() {
  const boxes = [...document.querySelectorAll('.draft-check')];
  const chosen = boxes.filter(b => b.checked).length;
  const bulkButton = $('deleteSelectedDrafts'), approveButton = $('approveSelectedDrafts'), selectAll = $('selectAllDrafts');
  if (!bulkButton || !selectAll) return;
  bulkButton.disabled = busy || chosen === 0;
  bulkButton.textContent = 'Delete selected (' + chosen + ')';
  if (approveButton) {
    approveButton.disabled = busy || chosen === 0;
    approveButton.textContent = 'Approve selected (' + chosen + ')';
  }
  selectAll.checked = !!boxes.length && chosen === boxes.length;
  selectAll.indeterminate = chosen > 0 && chosen < boxes.length;
}
function attention(r) {
  return ['failed','partial','uncertain','queueing','processing','publishing'].includes(r.status)
    || ['failed','uncertain'].includes(r.results?.x?.status);
}
function localInputValue(value) {
  if (!value) return '';
  const d = new Date(value), pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function videoInfo(file) {
  return new Promise(resolve => {
    const url=URL.createObjectURL(file);
    const video=document.createElement('video');
    video.preload='metadata';
    video.onloadedmetadata=()=> {
      const result={width:video.videoWidth||null,height:video.videoHeight||null,duration:Number.isFinite(video.duration)?video.duration:null};
      URL.revokeObjectURL(url); resolve(result);
    };
    video.onerror=()=> { URL.revokeObjectURL(url); resolve({width:null,height:null,duration:null}); };
    video.src=url;
  });
}
async function uploadPrivateYouTubeVideo(file) {
  const meta=await videoInfo(file);
  const start=await youtubePost('video-init',{filename:file.name,mimeType:file.type || 'video/mp4',size:file.size});
  let response;
  try {
    response=await fetch(start.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type || 'video/mp4'},body:file});
  } catch {
    throw new Error('The upload of ' + file.name + ' was interrupted. Try that video again.');
  }
  const data=await response.json().catch(()=>null);
  if(!response.ok || !data?.id) throw new Error(data?.error?.message || 'YouTube did not finish uploading ' + file.name + '.');
  const registered=await youtubePost('video-register',{
    youtubeId:data.id,filename:file.name,title:file.name.replace(/\.[^.]+$/,''),
    width:meta.width,height:meta.height,duration:meta.duration
  });
  return registered.item;
}
async function handleVideoFiles(files) {
  const list=[...files];
  if(!list.length) return;
  await perform(async()=>{
    let done=0;
    for(const file of list) {
      if(!String(file.type).startsWith('video/')) {
        notice('Skipped '+file.name+': choose a video file.',true);
        continue;
      }
      notice('Uploading video '+(done+1)+' of '+list.length+' privately to YouTube…');
      const item=await uploadPrivateYouTubeVideo(file);
      videoInbox.unshift(item);
      done++;
    }
    renderVideoInbox();
    notice(done+' video'+(done===1?'':'s')+' loaded into Video Inbox. Nothing was published.');
  });
}
function commentAgeState(comment) {
  if (comment.handled) return 'green';
  const age = Date.now() - Date.parse(comment.publishedAt || 0);
  return age >= 24*60*60*1000 ? 'red' : 'yellow';
}
function renderComments() {
  const ageOver24 = c => !c.handled && Date.now() - Date.parse(c.publishedAt || 0) >= 24*60*60*1000;
  const unanswered = commentStream.filter(c=>!c.handled).length;
  const over24 = commentStream.filter(ageOver24).length;
  const handled = commentStream.filter(c=>c.handled).length;
  const platformCounts = Object.fromEntries(['facebook','instagram','x','youtube','blog','website'].map(p=>[p,commentStream.filter(c=>c.platform===p).length]));
  let visible = commentStream.filter(c=>commentPlatformFilter==='all' || c.platform===commentPlatformFilter);
  if(commentStatusFilter==='unanswered') visible=visible.filter(c=>!c.handled);
  else if(commentStatusFilter==='handled') visible=visible.filter(c=>c.handled);
  else if(commentStatusFilter==='over24') visible=visible.filter(ageOver24);
  const platformLabel = p => names[p] || p;
  const rows = visible.length ? visible.map(c=>`
    <article class="comment-card ${commentAgeState(c)}">
      <div class="comment-head">
        <div><span class="platform-pill ${esc(c.platform)}">${esc(platformLabel(c.platform))}</span><strong>${esc(c.postTitle || platformLabel(c.platform) + ' post')}</strong></div>
        <span class="comment-age">${esc(date(c.publishedAt))}</span>
      </div>
      <div class="comment-author">${esc(c.author || platformLabel(c.platform) + ' user')}</div>
      <p class="comment-text">${esc(c.text || '')}</p>
      ${c.platform==='website' && c.media ? `<div class="website-media">${c.media.type==='image' ? `<img src="${esc(c.media.url)}" alt="Website submission">` : `<video src="${esc(c.media.url)}" controls preload="metadata"></video>`}</div>` : ''}
      ${c.platform==='website' ? `<div class="website-moderation-status ${esc(c.moderationStatus || 'pending')}">⚜ Website Community · ${esc(c.moderationStatus || 'pending')}</div>` : ''}
      <div class="comment-actions">
        <textarea data-comment-reply="${esc(c.id)}" rows="2" maxlength="10000" placeholder="Reply to this comment…"></textarea>
        <div>
          ${c.platform==='website' && c.moderationStatus==='pending' ? `<button class="approve website-approve" data-action="moderateWebsite" data-community-action="approve" data-comment-id="${esc(c.id)}">Approve</button><button class="website-reject" data-action="moderateWebsite" data-community-action="reject" data-comment-id="${esc(c.id)}">Reject</button>` : ''}
          <button class="approve" data-action="replyComment" data-comment-platform="${esc(c.platform)}" data-comment-id="${esc(c.id)}" data-comment-parent="${esc(c.parentId || c.id)}" data-comment-reference="${esc(c.referenceId || '')}">Reply</button>
          <a class="button" href="${esc(c.openUrl)}" target="_blank" rel="noopener">Open on ${esc(platformLabel(c.platform))}</a>
          <button data-action="toggleCommentHandled" data-comment-platform="${esc(c.platform)}" data-comment-id="${esc(c.id)}" data-comment-handled="${c.handled ? '1':'0'}">${c.handled ? 'Mark unanswered' : 'Mark handled'}</button>
        </div>
      </div>
    </article>`).join('') : '<div class="empty"><h3>No comments in this view.</h3><p>Try another filter or refresh the stream.</p></div>';
  const warnings = commentWarnings.length ? `<div class="comment-warnings">${commentWarnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>` : '';
  const tab = (key,label,count) => `<button class="comment-filter ${commentPlatformFilter===key?'active':''}" data-comment-platform-filter="${key}">${label} <span>${count}</span></button>`;
  const statusTab = (key,label,count) => `<button class="comment-filter secondary ${commentStatusFilter===key?'active':''}" data-comment-status-filter="${key}">${label} <span>${count}</span></button>`;
  $('content').innerHTML=`
    <div class="box comments-summary">
      <div><strong>Comments / Replies Center</strong><p>Newest first. Green = handled, yellow = under 24 hours, red = over 24 hours waiting.</p></div>
      <div class="comment-metrics"><span><b>${commentStream.length}</b> loaded</span><span><b>${unanswered}</b> unanswered</span><span><b>${over24}</b> over 24 hrs</span><span><b>${commentCheckedAt ? esc(date(commentCheckedAt)) : '—'}</b> last checked</span></div>
      <button data-action="refreshComments">Refresh now</button>
    </div>
    <div class="comment-filterbar">
      <div class="comment-filter-row">
        ${tab('all','All',commentStream.length)}
        ${tab('facebook','Facebook',platformCounts.facebook)}
        ${tab('instagram','Instagram',platformCounts.instagram)}
        ${tab('x','X',platformCounts.x)}
        ${tab('youtube','YouTube',platformCounts.youtube)}
        ${tab('blog',"From Doc's Porch",platformCounts.blog)}
        ${tab('website','⚜ Website Community',platformCounts.website)}
      </div>
      <div class="comment-filter-row">
        ${statusTab('all','All status',commentStream.length)}
        ${statusTab('unanswered','Unanswered',unanswered)}
        ${statusTab('over24','Over 24 hrs',over24)}
        ${statusTab('handled','Handled',handled)}
      </div>
    </div>
    ${warnings}
    <div class="comment-stream">${rows}</div>`;
}
function renderVideoInbox() {
  const campaignOptions = campaigns.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  const categoryOptions = [
    ['22','People & Blogs'],['10','Music'],['24','Entertainment'],['26','Howto & Style']
  ].map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
  const cards=videoInbox.length ? videoInbox.map(item => {
    const isVertical=item.width && item.height && item.height > item.width;
    const shortReady=isVertical && item.duration && item.duration <= 180;
    return `
      <article class="video-inbox-card" data-video-card="${esc(item.id)}">
        <div class="video-file-tile">
          <span class="video-icon">▶</span>
          <strong>${esc(item.filename)}</strong>
          <small>${item.width && item.height ? esc(item.width+'×'+item.height) : 'Video'}${item.duration ? ' · '+esc(Math.round(item.duration))+' sec' : ''}</small>
          <span class="video-private">PRIVATE ON YOUTUBE</span>
          ${shortReady ? '<span class="short-ready">Shorts-ready</span>' : ''}
        </div>
        <div class="video-fields">
          <label>Campaign<select data-video-campaign="${esc(item.id)}">${campaignOptions}</select></label>
          <label>Video title<input data-video-title="${esc(item.id)}" maxlength="100" value="${esc(item.title || item.filename.replace(/\.[^.]+$/,''))}"></label>
          <label>Description<textarea data-video-description="${esc(item.id)}" rows="6" maxlength="5000" placeholder="What should viewers know about this video?">${esc(item.description || '')}</textarea></label>
          <label>Link <small>(optional)</small><input data-video-link="${esc(item.id)}" type="url" value="${esc(item.link || '')}" placeholder="https://docjaks.com"></label>
          <label>YouTube category<select data-video-category="${esc(item.id)}">${categoryOptions}</select></label>
          <fieldset><legend>Prepare this video for</legend>
            <label class="check"><input type="checkbox" data-video-platform="${esc(item.id)}" value="youtube" checked> YouTube</label>
            <label class="check"><input type="checkbox" data-video-platform="${esc(item.id)}" value="facebook"> Facebook</label>
            <label class="check"><input type="checkbox" data-video-platform="${esc(item.id)}" value="instagram"> Instagram</label>
            <label class="check"><input type="checkbox" data-video-platform="${esc(item.id)}" value="x"> X</label>
          </fieldset>
          <p class="locknote">The master video is safely stored as a private YouTube upload. Saving updates its YouTube title and description. Facebook, Instagram and X are marked here for later reuse; direct cross-platform video delivery is not enabled yet.</p>
          <div class="video-actions">
            <button class="approve" data-action="saveVideoInbox" data-video-id="${esc(item.id)}">Save video info</button>
            <button data-action="deleteVideoInbox" data-video-id="${esc(item.id)}">Delete video</button>
          </div>
        </div>
      </article>`;
  }).join('') : '<div class="empty"><h3>Your Video Inbox is empty.</h3><p>Load several videos at once. They are uploaded privately to your YouTube channel so you can come back and fill in the campaign information later.</p></div>';
  $('content').innerHTML=`
    <div class="box video-toolbar">
      <div><strong>Video Inbox / Batch Upload</strong><p>Load videos first. They stay private. Come back later to assign the campaign, title, description, link and where you plan to use them.</p></div>
      <label class="upload-button video-upload">Load videos<input id="batchVideoFiles" type="file" accept="video/mp4,video/quicktime,video/webm,video/*" multiple hidden></label>
      <span>${videoInbox.length} video${videoInbox.length===1?'':'s'} waiting</span>
    </div>
    <div id="videoDropZone" class="drop-zone"><strong>Drag & drop videos here</strong><span>MP4, MOV, WebM and other browser-supported video files · multiple files welcome</span></div>
    <div class="video-inbox-grid">${cards}</div>`;
  videoInbox.forEach(item=>{
    const c=document.querySelector('[data-video-campaign="'+CSS.escape(item.id)+'"]'); if(c) c.value=item.campaign || 'BBQ';
    const cat=document.querySelector('[data-video-category="'+CSS.escape(item.id)+'"]'); if(cat) cat.value=item.categoryId || '22';
    document.querySelectorAll('[data-video-platform="'+CSS.escape(item.id)+'"]').forEach(cb=>cb.checked=(item.targets||['youtube']).includes(cb.value));
  });
  $('batchVideoFiles')?.addEventListener('change', e=>{
    const files=[...e.target.files]; e.target.value='';
    handleVideoFiles(files);
  });
  wireDropZone('videoDropZone',handleVideoFiles,'videos');
}
async function handlePictureFiles(files) {
  const list=[...files];
  if(!list.length) return;
  await perform(async()=> {
    let done=0;
    for(const file of list) {
      if (file.size > 20000000 || !['image/jpeg','image/png','image/webp'].includes(file.type)) {
        notice('Skipped ' + file.name + ': use JPG, PNG or WebP under 20 MB.', true);
        continue;
      }
      notice('Loading picture ' + (done+1) + ' of ' + list.length + '…');
      const bitmap=await createImageBitmap(file);
      const master=await uploadVariant(bitmap,1080,1080);
      bitmap.close();
      const added=await api('records',{action:'mediaInboxAdd',filename:file.name,imageId:master.imageId});
      mediaInbox.unshift(added.item);
      done++;
    }
    // Keep any captions on previously uploaded pictures before rebuilding the grid.
    await saveInboxFieldsAll(true);
    renderMediaInbox();
    notice(done + ' picture' + (done===1?'':'s') + ' loaded into Media Inbox.');
  });
}
function wireDropZone(zoneId, handler, label) {
  const zone=$(zoneId);
  if(!zone) return;
  ['dragenter','dragover'].forEach(type=>zone.addEventListener(type,e=>{
    e.preventDefault(); e.stopPropagation(); zone.classList.add('dragging');
    if(e.dataTransfer) e.dataTransfer.dropEffect='copy';
  }));
  ['dragleave','drop'].forEach(type=>zone.addEventListener(type,e=>{
    e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragging');
  }));
  zone.addEventListener('drop',e=>{
    const files=[...(e.dataTransfer?.files || [])];
    if(!files.length) return;
    handler(files).catch(err=>notice(err.message || ('Could not load ' + label + '.'),true));
  });
}

function inboxFieldValues(itemId) {
  const card=document.querySelector('[data-inbox-card="' + CSS.escape(itemId) + '"]');
  if (!card) return null;
  return {
    itemId,
    campaign:card.querySelector('[data-inbox-campaign]')?.value || 'BBQ',
    title:card.querySelector('[data-inbox-title]')?.value || '',
    caption:card.querySelector('[data-inbox-caption]')?.value || '',
    link:card.querySelector('[data-inbox-link]')?.value || '',
    targets:[...card.querySelectorAll('[data-inbox-platform]:checked')].map(x=>x.value),
    usePicture:!!card.querySelector('.inbox-check')?.checked
  };
}
function isValidInboxLink(value) {
  const link=String(value || '').trim();
  if (!link) return true; // Links are optional.
  try {
    const parsed=new URL(link);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !!parsed.hostname;
  } catch { return false; }
}
function checkInboxLinks(onlySelected=false) {
  const bad=[];
  for (const item of mediaInbox) {
    const card=document.querySelector('[data-inbox-card="' + CSS.escape(item.id) + '"]');
    const input=card?.querySelector('[data-inbox-link]');
    if (!input || (onlySelected && !card.querySelector('.inbox-check')?.checked)) continue;
    const valid=isValidInboxLink(input.value);
    input.classList.toggle('inbox-invalid-link',!valid);
    input.setAttribute('aria-invalid',valid ? 'false' : 'true');
    if (!valid) bad.push({ item, input, title:card.querySelector('[data-inbox-title]')?.value || item.filename });
  }
  if(bad.length) {
    const first=bad[0];
    first.input.scrollIntoView({behavior:'smooth',block:'center'});
    first.input.focus({preventScroll:true});
    notice('Invalid Link on "' + first.title + '"'
      + (bad.length > 1 ? ' (and ' + (bad.length-1) + ' more placecards)' : '')
      + '. Enter a full address beginning https:// or clear the optional field.',true);
  }
  return bad;
}
function inboxStatus(itemId, message, bad=false) {
  const label=document.querySelector('[data-inbox-save-status="' + CSS.escape(itemId) + '"]');
  if(label) {
    label.textContent=message;
    label.classList.toggle('inbox-save-error',bad);
  }
}
function inboxMarkEdited(itemId) {
  const values=inboxFieldValues(itemId), item=mediaInbox.find(x=>x.id===itemId);
  if(!values || !item) return;
  Object.assign(item,values);
  inboxDirty.add(itemId);
  inboxEditVersions.set(itemId,(inboxEditVersions.get(itemId)||0)+1);
  inboxStatus(itemId,'Unsaved changes');
  if(inboxSaveTimers.has(itemId)) clearTimeout(inboxSaveTimers.get(itemId));
  inboxSaveTimers.set(itemId,setTimeout(()=>{
    inboxSaveTimers.delete(itemId);
    saveInboxFields(itemId).catch(()=>{});
  },1100));
}
async function saveInboxFields(itemId) {
  const item=mediaInbox.find(x=>x.id===itemId);
  if(!item) throw new Error('This Media Inbox picture is no longer available.');
  if(inboxSaveTimers.has(itemId)) { clearTimeout(inboxSaveTimers.get(itemId)); inboxSaveTimers.delete(itemId); }
  const values=inboxFieldValues(itemId) || {
    itemId, title:item.title || item.filename.replace(/\.[^.]+$/,''),
    campaign:item.campaign || 'BBQ', caption:item.caption || '',link:item.link || '',
    targets:item.targets || ['facebook','instagram','x'],usePicture:item.usePicture !== false
  };
  if (!isValidInboxLink(values.link)) {
    const input=document.querySelector('[data-inbox-link="' + CSS.escape(itemId) + '"]');
    if (input) {
      input.classList.add('inbox-invalid-link');
      input.setAttribute('aria-invalid','true');
    }
    const message='Invalid Link on "' + (values.title || item.filename) + '". Use a complete https:// address or leave it blank.';
    inboxStatus(itemId,message,true);
    throw new Error(message);
  }
  const version=inboxEditVersions.get(itemId)||0;
  const preceding=inboxSaveChains.get(itemId)||Promise.resolve();
  const task=preceding.catch(()=>{}).then(async()=>{
    inboxStatus(itemId,'Saving…');
    const result=await api('records',{action:'mediaInboxSave',...values});
    const latest=mediaInbox.find(x=>x.id===itemId);
    if(latest) {
      if((inboxEditVersions.get(itemId)||0)===version) {
        Object.assign(latest,result.item);
        inboxDirty.delete(itemId);
        inboxStatus(itemId,'Saved ✓');
      } else {
        latest.updatedAt=result.item.updatedAt;
        inboxStatus(itemId,'Unsaved changes');
      }
    }
    return result.item;
  }).catch(error=>{
    inboxDirty.add(itemId);
    inboxStatus(itemId,'Not saved: ' + error.message,true);
    throw error;
  });
  inboxSaveChains.set(itemId,task);
  try { return await task; }
  finally { if(inboxSaveChains.get(itemId)===task) inboxSaveChains.delete(itemId); }
}
async function saveInboxFieldsAll(onlyChanged=false) {
  const ids=(onlyChanged?[...inboxDirty]:mediaInbox.map(x=>x.id))
    .filter(id=>mediaInbox.some(x=>x.id===id));
  let saved=0;
  for(let i=0;i<ids.length;i+=4) {
    const results=await Promise.allSettled(ids.slice(i,i+4).map(id=>saveInboxFields(id)));
    const failed=results.find(x=>x.status==='rejected');
    saved+=results.filter(x=>x.status==='fulfilled').length;
    if(failed) throw new Error(saved + ' saved; at least one picture was not saved. ' + failed.reason.message);
  }
  return saved;
}
function updateInboxSelectAll() {
  const checks=[...document.querySelectorAll('.inbox-check')];
  const all=$('selectAllInbox');
  if(!all) return;
  const num=checks.filter(c=>c.checked).length;
  all.checked=checks.length>0 && num===checks.length;
  all.indeterminate=num>0 && num<checks.length;
}
function renderMediaInbox() {
  const campaignOptions = campaigns.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  const cards = mediaInbox.length ? mediaInbox.map(item => {
    const activeTargets=item.targets || ['facebook','instagram','x'];
    const enabled=item.usePicture !== false;
    return `
    <article class="inbox-card" data-inbox-card="${esc(item.id)}">
      <div class="inbox-image"><img src="${esc(item.imageUrl)}" alt=""></div>
      <div class="inbox-fields">
        <label class="check inbox-use"><input class="inbox-check" type="checkbox" data-inbox-id="${esc(item.id)}" ${enabled ? 'checked' : ''}> Use this picture</label>
        <label>Campaign<select data-inbox-campaign="${esc(item.id)}">${campaignOptions}</select></label>
        <label>Post title<input data-inbox-title="${esc(item.id)}" maxlength="120" value="${esc(item.title ?? item.filename.replace(/\.[^.]+$/,''))}"></label>
        <label>Caption<textarea data-inbox-caption="${esc(item.id)}" rows="5" maxlength="10000" placeholder="What do you want people to hear?">${esc(item.caption || '')}</textarea></label>
        <label>Link <small>(optional; full https:// address)</small><input data-inbox-link="${esc(item.id)}" type="url" value="${esc(item.link || '')}" placeholder="https://www.docjaks.com"></label>
        <fieldset><legend>Prepare for</legend>
          ${[['facebook','Facebook'],['instagram','Instagram'],['x','X'],['youtube','YouTube']].map(([id,label])=>`<label class="check"><input type="checkbox" data-inbox-platform="${esc(item.id)}" value="${id}" ${activeTargets.includes(id)?'checked':''}> ${label}</label>`).join('')}
        </fieldset>
        <div class="inbox-actions">
          <span class="inbox-save-state" data-inbox-save-status="${esc(item.id)}">${inboxDirty.has(item.id) ? 'Unsaved changes' : item.updatedAt ? 'Saved ✓' : 'Not saved yet'}</span>
          <button class="approve" type="button" data-action="saveInboxItem" data-inbox-id="${esc(item.id)}">Save</button>
          <button type="button" data-action="removeInbox" data-inbox-id="${esc(item.id)}">Remove</button>
        </div>
      </div>
    </article>`;
  }).join('') : '<div class="empty"><h3>Your Media Inbox is empty.</h3><p>Drop in a whole campaign of pictures at once. Fill out the information whenever you are ready.</p></div>';
  $('content').innerHTML = `
    <div class="box inbox-toolbar">
      <div><strong>Media Inbox / Batch Upload</strong><p>Changes save automatically. You can also click Save or Save all. Your captions will still be here when you return.</p></div>
      <label class="upload-button inbox-upload">Load pictures<input id="batchImageFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
      <label class="check inbox-select-all"><input type="checkbox" id="selectAllInbox" ${mediaInbox.length ? '' : 'disabled'}> Select all pictures</label>
      <button type="button" class="approve" data-action="saveAllInbox" ${mediaInbox.length ? '' : 'disabled'}>Save all</button>
      <button class="approve" data-action="createInboxDrafts">Create drafts from selected</button>
      <span id="inboxCount">${mediaInbox.length} picture${mediaInbox.length===1?'':'s'} waiting</span>
    </div>
    <div id="mediaDropZone" class="drop-zone"><strong>Drag & drop pictures here</strong><span>JPG, PNG or WebP · multiple files welcome</span></div>
    <div class="inbox-grid">${cards}</div>`;
  mediaInbox.forEach(item=>{
    const select=document.querySelector('[data-inbox-campaign="' + CSS.escape(item.id) + '"]');
    if(select) select.value=item.campaign || 'BBQ';
    if(inboxDirty.has(item.id)) inboxStatus(item.id,'Unsaved changes');
  });
  updateInboxSelectAll();
  $('batchImageFiles')?.addEventListener('change',e=>{
    const files=[...e.target.files]; e.target.value='';
    handlePictureFiles(files);
  });
  wireDropZone('mediaDropZone',handlePictureFiles,'pictures');
}
async function buildInboxDraft(itemId) {
  const item=mediaInbox.find(x=>x.id===itemId);
  if(!item) throw new Error('That Media Inbox picture is missing.');
  const title=document.querySelector('[data-inbox-title="' + CSS.escape(itemId) + '"]')?.value.trim() || 'New post';
  const campaign=document.querySelector('[data-inbox-campaign="' + CSS.escape(itemId) + '"]')?.value || 'BBQ';
  const caption=document.querySelector('[data-inbox-caption="' + CSS.escape(itemId) + '"]')?.value || '';
  const link=document.querySelector('[data-inbox-link="' + CSS.escape(itemId) + '"]')?.value || '';
  const targets=[...document.querySelectorAll('[data-inbox-platform="' + CSS.escape(itemId) + '"]:checked')].map(x=>x.value);
  if(!targets.length) throw new Error('Choose at least one platform for ' + title + '.');
  const response=await fetch(item.imageUrl,{credentials:'same-origin'});
  if(!response.ok) throw new Error('Could not read ' + item.filename + ' for formatting.');
  const blob=await response.blob();
  const bitmap=await createImageBitmap(blob);
  const formats={
    facebook:await uploadVariant(bitmap,1200,1500),
    instagram:await uploadVariant(bitmap,1080,1350),
    x:await uploadVariant(bitmap,1600,900),
    youtube:await uploadVariant(bitmap,1280,720),
    shorts:await uploadVariant(bitmap,1080,1920)
  };
  bitmap.close();
  const created=await api('records',{action:'create',campaign,title});
  const saved=await api('records',{
    action:'save',id:created.record.id,revision:created.record.revision,title,campaign,caption,link,
    imageId:item.imageId,
    imageVariants:Object.fromEntries(Object.entries(formats).map(([k,v])=>[k,v.imageId])),
    targets
  });
  await api('records',{action:'mediaInboxDelete',itemId});
  return saved.record;
}
function renderBatchSchedule() {
  const approved = records.filter(r => r.status === 'approved').sort((a,b) => Date.parse(a.createdAt || a.updatedAt)-Date.parse(b.createdAt || b.updatedAt));
  const scheduled = records.filter(r => r.status === 'scheduled').sort((a,b) => Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt));
  const approvedRows = approved.length ? approved.map(r => `
    <tr>
      <td><input class="batch-check" type="checkbox" data-batch-id="${esc(r.id)}" checked aria-label="Select ${esc(r.title)}"></td>
      <td>${r.imageUrl ? `<img class="row-photo" src="${esc(r.imageUrl)}" alt="">` : '<span class="thumb">PHOTO</span>'}</td>
      <td><small class="id">${esc(code(r))}</small><strong>${esc(r.title)}</strong><small>${esc(campaigns.find(c=>c.id===r.campaign)?.title || r.campaign)}</small></td>
      <td>${r.targets.map(t=>esc(names[t])).join('<br>')}</td>
      <td><input class="batch-time" type="datetime-local" data-batch-time="${esc(r.id)}" aria-label="Posting time for ${esc(r.title)}"></td>
      <td><button data-open="${esc(r.id)}">Open ›</button></td>
    </tr>`).join('') : '<tr><td colspan="6"><div class="empty"><h3>No approved posts waiting.</h3><p>Build each post, save it, then approve it. Approved posts appear here automatically.</p></div></td></tr>';
  const scheduledRows = scheduled.length ? `
    <h3 class="batch-subhead">Already scheduled</h3>
    ${rowsHtml(scheduled)}
  ` : '';
  $('content').innerHTML = `
    <div class="box batch-tools">
      <div>
        <strong>Campaign Batch Scheduler</strong>
        <p>Set the posting times for several approved posts without opening them one by one.</p>
      </div>
      <div class="batch-fill">
        <label>First post<input id="batchStart" type="datetime-local"></label>
        <label>Spacing
          <select id="batchSpacing">
            <option value="24">1 day apart</option>
            <option value="48">2 days apart</option>
            <option value="72">3 days apart</option>
            <option value="12">12 hours apart</option>
            <option value="6">6 hours apart</option>
          </select>
        </label>
        <button data-action="fillBatchTimes">Fill selected times</button>
        <button class="approve" data-action="scheduleBatch">Schedule selected</button>
      </div>
      <p class="locknote">Only approved posts can be batch scheduled. The current scheduler allows dates up to seven days ahead.</p>
    </div>
    <div class="table-wrap batch-table"><table>
      <thead><tr><th>Use</th><th>Photo</th><th>Post</th><th>Platforms</th><th>Posting date & time</th><th></th></tr></thead>
      <tbody>${approvedRows}</tbody>
    </table></div>
    ${scheduledRows}`;
}

function wName(path){if(!path||path==='/')return'Home';return String(path).replace(/^\//,'').replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function wTime(v){const n=Number(v);if(!Number.isFinite(n))return'—';return n<60?Math.round(n)+'s':Math.floor(n/60)+'m '+Math.round(n%60)+'s';}
function wPct(v){const n=Number(v);if(!Number.isFinite(n))return'—';const p=n<=1?n*100:n;return p.toFixed(p<10?1:0)+'%';}

function missionMetricTrendColor(comparison,metric='Visitors') {
  // A lower bounce rate is generally better. Unknown or unchanged is yellow.
  const change=comparison?.percentChange;
  const invert=metric==='Bounce rate'||comparison?.lowerIsBetter===true;
  if(typeof change!=='number'||!Number.isFinite(change)) {
    return comparison?.direction==='new'&&!invert?'green':'yellow';
  }
  return change===0?'yellow':((change>0)!==invert?'green':'red');
}

function renderVisitorChangeGauge(comparison,metric='Visitors') {
  // This comparison stays alongside the current numeric value; color also
  // drives the small inset line, never a filled badge or another chart.
  const change=comparison?.percentChange;
  const valid=typeof change==='number'&&Number.isFinite(change);
  const noBase=comparison?.direction==='new';
  const invert=metric==='Bounce rate'||comparison?.lowerIsBetter===true;
  const color=missionMetricTrendColor(comparison,metric);
  const amount=valid
    ? (change>0?'+':'')+change.toFixed(1)+'%'
    : noBase?'NEW':'—';
  const selection=comparison?.selection||websiteRange;
  const period=selection==='today'?'yesterday (today incomplete)'
    : selection==='7d'?'the previous 7 days'
    : selection==='30d'?'the previous 30 days':'the previous 365 days';
  const current=typeof comparison?.current==='number'?comparison.current:comparison?.currentVisitors;
  const previous=typeof comparison?.previous==='number'?comparison.previous:comparison?.previousVisitors;
  const details=typeof current==='number'&&typeof previous==='number'
    ? ' Current: '+current+'. Previous: '+previous+'.'
    : ' Comparison figures are not both available.';
  const caveat=invert?' Lower bounce rate is generally better; one-page radio listening can be an exception.':'';
  const tip=metric+' vs '+period+': '+amount+'.'+details
    +(noBase?' Previous period was zero, so a percentage cannot be calculated.':'')
    +caveat;
  return `<span class="mission-visitor-change ${color}" title="${esc(tip)}" aria-label="${esc(tip)}">${esc(amount)}</span>`;
}

function renderBounceMeter(rate) {
  // A qualitative website navigation cue, not a measurement of visitor satisfaction.
  // Wix may supply a ratio (0..1) or a percentage (0..100).
  if (rate === null || rate === undefined || rate === '') {
    return '<span class="mission-bounce-nodata">NO DATA</span>';
  }
  const value=Number(rate);
  if(!Number.isFinite(value) || value<0 || value>100) {
    return '<span class="mission-bounce-nodata">NO DATA</span>';
  }
  const pct=value<=1?value*100:value;
  const grade=pct<40?'good':pct<70?'watch':'high';
  const label=grade==='good'?'GOOD':grade==='watch'?'WATCH':'HIGH';
  const guide='General guide: green is under 40%, yellow is 40–69%, red is 70% or more. A one-page radio listening visit can still be successful.';
  return `<span class="mission-bounce-meter" role="img" aria-label="${esc(wPct(rate))} bounce rate. ${label}. ${esc(guide)}" title="${esc(guide)}">
    <span class="mission-bounce-track"><span class="mission-bounce-needle" style="left:${pct.toFixed(1)}%" aria-hidden="true"></span></span>
    <span class="mission-bounce-grade ${grade}">${label}</span>
  </span>`;
}

function wBar(rows,key,label){
  const vals=(rows||[]).map(r=>Number(r[key])).filter(Number.isFinite),max=Math.max(...vals,1);
  return '<div class="wa-chart"><b>'+esc(label)+'</b><div class="wa-bars">'+(rows||[]).map(r=>{const v=Number(r[key]);return '<span><i style="height:'+Math.max(3,Number.isFinite(v)?v/max*100:0)+'%"></i><small>'+esc(r.label||'')+'</small><strong>'+esc(compactMetric(v))+'</strong></span>';}).join('')+'</div></div>';
}
function wInsights(s){
  const out=[],p=s.topPages||[],w=s.weekly||[],src=s.trafficSources||[];
  if(w.length>1){const a=Number(w.at(-2).sessions),b=Number(w.at(-1).sessions);if(a>0){const x=(b-a)/a*100;out.push((x>=0?'Traffic up ':'Traffic down ')+Math.abs(x).toFixed(0)+'% vs prior week.');}}
  if(p[0])out.push('Top page is '+wName(p[0].path)+' with '+compactMetric(p[0].views)+' views.');
  const best=p.filter(x=>Number(x.views)>=2&&Number.isFinite(Number(x.bounceRate))).sort((a,b)=>a.bounceRate-b.bounceRate)[0];
  if(best)out.push(wName(best.path)+' kept '+wPct(1-Number(best.bounceRate))+' moving to another page.');
  const leak=p.filter(x=>Number(x.views)>=3&&Number.isFinite(Number(x.bounceRate))).sort((a,b)=>b.bounceRate-a.bounceRate)[0];
  if(leak&&Number(leak.bounceRate)>=.7)out.push(wName(leak.path)+' may be a leak: '+wPct(leak.bounceRate)+' bounce.');
  if(src[0])out.push('Top traffic source is '+String(src[0].category||src[0].source||'Unknown').replace(/_/g,' ')+' with '+compactMetric(src[0].sessions)+' sessions.');
  if(Number(s.sessions)>0&&Number(s.orders||0)===0)out.push('Traffic is arriving but has not produced a Wix order yet.');
  return out.slice(0,6);
}
function renderWebsitePlatform() {
  // Platforms is a connection/health board, not a duplicate analytics dashboard.
  // Detailed Wix measurements and date ranges live in Website Analytics.
  const site=localData?.website||{};
  const health=site.connected ? (site.partial?'yellow':'green') : 'red';
  const label=site.connected ? (site.partial?'YELLOW · Some reporting unavailable':'GREEN · Connected & working') : 'RED · Connection needs attention';
  return `<div class="platforms connection-panels website-connection-row">
    <div class="box platform-detail website-gyr-card">
      <div class="platform-detail-head">
        <div><small class="website-gyr-label">YOUR HOME PLATFORM · WIX WEBSITE</small><h2>DOCJAKS.COM</h2></div>
        <i class="gyr-light ${health}" aria-label="${esc(health)}" role="img"></i>
      </div>
      <p><strong>${esc(label)}</strong></p>
      <p>${esc(site.message||'Wix reporting connection has not been checked.')}</p>
      <small>Last checked: ${esc(updatedText(site.checkedAt||localData?.checkedAt))}. Detailed website figures are kept on Website Analytics.</small>
      <div class="website-gyr-actions">
        <button type="button" class="approve" data-view="Website Analytics">Website Analytics</button>
        <button type="button" data-action="checkWebsiteConnection">Check Wix connection</button>
        <a class="button" href="https://docjaks.com" target="_blank" rel="noopener noreferrer">Visit DOCJAKS.COM ↗</a>
      </div>
    </div>
  </div>`;
}

function renderWebsiteAnalytics(){
  const s=websiteSnapshot(),w=s.weekly||[],p=s.topPages||[],src=s.trafficSources||[],dev=s.devices||[],vt=s.visitorTypes||[],geo=s.geography||[],land=s.landingPages||[],exit=s.exitPages||[];
  const leads=Number(s.contactClicks||0)+Number(s.formsSubmitted||0),sales=Number(s.sales),salesText=Number.isFinite(sales)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(sales):'—';
  const nv=vt.find(x=>x.type==='first_time_visitor')?.visitors,rv=vt.find(x=>x.type==='returning_visitor')?.visitors;
  const status=s.connected?(s.partial?'YELLOW':'GREEN'):'RED',color=s.connected?(s.partial?'yellow':'green'):'red';
  $('content').innerHTML=`
  <section class="wa">
    ${websiteRangeButtons()}
    <div class="wa-head"><div><small>WEBSITE · WIX</small><h2>DOCJAKS.COM ANALYTICS</h2><p>Main website research page. Find what works, what loses people, and what deserves more attention.</p></div><div><i class="mission-glance-light ${color}"></i><b>${status}</b><span>${esc(s.message||'Not connected')}</span></div></div>
    <div class="wa-kpis">
      ${[['Sessions',s.sessions],['Visitors',s.visitors],['Page views',s.pageViews],['Avg stay',wTime(s.avgTimeSeconds)],['Pages / visit',s.pagesPerSession==null?'—':Number(s.pagesPerSession).toFixed(2)],['Bounce',wPct(s.bounceRate)],['Leads',leads],['Orders',s.orders],['Sales',salesText]].map(x=>`<span><small>${x[0]}</small><b>${esc(compactMetric(x[1]))}</b></span>`).join('')}
    </div>
    <section class="wa-box"><h3>GOLD NUGGETS</h3><div class="wa-nuggets">${wInsights(s).map(x=>`<span>${esc(x)}</span>`).join('')||'<span>Not enough traffic yet for patterns.</span>'}</div></section>
    <section class="wa-box"><h3>WEEK BY WEEK</h3><div class="wa-charts">${wBar(w,'sessions','Sessions')}${wBar(w,'visitors','People')}${wBar(w,'views','Page views')}</div>
      <div class="wa-week"><div class="head"><span>Week</span><span>Sessions</span><span>People</span><span>Views</span><span>Avg stay</span><span>Pages/visit</span><span>Continued</span></div>${w.map(r=>`<div><span>${esc(r.label||'')}</span><span>${esc(compactMetric(r.sessions))}</span><span>${esc(compactMetric(r.visitors))}</span><span>${esc(compactMetric(r.views))}</span><span>${esc(wTime(r.avgTimeSeconds))}</span><span>${r.pagesPerSession==null?'—':Number(r.pagesPerSession).toFixed(2)}</span><span>${Number.isFinite(Number(r.bounceRate))?esc(wPct(1-Number(r.bounceRate))):'—'}</span></div>`).join('')}</div>
    </section>
    <section class="wa-box"><h3>TOP PAGES · SELECTED PERIOD</h3>
      <div class="wa-pages"><div class="head"><span>Page</span><span>Views</span><span>People</span><span>Sessions</span><span>Avg time</span><span>Continued</span></div>${p.map((r,i)=>`<div><span><b>${i+1}. ${esc(wName(r.path))}</b><small>${esc(r.path)}</small></span><span>${esc(compactMetric(r.views))}</span><span>${esc(compactMetric(r.visitors))}</span><span>${esc(compactMetric(r.sessions))}</span><span>${esc(wTime(r.avgTimeSeconds))}</span><span>${Number.isFinite(Number(r.bounceRate))?esc(wPct(1-Number(r.bounceRate))):'—'}</span></div>`).join('')}</div>
    </section>
    <div class="wa-two">
      <section class="wa-box"><h3>TRAFFIC SOURCES</h3>${src.map((r,i)=>`<p><b>${i+1}. ${esc(String(r.category||r.source||'Unknown').replace(/_/g,' '))}</b><span>${esc(compactMetric(r.sessions))} sessions${r.source&&r.source!==r.category?' · '+esc(r.source):''}</span></p>`).join('')}</section>
      <section class="wa-box"><h3>DEVICES</h3>${dev.map((r,i)=>`<p><b>${i+1}. ${esc(r.device)}</b><span>${esc(compactMetric(r.sessions))} sessions</span></p>`).join('')}</section>
    </div>
    <div class="wa-two">
      <section class="wa-box"><h3>AUDIENCE</h3><div class="wa-mini"><span><small>New</small><b>${esc(compactMetric(nv))}</b></span><span><small>Returning</small><b>${esc(compactMetric(rv))}</b></span><span><small>Total</small><b>${esc(compactMetric(s.visitors))}</b></span></div></section>
      <section class="wa-box"><h3>GEOGRAPHY</h3>${geo.slice(0,8).map((r,i)=>`<p><b>${i+1}. ${esc([r.city,r.region].filter(Boolean).join(', ')||r.country||'Unknown')}</b><span>${esc(compactMetric(r.visitors))} people</span></p>`).join('')}</section>
    </div>
    <div class="wa-two">
      <section class="wa-box"><h3>LANDING PAGES · WHERE THEY ENTER</h3>${land.map((r,i)=>`<p><b>${i+1}. ${esc(wName(r.path))}</b><span>${esc(compactMetric(r.sessions))} sessions</span></p>`).join('')}</section>
      <section class="wa-box"><h3>EXIT PAGES · WHERE THEY LEAVE</h3>${exit.map((r,i)=>`<p><b>${i+1}. ${esc(wName(r.path))}</b><span>${esc(compactMetric(r.sessions))} sessions</span></p>`).join('')}</section>
    </div>
    <div class="wa-two">
      <section class="wa-box"><h3>LEADS</h3><div class="wa-mini"><span><small>Contact clicks</small><b>${esc(compactMetric(s.contactClicks))}</b></span><span><small>Forms</small><b>${esc(compactMetric(s.formsSubmitted))}</b></span><span><small>Total</small><b>${esc(compactMetric(leads))}</b></span></div></section>
      <section class="wa-box"><h3>COMMERCE</h3><div class="wa-mini"><span><small>Orders</small><b>${esc(compactMetric(s.orders))}</b></span><span><small>Sales</small><b>${esc(salesText)}</b></span><span><small>Order rate</small><b>${Number(s.sessions)>0?((Number(s.orders||0)/Number(s.sessions))*100).toFixed(1)+'%':'—'}</b></span></div></section>
    </div>
    <section class="wa-next"><h3>NEXT LAYERS</h3><span>Button / CTA clicks</span><span>Google Search queries & ranking</span><span>Shopping funnel</span><span>Site speed & technical health</span></section>
  </section>`;
}

function rotationToday() {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:rotationZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=key=>parts.find(p=>p.type===key)?.value || '';
  return [part('year'),part('month'),part('day')].join('-');
}

function rotationDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US',{
    timeZone:rotationZone,month:'short',day:'numeric',year:'numeric',
    hour:'numeric',minute:'2-digit',timeZoneName:'short'
  }).format(new Date(iso));
}


function rotationXPanel(plan) {
  const x=xAutoStatus || {};
  const future=(plan?.entries || []).filter(e=>Date.parse(e.at)>Date.now() && e.state!=='published' &&
    records.find(r=>r.id===e.recordId)?.targets?.includes('x')).length;
  const estimate=(future*0.20).toFixed(2);
  let controls='';
  if(x.enabled){
    controls='<button type="button" class="danger" data-action="disableXAuto">Turn OFF automatic X posting</button>';
  } else if(!x.ready){
    controls='<a class="button" href="/api/x/connect">Connect / reconnect X for image posting</a>' +
      '<p>After connecting the intended X account, return here and refresh the page.</p>';
  } else {
    controls='<label class="check"><input type="checkbox" id="xBillingConsent"> I authorize X API pay-per-use charges for future rotation posts.</label>' +
      '<button type="button" class="approve" id="enableXAuto" data-action="enableXAuto" disabled>Enable automatic X posting</button>';
  }
  return '<section class="rotation-x-settings" aria-label="X automatic posting settings">' +
    '<h3>X Automatic Posting</h3>' +
    '<p><strong>' + (x.enabled ? 'ON FOR UPCOMING POSTS' : 'OFF: X IS NOT AUTO-POSTING') + '</strong></p>' +
    '<p>Connected account: ' + esc(x.account || 'Not verified') + ' · ' +
      esc(x.connectionMessage || 'Checking X account…') + '</p>' +
    '<p>When enabled, DJOMS sends each future rotation post to X with its campaign picture, a short caption, and its website link.</p>' +
    '<p><strong>Estimated X API cost:</strong> X currently charges about $0.20 per linked post. ' +
      future + ' upcoming posts could cost approximately <strong>$' + estimate + '</strong> at current rates. ' +
      'X bills from prepaid developer credits. Prices may change.</p>' +
    '<p>Already-published posts are not sent again automatically. Facebook and Instagram continue unchanged.</p>' +
    controls + '</section>';
}
function renderPostingRotation() {
  const plan=rotationStatus?.plan || null;
  const counts=rotationStatus?.approved || {};
  const activePlan=plan && ['active','paused','needs_attention','starting'].includes(plan.state);
  const titleMap={ BBQ:'BBQ', MUSIC:'Music', BOOK:'Book' };
  const inventory=Object.entries(titleMap).map(([key,label])=>
    `<span class="rotation-count"><strong>${esc(label)}</strong><b>${esc(counts[key] ?? 0)} approved</b></span>`).join('');
  const previewEntries=rotationPreview?.entries || [];
  const times=previewEntries.length ? `
    <div class="rotation-preview">
      <h3>Review the full posting order</h3>
      <p>45 posts, every other day, at the Central time selected above. Only the next post is queued with the free seven-day scheduler.</p>
      <div class="table-wrap"><table class="rotation-table"><thead>
        <tr><th>Day</th><th>When (Central)</th><th>Campaign</th><th>Post</th></tr>
      </thead><tbody>${previewEntries.map((r,i)=>
        `<tr><td>${1+i*2}</td><td>${esc(rotationDateTime(r.at))}</td><td>${esc(titleMap[r.campaign] || r.campaign)}</td><td>${esc(r.title)}</td></tr>`
      ).join('')}</tbody></table></div>
      <label class="check rotation-consent"><input type="checkbox" id="rotationConfirm">
        I reviewed the schedule and authorize automatic Facebook and Instagram posting.
      </label>
      <button type="button" class="approve rotation-activate" data-action="activateRotation" id="activateRotation" disabled>Activate 90-day rotation</button>
    </div>` : '';
  const date=rotationStartDate || rotationToday();
  const setup=activePlan ? '' : `
    <div class="rotation-fields">
      <label>First post date (Central time)<input type="date" id="rotationDate" min="${esc(rotationToday())}" value="${esc(date)}"></label>
      <label>Posting time (Central time)<input type="time" id="rotationTime" value="${esc(rotationStartTime)}" required></label>
      <button type="button" class="approve" data-action="previewRotation">Preview all 45 posts</button>
    </div>
    ${times}`;
  const next=activePlan ? plan.entries?.[plan.nextIndex] : null;
  const completed=plan ? plan.entries.filter(x=>x.state==='published').length : 0;
  const stateText={ active:'ACTIVE',paused:'PAUSED',needs_attention:'NEEDS ATTENTION',starting:'SETTING UP',completed:'COMPLETE',setup_failed:'SETUP FAILED' };
  const current=plan ? `
    <section class="rotation-current">
      <h3>Current rotation: ${esc(stateText[plan.state] || plan.state)}</h3>
      <p><strong>${completed} of 45 posted.</strong> ${plan.state === 'active' ? 'Future posts will be queued automatically after each successful scheduled delivery.' : ''}</p>
      ${next && plan.state !== 'completed' ? `<p><strong>Next:</strong> ${esc(next.title)} · ${esc(rotationDateTime(next.at))}</p>` : ''}
      ${plan.lastError ? `<p class="rotation-error">${esc(plan.lastError)}</p>` : ''}
      ${plan.state === 'active' ? '<button type="button" class="danger" data-action="pauseRotation">Pause the rotation</button>' : ''}
      ${plan.state === 'paused' ? '<p>The rotation is paused. Nothing else will be posted automatically. The remaining posts need to be rescheduled.</p>' : ''}
      ${plan.state === 'needs_attention' ? '<p>Automatic follow-on scheduling has stopped. Review the failed post before restarting.</p>' : ''}
    </section>` : '';
  $('content').innerHTML = `
    <section class="box rotation-panel">
      <h2>90-DAY CAMPAIGN ROTATION</h2>
      <p><strong>BBQ → Music → Book, every other day.</strong> All 45 approved posts are included once, across 89 calendar days.</p>
      <div class="rotation-inventory">${inventory}</div>
      <p class="rotation-caution"><strong>Delivery:</strong> Facebook and Instagram publish automatically if their accounts remain connected.
      X remains prepared-only until you separately authorize and enable paid X API posting below. The existing Facebook and Instagram schedule continues unchanged.</p>
      ${current}
      ${rotationXPanel(plan)}
      ${setup}
    </section>`;
}

function rotationPreviewClick(){
  const date=$('rotationDate')?.value, time=$('rotationTime')?.value;
  if(!date || !time) { notice('Choose today’s posting time before previewing the rotation.',true); return; }
  rotationStartDate=date; rotationStartTime=time;
  return perform(async()=>{
    rotationPreview=await api('rotation',{action:'preview',startLocal:date+'T'+time});
    renderPostingRotation();
    notice('Preview ready: 45 posts, beginning ' + rotationDateTime(rotationPreview.entries[0].at) + '. Review the order before activating.');
  });
}

function rotationActivateClick(){
  if(!rotationPreview?.entries?.length || !$('rotationConfirm')?.checked) {
    notice('Review and confirm the schedule before activating.',true); return;
  }
  const startLocal=rotationStartDate+'T'+rotationStartTime;
  const when=rotationDateTime(rotationPreview.entries[0].at);
  if(!confirm('ACTIVATE 90-DAY POSTING ROTATION? First post: BBQ-0001 on ' + when +
    '. After that, each successful post queues the next, every other day. Facebook and Instagram publish automatically; X is prepared only. Nothing will post before the chosen time.')) return;
  return perform(async()=>{
    const response=await api('rotation',{action:'activate',startLocal});
    rotationPreview=null;
    rotationStatus={...(rotationStatus || {}),plan:response.plan};
    await loadRecords();
    renderPostingRotation();
    notice('90-day rotation activated! First BBQ post scheduled for ' + rotationDateTime(response.plan.entries[0].at) + '.');
  });
}

function rotationPauseClick(){
  if (!confirm('Pause automatic posting? The next scheduled post will be stopped, and later posts will not be queued.')) return;
  return perform(async()=>{
    const response=await api('rotation',{action:'pause'});
    rotationStatus={...(rotationStatus||{}),plan:response.plan};
    await loadRecords();
    renderPostingRotation();
    notice('Posting rotation paused. No future posts are queued.');
  });
}

function render() {
  $('workspace').hidden = false; $('editor').hidden = true; selected = null; dirty = false;
  if (['Mission Control','Platform Details'].includes(activeView)) renderConnectionStrip();
  else $('connectionStrip').hidden = true;
  $('viewTitle').textContent = activeView === 'Mission Control' ? 'Social Command' : activeView;
  document.querySelectorAll('nav [data-view]').forEach(b => b.classList.toggle('active',b.dataset.view === activeView));
  $('campaignCards').hidden = activeView !== 'Campaigns';
  $('campaignCards').innerHTML = campaigns.map(c => {
    const list = records.filter(r => r.campaign === c.id), needs = list.filter(attention).length;
    return `<button class="card ${campaignFilter === c.id ? 'selected-card':''}" data-campaign="${esc(c.id)}"><i class="light ${needs ? 'red' : list.some(r => r.status === 'published') ? 'green' : 'neutral'}"></i><span class="id">${esc(c.id)}</span><h3>${esc(c.title)}</h3><small>${list.length} posts${needs ? ' · ' + needs + ' need attention' : ''}</small></button>`;
  }).join('');
  if (activeView === 'Mission Control' || activeView === 'Platform Details') {
    $('content').innerHTML = '';
    return;
  }
  if (activeView === 'Comments') {
    $('content').innerHTML = '<div class="empty"><h3>Loading comments…</h3></div>';
    loadComments().then(()=>{ if(activeView==='Comments') renderComments(); }).catch(e=>notice(e.message,true));
    return;
  }
  if (activeView === 'Video Inbox') {
    $('content').innerHTML = '<div class="empty"><h3>Loading Video Inbox…</h3></div>';
    loadVideoInbox().then(() => { if(activeView === 'Video Inbox') renderVideoInbox(); }).catch(e=>notice(e.message,true));
    return;
  }
  if (activeView === 'Media Inbox') {
    $('content').innerHTML = '<div class="empty"><h3>Loading Media Inbox…</h3></div>';
    loadMediaInbox().then(() => { if (activeView === 'Media Inbox') renderMediaInbox(); }).catch(e => notice(e.message,true));
    return;
  }
  if (activeView === 'Platforms') {
    $('content').innerHTML = renderWebsitePlatform() + `<div class="platforms connection-panels">${statusPlatforms.map(p => {
      const n = names[p], info = connection?.[p] || {}, health = connectionHealth(info);
      return `<div class="box platform-detail"><div class="platform-detail-head"><h2>${esc(n)}</h2><i class="gyr-light ${health.color}" aria-hidden="true"></i></div><p><strong>${esc(health.label)} · ${esc(health.text)}</strong></p><p>${esc(info.name || 'Account not verified')}</p><p>${esc(info.message || 'Connection and posting permissions checked.')}</p></div>`;
    }).join('')}</div><div class="box connection-actions"><a class="button approve" href="/api/meta/connect">Connect / reconnect Facebook & Instagram</a><button data-action="checkConnection">Check connections</button><p>Choose the Doc Jaks Facebook Page and its linked professional Instagram account when Meta asks.</p><p>Scheduling: ${connection?.scheduler ? 'Configured · confirmed separately when you schedule a post.' : 'One-time scheduler setup still needed.'}</p><a class="button approve" href="/api/x/connect">Connect / reconnect X</a><p>Connect the Doc Jaks X account and approve read/write access when X asks.</p><a class="button approve" href="/api/youtube/connect">Connect / reconnect YouTube</a><p>Connect the Doc Jaks YouTube channel now so it is ready when video publishing begins.</p></div>`;
    return;
  }
  if (activeView === 'Batch Schedule') {
    renderBatchSchedule();
    return;
  }
  if (activeView === 'Posting Rotation') {
    $('content').innerHTML='<div class="box"><h3>Checking the rotation and X connection…</h3></div>';
    Promise.allSettled([api('rotation'),loadXAuto()]).then(results=>{
      if(results[0].status==='fulfilled')rotationStatus=results[0].value;
      else notice('Could not load the rotation: '+results[0].reason.message,true);
      if(results[1].status==='rejected')xAutoStatus={enabled:false,ready:false,connected:false,connectionMessage:results[1].reason.message};
      if(activeView==='Posting Rotation')renderPostingRotation();
    });
    return;
  }
  if (activeView === 'Website Analytics') {
    renderWebsiteAnalytics();
    return;
  }
  if (activeView === 'Analytics') {
    const count = p => records.filter(r => r.results?.[p]?.status === 'published').length;
    const xStats = analyticsData?.platforms?.x || {};
    $('content').innerHTML = `<div class="cards"><div class="card"><h3>Facebook posts</h3><strong class="metric">${count('facebook')}</strong></div><div class="card"><h3>Instagram posts</h3><strong class="metric">${count('instagram')}</strong></div><div class="card"><h3>X posts tracked</h3><strong class="metric">${count('x')}</strong></div><div class="card"><h3>Scheduled</h3><strong class="metric">${records.filter(r => r.status === 'scheduled').length}</strong></div><div class="card"><h3>Needs attention</h3><strong class="metric">${records.filter(attention).length}</strong></div></div>
      <section class="box">
        <h3>X campaign performance</h3>
        <p>The X connection already supports account details and mentions. For manually posted campaigns, DJOMS tracks the copied post link and the numbers you enter. No extra X analytics API calls are made by this tracking feature.</p>
        <div class="x-analytics-summary">
          <span><small>Posts in this range</small><strong>${esc(xStats.posts ?? 0)}</strong></span>
          <span><small>Views</small><strong>${esc(compactMetric(xStats.views ?? 'Not entered'))}</strong></span>
          <span><small>Likes</small><strong>${esc(compactMetric(xStats.likes ?? 'Not entered'))}</strong></span>
          <span><small>Reposts</small><strong>${esc(compactMetric(xStats.shares ?? 'Not entered'))}</strong></span>
          <span><small>Replies</small><strong>${esc(compactMetric(xStats.replies ?? 'Not entered'))}</strong></span>
        </div>
        <p class="locknote">To record an X post, open its campaign card in Content Library, paste the X post URL, select Mark X as Posted, then enter any visible engagement counts. These are snapshots, not live measurements.</p>
      </section>`;
    return;
  }
  let list = records.filter(r => !campaignFilter || r.campaign === campaignFilter);
  if (activeView === 'Calendar') list = records.filter(r => r.status === 'scheduled').sort((a,b) => Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt));
  if (activeView === 'Approvals') list = records.filter(r => ['draft','approved'].includes(r.status));
  if (activeView === 'Needs Attention') list = records.filter(attention);
  if (searchTerm) list = list.filter(r => (r.title + ' ' + r.caption).toLowerCase().includes(searchTerm.toLowerCase()));
  const canSelect = activeView === 'Content Library';
  const draftCount = list.filter(canDeleteDraft).length;
  const bulkTools = canSelect ? `<label class="draft-select-all"><input type="checkbox" id="selectAllDrafts" ${draftCount ? '' : 'disabled'}> Select all drafts shown</label><button type="button" class="approve" id="approveSelectedDrafts" data-action="approveSelectedDrafts" disabled>Approve selected (0)</button><button type="button" class="danger" id="deleteSelectedDrafts" data-action="deleteSelectedDrafts" disabled>Delete selected (0)</button>` : '';
  const campaignPicker = canSelect ? `<label class="library-campaign-filter">Campaign<select id="libraryCampaignFilter"><option value="">All campaigns</option>${campaigns.map(c => `<option value="${esc(c.id)}" ${campaignFilter === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>` : '';
  const missingBookLinks = records.filter(r => r.campaign === 'BOOK' && canDeleteDraft(r) && !String(r.link || '').trim()).length;
  const bookLinkRepair = canSelect && (!campaignFilter || campaignFilter === 'BOOK') && missingBookLinks
    ? `<button type="button" class="approve" data-action="fillMissingBookLinks">Fill missing Book links (${missingBookLinks})</button>` : '';
  $('content').innerHTML = `<div class="filterbar"><label>Find a post<input id="searchPosts" type="search" value="${esc(searchTerm)}" placeholder="Title or caption"></label>${campaignPicker}${campaignFilter && !canSelect ? '<button data-action="allCampaigns">Show all campaigns</button>':''}${bulkTools}${bookLinkRepair}<span>${list.length} posts</span></div>` + rowsHtml(list);
}
async function setView(view) {
  if (inboxChangingView) return;
  if (activeView === 'Media Inbox' && view !== 'Media Inbox' && inboxDirty.size) {
    inboxChangingView = true;
    try { await saveInboxFieldsAll(true); }
    catch(error) { notice('Could not save Media Inbox changes. Stay here and click Save again: ' + error.message,true); return; }
    finally { inboxChangingView = false; }
  }
  if (dirty && !confirm('Leave without saving your changes?')) return;
  activeView = view; campaignFilter = ''; searchTerm = ''; render();
}
function platformText() {
  const caption = $('postCaption').value.trim();
  const link = $('postLink').value.trim();
  const full = caption + (link ? (caption ? '\n\n' : '') + link : '');
  const ig = full.length > 2200 ? full.slice(0,2197) + '…' : full;
  const reserve = link ? link.length + 2 : 0;
  const maxCaption = Math.max(0, 280 - reserve);
  const xCaption = caption.length > maxCaption ? caption.slice(0, Math.max(0,maxCaption-1)).trimEnd() + '…' : caption;
  const x = xCaption + (link ? (xCaption ? '\n\n' : '') + link : '');
  const ytTitle = $('postTitle').value.trim().slice(0,100);
  const ytDescription = full;
  return { facebook:full, instagram:ig, x, youtubeTitle:ytTitle, youtubeDescription:ytDescription };
}
function renderFormats() {
  const t = platformText();
  const variants = selected?.imageVariants || {};
  const specs = [
    ['Facebook','facebook','4:5 · 1200×1500'],
    ['Instagram','instagram','4:5 · 1080×1350'],
    ['X','x','16:9 · 1600×900'],
    ['YouTube','youtube','16:9 thumbnail · 1280×720'],
    ['Shorts','shorts','9:16 cover · 1080×1920']
  ];
  $('formatPreviews').innerHTML = specs.map(([label,key,spec]) => `<div class="format-card"><div class="format-image ${key}">${variants[key] ? `<img src="${esc(variants[key])}" alt="${esc(label)} formatted artwork">` : '<span>Upload photo</span>'}</div><strong>${esc(label)}</strong><small>${esc(spec)}</small></div>`).join('');
  $('platformCopy').innerHTML = `
    <div class="copy-card"><strong>Facebook</strong><small>${t.facebook.length} characters</small><p>${esc(t.facebook || 'Add your master message.')}</p></div>
    <div class="copy-card"><strong>Instagram</strong><small>${t.instagram.length}/2200</small><p>${esc(t.instagram || 'Add your master message.')}</p></div>
    <div class="copy-card"><strong>X</strong><small>${t.x.length}/280</small><p>${esc(t.x || 'Add your master message.')}</p></div>
    <div class="copy-card"><strong>YouTube</strong><small>Title ${t.youtubeTitle.length}/100</small><p><b>${esc(t.youtubeTitle || 'Campaign title')}</b><br>${esc(t.youtubeDescription || 'Add your master message.')}</p></div>`;
}
function updatePreview() {
  $('captionPreview').textContent = $('postCaption').value + ($('postLink').value ? '\n\n' + $('postLink').value : '');
  $('photoPreview').innerHTML = selected?.imageUrl ? `<img src="${esc(selected.imageUrl)}" alt="Post artwork">` : 'Add your photo';
  renderFormats();
}
function buttons() {
  if (!selected) return;
  const r = selected, locked = ['scheduled','queueing','publishing','published','partial','uncertain'].includes(r.status);
  ['postTitle','postCampaign','postCaption','postLink','targetFacebook','targetInstagram','targetX','targetYouTube','imageFile'].forEach(x => $(x).disabled = locked || busy);
  $('saveButton').disabled = locked || busy;
  $('approveButton').disabled = busy || dirty || !['draft','paused','failed','approved'].includes(r.status);
  const interrupted = r.status === 'publishing' && Date.now() - Date.parse(r.updatedAt) > 180000;
  const retryable = (['approved','failed','partial','processing'].includes(r.status) || interrupted) && r.approvedBy;
  $('publishButton').disabled = busy || dirty || !retryable;
  $('publishButton').textContent = interrupted ? 'Check interrupted post' : r.status === 'processing' || r.results?.instagram?.status === 'processing' ? 'Finish Instagram post' : ['failed','partial'].includes(r.status) ? 'Retry unsent platforms' : 'Publish now';
  $('scheduleButton').disabled = busy || dirty || r.status !== 'approved' || !connection?.scheduler;
  $('deleteDraftButton').hidden = !canDeleteDraft(r);
  $('deleteDraftButton').disabled = busy || dirty || !canDeleteDraft(r);
  ['pauseButton','draftButton'].forEach(x => $(x).disabled = busy || dirty || ['publishing','published','partial','uncertain'].includes(r.status));
  $('savedState').textContent = dirty ? 'Unsaved changes — save the draft before approving or posting.' : 'Saved ' + date(r.updatedAt);
  $('scheduleNote').textContent = r.status === 'scheduled' ? 'Scheduled for ' + date(r.scheduledAt) + '. Delivery continues when this browser is closed.' : connection?.scheduler ? 'Approve the saved post, then choose a time from two minutes to seven days ahead. Delivery can be delayed by the platforms.' : 'Scheduling is disabled until its one-time server setup is finished.';
}

function renderXManualTracker(record) {
  const host=$('manualXTracker');
  if(!host)return;
  if(!record?.targets?.includes('x')) {host.hidden=true;host.innerHTML='';return;}
  host.hidden=false;
  const item=record.results?.x || {};
  const reported=item.status==='published' && !!item.postId;
  if(!reported) {
    const blocked=['sending','uncertain','preparing'].includes(item.status);
    host.innerHTML='<h3>Track a post you published manually on X</h3>' +
      '<p>Post normally on X, then open that post, click Share, and choose Copy link. Paste the post link here to mark this campaign as posted on X.</p>' +
      '<label>Link to your published X post<input type="url" id="manualXPostUrl" placeholder="https://x.com/YourAccount/status/1234567890123456789" ' +
        (blocked?'disabled':'') + '></label>' +
      '<button type="button" class="approve" data-action="markXManual" '+
        (blocked?'disabled':'')+'>Mark X as Posted</button>' +
      '<p class="locknote">This records the existing post in DJOMS. It does not publish anything or enable paid X automation.</p>' +
      (blocked?'<p class="x-manual-caution">A previous X delivery is awaiting confirmation. Check the account before adding a manual link.</p>':'');
    return;
  }
  const fields=[
    ['views','Views'],['likes','Likes'],['replies','Replies'],
    ['reposts','Reposts'],['bookmarks','Bookmarks'],['linkClicks','Link clicks']
  ];
  const editor=fields.map(([key,label])=>
    '<label>'+label+
    '<input id="xMetric-'+key+'" type="number" inputmode="numeric" min="0" max="100000000000" '+
    'placeholder="Not entered" value="'+esc(item.metrics?.[key] ?? '')+'"></label>'
  ).join('');
  const url='https://x.com/i/web/status/'+encodeURIComponent(item.postId);
  host.innerHTML='<h3>X post: '+(item.source==='manual'?'Posted manually':'Posted')+'</h3>' +
    '<p><a href="'+url+'" target="_blank" rel="noopener noreferrer">View your X post ↗</a></p>' +
    '<p>Track the numbers visible on X. Leave a field blank if that number is unavailable.</p>' +
    '<div class="x-manual-metrics">'+editor+'</div>' +
    '<div class="x-manual-actions"><button type="button" class="approve" data-action="saveXMetrics">Save X numbers</button>' +
    (item.source==='manual' ? '<button type="button" data-action="clearXManual">Unlink manual X post</button>' : '')+'</div>' +
    '<p class="locknote">Stats are entered manually and are not an automatic X analytics feed. ' +
    (item.metricsUpdatedAt?'Last updated: '+esc(date(item.metricsUpdatedAt))+'. ':'')+
    'Unlinking does not delete anything from X.</p>';
}

function openRecord(r) {
  if (!r) return;
  clearTimeout(pollTimer); selected = structuredClone(r); dirty = false;
  $('workspace').hidden = true; $('editor').hidden = false;
  $('recordCode').textContent = code(r); $('recordTitle').textContent = r.title;
  $('recordStatus').textContent = labels[r.status] || r.status; $('recordStatus').className = 'status state-' + r.status;
  $('postTitle').value = r.title; $('postCaption').value = r.caption; $('postLink').value = r.link;
  $('postCampaign').innerHTML = campaigns.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join(''); $('postCampaign').value = r.campaign;
  $('targetFacebook').checked = r.targets.includes('facebook'); $('targetInstagram').checked = r.targets.includes('instagram'); $('targetX').checked = r.targets.includes('x'); $('targetYouTube').checked = r.targets.includes('youtube');
  $('timeZone').textContent = 'Your time: ' + timezone;
  if (r.scheduledAt) {
    const when = new Date(r.scheduledAt);
    const pad = n => String(n).padStart(2,'0');
    $('scheduleTime').value = `${when.getFullYear()}-${pad(when.getMonth()+1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
  } else $('scheduleTime').value = '';
  $('historyList').innerHTML = (r.history || []).map(h => `<p><small>${esc(date(h.at))} · ${esc(h.user)}</small><br>${esc(h.message)}</p>`).join('');
  $('results').innerHTML = Object.entries(r.results || {}).map(([p,v]) => `<div class="result-item"><strong>${esc(names[p])}: ${esc(labels[v.status] || v.status)}</strong>${v.postId ? `<p>Post ID: ${esc(v.postId)}</p>${p==='x' ? `<p><a href="https://x.com/i/web/status/${encodeURIComponent(v.postId)}" target="_blank" rel="noopener noreferrer">View X post ↗</a></p>` : ''}`:''}${v.error ? `<p>${esc(v.error)}</p>`:''}${v.note ? `<p>${esc(v.note)}</p>`:''}${['sending','uncertain'].includes(v.status) && (p==='facebook' || p==='instagram') ? `<button data-resolve="${p}" data-outcome="posted">I found the post</button><button data-resolve="${p}" data-outcome="not-posted">I checked: it did not post</button>`:''}</div>`).join('');
  renderXManualTracker(r);
  updatePreview(); buttons();
}
async function saveDraft() {
  const d = await api('records',{ action:'save', id:selected.id, revision:selected.revision, title:$('postTitle').value, campaign:$('postCampaign').value, caption:$('postCaption').value, link:$('postLink').value, imageId:selected.imageId, imageVariants:selected.imageVariantIds || {}, targets:[$('targetFacebook').checked && 'facebook',$('targetInstagram').checked && 'instagram',$('targetX').checked && 'x',$('targetYouTube').checked && 'youtube'].filter(Boolean) });
  updateRecord(d.record); openRecord(d.record); notice('Draft saved.');
}
async function recordAction(action, extra = {}) {
  if (!selected) return;
  const d = await api('records',{ action, id:selected.id, revision:selected.revision, ...extra });
  updateRecord(d.record); openRecord(d.record); notice(action === 'approve' ? 'Approved. You can publish now or schedule it.' : action === 'schedule' ? 'Schedule confirmed.' : 'Saved.');
}
async function publish() {
  const d = await api('publish',{ id:selected.id, revision:selected.revision });
  updateRecord(d.record); openRecord(d.record);
  const processing = Object.values(d.record.results || {}).some(r => r.status === 'processing');
  notice(d.success ? 'Published successfully to the selected platforms.' : processing ? 'Instagram is preparing the photo. Use Finish Instagram post in a few seconds.' : 'Check the result shown for each platform.', !d.success && !processing);
}
async function jpegVariant(bitmap, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(0,0,width,height);
  const scale = Math.min(width/bitmap.width,height/bitmap.height);
  const w=bitmap.width*scale,h=bitmap.height*scale;
  ctx.drawImage(bitmap,(width-w)/2,(height-h)/2,w,h);
  let quality=.86, data=canvas.toDataURL('image/jpeg',quality).split(',')[1];
  while (data.length > 2400000 && quality > .5) { quality -= .08; data=canvas.toDataURL('image/jpeg',quality).split(',')[1]; }
  return data;
}
async function uploadVariant(bitmap, width, height) {
  return api('media',{ base64:await jpegVariant(bitmap,width,height) });
}
async function upload(file) {
  if (!file) return;
  if (file.size > 20000000 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP photo smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  notice('Building Facebook, Instagram, X, YouTube and Shorts image formats…');
  const master = await uploadVariant(bitmap,1080,1080);
  const formats = {
    facebook: await uploadVariant(bitmap,1200,1500),
    instagram: await uploadVariant(bitmap,1080,1350),
    x: await uploadVariant(bitmap,1600,900),
    youtube: await uploadVariant(bitmap,1280,720),
    shorts: await uploadVariant(bitmap,1080,1920)
  };
  bitmap.close();
  selected.imageId = master.imageId;
  selected.imageUrl = master.imageUrl;
  selected.imageVariantIds = Object.fromEntries(Object.entries(formats).map(([k,v])=>[k,v.imageId]));
  selected.imageVariants = Object.fromEntries(Object.entries(formats).map(([k,v])=>[k,v.imageUrl]));
  dirty = true; updatePreview(); buttons();
  notice('Campaign photo formatted for Facebook, Instagram, X, YouTube and Shorts. Save the draft to keep all versions.');
}
async function perform(work) {
  if (busy) return; busy = true; buttons();
  try { await work(); }
  catch (e) {
    // Read the saved result after a failed request; never erase an unsaved draft.
    if (selected && !dirty) {
      const currentId = selected.id;
      try { await loadRecords(); const current = records.find(r => r.id === currentId); if (current) openRecord(current); } catch {}
    }
    notice(e.message,true);
  }
  finally { busy = false; buttons(); }
}
document.addEventListener('click', event => {
  const b = event.target.closest('button,a'); if (!b || b.disabled || busy) return;
  if (b.dataset.websiteRange) {
    const requested = b.dataset.websiteRange;
    return perform(async () => {
      notice('Checking Wix for '+(websiteRanges.find(([key]) => key===requested)?.[1] || requested)+'…');
      const site = await loadWebsiteRange(requested);
      websiteRange = requested;
      render();
      notice(site.connected ? 'Wix website report updated for '+requested+'.' : (site.message || 'Wix reporting needs attention.'), !site.connected);
    });
  }
  if (b.dataset.metricRange) { platformMetricRange = b.dataset.metricRange; return perform(async()=>{ await loadAnalytics(true); renderConnectionStrip(); }); }
  if (b.dataset.platformDetail) { if (activeView === 'Mission Control') { selectedStatusPlatform = b.dataset.platformDetail; activeView = 'Platform Details'; render(); return; } selectedStatusPlatform = selectedStatusPlatform === b.dataset.platformDetail ? null : b.dataset.platformDetail; renderConnectionStrip(); return; }
  if (b.dataset.view) return setView(b.dataset.view);
  if (b.dataset.open) return openRecord(records.find(r => r.id === b.dataset.open));
  if (b.dataset.campaign) { campaignFilter = campaignFilter === b.dataset.campaign ? '' : b.dataset.campaign; return render(); }
  if (b.dataset.deleteDraft) {
    const r = records.find(x => x.id === b.dataset.deleteDraft);
    if (!canDeleteDraft(r)) { notice('Only unsent drafts can be deleted.', true); return; }
    if (!confirm('Permanently delete the draft "' + r.title + '"? This cannot be undone. Original artwork files on your computer are not affected.')) return;
    return perform(async () => {
      await api('records', { action:'deleteDraft', id:r.id, revision:r.revision });
      records = records.filter(x => x.id !== r.id);
      render();
      notice('Draft deleted from Content Library.');
    });
  }
  if (b.dataset.resolve) return perform(async () => {
    const extra = { platform:b.dataset.resolve, outcome:b.dataset.outcome };
    if (extra.outcome === 'posted') { extra.postId = prompt('Enter the post ID from the account:'); if (!extra.postId) return; }
    else { extra.confirmed = confirm('Have you checked the live account and confirmed that this post was NOT published?'); if (!extra.confirmed) return; }
    await recordAction('resolve',extra);
  });
  if (b.dataset.commentPlatformFilter) { commentPlatformFilter=b.dataset.commentPlatformFilter; renderComments(); return; }
  if (b.dataset.commentStatusFilter) { commentStatusFilter=b.dataset.commentStatusFilter; renderComments(); return; }
  const action = b.dataset.action; if (!action) return;
  if(action==='markXManual') {
    if(!selected || dirty) { notice('Save or discard unsaved post edits before linking X.',true);return; }
    const url=$('manualXPostUrl')?.value.trim();
    if(!url) {notice('Copy your published X post link and paste it first.',true);return;}
    if(!confirm('Confirm that you already posted this campaign on X? This records a link in DJOMS; it does not publish anything.'))return;
    return perform(async()=>{
      await recordAction('recordManualX',{url});
      notice('Manual X post linked to this campaign. You can now save its views, likes and reposts.');
    });
  }
  if(action==='saveXMetrics') {
    if(!selected || dirty) {notice('Save or discard unsaved post edits first.',true);return;}
    const keys=['views','likes','replies','reposts','bookmarks','linkClicks'];
    const metrics=Object.fromEntries(keys.map(key=>[key,$('xMetric-'+key)?.value.trim() || null]));
    return perform(async()=>{
      await recordAction('updateManualXMetrics',{metrics});
      notice('X statistics saved to DJOMS. These are manually entered numbers, not live X API analytics.');
    });
  }
  if(action==='clearXManual') {
    if(!selected || dirty)return notice('Save or discard unsaved post edits first.',true);
    if(!confirm('Unlink this manually recorded X post from DJOMS? It will remain published on X.'))return;
    return perform(async()=>{
      await recordAction('clearManualX');
      notice('Manual X tracking link removed. The post remains on X.');
    });
  }
  if (action === 'openUnansweredComments') { commentStatusFilter = 'unanswered'; setView('Comments'); return; }
  if (action === 'openBlogComments') { commentPlatformFilter = 'blog'; commentStatusFilter = 'all'; setView('Comments'); return; }
  if (action === 'connectBlog') {
    const clientId = prompt('Paste the Wix Headless Client ID for DJOMS Blog Bridge.');
    if (!clientId) return;
    const clientSecret = prompt('Paste the Wix Headless Client Secret. This stays in the encrypted backend connection and is not shown on the dashboard.');
    if (!clientSecret) return;
    return perform(async()=> {
      notice('Connecting From Doc\'s Porch…');
      await wixBlogPost({ action:'configure', clientId, clientSecret });
      await loadComments();
      renderConnectionStrip();
      notice('From Doc\'s Porch is connected.');
    });
  }
  if (action === 'closePlatformDetail') { selectedStatusPlatform = null; renderConnectionStrip(); return; }
  if (action === 'openFullPlatforms') { selectedStatusPlatform = null; setView('Platforms'); return; }
  if (action === 'saveGoogleLocation') {
    const select=document.querySelector('[data-local-google-location]');
    if(!select?.value){ notice('Choose the Google Business Profile location first.',true); return; }
    const split=select.value.split('|');
    return perform(async()=>{ await api('local-google-select',{accountName:split[0],locationName:split.slice(1).join('|')}); await loadLocalStatus(); renderConnectionStrip(); notice('Google Business Profile location saved.'); });
  }
  if (action === 'back') { if (!dirty || confirm('Leave without saving your changes?')) render(); return; }
  if (action === 'allCampaigns') { campaignFilter=''; return render(); }
  if (action === 'previewRotation') return rotationPreviewClick();
  if (action === 'activateRotation') return rotationActivateClick();
  if (action === 'pauseRotation') return rotationPauseClick();
  if(action==='enableXAuto'){
    if(!$('xBillingConsent')?.checked)return notice('Confirm X API pay-per-use charges first.',true);
    if(!confirm('Enable paid X picture posting for FUTURE 90-day rotation posts? Linked posts currently cost approximately $0.20 each, billed by X. Earlier posts will NOT be reposted.'))return;
    return perform(async()=>{
      const data=await xAutoPost({action:'enable',acknowledgePayPerUse:true});
      await loadXAuto();
      renderPostingRotation();
      notice('Automatic X posting enabled for future scheduled posts to '+(data.account || 'the connected account')+'.');
    });
  }
  if(action==='disableXAuto'){
    if(!confirm('Turn OFF automatic X posts? Facebook and Instagram will continue unchanged.'))return;
    return perform(async()=>{
      await xAutoPost({action:'disable'});
      await loadXAuto();
      renderPostingRotation();
      notice('Automatic X posting disabled. Facebook and Instagram continue as scheduled.');
    });
  }
  if (action === 'fillMissingBookLinks') {
    if (activeView !== 'Content Library') return;
    const count = records.filter(r => r.campaign === 'BOOK' && canDeleteDraft(r) && !String(r.link || '').trim()).length;
    if (!count) { notice('No missing links remain on the Book drafts.'); return; }
    if (!confirm('Add https://www.docjaks.com to the ' + count + ' Book draft' + (count === 1 ? '' : 's') + ' with empty links? Existing links, artwork, captions, and other campaigns will be left alone. This will NOT publish any posts.')) return;
    return perform(async() => {
      const result = await api('records', { action:'fillMissingBookLinks' });
      await loadRecords();
      render();
      notice(result.updated + ' missing Book Campaign link' + (result.updated === 1 ? '' : 's') + ' filled. Nothing was published.');
    });
  }
  if (action === 'approveSelectedDrafts') {
    if (activeView !== 'Content Library') return;
    const chosen = [...document.querySelectorAll('.draft-check:checked')]
      .map(box => records.find(r => r.id === box.dataset.draftId));
    if (!chosen.length) { notice('Check the drafts you want to approve first.', true); return; }
    if (chosen.some(r => !canDeleteDraft(r))) {
      notice('Only unsent draft posts can be approved in bulk. Refresh the list and try again.', true);
      return;
    }
    const count = chosen.length;
    const campaignNames = [...new Set(chosen.map(r => campaigns.find(c => c.id === r.campaign)?.title || r.campaign))];
    if (!confirm('Approve ' + count + ' selected draft' + (count === 1 ? '' : 's') + ' from ' +
      campaignNames.join(', ') + '? This does NOT publish or schedule any posts. Posts with missing or invalid details will remain drafts.')) return;
    return perform(async () => {
      let approved = 0;
      const failures = [];
      // Process a few at a time to keep the dashboard responsive without
      // bypassing each record's server-side approval validation.
      for (let i = 0; i < chosen.length; i += 4) {
        notice('Checking and approving drafts ' + (i + 1) + '–' +
          Math.min(i + 4, count) + ' of ' + count + '…');
        const results = await Promise.allSettled(chosen.slice(i, i + 4).map(r =>
          api('records', { action:'approve', id:r.id, revision:r.revision })));
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            approved++;
          } else {
            failures.push({ title:chosen[i+index].title, message:result.reason?.message || 'Approval failed.' });
          }
        });
      }
      await loadRecords();
      render();
      const failed = failures.length;
      if (failed) {
        const example = failures.slice(0, 3).map(f => f.title + ': ' + f.message).join(' | ');
        notice(approved + ' approved. ' + failed + ' stayed as drafts and need attention. ' + example +
          (failed > 3 ? ' (and ' + (failed - 3) + ' more)' : '') + '. No posts were published.', true);
      } else {
        notice(approved + ' drafts approved and ready for scheduling. Nothing was published.');
      }
    });
  }
  if (action === 'deleteSelectedDrafts') {
    if (activeView !== 'Content Library') return;
    const chosen = [...document.querySelectorAll('.draft-check:checked')]
      .map(box => records.find(r => r.id === box.dataset.draftId));
    if (!chosen.length) { notice('Check the drafts you want to delete first.', true); return; }
    if (chosen.some(r => !canDeleteDraft(r))) { notice('Only unsent drafts can be deleted. Refresh the list and try again.', true); return; }
    const count = chosen.length;
    const includedCampaigns = [...new Set(chosen.map(r => campaigns.find(c => c.id === r.campaign)?.title || r.campaign))];
    if (!confirm('Permanently delete ' + count + ' selected draft post' + (count === 1 ? '' : 's') + ' from ' + includedCampaigns.join(', ') + '? This cannot be undone. Published and scheduled posts are protected.')) return;
    return perform(async () => {
      let deleted = 0, error = null;
      for (const r of chosen) {
        notice('Deleting draft ' + (deleted + 1) + ' of ' + count + '…');
        try {
          await api('records', { action:'deleteDraft', id:r.id, revision:r.revision });
          records = records.filter(x => x.id !== r.id);
          deleted++;
        } catch (e) { error = e; break; }
      }
      // Refresh so an interrupted run or revision conflict cannot leave stale rows.
      await loadRecords();
      render();
      notice(error
        ? deleted + ' of ' + count + ' selected drafts deleted. Remaining drafts were kept. ' + error.message
        : deleted + ' selected draft' + (deleted === 1 ? '' : 's') + ' deleted.',
        !!error);
    });
  }
  if (action === 'deleteDraft') {
    const r = selected;
    if (!canDeleteDraft(r) || dirty) { notice('Only saved, unsent drafts can be deleted. Save or discard any unsaved changes first.', true); return; }
    if (!confirm('Permanently delete the draft "' + r.title + '"? This cannot be undone. Original artwork files on your computer are not affected.')) return;
    return perform(async () => {
      await api('records', { action:'deleteDraft', id:r.id, revision:r.revision });
      records = records.filter(x => x.id !== r.id);
      render();
      notice('Draft deleted from Content Library.');
    });
  }
  if (action === 'removeImage') { if ($('imageFile').disabled) return; selected.imageId=null; selected.imageUrl=null; selected.imageVariantIds={}; selected.imageVariants={}; dirty=true; updatePreview(); buttons(); return; }
  if (action === 'refreshComments') {
    return perform(async()=>{ await loadComments(); renderComments(); notice('Comments updated.'); });
  }
  if (action === 'replyComment') {
    const platform=b.dataset.commentPlatform;
    const commentId=b.dataset.commentId;
    const parentId=b.dataset.commentParent;
    const box=document.querySelector('[data-comment-reply="'+CSS.escape(commentId)+'"]');
    const text=box?.value.trim() || '';
    if(!text) { notice('Write a reply first.',true); return; }
    return perform(async()=>{
      if(platform === 'youtube') await youtubePost('comment-reply',{parentId,text});
      else if(platform === 'blog') await wixBlogPost({ action:'reply', commentId, parentId, referenceId:b.dataset.commentReference || '', message:text });
      else if(platform === 'website') {
        const response=await fetch('/api/community/moderation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},body:JSON.stringify({action:'reply',itemId:commentId,reply:text})});
        const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Website Community could not save the reply.');
      } else if(platform === 'x') {
        const response=await fetch('/api/x/mention-reply',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},body:JSON.stringify({tweetId:commentId,text})});
        const data=await response.json(); if(!response.ok) throw new Error(data.error || 'X could not send the reply.');
      } else await api('comments',{action:'reply',platform,commentId,message:text});
      await loadComments();
      renderComments();
      notice('Reply sent and comment marked handled.');
    });
  }
  if (action === 'toggleCommentHandled') {
    const platform=b.dataset.commentPlatform;
    const commentId=b.dataset.commentId;
    const handled=b.dataset.commentHandled !== '1';
    return perform(async()=>{
      if(platform === 'youtube') await youtubePost('comment-handled',{commentId,handled});
      else if(platform === 'blog') await wixBlogPost({ action:'handled', commentId, handled });
      else if(platform === 'website') {
        const response=await fetch('/api/community/moderation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},body:JSON.stringify({action:'handled',itemId:commentId,handled})});
        const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Website Community could not update this post.');
      } else if(platform === 'x') {
        const response=await fetch('/api/x/mention-handled',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},body:JSON.stringify({tweetId:commentId,handled})});
        const data=await response.json(); if(!response.ok) throw new Error(data.error || 'X could not update this mention.');
      } else await api('comments',{action:'handled',platform,commentId,handled});
      await loadComments();
      renderComments();
      notice(handled ? 'Comment marked handled.' : 'Comment marked unanswered.');
    });
  }
  if (action === 'moderateWebsite') {
    const itemId=b.dataset.commentId;
    const moderationAction=b.dataset.communityAction;
    return perform(async()=>{
      const response=await fetch('/api/community/moderation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-DJOMS-CSRF':csrf},body:JSON.stringify({action:moderationAction,itemId})});
      const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Website Community moderation failed.');
      await loadComments(); renderComments(); notice(moderationAction==='approve' ? 'Website post approved.' : 'Website post rejected.');
    });
  }
  if (action === 'saveVideoInbox') {
    const itemId=b.dataset.videoId;
    return perform(async()=>{
      const title=document.querySelector('[data-video-title="'+CSS.escape(itemId)+'"]')?.value || '';
      const description=document.querySelector('[data-video-description="'+CSS.escape(itemId)+'"]')?.value || '';
      const link=document.querySelector('[data-video-link="'+CSS.escape(itemId)+'"]')?.value || '';
      const campaign=document.querySelector('[data-video-campaign="'+CSS.escape(itemId)+'"]')?.value || 'BBQ';
      const categoryId=document.querySelector('[data-video-category="'+CSS.escape(itemId)+'"]')?.value || '22';
      const targets=[...document.querySelectorAll('[data-video-platform="'+CSS.escape(itemId)+'"]:checked')].map(x=>x.value);
      const saved=await youtubePost('video-save',{itemId,title,description,link,campaign,categoryId,targets});
      const i=videoInbox.findIndex(x=>x.id===itemId); if(i>=0) videoInbox[i]=saved.item;
      renderVideoInbox(); notice('Video information saved. The YouTube copy remains private.');
    });
  }
  if (action === 'deleteVideoInbox') {
    const itemId=b.dataset.videoId;
    if(!confirm('Delete this private YouTube video and remove it from Video Inbox?')) return;
    return perform(async()=>{
      await youtubePost('video-delete',{itemId});
      videoInbox=videoInbox.filter(x=>x.id!==itemId);
      renderVideoInbox(); notice('Video deleted.');
    });
  }
  if (action === 'saveInboxItem') {
    const itemId=b.dataset.inboxId;
    return perform(async()=>{
      await saveInboxFields(itemId);
      notice('Media Inbox placecard saved. You can leave and reopen it.');
    });
  }
  if (action === 'saveAllInbox') {
    if (checkInboxLinks().length) return;
    return perform(async()=>{
      const count=await saveInboxFieldsAll(false);
      notice(count + ' Media Inbox placecard' + (count===1?'':'s') + ' saved. Captions, titles, links and platform selections will remain when you return.');
    });
  }
  if (action === 'removeInbox') {
    const itemId=b.dataset.inboxId;
    if (!confirm('Remove this picture from Media Inbox?')) return;
    return perform(async()=> {
      if(inboxSaveTimers.has(itemId)) clearTimeout(inboxSaveTimers.get(itemId));
      inboxSaveTimers.delete(itemId);
      await inboxSaveChains.get(itemId)?.catch(()=>{});
      await api('records',{action:'mediaInboxDelete',itemId});
      mediaInbox=mediaInbox.filter(x=>x.id!==itemId);
      inboxDirty.delete(itemId);
      inboxEditVersions.delete(itemId);
      inboxSaveChains.delete(itemId);
      renderMediaInbox();
      notice('Picture removed from Media Inbox.');
    });
  }
  if (action === 'createInboxDrafts') {
    if (checkInboxLinks().length) return;
    return perform(async()=> {
      await saveInboxFieldsAll(true);
      const selectedIds=[...document.querySelectorAll('.inbox-check:checked')].map(x=>x.dataset.inboxId);
      if(!selectedIds.length) throw new Error('Select at least one picture.');
      if(!confirm('Create ' + selectedIds.length + ' draft post' + (selectedIds.length===1?'':'s') + ' from these pictures?')) return;
      let done=0;
      for(const itemId of selectedIds) {
        notice('Building draft ' + (done+1) + ' of ' + selectedIds.length + ' and formatting its platform images…');
        const record=await buildInboxDraft(itemId);
        updateRecord(record);
        mediaInbox=mediaInbox.filter(x=>x.id!==itemId);
        inboxDirty.delete(itemId);
        inboxEditVersions.delete(itemId);
        if(inboxSaveTimers.has(itemId)) clearTimeout(inboxSaveTimers.get(itemId));
        inboxSaveTimers.delete(itemId);
        done++;
      }
      await loadRecords();
      renderMediaInbox();
      notice(done + ' draft post' + (done===1?'':'s') + ' created. They are ready for review and approval.');
    });
  }
  if (action === 'fillBatchTimes') {
    const startValue = $('batchStart')?.value;
    if (!startValue) { notice('Choose the first posting date and time.', true); return; }
    const start = new Date(startValue);
    if (!Number.isFinite(start.getTime())) { notice('Choose a valid first posting time.', true); return; }
    const spacingHours = Number($('batchSpacing')?.value || 24);
    const chosen = [...document.querySelectorAll('.batch-check:checked')];
    if (!chosen.length) { notice('Select at least one approved post.', true); return; }
    chosen.forEach((check,index) => {
      const input = document.querySelector('[data-batch-time="' + CSS.escape(check.dataset.batchId) + '"]');
      if (input) input.value = localInputValue(new Date(start.getTime() + index * spacingHours * 3600000));
    });
    notice('Posting times filled. Review them, then click Schedule selected.');
    return;
  }
  if (action === 'scheduleBatch') {
    return perform(async () => {
      const chosen = [...document.querySelectorAll('.batch-check:checked')];
      if (!chosen.length) throw new Error('Select at least one approved post.');
      const jobs = chosen.map(check => {
        const r = records.find(x => x.id === check.dataset.batchId);
        const input = document.querySelector('[data-batch-time="' + CSS.escape(check.dataset.batchId) + '"]');
        if (!r || !input?.value) throw new Error('Choose a date and time for every selected post.');
        return { r, when:new Date(input.value) };
      });
      if (jobs.some(j => !Number.isFinite(j.when.getTime()))) throw new Error('One of the posting times is not valid.');
      if (!confirm('Schedule ' + jobs.length + ' selected post' + (jobs.length === 1 ? '' : 's') + '?')) return;
      let completed = 0;
      for (const job of jobs) {
        const d = await api('records',{ action:'schedule', id:job.r.id, revision:job.r.revision, scheduledAt:job.when.toISOString(), timeZone:timezone });
        updateRecord(d.record);
        completed++;
      }
      await loadRecords();
      render();
      notice(completed + ' post' + (completed === 1 ? '' : 's') + ' scheduled.');
    });
  }
  perform(async () => {
    if (action === 'logout') { if (dirty && !confirm('Sign out without saving changes?')) return; await api('session',null,'DELETE'); location.reload(); }
    else if (action === 'new') { const d=await api('records',{action:'create',campaign:campaignFilter || 'BBQ'}); updateRecord(d.record); openRecord(d.record); }
    else if (action === 'refresh') { await loadRecords(); await loadAnalytics(true); await loadLocalStatus(); if (websiteRange !== '7d') await loadWebsiteRange(websiteRange); await refreshConnection(); await loadComments(); render(); renderConnectionStrip(); notice('Updated.'); }
    else if (action === 'refreshRecord') { if (dirty && !confirm('Refresh and discard unsaved changes?')) return; const currentId=selected.id; await loadRecords(); openRecord(records.find(r=>r.id===currentId)); notice('Showing the latest saved result.'); }
    else if (action === 'checkWebsiteConnection') { const site=await loadWebsiteRange('7d'); render(); notice(site.connected ? 'Wix website connection checked.' : (site.message || 'Wix website reporting needs attention.'), !site.connected); }
    else if (action === 'checkConnection') { await Promise.all([refreshConnection(), loadLocalStatus()]); render(); notice('Platform and website connections checked.'); }
    else if (action === 'publish') await publish();
    else if (action === 'schedule') { const at=$('scheduleTime').value; if(!at) throw new Error('Choose a posting date and time.'); await recordAction('schedule',{scheduledAt:new Date(at).toISOString(),timeZone:timezone}); }
    else if (['approve','pause','draft','duplicate'].includes(action)) await recordAction(action);
  });
});
document.addEventListener('change', event => {
  if(event.target.id==='xBillingConsent'){
    const button=$('enableXAuto');
    if(button)button.disabled=!event.target.checked;
    return;
  }
  if (event.target.id === 'rotationConfirm') {
    const button=$('activateRotation');
    if (button) button.disabled = !event.target.checked;
    return;
  }
  if (event.target.id === 'rotationDate' || event.target.id === 'rotationTime') {
    rotationStartDate=$('rotationDate')?.value || rotationStartDate;
    rotationStartTime=$('rotationTime')?.value || rotationStartTime;
    rotationPreview=null;
    if(activeView==='Posting Rotation') renderPostingRotation();
    return;
  }
  if(event.target.id === 'selectAllInbox') {
    document.querySelectorAll('.inbox-check').forEach(box=>{
      if(box.checked !== event.target.checked) {
        box.checked=event.target.checked;
        inboxMarkEdited(box.dataset.inboxId);
      }
    });
    updateInboxSelectAll();
    return;
  }
  const inboxCard=event.target.closest('.inbox-card');
  if(inboxCard) {
    inboxMarkEdited(inboxCard.dataset.inboxCard);
    if(event.target.classList.contains('inbox-check')) updateInboxSelectAll();
    return;
  }
  if (event.target.id === 'libraryCampaignFilter') {
    campaignFilter = event.target.value;
    render();
    return;
  }
  if (event.target.id === 'selectAllDrafts') {
    document.querySelectorAll('.draft-check').forEach(box => { box.checked = event.target.checked; });
    updateDraftSelectionControls();
  } else if (event.target.classList?.contains('draft-check')) {
    updateDraftSelectionControls();
  }
});
document.addEventListener('input', event => {
  const inboxCard=event.target.closest('.inbox-card');
  if(inboxCard && event.target.type !== 'checkbox') {
    if(event.target.hasAttribute('data-inbox-link')) {
      const valid=isValidInboxLink(event.target.value);
      event.target.classList.toggle('inbox-invalid-link',!valid);
      event.target.setAttribute('aria-invalid',valid ? 'false' : 'true');
    }
    inboxMarkEdited(inboxCard.dataset.inboxCard);
    return;
  }
  if (event.target.id === 'searchPosts') { const position=event.target.selectionStart; searchTerm=event.target.value; render(); $('searchPosts').focus(); try{$('searchPosts').setSelectionRange(position,position);}catch{} return; }
  if (event.target.closest('#editForm')) { dirty=true; updatePreview(); buttons(); }
});
window.addEventListener('beforeunload',event=>{
  if(inboxDirty.size && activeView === 'Media Inbox') {
    event.preventDefault();
    event.returnValue='';
  }
});
$('imageFile').addEventListener('change', e => { const file=e.target.files[0]; e.target.value=''; perform(() => upload(file)); });
$('editForm').addEventListener('submit', e => { e.preventDefault(); perform(saveDraft); });
$('loginDialog').addEventListener('cancel',e=>e.preventDefault());
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); $('signInButton').disabled=true; $('loginMessage').textContent='Signing in…';
  try { await signedIn(await api('session',{password:$('password').value, remember:$('rememberComputer').checked})); }
  catch(error) { $('loginMessage').textContent=error.message; notice(error.message,true); }
  finally { $('signInButton').disabled=false; }
});
$('forgotPassword').addEventListener('click', () => { $('password').value = ''; $('recoveryMessage').textContent = ''; authScreen('recovery'); });
$('backToLogin').addEventListener('click', () => showLogin(''));
$('requestAnotherLink').addEventListener('click', () => { resetToken = ''; $('newPassword').value = ''; $('confirmPassword').value = ''; $('recoveryMessage').textContent = ''; authScreen('recovery'); });
$('recoveryForm').addEventListener('submit', async e => {
  e.preventDefault(); $('sendResetButton').disabled = true; $('recoveryMessage').textContent = 'Sending your reset link…';
  try { const result = await api('password', { action: 'request' }); $('recoveryMessage').textContent = result.message; }
  catch (error) { $('recoveryMessage').textContent = error.message; }
  finally { $('sendResetButton').disabled = false; }
});
$('resetForm').addEventListener('submit', async e => {
  e.preventDefault();
  if ($('newPassword').value !== $('confirmPassword').value) { $('resetMessage').textContent = 'The two new passwords do not match.'; $('confirmPassword').focus(); return; }
  $('savePasswordButton').disabled = true; $('resetMessage').textContent = 'Saving your new password…';
  try {
    const result = await api('password', { action: 'reset', token: resetToken, password: $('newPassword').value, confirmPassword: $('confirmPassword').value });
    resetToken = ''; csrf = ''; $('newPassword').value = ''; $('confirmPassword').value = ''; $('password').value = '';
    showLogin(result.message);
  } catch (error) { $('resetMessage').textContent = error.message; }
  finally { $('savePasswordButton').disabled = false; }
});
window.addEventListener('beforeunload',e=>{ if(dirty){e.preventDefault();e.returnValue='';} });
(async()=>{
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('reset-password')) {
    resetToken = fragment.get('reset-password') || '';
    history.replaceState({}, '', location.pathname + location.search);
    if (/^[a-f0-9]{64}$/.test(resetToken)) { $('live').textContent = 'Password recovery'; authScreen('reset'); return; }
    resetToken = ''; $('recoveryMessage').textContent = 'This reset link is incomplete. Request a new link.'; authScreen('recovery'); return;
  }
  try{const s=await api('session'); if(s.authenticated) await signedIn(s); else showLogin('');}catch(e){$('live').textContent='Setup needed';showLogin(e.message);}
})();
