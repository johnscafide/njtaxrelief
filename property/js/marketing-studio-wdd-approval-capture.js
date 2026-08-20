(function(){
  'use strict';
  var busy = false;

  function campaignId(){
    return new URLSearchParams(location.search).get('campaign') || '';
  }

  function toast(message, bad){
    var t = document.querySelector('#pl-toast,#ms-toast');
    if (!t) return;
    t.textContent = String(message || '');
    t.style.display = 'block';
    t.classList.toggle('bad', !!bad);
    clearTimeout(window.__wddApprovalToast);
    window.__wddApprovalToast = setTimeout(function(){
      t.style.display = 'none';
      t.classList.remove('bad');
    }, 5000);
  }

  function setButtons(label, disabled){
    document.querySelectorAll('#msc-approve,[data-pv-approve],[data-wd-handoff-approve]').forEach(function(btn){
      btn.disabled = !!disabled;
      if (btn.matches('[data-pv-approve]')) btn.textContent = label;
      else btn.innerHTML = label;
    });
  }

  async function approve(){
    if (busy) return;
    var id = campaignId();
    if (!id) return toast('Campaign ID is missing.', true);
    if (!window.NJPTRAccess || typeof window.NJPTRAccess.client !== 'function') return toast('Watchdog session is not ready.', true);

    busy = true;
    setButtons('<i class="fas fa-circle-notch fa-spin"></i> Approving…', true);
    try {
      var client = window.NJPTRAccess.client();
      var sessionResult = await client.auth.getSession();
      var accessToken = sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!accessToken) throw new Error('Sign in required.');

      var response = await fetch('/api/watchdog-designs-creative', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action:'approve_active', campaign_id:id })
      });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data || data.ok !== true) throw new Error((data && data.error) || 'Approval failed.');

      setButtons('<i class="fas fa-circle-check"></i> Studio creative approved', true);
      toast('Studio creative approved. Refreshing Watchdog Designs state.');
      setTimeout(function(){ location.reload(); }, 450);
    } catch (error) {
      console.error('[WDD approval] failed', error);
      setButtons('Approve Studio creative', false);
      toast(error && error.message ? error.message : 'Could not approve Studio creative.', true);
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', function(event){
    var target = event.target && event.target.closest ? event.target.closest('#msc-approve,[data-pv-approve],[data-wd-handoff-approve]') : null;
    if (!target) return;
    if (!document.body.classList.contains('wd-studio-visual-active')) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    approve();
  }, true);
})();
