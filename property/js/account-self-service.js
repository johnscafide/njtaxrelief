(function () {
  'use strict';

  if (!window.NJPTRSupabaseRuntime) return;
  var client = window.NJPTRSupabaseRuntime.createClient();
  var currentUser = null;
  var currentPlan = 'standard';
  var connectionBusy = false;
  var AVATAR_BUCKET = 'profile-avatars';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function paidProfessional() { return ['agent','pro','pro_plus','teams','developer'].indexOf(currentPlan) >= 0; }
  function note(id, text, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'ac-self-note' + (type ? ' ' + type : '');
  }
  async function invoke(functionName, body) {
    var result = await client.functions.invoke(functionName, { body:body || {} });
    if (result.error) {
      var message = result.error.message || 'Request failed';
      if (result.error.context && typeof result.error.context.json === 'function') {
        try { var payload = await result.error.context.json(); if (payload && payload.error) message = payload.error; } catch (_error) {}
      }
      throw new Error(message);
    }
    return result.data || {};
  }
  function renderAvatarControls() {
    var hero = document.querySelector('.ac-profile-hero');
    if (!hero || !currentUser || hero.querySelector('.ac-avatar-tools')) return;
    var wrap = hero.querySelector('.ac-avatar-wrap') || hero.querySelector('.ac-avatar');
    if (!wrap) return;
    var tools = document.createElement('div');
    tools.className = 'ac-avatar-tools';
    tools.innerHTML = '<input id="ac-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" id="ac-avatar-change"><i class="fas fa-camera"></i> Change photo</button><button type="button" class="ghost" id="ac-avatar-remove"><i class="fas fa-trash"></i> Remove</button><small id="ac-avatar-note" aria-live="polite"></small>';
    wrap.insertAdjacentElement('afterend', tools);
    var edit = document.getElementById('ac-avatar-edit');
    var change = document.getElementById('ac-avatar-change');
    var input = document.getElementById('ac-avatar-file');
    if (edit) edit.addEventListener('click', function () { input.click(); });
    if (change) change.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', uploadAvatar);
    document.getElementById('ac-avatar-remove').addEventListener('click', removeAvatar);
  }
  function avatarExt(type) { return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'; }
  async function uploadAvatar(event) {
    var file = event.target.files && event.target.files[0];
    var noteEl = document.getElementById('ac-avatar-note');
    if (!file || !currentUser) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      if (noteEl) noteEl.textContent = 'Use a JPG, PNG or WebP image up to 5 MB.';
      return;
    }
    if (noteEl) noteEl.textContent = 'Uploading…';
    var metadata = currentUser.user_metadata || {};
    var oldPath = metadata.watchdog_avatar_path || '';
    var path = 'user/' + currentUser.id + '/avatar.' + avatarExt(file.type);
    try {
      if (oldPath && oldPath !== path) await client.storage.from(AVATAR_BUCKET).remove([oldPath]);
      var upload = await client.storage.from(AVATAR_BUCKET).upload(path, file, { upsert:true, cacheControl:'3600', contentType:file.type });
      if (upload.error) throw upload.error;
      var publicData = client.storage.from(AVATAR_BUCKET).getPublicUrl(path).data;
      var publicUrl = publicData && publicData.publicUrl ? publicData.publicUrl + '?v=' + Date.now() : '';
      if (!publicUrl) throw new Error('Profile photo URL could not be created');
      var updated = await client.auth.updateUser({ data:{ avatar_url:publicUrl, watchdog_avatar_path:path } });
      if (updated.error) throw updated.error;
      currentUser = updated.data.user || currentUser;
      await client.from('profiles').update({ avatar_url:publicUrl }).eq('id', currentUser.id).then(function () {});
      var avatar = document.getElementById('ac-profile-avatar');
      if (avatar) avatar.innerHTML = '<img src="' + esc(publicUrl) + '" alt="Profile photo">';
      var shellAvatar = document.getElementById('wdx-avatar');
      if (shellAvatar) {
        if (shellAvatar.tagName === 'IMG') shellAvatar.src = publicUrl;
        else shellAvatar.outerHTML = '<img id="wdx-avatar" class="wdx-avatar" src="' + esc(publicUrl) + '" alt="">';
      }
      if (noteEl) noteEl.textContent = 'Profile photo updated.';
    } catch (error) {
      console.error('[Account] avatar upload failed', error);
      if (noteEl) noteEl.textContent = 'Photo could not be saved. Please try again.';
    } finally { event.target.value = ''; }
  }
  async function removeAvatar() {
    if (!currentUser) return;
    var noteEl = document.getElementById('ac-avatar-note');
    if (noteEl) noteEl.textContent = 'Removing…';
    try {
      var metadata = currentUser.user_metadata || {};
      var path = metadata.watchdog_avatar_path || '';
      if (path) await client.storage.from(AVATAR_BUCKET).remove([path]);
      var updated = await client.auth.updateUser({ data:{ avatar_url:null, watchdog_avatar_path:null } });
      if (updated.error) throw updated.error;
      currentUser = updated.data.user || currentUser;
      await client.from('profiles').update({ avatar_url:null }).eq('id', currentUser.id).then(function () {});
      location.reload();
    } catch (error) {
      console.error('[Account] avatar removal failed', error);
      if (noteEl) noteEl.textContent = 'Photo could not be removed.';
    }
  }

  function insertConnections(app) {
    if (!app || document.getElementById('ac-connections')) return;
    var section = document.createElement('section');
    section.className = 'ac-section ac-connections';
    section.id = 'ac-connections';
    section.innerHTML = '<header><div><span>CONNECTIONS</span><h2>CRM &amp; newsletter accounts</h2><p>Save each provider once. Watchdog keeps the credential server-side in its encrypted secret store and reuses that user-scoped connection anywhere the provider is supported.</p></div><a class="ac-connection-center" href="/property/integrations"><i class="fas fa-arrow-up-right-from-square"></i> Integration Center</a></header>' +
      '<div class="ac-connection-grid">' +
      '<article class="ac-connection-card"><div class="ac-connection-head"><span class="ac-provider-icon"><i class="fas fa-address-book"></i></span><div><small>CRM</small><h3>BoldTrail / kvCORE</h3><p id="ac-crm-status">Checking connection…</p></div></div>' +
      '<label>API token<input id="ac-crm-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your BoldTrail API token"></label><small class="ac-secret-note"><i class="fas fa-lock"></i> The key is validated server-side and never returned to this browser.</small><div class="ac-connection-actions"><button type="button" id="ac-crm-save">Save CRM connection</button><button type="button" class="ghost" id="ac-crm-sync">Sync now</button><button type="button" class="danger-ghost" id="ac-crm-disconnect">Disconnect</button></div><div class="ac-self-note" id="ac-crm-note" aria-live="polite"></div></article>' +
      '<article class="ac-connection-card"><div class="ac-connection-head"><span class="ac-provider-icon"><i class="fas fa-envelope-open-text"></i></span><div><small>NEWSLETTER / EMAIL SERVICE</small><h3>Kit</h3><p id="ac-kit-status">Checking connection…</p></div></div>' +
      '<label>V4 API key<input id="ac-kit-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your Kit V4 API key"></label><small class="ac-secret-note"><i class="fas fa-lock"></i> Saving a provider connection does not by itself grant Broadcasts access or marketing consent.</small><div class="ac-connection-actions"><button type="button" id="ac-kit-save">Save Kit connection</button><button type="button" class="ghost" id="ac-kit-health">Check connection</button><button type="button" class="danger-ghost" id="ac-kit-disconnect">Disconnect</button></div><div class="ac-self-note" id="ac-kit-note" aria-live="polite"></div></article>' +
      '</div><div class="ac-connection-foot"><i class="fas fa-shield-halved"></i><span>Provider connections are private to this Watchdog account. CRM contacts, email subscribers, credentials and sender identities are never merged across users.</span></div>';
    var pricing = document.getElementById('membership-options');
    if (pricing) pricing.insertAdjacentElement('beforebegin', section); else app.appendChild(section);

    if (!paidProfessional()) {
      section.classList.add('plan-gated');
      section.querySelectorAll('input,button').forEach(function (node) { node.disabled = true; });
      section.querySelector('#ac-crm-status').textContent = 'Available on Agent, Pro, Pro+ and Teams.';
      section.querySelector('#ac-kit-status').textContent = 'Available on Agent, Pro, Pro+ and Teams.';
      return;
    }
    document.getElementById('ac-crm-save').addEventListener('click', saveCrm);
    document.getElementById('ac-crm-sync').addEventListener('click', syncCrm);
    document.getElementById('ac-crm-disconnect').addEventListener('click', disconnectCrm);
    document.getElementById('ac-kit-save').addEventListener('click', saveKit);
    document.getElementById('ac-kit-health').addEventListener('click', healthKit);
    document.getElementById('ac-kit-disconnect').addEventListener('click', disconnectKit);
    refreshConnections();
  }
  async function refreshConnections() {
    if (!paidProfessional()) return;
    try {
      var crm = await invoke('tmp-boldtrail-probe', { action:'crm.status' });
      var state = crm && crm.provider;
      document.getElementById('ac-crm-status').textContent = state ? ('Connected · ' + (state.last_success_at ? 'last sync ' + new Date(state.last_success_at).toLocaleString() : 'sync ready')) : 'Not connected';
      document.getElementById('ac-crm-sync').disabled = !state;
      document.getElementById('ac-crm-disconnect').disabled = !state;
    } catch (error) {
      document.getElementById('ac-crm-status').textContent = 'Connection status unavailable';
    }
    try {
      var kit = await invoke('tmp-boldtrail-probe', { action:'email.status' });
      var provider = kit && kit.provider;
      document.getElementById('ac-kit-status').textContent = provider && provider.status !== 'revoked' ? ('Connected' + (provider.account_name ? ' · ' + provider.account_name : '')) : 'Not connected';
      document.getElementById('ac-kit-health').disabled = !provider || provider.status === 'revoked';
      document.getElementById('ac-kit-disconnect').disabled = !provider || provider.status === 'revoked';
    } catch (error) {
      document.getElementById('ac-kit-status').textContent = 'Not connected';
    }
  }
  async function saveCrm() {
    if (connectionBusy) return;
    var key = String(document.getElementById('ac-crm-key').value || '').trim();
    if (key.length < 20) { note('ac-crm-note','Paste a valid BoldTrail API token.','error'); return; }
    connectionBusy = true; note('ac-crm-note','Validating and securing the CRM connection…');
    try { await invoke('tmp-boldtrail-probe',{ action:'boldtrail.connect', api_token:key, external_account_label:'BoldTrail CRM' }); document.getElementById('ac-crm-key').value=''; note('ac-crm-note','BoldTrail connected. The saved token is server-side only.','success'); await refreshConnections(); }
    catch (error) { note('ac-crm-note', error.message || 'BoldTrail could not be connected.','error'); }
    finally { connectionBusy=false; }
  }
  async function syncCrm() {
    if (connectionBusy) return;
    connectionBusy=true; note('ac-crm-note','Queueing CRM sync…');
    try { await invoke('tmp-boldtrail-probe',{action:'boldtrail.sync'}); note('ac-crm-note','CRM sync queued.','success'); }
    catch(error){ note('ac-crm-note',error.message||'CRM sync could not be queued.','error'); }
    finally{connectionBusy=false;}
  }
  async function disconnectCrm() {
    if (connectionBusy || !confirm('Disconnect BoldTrail from this Watchdog account? The stored API token and synchronized CRM context will be removed.')) return;
    connectionBusy=true; note('ac-crm-note','Disconnecting…');
    try { await invoke('tmp-boldtrail-probe',{action:'boldtrail.disconnect'}); note('ac-crm-note','BoldTrail disconnected.','success'); await refreshConnections(); }
    catch(error){ note('ac-crm-note',error.message||'Could not disconnect BoldTrail.','error'); }
    finally{connectionBusy=false;}
  }
  async function saveKit() {
    if (connectionBusy) return;
    var key=String(document.getElementById('ac-kit-key').value||'').trim();
    if(key.length<16){note('ac-kit-note','Paste a valid Kit V4 API key.','error');return;}
    connectionBusy=true;note('ac-kit-note','Validating and securing the Kit connection…');
    try{await invoke('tmp-boldtrail-probe',{action:'kit.connect',api_key:key});document.getElementById('ac-kit-key').value='';note('ac-kit-note','Kit connected. The saved key is server-side only.','success');await refreshConnections();}
    catch(error){note('ac-kit-note',error.message||'Kit could not be connected.','error');}
    finally{connectionBusy=false;}
  }
  async function healthKit(){if(connectionBusy)return;connectionBusy=true;note('ac-kit-note','Checking Kit…');try{await invoke('tmp-boldtrail-probe',{action:'kit.health'});note('ac-kit-note','Kit connection verified.','success');await refreshConnections();}catch(error){note('ac-kit-note',error.message||'Kit check failed.','error');}finally{connectionBusy=false;}}
  async function disconnectKit(){if(connectionBusy||!confirm('Disconnect Kit from this Watchdog account? The stored API key and sender connection will be removed.'))return;connectionBusy=true;note('ac-kit-note','Disconnecting…');try{await invoke('tmp-boldtrail-probe',{action:'kit.disconnect'});note('ac-kit-note','Kit disconnected.','success');await refreshConnections();}catch(error){note('ac-kit-note',error.message||'Could not disconnect Kit.','error');}finally{connectionBusy=false;}}

  function insertSelfService(app) {
    if (!app || document.getElementById('ac-self-service')) return;
    var section = document.createElement('section');
    section.className = 'ac-section ac-self-service';
    section.id = 'ac-self-service';
    section.innerHTML = '<header><div><span>ACCOUNT DATA &amp; SECURITY</span><h2>Your Watchdog, portable and under your control</h2><p>Download your account data, review service health, manage sessions, or permanently remove data you no longer want Watchdog to keep.</p></div></header>' +
      '<div class="ac-self-grid"><button class="ac-self-action" type="button" id="ac-export-data"><i class="fas fa-file-arrow-down"></i><span><b>Download my data</b><small>JSON export of your profile, saved work, professional workspace and Intelligence history.</small></span></button><a class="ac-self-action" href="/property/support"><i class="fas fa-life-ring"></i><span><b>Get support</b><small>Open an account-linked support request.</small></span></a><a class="ac-self-action" href="/property/status"><i class="fas fa-signal"></i><span><b>Platform status</b><small>Privacy-safe operational health and recently resolved incidents.</small></span></a><button class="ac-self-action" type="button" id="ac-signout-device"><i class="fas fa-laptop"></i><span><b>Sign out this device</b><small>End the current browser session only.</small></span></button><button class="ac-self-action" type="button" id="ac-signout-all"><i class="fas fa-shield-halved"></i><span><b>Sign out all devices</b><small>Revoke Watchdog sessions everywhere and require a fresh sign-in.</small></span></button><button class="ac-self-action" type="button" data-billing-portal><i class="fas fa-receipt"></i><span><b>Invoices &amp; billing</b><small>Open the secure billing portal for receipts, payment methods and subscription management.</small></span></button></div>' +
      '<div class="ac-self-note" id="ac-self-note" aria-live="polite"></div>' +
      '<div class="ac-danger-zone"><div class="ac-danger-head"><span>DANGER ZONE</span><h3>Permanent account actions</h3><p>These actions cannot be undone. Watchdog requires typed confirmation before anything is deleted.</p></div><div class="ac-danger-actions"><button type="button" class="ac-danger" id="ac-delete-data"><i class="fas fa-trash-can"></i><span><b>Delete all data</b><small>Keep the sign-in account, but remove Watchdog workspace, profile, saved-property, marketing and Intelligence data.</small></span></button><button type="button" class="ac-danger" id="ac-remove-account"><i class="fas fa-user-slash"></i><span><b>Remove account</b><small>Delete this Watchdog sign-in after any active paid membership has ended.</small></span></button></div><p class="ac-retention-note"><i class="fas fa-circle-info"></i> Billing, fraud-prevention, security and audit records that Watchdog is required to retain may remain for their required retention period and are not used as an active customer workspace.</p></div>' + dangerDialogMarkup();
    app.appendChild(section);
    document.getElementById('ac-export-data').addEventListener('click', exportData);
    document.getElementById('ac-signout-device').addEventListener('click', function(){client.auth.signOut({scope:'local'}).then(function(){location.href='/';});});
    document.getElementById('ac-signout-all').addEventListener('click', function(){client.auth.signOut({scope:'global'}).then(function(){location.href='/';});});
    document.getElementById('ac-delete-data').addEventListener('click', function(){openDanger('delete_data');});
    document.getElementById('ac-remove-account').addEventListener('click', function(){openDanger('remove_account');});
    bindDangerDialog();
  }
  function dangerDialogMarkup(){return '<dialog class="ac-danger-dialog" id="ac-danger-dialog"><form method="dialog"><button class="ac-dialog-x" value="cancel" aria-label="Close"><i class="fas fa-xmark"></i></button><span>PERMANENT ACTION</span><h3 id="ac-danger-title">Confirm deletion</h3><p id="ac-danger-copy"></p><label id="ac-danger-label"></label><input id="ac-danger-confirm" autocomplete="off" spellcheck="false"><div class="ac-danger-dialog-actions"><button value="cancel">Cancel</button><button type="button" class="danger" id="ac-danger-submit" disabled>Delete permanently</button></div><div class="ac-self-note" id="ac-danger-note" aria-live="polite"></div></form></dialog>';}
  var dangerMode='';
  function openDanger(mode){dangerMode=mode;var dialog=document.getElementById('ac-danger-dialog'),input=document.getElementById('ac-danger-confirm'),title=document.getElementById('ac-danger-title'),copy=document.getElementById('ac-danger-copy'),label=document.getElementById('ac-danger-label');var phrase=mode==='remove_account'?'DELETE MY ACCOUNT':'DELETE MY DATA';title.textContent=mode==='remove_account'?'Remove Watchdog account':'Delete all Watchdog data';copy.textContent=mode==='remove_account'?'This deletes the Watchdog sign-in and customer workspace. Active paid memberships must be canceled and ended first.':'This keeps your sign-in but removes your Watchdog customer workspace data and connected-provider secrets.';label.textContent='Type '+phrase+' to continue';input.value='';input.dataset.phrase=phrase;document.getElementById('ac-danger-submit').disabled=true;note('ac-danger-note','');dialog.showModal();input.focus();}
  function bindDangerDialog(){var input=document.getElementById('ac-danger-confirm'),submit=document.getElementById('ac-danger-submit');input.addEventListener('input',function(){submit.disabled=input.value!==input.dataset.phrase;});submit.addEventListener('click',runDanger);}
  async function runDanger(){var submit=document.getElementById('ac-danger-submit'),input=document.getElementById('ac-danger-confirm');if(submit.disabled)return;submit.disabled=true;note('ac-danger-note','Deleting securely…');try{if(currentUser&&currentUser.user_metadata&&currentUser.user_metadata.watchdog_avatar_path){try{await client.storage.from(AVATAR_BUCKET).remove([currentUser.user_metadata.watchdog_avatar_path]);}catch(_error){}}var rpcName=dangerMode==='remove_account'?'account_remove_my_account':'account_delete_my_data';var rpc=await client.rpc(rpcName,{p_confirmation:input.value});if(rpc.error)throw rpc.error;if(dangerMode==='remove_account'){location.href='/?account=removed';return;}note('ac-danger-note','Watchdog customer data was deleted. Reloading your clean account…','success');setTimeout(function(){location.reload();},1200);}catch(error){note('ac-danger-note',error.message||'Deletion could not be completed.','error');submit.disabled=false;}}
  async function exportData(){var button=document.getElementById('ac-export-data');if(!button)return;button.disabled=true;note('ac-self-note','Preparing your export…');try{var exported=await client.rpc('account_export_my_data');if(exported.error)throw exported.error;var payload=exported.data||{};var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='watchdog-data-export-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);note('ac-self-note','Your Watchdog data export was downloaded.','success');}catch(error){note('ac-self-note',error.message||'Your export could not be prepared.','error');}finally{button.disabled=false;}}

  async function mount(event) {
    var app=document.getElementById('ac-app');if(!app||app.hidden)return;
    var detail=event&&event.detail||{};currentPlan=detail.plan||document.documentElement.dataset.accountPlan||'standard';
    try{var auth=await client.auth.getUser();currentUser=auth.data&&auth.data.user||currentUser;}catch(_error){}
    if(!currentUser)return;
    renderAvatarControls();
    insertConnections(app);
    insertSelfService(app);
  }
  document.addEventListener('watchdog:account-rendered',mount);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(mount,350);},{once:true});else setTimeout(mount,350);
})();
