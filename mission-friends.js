/* DOC JAKS Friends & Supporters. Owner-only management and actual tagged
   Wix website visits. No inferred Facebook post reach or sales. */
(function friendsModule(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const valid=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const count=v=>valid(v)?v.toLocaleString('en-US'):'N/A';
const cache=new Map(),requests=new Map();
const TTL=120000;
let busy=false;
function key(period){return period?.query||'';}
function ready(period){const entry=cache.get(key(period));
  return entry?.expires>Date.now()?entry.data:null;
}
const announce=(value,failed=false)=>{if(typeof notice==='function')notice(value,failed);};
async function load(period,force=false){
  const id=key(period);
  if(!id||typeof api!=='function')return null;
  const saved=ready(period);
  if(!force&&saved)return saved;
  if(requests.has(id))return requests.get(id);
  const promise=(async()=>{
    try{
      const data=await api('friend-supporters?'+id);
      if(!data?.range||data.range.start!==period.start||
        data.range.end!==period.end||!Array.isArray(data.rows))
        throw new Error('Supporter report returned unmatched dates.');
      cache.set(id,{expires:Date.now()+TTL,data});
      return data;
    }catch(error){
      const fallback=cache.get(id)?.data||{
        status:'unavailable',rows:[],error:String(error?.message||'Supporter report unavailable.'),
        note:'Wix supporter visit figures could not be verified.'
      };
      cache.set(id,{expires:Date.now()+TTL,data:fallback});
      return fallback;
    }finally{
      requests.delete(id);
      if(typeof activeView!=='undefined'&&activeView==='Mission Control'&&
        typeof window.renderConnectionStrip==='function')window.renderConnectionStrip();
    }
  })();
  requests.set(id,promise);
  return promise;
}
async function refresh(){
  const period=typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
  if(!period)return;
  cache.delete(key(period));
  return load(period,true);
}
function trend(last,now){
  if(!valid(last)||!valid(now))return {text:'N/A',tone:'na'};
  if(last===now)return {text:'→ 0%',tone:'hold'};
  if(last===0)return {text:'↑ NEW',tone:'up'};
  const change=(now-last)/last*100;
  return {text:(change>0?'↑ +':'↓ ')+change.toFixed(1)+'%',
    tone:change>0?'up':'down'};
}
function person(r){
  const posted=Boolean(r.postedAt);
  const delta=trend(r.lastVisits,r.visits);
  return '<div class="mj-friend-entry">'+
    '<div class="mj-friend-heading"><strong>'+esc(r.name)+'</strong>'+
      '<small>'+esc(posted?'POSTED':'READY TO SHARE')+'</small></div>'+
    '<label class="mj-friend-link-label">TRACKING LINK'+
      '<input type="text" class="mj-friend-link" readonly'+
      ' aria-label="Tracking link for '+esc(r.name)+'" value="'+esc(r.link)+'"></label>'+
    '<div class="mj-friend-actions">'+
      '<button type="button" data-friend-copy="'+esc(r.slug)+'">COPY LINK</button>'+
      '<button type="button" data-friend-post="'+esc(r.slug)+'">'+
        (posted?'MARK NOT POSTED':'MARK POSTED')+'</button></div>'+
    '<div class="mj-friend-metrics">'+
      '<div class="mj-friend-primary"><small>WEBSITE VISITS</small>'+
        '<b>'+count(r.visits)+'</b><span>LAST '+count(r.lastVisits)+'</span>'+
        '<strong class="mj-friend-trend '+delta.tone+'">'+esc(delta.text)+'</strong></div>'+
      '<div><small>VISITORS</small><b>'+count(r.visitors)+'</b></div>'+
      '<div><small>PAGE VIEWS</small><b>'+count(r.pageViews)+'</b></div></div>'+
    (!posted?'<p class="mj-friend-hint">Not posted yet. Visit figures remain N/A.</p>':'')+
  '</div>';
}
function panel(period){
  const id=key(period);
  if(!id||typeof owner==='undefined'||!owner)return '';
  let report=ready(period);
  if(!report&&!requests.has(id))void load(period);
  report ||= cache.get(id)?.data||null;
  const rows=Array.isArray(report?.rows)?report.rows:[];
  const posted=rows.filter(x=>x.postedAt).length;
  const list=rows.slice().sort((a,b)=>{
    if(valid(a.visits)&&valid(b.visits)&&a.visits!==b.visits)return b.visits-a.visits;
    return a.name.localeCompare(b.name);
  });
  const total=posted&&report?.status==='reported'?
    count(report.measuredTaggedVisits)+' tagged visits':'N/A';
  const summary=!report?'LOADING':
    posted+' posted · '+(rows.length-posted)+' ready';
  return '<details class="mj-stage-dropdown mj-friend-supporters" data-mj-dropdown="friend-supporters">'+
    '<summary><span>FRIENDS &amp; SUPPORTERS</span><b>'+
      esc(summary)+' <i aria-hidden="true">▾</i></b></summary>'+
    '<div class="mj-friend-supporter-inner">'+
      '<p class="mj-friend-intro">Each friend gets their OWN Doc Jaks Facebook-post link. '+ 
        'Tagged visits are already included in #3 Website Visits, never added again.</p>'+
      '<div class="mj-friend-total"><strong>'+esc(total)+'</strong>'+
        '<small>Wix Analytics · selected dates · not Facebook post views</small></div>'+
      (report?.status==='unavailable'?'<p class="mj-friend-warning">'+
        esc(report.error||'Wix campaign reporting is unavailable. N/A until verified.')+'</p>':'')+
      (list.length?'<div class="mj-friend-entries">'+list.map(person).join('')+'</div>':
        '<p class="mj-dropdown-empty">'+(report?'No registered supporters.':'Loading real supporter records…')+'</p>')+
      '<form id="mjFriendAdd" class="mj-friend-form">'+
        '<label>ADD ANOTHER FRIEND'+
        '<input name="friendName" type="text" required minlength="2" maxlength="70"'+
          ' autocomplete="off" placeholder="Friend’s name"></label>'+
        '<button type="submit"'+(busy?' disabled':'')+'>CREATE THEIR LINK</button>'+
      '</form>'+
      '<button type="button" class="mj-friend-refresh" data-friend-refresh="1"'+
        (busy?' disabled':'')+'>CHECK NEW WEBSITE VISITS ↻</button>'+
      '<p class="mj-friend-note">Source: real Wix traffic with each supporter’s UTM campaign ID. '+
        'Reporting may be delayed. A tagged session is not a confirmed sale. '+
        'Friends’ personal Facebook reach, likes and shares are not automatically accessible.</p>'+
    '</div></details>';
}
window.djomsSupporterPanel=panel;
document.addEventListener('submit',async event=>{
  const form=event.target.closest?.('#mjFriendAdd');
  if(!form)return;
  event.preventDefault();
  if(busy)return;
  const name=String(form.elements.namedItem('friendName')?.value||'').trim();
  if(name.length<2){announce('Enter a friend’s name.',true);return;}
  busy=true;const button=form.querySelector('[type=submit]');
  if(button)button.disabled=true;
  try{
    const result=await api('friend-supporters',{name});
    if(!result?.saved||!result.friend?.link)throw Error('Link creation not verified.');
    announce('Link created for '+result.friend.name+'. Open Friends & Supporters to copy it.');
    await refresh();
  }catch(error){announce(error.message||'Could not create the link.',true);}
  finally{busy=false;if(button)button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-friend-copy],[data-friend-post],[data-friend-refresh]');
  if(!button||busy)return;
  if(button.dataset.friendRefresh!==undefined){
    busy=true;button.disabled=true;
    try{await refresh();announce('Supporter traffic checked for the reporting period.');}
    catch(error){announce(error?.message||'Could not refresh.',true);}
    finally{busy=false;button.disabled=false;}
    return;
  }
  const period=typeof websiteReportPeriod==='function'?websiteReportPeriod():null;
  const slug=button.dataset.friendCopy||button.dataset.friendPost;
  const friend=ready(period)?.rows?.find(x=>x.slug===slug);
  if(!friend){announce('Refresh the supporter list to continue.',true);return;}
  if(button.dataset.friendCopy){
    try{
      if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(friend.link);
      announce('Copied '+friend.name+'’s full tracked Doc Jaks link.');
    }catch{
      button.closest('.mj-friend-entry')?.querySelector('.mj-friend-link')?.select();
      announce('Copy the selected link including ALL the tracking tags.');
    }
    return;
  }
  busy=true;button.disabled=true;
  const posting=!friend.postedAt;
  try{
    await api('friend-supporters',{slug:friend.slug,posted:posting},'PATCH');
    announce(friend.name+(posting?' marked as posted. Wix can now report tagged visits.':' marked as not posted.'));
    await refresh();
  }catch(error){announce(error.message||'Could not change posted status.',true);}
  finally{busy=false;button.disabled=false;}
});
})();
