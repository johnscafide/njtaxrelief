(function(){
  'use strict';
  var rows=[], current=null, client=null;
  function q(id){return document.getElementById(id)}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function prettyDate(value){if(!value)return'';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch(_){return value}}
  function status(message,error){var node=q('comm-status');if(!node)return;node.textContent=message||'';node.className='status'+(error?' error':'')}
  async function requireDeveloper(){
    if(!window.NJPTRSupabaseRuntime)throw new Error('Watchdog runtime unavailable.');
    client=window.NJPTRSupabaseRuntime.createClient();
    var sessionResult=await client.auth.getSession();
    var session=sessionResult.data&&sessionResult.data.session;
    if(!session){if(window.WatchdogAuth)window.WatchdogAuth.openSignIn(location.pathname+location.search);throw new Error('Sign in required.');}
    var check=await client.rpc('is_watchdog_developer');
    if(check.error||check.data!==true)throw new Error('Developer authorization is required.');
    document.documentElement.classList.remove('access-pending');
  }
  async function load(){
    status('Loading communications…');
    var result=await client.from('watchdog_contact_inbox').select('id,kind,channel,status,name,email,phone,subject,message,voice_bucket,voice_path,voice_mime_type,voice_duration_seconds,voice_size_bytes,source_path,referrer,created_at,updated_at,read_at,archived_at').neq('status','pending_upload').order('created_at',{ascending:false}).limit(250);
    if(result.error)throw result.error;
    rows=result.data||[];
    render();
    status(rows.length?rows.length+' communication'+(rows.length===1?'':'s')+' loaded.':'No communications yet.');
  }
  function filtered(){
    var state=q('status-filter').value,kind=q('kind-filter').value,term=String(q('comm-search').value||'').trim().toLowerCase();
    return rows.filter(function(row){
      if(state==='new'&&row.status!=='new')return false;
      if(state==='archived'&&row.status!=='archived')return false;
      if(state==='active'&&row.status==='archived')return false;
      if(kind!=='all'&&row.kind!==kind)return false;
      if(term){var hay=[row.name,row.email,row.phone,row.subject,row.message,row.source_path].join(' ').toLowerCase();if(hay.indexOf(term)===-1)return false;}
      return true;
    });
  }
  function render(){
    var list=q('comm-list'),data=filtered();
    q('comm-count').textContent=String(data.length);
    if(!data.length){list.innerHTML='<div class="empty">No communications match this view.</div>';return;}
    list.innerHTML=data.map(function(row){var title=row.subject|| (row.kind==='voice'?'Voice message':'Website message');var preview=row.kind==='voice'?(row.voice_duration_seconds||0)+' sec private recording':String(row.message||'').slice(0,105);return '<button class="message-row'+(row.status==='new'?' unread':'')+'" type="button" data-id="'+esc(row.id)+'"><span class="row-icon"><i class="fas '+(row.kind==='voice'?'fa-microphone':'fa-message')+'"></i></span><span class="row-main"><span class="row-top"><b>'+esc(row.name)+'</b><time>'+esc(prettyDate(row.created_at))+'</time></span><span class="row-subject">'+esc(title)+'</span><span class="row-preview">'+esc(preview)+'</span></span><span class="row-status '+esc(row.status)+'">'+esc(row.status)+'</span></button>'}).join('');
    list.querySelectorAll('[data-id]').forEach(function(button){button.addEventListener('click',function(){openRow(button.getAttribute('data-id'))})});
  }
  async function openRow(id){
    current=rows.find(function(row){return row.id===id})||null;if(!current)return;
    q('detail').hidden=false;
    q('detail-kind').textContent=current.kind==='voice'?'Private voice message':'Website message';
    q('detail-name').textContent=current.name||'';
    q('detail-date').textContent=prettyDate(current.created_at);
    q('detail-email').textContent=current.email||'';q('detail-email').href='mailto:'+current.email;
    var phone=q('detail-phone');phone.textContent=current.phone||'Not provided';phone.href=current.phone?'tel:'+current.phone:'#';phone.classList.toggle('disabled',!current.phone);
    q('detail-subject').textContent=current.subject||'No subject';
    q('detail-source').textContent=current.source_path||'Unknown page';
    q('detail-message').textContent=current.message||'';q('detail-message-wrap').hidden=current.kind!=='message';
    q('detail-audio-wrap').hidden=current.kind!=='voice';q('detail-audio').removeAttribute('src');
    q('archive-btn').textContent=current.status==='archived'?'Restore to inbox':'Archive';
    q('archive-btn').innerHTML='<i class="fas '+(current.status==='archived'?'fa-inbox':'fa-box-archive')+'"></i> '+(current.status==='archived'?'Restore to inbox':'Archive');
    if(current.status==='new'){
      var now=new Date().toISOString();var updated=await client.from('watchdog_contact_inbox').update({status:'read',read_at:now,updated_at:now}).eq('id',current.id);
      if(!updated.error){current.status='read';render();}
    }
    if(current.kind==='voice')await loadAudio();
  }
  async function loadAudio(){
    var note=q('audio-status');note.textContent='Creating a private 10-minute playback link…';
    var signed=await client.storage.from(current.voice_bucket||'watchdog-voice-inbox').createSignedUrl(current.voice_path,600);
    if(signed.error||!signed.data||!signed.data.signedUrl){note.textContent='Private playback could not be opened.';return;}
    q('detail-audio').src=signed.data.signedUrl;note.textContent=(current.voice_duration_seconds||0)+' seconds · link expires in 10 minutes';
  }
  async function toggleArchive(){
    if(!current)return;var restore=current.status==='archived',now=new Date().toISOString();
    var patch=restore?{status:'new',archived_at:null,updated_at:now}:{status:'archived',archived_at:now,updated_at:now};
    var result=await client.from('watchdog_contact_inbox').update(patch).eq('id',current.id);if(result.error){status(result.error.message,true);return;}
    current.status=patch.status;current.archived_at=patch.archived_at;render();openRow(current.id);status(restore?'Communication restored.':'Communication archived.');
  }
  document.addEventListener('DOMContentLoaded',async function(){
    try{await requireDeveloper();await load()}catch(error){document.documentElement.classList.remove('access-pending');status(error.message||'Developer inbox unavailable.',true);q('comm-list').innerHTML='<div class="empty">Developer access is required.</div>'}
    ['status-filter','kind-filter'].forEach(function(id){q(id).addEventListener('change',render)});q('comm-search').addEventListener('input',render);q('refresh-btn').addEventListener('click',function(){load().catch(function(e){status(e.message,true)})});q('archive-btn').addEventListener('click',toggleArchive);q('detail-close').addEventListener('click',function(){q('detail').hidden=true;current=null});
  });
})();
