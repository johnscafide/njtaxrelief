(function () {
  'use strict';
  if (!window.WatchdogAnchorVault || !window.NJPTRSupabaseRuntime) return;

  var vault = window.WatchdogAnchorVault;
  var db = vault.supabaseClient();
  var user = null;
  var rows = [];
  var rawKey = null;
  var registry = [];
  var decoded = new Map();
  var SESSION_APP_KEY = 'wd_anchor_2025_application_id';

  function q(sel) { return document.querySelector(sel); }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function status(message, error) {
    var el = q('#wd-library-status');
    el.textContent = message || '';
    el.className = 'wd-app-status' + (message ? ' is-visible' : '') + (error ? ' error' : '');
  }
  function rememberApp(id) { try { sessionStorage.setItem(SESSION_APP_KEY, id); } catch (_) {} }
  function clearApp() { try { sessionStorage.removeItem(SESSION_APP_KEY); } catch (_) {} }
  function formatDate(value) {
    if (!value) return 'Saved application';
    try { return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric' }).format(new Date(value)); }
    catch (_) { return 'Saved application'; }
  }
  function applicantName(payload) {
    var a = payload && payload.applicant || {};
    return [a.first, a.last].filter(Boolean).join(' ') || '2025 application';
  }
  function homeAddress(payload) {
    if (!payload) return 'Encrypted application';
    var oct = payload.oct1 || {}, mailing = payload.mailing || {};
    return (oct.different && oct.address) || mailing.address || 'Address not entered';
  }
  function formLabel(payload) {
    if (!payload) return '2025';
    var a = payload.applicant || {}, s = payload.spouse || {};
    var married = ['D','F'].indexOf(payload.filing_status) !== -1;
    var pas = Number(a.birth_year || 9999) <= 1960 || (married && Number(s.birth_year || 9999) <= 1960) || a.ssd_2025 === true || a.railroad_disability_2025 === true || (married && (s.ssd_2025 === true || s.railroad_disability_2025 === true));
    return pas ? '2025 PAS-1' : '2025 ANC-1';
  }

  async function loadRegistry() {
    var result = await db.from('anchor_application_vault_keys').select('id,key_fingerprint,status').eq('user_id', user.id).eq('status','active');
    if (result.error) throw result.error;
    registry = result.data || [];
  }
  async function keyMatches(key) {
    if (!key || !registry.length) return false;
    var fp = await vault.fingerprint(key);
    return registry.some(function (row) { return row.key_fingerprint === fp; });
  }
  async function loadRows() {
    var result = await vault.listApplications();
    user = result.user;
    rows = result.applications || [];
  }

  async function showAfterAuth() {
    q('#wd-library-auth').hidden = true;
    await loadRegistry();
    await loadRows();
    if (!rows.length) {
      q('#wd-library-content').hidden = false;
      q('#wd-library-empty').hidden = false;
      q('#wd-library-list').innerHTML = '';
      return;
    }
    var remembered = await vault.getRememberedKey();
    if (remembered && await keyMatches(remembered)) {
      rawKey = remembered;
      await unlockRows();
      return;
    }
    q('#wd-library-vault').hidden = false;
  }

  async function sendCode() {
    var email = String(q('#wd-library-email').value || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return status('Enter a valid email address.', true);
    var button = q('#wd-library-send'); button.disabled = true; status('Sending your secure sign-in code...');
    try {
      var result = await db.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
      if (result.error) throw result.error;
      q('#wd-library-code-box').hidden = false;
      status('Check your email for the 6-digit code.');
      q('#wd-library-code').focus();
    } catch (_) { status('We could not send the sign-in code. Try again.', true); }
    finally { button.disabled = false; }
  }

  async function verifyCode() {
    var email = String(q('#wd-library-email').value || '').trim().toLowerCase();
    var token = digits(q('#wd-library-code').value).slice(0, 6);
    if (token.length !== 6) return status('Enter the 6-digit code from your email.', true);
    var button = q('#wd-library-verify'); button.disabled = true; status('Verifying...');
    try {
      var result = await db.auth.verifyOtp({ email: email, token: token, type:'email' });
      if (result.error || !result.data || !result.data.user) throw (result.error || new Error('verify_failed'));
      user = result.data.user;
      status('');
      await showAfterAuth();
    } catch (_) { status('That code could not be verified. Check it and try again.', true); }
    finally { button.disabled = false; }
  }

  async function unlock() {
    var button = q('#wd-library-unlock'); button.disabled = true; status('Unlocking your Private Vault...');
    try {
      var key = vault.parseRecoveryKey(q('#wd-library-recovery').value);
      if (!await keyMatches(key)) throw new Error('mismatch');
      rawKey = key;
      if (q('#wd-library-remember').checked) await vault.rememberKey(rawKey); else await vault.forgetKey();
      await unlockRows();
    } catch (_) { status('That recovery key does not match this Watchdog account.', true); button.disabled = false; }
  }

  async function unlockRows() {
    decoded.clear();
    status('Decrypting saved applications on this device...');
    for (var i = 0; i < rows.length; i++) {
      try { decoded.set(rows[i].id, await vault.decryptApplication(rows[i], rawKey)); }
      catch (_) { decoded.set(rows[i].id, null); }
    }
    q('#wd-library-vault').hidden = true;
    q('#wd-library-content').hidden = false;
    renderRows();
    status('');
  }

  function button(label, cls, action, id) {
    var b = document.createElement('button'); b.type='button'; b.className='wd-btn ' + cls; b.textContent=label; b.dataset.action=action; b.dataset.id=id; return b;
  }

  function renderRows() {
    var list = q('#wd-library-list'); list.innerHTML = '';
    q('#wd-library-empty').hidden = !!rows.length;
    q('#wd-library-heading').textContent = rows.length === 1 ? '1 saved application' : rows.length + ' saved applications';
    rows.forEach(function (row) {
      var payload = decoded.get(row.id);
      var card = document.createElement('article'); card.className='wd-library-card'; card.dataset.id=row.id;
      var head=document.createElement('div'); head.className='wd-library-card-head';
      var text=document.createElement('div'); var h=document.createElement('h3'); h.textContent=applicantName(payload); var addr=document.createElement('p'); addr.className='wd-library-card-address'; addr.textContent=homeAddress(payload); text.appendChild(h);text.appendChild(addr);
      var badge=document.createElement('span');badge.className='wd-library-badge';badge.textContent=formLabel(payload);head.appendChild(text);head.appendChild(badge);card.appendChild(head);
      // content-architecture: dynamic — save date and generated/draft state are rendered from the decrypted account record.
      var meta=document.createElement('div');meta.className='wd-library-meta';var saved=document.createElement('span');saved.textContent='Last saved ' + formatDate(row.updated_at);var stateEl=document.createElement('span');stateEl.textContent=row.status === 'generated' ? 'Official PDF prepared' : 'Draft';meta.appendChild(saved);meta.appendChild(stateEl);card.appendChild(meta);
      var actions=document.createElement('div');actions.className='wd-library-actions';actions.appendChild(button('Continue application','secondary','resume',row.id));if(row.status==='generated'){actions.appendChild(button('Download saved PDF','primary','download',row.id));actions.appendChild(button('Print saved PDF','secondary','print',row.id));}actions.appendChild(button('Delete','wd-library-delete','delete',row.id));card.appendChild(actions);list.appendChild(card);
    });
  }

  async function loadLatestPdf(id) {
    var row = rows.find(function (r) { return r.id === id; });
    var docs = await vault.listDocuments(id);
    if (!row || !docs.length) throw new Error('missing');
    var bytes = await vault.loadPdf({ document: docs[0], rawKey: rawKey, userId: user.id, applicationId:id, taxYear:row.tax_year });
    return { row: row, bytes: bytes };
  }

  async function downloadLatest(id) {
    status('Decrypting your saved PDF on this device...');
    try {
      var loaded = await loadLatestPdf(id);
      var blob = new Blob([loaded.bytes], {type:'application/pdf'}), url=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url; a.download=formLabel(decoded.get(id)).replace(/\s+/g,'-') + '-Watchdog.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},1500); status('');
    } catch (_) { status('Watchdog could not decrypt the saved PDF. Confirm that you unlocked the correct Private Vault.', true); }
  }

  async function printLatest(id) {
    var preview = window.open('', '_blank');
    if (!preview) return status('Allow pop-ups for Watchdog so the print-ready PDF can open.', true);
    status('Decrypting your saved PDF for printing on this device...');
    try {
      var loaded = await loadLatestPdf(id);
      var blob = new Blob([loaded.bytes], {type:'application/pdf'}), url=URL.createObjectURL(blob);
      preview.location.replace(url);
      setTimeout(function(){ try { preview.focus(); preview.print(); } catch (_) {} }, 900);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      status('Your print-ready PDF opened in a new tab. Use the browser print control if the print dialog does not open automatically.');
    } catch (_) {
      try { preview.close(); } catch (_) {}
      status('Watchdog could not decrypt the saved PDF. Confirm that you unlocked the correct Private Vault.', true);
    }
  }

  async function removeApplication(id) {
    if (!window.confirm('Delete this encrypted application and its saved PDFs from your Watchdog account? This cannot be undone.')) return;
    status('Deleting encrypted application...');
    try {
      await vault.deleteApplication(id);
      rows = rows.filter(function (row) { return row.id !== id; }); decoded.delete(id); renderRows(); status('Application deleted.');
    } catch (_) { status('The application could not be deleted. Try again.', true); }
  }

  function startNew() { clearApp(); window.location.href='/anchor/application/2025/'; }

  function bind() {
    q('#wd-library-send').addEventListener('click', sendCode);
    q('#wd-library-verify').addEventListener('click', verifyCode);
    q('#wd-library-unlock').addEventListener('click', unlock);
    q('#wd-library-new').addEventListener('click', startNew);
    var topNew = q('.wd-library-new-top');
    if (topNew) topNew.addEventListener('click', function (event) { event.preventDefault(); startNew(); });
    q('#wd-library-list').addEventListener('click', function (event) {
      var target=event.target.closest('[data-action]'); if(!target)return; var id=target.dataset.id;
      if(target.dataset.action==='resume'){rememberApp(id);window.location.href='/anchor/application/2025/';}
      else if(target.dataset.action==='download') downloadLatest(id);
      else if(target.dataset.action==='print') printLatest(id);
      else if(target.dataset.action==='delete') removeApplication(id);
    });
  }

  async function init() {
    bind();
    try {
      var auth = await db.auth.getUser(); if(auth.error)throw auth.error; user=auth.data&&auth.data.user?auth.data.user:null;
      if(user) await showAfterAuth();
    } catch (_) { status('Watchdog account services are temporarily unavailable. Try again in a moment.', true); }
  }
  init();
})();