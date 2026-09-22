'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube' };
const labels = { draft:'Draft', approved:'Approved', scheduled:'Scheduled', queueing:'Confirming schedule', paused:'Paused', publishing:'Publishing', published:'Published', failed:'Needs attention', partial:'Partly published', uncertain:'Check result', processing:'Preparing photo', prepared:'Prepared' };
let records = [], campaigns = [], csrf = '', selected = null, connection = null, dirty = false, busy = false, activeView = 'Campaigns', campaignFilter = '', searchTerm = '', owner = '';
let pollTimer;
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
async function platformApi(prefix, path, label) {
  const response = await fetch('/api/' + prefix + '/' + path, { credentials:'same-origin', signal:AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || label + ' could not be checked.');
  return data;
}
async function refreshConnection() {
  try { connection = await api('status?refresh=1'); }
  catch (e) { connection = { facebook:{message:e.message}, instagram:{message:e.message}, scheduler:false }; }
  try { connection.x = await platformApi('x','status?refresh=1','X'); }
  catch (e) { connection.x = { connected:false, canPublish:false, message:e.message }; }
  try { connection.youtube = await platformApi('youtube','status?refresh=1','YouTube'); }
  catch (e) { connection.youtube = { connected:false, canPublish:false, message:e.message }; }
  const strip = $('connectionStrip'); strip.hidden = false;
  strip.innerHTML = Object.entries(names).map(([p,n]) => `<span><i class="dot ${connection[p]?.canPublish ? 'green' : 'red'}"></i>${n}: ${esc(connection[p]?.name || (connection[p]?.connected ? 'Check permissions' : 'Needs connection'))}</span>`).join('') + '<button data-view="Platforms">Manage connections</button>';
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
function render() {
  $('workspace').hidden = false; $('editor').hidden = true; selected = null; dirty = false;
  $('viewTitle').textContent = activeView;
  document.querySelectorAll('nav [data-view]').forEach(b => b.classList.toggle('active',b.dataset.view === activeView));
  $('campaignCards').hidden = !['Campaigns','Mission Control'].includes(activeView);
  $('campaignCards').innerHTML = campaigns.map(c => {
    const list = records.filter(r => r.campaign === c.id), needs = list.filter(attention).length;
    return `<button class="card ${campaignFilter === c.id ? 'selected-card':''}" data-campaign="${esc(c.id)}"><i class="light ${needs ? 'red' : list.some(r => r.status === 'published') ? 'green' : 'neutral'}"></i><span class="id">${esc(c.id)}</span><h3>${esc(c.title)}</h3><small>${list.length} posts${needs ? ' · ' + needs + ' need attention' : ''}</small></button>`;
  }).join('');
  if (activeView === 'Platforms') {
    $('content').innerHTML = `<div class="platforms connection-panels">${Object.entries(names).map(([p,n]) => `<div class="box"><h2>${n}</h2><p><i class="dot ${connection?.[p]?.canPublish ? 'green':'red'}"></i>${esc(connection?.[p]?.name || 'Account not verified')}</p><p>${esc(connection?.[p]?.message || 'Check the account connection.')}</p></div>`).join('')}</div><div class="box connection-actions"><a class="button approve" href="/api/meta/connect">Connect / reconnect Facebook & Instagram</a><button data-action="checkConnection">Check connections</button><p>Choose the Doc Jaks Facebook Page and its linked professional Instagram account when Meta asks.</p><p>Scheduling: ${connection?.scheduler ? 'Configured · confirmed separately when you schedule a post.' : 'One-time scheduler setup still needed.'}</p><a class="button approve" href="/api/x/connect">Connect / reconnect X</a><p>Connect the Doc Jaks X account and approve read/write access when X asks.</p><a class="button approve" href="/api/youtube/connect">Connect / reconnect YouTube</a><p>Connect the Doc Jaks YouTube channel now so it is ready when video publishing begins.</p></div>`;
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
  if (b.dataset.view) return setView(b.dataset.view);
  if (b.dataset.open) return openRecord(records.find(r => r.id === b.dataset.open));
  if (b.dataset.campaign) { campaignFilter = campaignFilter === b.dataset.campaign ? '' : b.dataset.campaign; return render(); }
  if (b.dataset.resolve) return perform(async () => {
    const extra = { platform:b.dataset.resolve, outcome:b.dataset.outcome };
    if (extra.outcome === 'posted') { extra.postId = prompt('Enter the post ID from the account:'); if (!extra.postId) return; }
    else { extra.confirmed = confirm('Have you checked the live account and confirmed that this post was NOT published?'); if (!extra.confirmed) return; }
    await recordAction('resolve',extra);
  });
  const action = b.dataset.action; if (!action) return;
  if (action === 'back') { if (!dirty || confirm('Leave without saving your changes?')) render(); return; }
  if (action === 'allCampaigns') { campaignFilter=''; return render(); }
  if (action === 'removeImage') { if ($('imageFile').disabled) return; selected.imageId=null; selected.imageUrl=null; selected.imageVariantIds={}; selected.imageVariants={}; dirty=true; updatePreview(); buttons(); return; }
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
