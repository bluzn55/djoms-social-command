'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube', website: 'Website Community' };
const statusPlatforms = ['facebook','instagram','x','youtube'];
const labels = { draft:'Draft', approved:'Approved', scheduled:'Scheduled', queueing:'Confirming schedule', paused:'Paused', publishing:'Publishing', published:'Published', failed:'Needs attention', partial:'Partly published', uncertain:'Check result', processing:'Preparing photo', prepared:'Prepared' };
let records = [], campaigns = [], mediaInbox = [], videoInbox = [], commentStream = [], commentWarnings = [], commentCheckedAt = null, commentPlatformFilter = 'all', commentStatusFilter = 'all', csrf = '', selected = null, connection = null, dirty = false, busy = false, activeView = 'Campaigns', campaignFilter = '', searchTerm = '', owner = '';
let pollTimer;
let platformMetricRange = '7d';
let selectedStatusPlatform = null;
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
  const [ytResult, metaResult, xResult, webResult] = await Promise.allSettled([
    platformApi('youtube','comments','YouTube'),
    api('comments?platforms=facebook,instagram'),
    platformApi('x','mentions','X'),
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
function platformMetricData(info = {}, platform) {
  const aliases = {
    today:['today','1d','day'],
    '7d':['7d','7','week'],
    '30d':['30d','30','month']
  };
  const bases = [info.analytics, info.insights, info.metrics].filter(Boolean);
  let source = {};
  for (const base of bases) {
    const key = (aliases[platformMetricRange] || [platformMetricRange]).find(k => base && typeof base[k] === 'object');
    if (key) { source = base[key]; break; }
    if (['likes','comments','replies','clicks','shares','reposts','reach','views','impressions'].some(k => base?.[k] !== undefined)) { source = base; break; }
  }
  return {
    audience: info.followers ?? info.subscribers ?? info.audience ?? source.followers ?? source.subscribers ?? source.audience ?? source.followersCount ?? source.subscriberCount,
    likes: source.likes ?? source.likeCount ?? info.likes,
    replies: source.replies ?? source.comments ?? source.replyCount ?? source.commentCount ?? info.replies ?? info.comments,
    clicks: source.clicks ?? source.linkClicks ?? source.clickCount ?? info.clicks ?? info.linkClicks,
    shares: source.shares ?? source.reposts ?? source.forwards ?? source.shareCount ?? source.repostCount ?? info.shares ?? info.reposts,
    reach: source.reach ?? source.views ?? source.impressions ?? source.viewCount ?? source.reachCount ?? info.reach ?? info.views
  };
}
function renderConnectionStrip() {
  const strip = $('connectionStrip');
  strip.hidden = false;
  const rangeLabels = { today:'Today', '7d':'Last 7 Days', '30d':'Last 30 Days' };
  strip.innerHTML = `
    <div class="platform-status-toolbar">
      <div><strong>Platform health & engagement</strong><small>${esc(rangeLabels[platformMetricRange] || 'Last 7 Days')}</small></div>
      <div class="platform-range-switch" role="group" aria-label="Engagement time range">
        ${[['today','Today'],['7d','7 Days'],['30d','30 Days']].map(([key,label]) => `<button type="button" data-metric-range="${key}" class="${platformMetricRange === key ? 'active' : ''}" aria-pressed="${platformMetricRange === key}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="platform-status-grid">${statusPlatforms.map(p => {
      const info = connection?.[p] || {};
      const health = connectionHealth(info);
      const account = info.name || (info.connected ? 'Connected account' : 'Connection needs attention');
      const metrics = platformMetricData(info,p);
      const audienceLabel = p === 'youtube' ? 'Subscribers' : 'Followers';
      const cells = [
        ['Likes',metrics.likes],
        ['Replies',metrics.replies],
        ['Clicks',metrics.clicks],
        ['Shares',metrics.shares],
        ['Reach',metrics.reach]
      ];
      return `<button class="platform-status-card" data-platform-detail="${esc(p)}" aria-label="${esc(names[p])}: ${esc(health.text)}. Open details below.">
        <span class="platform-status-top"><span class="platform-status-name">${esc(names[p])}</span><i class="gyr-light ${health.color}" aria-hidden="true"></i></span>
        <strong>${esc(health.label)} · ${esc(health.text)}</strong>
        <small>${esc(account)}</small>
        <span class="platform-audience-row"><span>${esc(audienceLabel)}</span><b>${esc(compactMetric(metrics.audience))}</b></span>
        <span class="platform-engagement-grid">${cells.map(([label,value]) => `<span class="platform-engagement-metric"><span>${esc(label)}</span><b>${esc(compactMetric(value))}</b></span>`).join('')}</span>
      </button>`;
    }).join('')}</div>
    
    ${selectedStatusPlatform ? (() => {
      const p = selectedStatusPlatform;
      const info = connection?.[p] || {};
      const health = connectionHealth(info);
      const metrics = platformMetricData(info,p);
      const audienceLabel = p === 'youtube' ? 'Subscribers' : 'Followers';
      const connectHref = p === 'facebook' || p === 'instagram' ? '/api/meta/connect' : p === 'x' ? '/api/x/connect' : '/api/youtube/connect';
      const connectLabel = p === 'facebook' || p === 'instagram' ? 'Connect / reconnect Facebook & Instagram' : 'Connect / reconnect ' + names[p];
      return `<div class="platform-inline-detail">
        <div class="platform-inline-detail-head">
          <div>
            <small>PLATFORM DRILL-DOWN</small>
            <h3>${esc(names[p])}</h3>
          </div>
          <div class="platform-inline-detail-actions">
            <i class="gyr-light ${health.color}" aria-hidden="true"></i>
            <button type="button" data-action="closePlatformDetail">Close</button>
          </div>
        </div>
        <div class="platform-inline-status"><strong>${esc(health.label)} · ${esc(health.text)}</strong><span>${esc(info.name || 'Account not verified')}</span></div>
        <div class="platform-inline-metrics">
          <div><span>${esc(audienceLabel)}</span><b>${esc(compactMetric(metrics.audience))}</b></div>
          <div><span>Likes</span><b>${esc(compactMetric(metrics.likes))}</b></div>
          <div><span>Replies</span><b>${esc(compactMetric(metrics.replies))}</b></div>
          <div><span>Clicks</span><b>${esc(compactMetric(metrics.clicks))}</b></div>
          <div><span>Shares</span><b>${esc(compactMetric(metrics.shares))}</b></div>
          <div><span>Reach / Views</span><b>${esc(compactMetric(metrics.reach))}</b></div>
        </div>
        <p>${esc(info.message || 'Connection and posting permissions checked.')}</p>
        <div class="platform-inline-links">
          <a class="button approve" href="${connectHref}">${esc(connectLabel)}</a>
          <button type="button" data-action="openFullPlatforms">Full platform settings</button>
        </div>
      </div>`;
    })() : ''}
    <small class="platform-analytics-note">A dash means that metric is not connected from that platform yet.</small>`;
}
async function refreshConnection() {
  try { connection = await api('status?refresh=1'); }
  catch (e) { connection = { facebook:{message:e.message}, instagram:{message:e.message}, scheduler:false }; }
  try { connection.x = await platformApi('x','status?refresh=1','X'); }
  catch (e) { connection.x = { connected:false, canPublish:false, message:e.message }; }
  try { connection.youtube = await platformApi('youtube','status?refresh=1','YouTube'); }
  catch (e) { connection.youtube = { connected:false, canPublish:false, message:e.message }; }
  renderConnectionStrip();
}
async function signedIn(s) {
  owner = s.user; csrf = s.csrf; $('loginDialog').close(); $('password').value = '';
  $('owner').textContent = owner.toUpperCase(); $('identity').textContent = 'Owner · Signed in'; $('live').textContent = '● Owner access'; $('logout').hidden = false;
  await api('records', { action:'initialize' }); await loadRecords(); await refreshConnection(); render();
  const params = new URLSearchParams(location.search);
  const result = params.get('connection');
  const xresult = params.get('xconnection');
  const youtubeResult = params.get('youtubeconnection');
  if (result || xresult || youtubeResult) {
    if (youtubeResult) notice(youtubeResult === 'saved' ? 'YouTube authorization saved. Check the channel status below.' : 'YouTube connection was cancelled.');
    else if (xresult) notice(xresult === 'saved' ? 'X authorization saved. Check the account status below.' : 'X connection was cancelled.');
    else notice(result === 'saved' ? 'Facebook authorization saved. Check each account’s status below.' : 'Facebook connection was cancelled.');
    history.replaceState({},'',location.pathname);
    setView('Platforms');
  }
}
function badge(status) { return `<span class="status state-${esc(status)}">${esc(labels[status] || status)}</span>`; }
function rowsHtml(list) {
  if (!list.length) return '<div class="empty"><h3>No posts here yet.</h3><p>Use New post to start one.</p></div>';
  return '<div class="table-wrap"><table><thead><tr><th>Photo</th><th>Post</th><th>Platforms</th><th>Status</th><th>Posting time</th><th></th></tr></thead><tbody>' + list.map(r => `<tr><td>${r.imageUrl ? `<img class="row-photo" src="${esc(r.imageUrl)}" alt="">` : '<span class="thumb">PHOTO</span>'}</td><td><small class="id">${esc(code(r))}</small><strong>${esc(r.title)}</strong></td><td>${r.targets.map(t => esc(names[t])).join('<br>') || 'Choose platforms'}</td><td>${badge(r.status)}</td><td>${esc(date(r.scheduledAt))}</td><td><button data-open="${esc(r.id)}" aria-label="Open ${esc(r.title)}">Open ›</button></td></tr>`).join('') + '</tbody></table></div>';
}
function attention(r) { return ['failed','partial','uncertain','queueing','processing','publishing'].includes(r.status); }
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
  const platformCounts = Object.fromEntries(['facebook','instagram','x','youtube','website'].map(p=>[p,commentStream.filter(c=>c.platform===p).length]));
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
          <button class="approve" data-action="replyComment" data-comment-platform="${esc(c.platform)}" data-comment-id="${esc(c.id)}" data-comment-parent="${esc(c.parentId || c.id)}">Reply</button>
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
function renderMediaInbox() {
  const campaignOptions = campaigns.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  const cards = mediaInbox.length ? mediaInbox.map((item,index) => `
    <article class="inbox-card" data-inbox-card="${esc(item.id)}">
      <div class="inbox-image"><img src="${esc(item.imageUrl)}" alt=""></div>
      <div class="inbox-fields">
        <label class="check inbox-use"><input class="inbox-check" type="checkbox" data-inbox-id="${esc(item.id)}" checked> Use this picture</label>
        <label>Campaign<select data-inbox-campaign="${esc(item.id)}">${campaignOptions}</select></label>
        <label>Post title<input data-inbox-title="${esc(item.id)}" maxlength="120" value="${esc(item.filename.replace(/\.[^.]+$/,''))}"></label>
        <label>Caption<textarea data-inbox-caption="${esc(item.id)}" rows="5" maxlength="10000" placeholder="What do you want people to hear?"></textarea></label>
        <label>Link <small>(optional)</small><input data-inbox-link="${esc(item.id)}" type="url" placeholder="https://docjaks.com"></label>
        <fieldset><legend>Prepare for</legend>
          <label class="check"><input type="checkbox" data-inbox-platform="${esc(item.id)}" value="facebook" checked> Facebook</label>
          <label class="check"><input type="checkbox" data-inbox-platform="${esc(item.id)}" value="instagram" checked> Instagram</label>
          <label class="check"><input type="checkbox" data-inbox-platform="${esc(item.id)}" value="x" checked> X</label>
          <label class="check"><input type="checkbox" data-inbox-platform="${esc(item.id)}" value="youtube"> YouTube</label>
        </fieldset>
        <div class="inbox-actions"><button data-action="removeInbox" data-inbox-id="${esc(item.id)}">Remove</button></div>
      </div>
    </article>`).join('') : '<div class="empty"><h3>Your Media Inbox is empty.</h3><p>Drop in a whole campaign of pictures at once. Fill out the information whenever you are ready.</p></div>';
  $('content').innerHTML = `
    <div class="box inbox-toolbar">
      <div><strong>Media Inbox / Batch Upload</strong><p>Load all your campaign pictures first. Assign campaign, title, caption, link and platforms afterward.</p></div>
      <label class="upload-button inbox-upload">Load pictures<input id="batchImageFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
      <button class="approve" data-action="createInboxDrafts">Create drafts from selected</button>
      <span id="inboxCount">${mediaInbox.length} picture${mediaInbox.length===1?'':'s'} waiting</span>
    </div>
    <div id="mediaDropZone" class="drop-zone"><strong>Drag & drop pictures here</strong><span>JPG, PNG or WebP · multiple files welcome</span></div>
    <div class="inbox-grid">${cards}</div>`;
  $('batchImageFiles')?.addEventListener('change', e => {
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
function render() {
  $('workspace').hidden = false; $('editor').hidden = true; selected = null; dirty = false;
  $('viewTitle').textContent = activeView;
  document.querySelectorAll('nav [data-view]').forEach(b => b.classList.toggle('active',b.dataset.view === activeView));
  $('campaignCards').hidden = !['Campaigns','Mission Control'].includes(activeView);
  $('campaignCards').innerHTML = campaigns.map(c => {
    const list = records.filter(r => r.campaign === c.id), needs = list.filter(attention).length;
    return `<button class="card ${campaignFilter === c.id ? 'selected-card':''}" data-campaign="${esc(c.id)}"><i class="light ${needs ? 'red' : list.some(r => r.status === 'published') ? 'green' : 'neutral'}"></i><span class="id">${esc(c.id)}</span><h3>${esc(c.title)}</h3><small>${list.length} posts${needs ? ' · ' + needs + ' need attention' : ''}</small></button>`;
  }).join('');
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
    $('content').innerHTML = `<div class="platforms connection-panels">${statusPlatforms.map(p => {
      const n = names[p], info = connection?.[p] || {}, health = connectionHealth(info);
      return `<div class="box platform-detail"><div class="platform-detail-head"><h2>${esc(n)}</h2><i class="gyr-light ${health.color}" aria-hidden="true"></i></div><p><strong>${esc(health.label)} · ${esc(health.text)}</strong></p><p>${esc(info.name || 'Account not verified')}</p><p>${esc(info.message || 'Connection and posting permissions checked.')}</p></div>`;
    }).join('')}</div><div class="box connection-actions"><a class="button approve" href="/api/meta/connect">Connect / reconnect Facebook & Instagram</a><button data-action="checkConnection">Check connections</button><p>Choose the Doc Jaks Facebook Page and its linked professional Instagram account when Meta asks.</p><p>Scheduling: ${connection?.scheduler ? 'Configured · confirmed separately when you schedule a post.' : 'One-time scheduler setup still needed.'}</p><a class="button approve" href="/api/x/connect">Connect / reconnect X</a><p>Connect the Doc Jaks X account and approve read/write access when X asks.</p><a class="button approve" href="/api/youtube/connect">Connect / reconnect YouTube</a><p>Connect the Doc Jaks YouTube channel now so it is ready when video publishing begins.</p></div>`;
    return;
  }
  if (activeView === 'Batch Schedule') {
    renderBatchSchedule();
    return;
  }
  if (activeView === 'Analytics') {
    const count = p => records.filter(r => r.results?.[p]?.status === 'published').length;
    $('content').innerHTML = `<div class="cards"><div class="card"><h3>Facebook posts</h3><strong class="metric">${count('facebook')}</strong></div><div class="card"><h3>Instagram posts</h3><strong class="metric">${count('instagram')}</strong></div><div class="card"><h3>Scheduled</h3><strong class="metric">${records.filter(r => r.status === 'scheduled').length}</strong></div><div class="card"><h3>Needs attention</h3><strong class="metric">${records.filter(attention).length}</strong></div></div><p>Confirmed activity from this Command Center. Reach, likes, and audience analytics are not connected yet.</p>`;
    return;
  }
  let list = records.filter(r => !campaignFilter || r.campaign === campaignFilter);
  if (activeView === 'Calendar') list = records.filter(r => r.status === 'scheduled').sort((a,b) => Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt));
  if (activeView === 'Approvals') list = records.filter(r => ['draft','approved'].includes(r.status));
  if (activeView === 'Needs Attention') list = records.filter(attention);
  if (searchTerm) list = list.filter(r => (r.title + ' ' + r.caption).toLowerCase().includes(searchTerm.toLowerCase()));
  $('content').innerHTML = `<div class="filterbar"><label>Find a post<input id="searchPosts" type="search" value="${esc(searchTerm)}" placeholder="Title or caption"></label>${campaignFilter ? '<button data-action="allCampaigns">Show all campaigns</button>':''}<span>${list.length} posts</span></div>` + rowsHtml(list);
}
function setView(view) { if (dirty && !confirm('Leave without saving your changes?')) return; activeView = view; campaignFilter = ''; searchTerm = ''; render(); }
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
  ['pauseButton','draftButton'].forEach(x => $(x).disabled = busy || dirty || ['publishing','published','partial','uncertain'].includes(r.status));
  $('savedState').textContent = dirty ? 'Unsaved changes — save the draft before approving or posting.' : 'Saved ' + date(r.updatedAt);
  $('scheduleNote').textContent = r.status === 'scheduled' ? 'Scheduled for ' + date(r.scheduledAt) + '. Delivery continues when this browser is closed.' : connection?.scheduler ? 'Approve the saved post, then choose a time from two minutes to seven days ahead. Delivery can be delayed by the platforms.' : 'Scheduling is disabled until its one-time server setup is finished.';
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
  $('results').innerHTML = Object.entries(r.results || {}).map(([p,v]) => `<div class="result-item"><strong>${esc(names[p])}: ${esc(labels[v.status] || v.status)}</strong>${v.postId ? `<p>Post ID: ${esc(v.postId)}</p>`:''}${v.error ? `<p>${esc(v.error)}</p>`:''}${v.note ? `<p>${esc(v.note)}</p>`:''}${['sending','uncertain'].includes(v.status) ? `<button data-resolve="${p}" data-outcome="posted">I found the post</button><button data-resolve="${p}" data-outcome="not-posted">I checked: it did not post</button>`:''}</div>`).join('');
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
  if (b.dataset.metricRange) { platformMetricRange = b.dataset.metricRange; renderConnectionStrip(); return; }
  if (b.dataset.platformDetail) { selectedStatusPlatform = selectedStatusPlatform === b.dataset.platformDetail ? null : b.dataset.platformDetail; renderConnectionStrip(); return; }
  if (b.dataset.view) return setView(b.dataset.view);
  if (b.dataset.open) return openRecord(records.find(r => r.id === b.dataset.open));
  if (b.dataset.campaign) { campaignFilter = campaignFilter === b.dataset.campaign ? '' : b.dataset.campaign; return render(); }
  if (b.dataset.resolve) return perform(async () => {
    const extra = { platform:b.dataset.resolve, outcome:b.dataset.outcome };
    if (extra.outcome === 'posted') { extra.postId = prompt('Enter the post ID from the account:'); if (!extra.postId) return; }
    else { extra.confirmed = confirm('Have you checked the live account and confirmed that this post was NOT published?'); if (!extra.confirmed) return; }
    await recordAction('resolve',extra);
  });
  if (b.dataset.commentPlatformFilter) { commentPlatformFilter=b.dataset.commentPlatformFilter; renderComments(); return; }
  if (b.dataset.commentStatusFilter) { commentStatusFilter=b.dataset.commentStatusFilter; renderComments(); return; }
  const action = b.dataset.action; if (!action) return;
  if (action === 'closePlatformDetail') { selectedStatusPlatform = null; renderConnectionStrip(); return; }
  if (action === 'openFullPlatforms') { selectedStatusPlatform = null; setView('Platforms'); return; }
  if (action === 'back') { if (!dirty || confirm('Leave without saving your changes?')) render(); return; }
  if (action === 'allCampaigns') { campaignFilter=''; return render(); }
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
  if (action === 'removeInbox') {
    const itemId=b.dataset.inboxId;
    if (!confirm('Remove this picture from Media Inbox?')) return;
    return perform(async()=> {
      await api('records',{action:'mediaInboxDelete',itemId});
      mediaInbox=mediaInbox.filter(x=>x.id!==itemId);
      renderMediaInbox();
      notice('Picture removed from Media Inbox.');
    });
  }
  if (action === 'createInboxDrafts') {
    return perform(async()=> {
      const selectedIds=[...document.querySelectorAll('.inbox-check:checked')].map(x=>x.dataset.inboxId);
      if(!selectedIds.length) throw new Error('Select at least one picture.');
      if(!confirm('Create ' + selectedIds.length + ' draft post' + (selectedIds.length===1?'':'s') + ' from these pictures?')) return;
      let done=0;
      for(const itemId of selectedIds) {
        notice('Building draft ' + (done+1) + ' of ' + selectedIds.length + ' and formatting its platform images…');
        const record=await buildInboxDraft(itemId);
        updateRecord(record);
        mediaInbox=mediaInbox.filter(x=>x.id!==itemId);
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
    else if (action === 'refresh') { await loadRecords(); await refreshConnection(); render(); notice('Updated.'); }
    else if (action === 'refreshRecord') { if (dirty && !confirm('Refresh and discard unsaved changes?')) return; const currentId=selected.id; await loadRecords(); openRecord(records.find(r=>r.id===currentId)); notice('Showing the latest saved result.'); }
    else if (action === 'checkConnection') { await refreshConnection(); render(); notice('Account checks completed.'); }
    else if (action === 'publish') await publish();
    else if (action === 'schedule') { const at=$('scheduleTime').value; if(!at) throw new Error('Choose a posting date and time.'); await recordAction('schedule',{scheduledAt:new Date(at).toISOString(),timeZone:timezone}); }
    else if (['approve','pause','draft','duplicate'].includes(action)) await recordAction(action);
  });
});
document.addEventListener('input', event => {
  if (event.target.id === 'searchPosts') { const position=event.target.selectionStart; searchTerm=event.target.value; render(); $('searchPosts').focus(); try{$('searchPosts').setSelectionRange(position,position);}catch{} return; }
  if (event.target.closest('#editForm')) { dirty=true; updatePreview(); buttons(); }
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
