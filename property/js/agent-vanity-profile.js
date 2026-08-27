(function () {
  'use strict';

  var RESERVED = new Set([
    'admin','api','app','auth','billing','dashboard','developer','help','login','logout','pricing','property','signup','support','watchdog','www',
    'fuck','shit','bitch','cunt','dick','pussy','asshole'
  ]);
  var SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
  var PORTAL_ROOT = 'https://www.watchdogindex.com/agent/';

  function normalize(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
      .replace(/-$/g, '');
  }

  function eligible(entitlement, role) {
    if (role === 'developer') return true;
    var status = String((entitlement && entitlement.subscription_status) || '').toLowerCase();
    var tier = String((entitlement && (entitlement.billing_tier || entitlement.plan_tier)) || '').toLowerCase().replace('pro+', 'pro_plus');
    return ['active','trialing','past_due','cancel_scheduled'].indexOf(status) >= 0 && ['agent','pro','pro_plus','teams'].indexOf(tier) >= 0;
  }

  function validate(value) {
    if (!value) return { ok: true, value: null };
    if (!SLUG_RE.test(value)) return { ok: false, message: 'Use 3–40 lowercase letters, numbers or hyphens, with no hyphen at either end.' };
    if (RESERVED.has(value)) return { ok: false, message: 'That address is reserved by Watchdog. Choose another.' };
    return { ok: true, value: value };
  }

  function fmtDate(value) {
    if (!value) return '';
    var d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }

  function injectStyles() {
    if (document.getElementById('wd-vanity-profile-style')) return;
    var style = document.createElement('style');
    style.id = 'wd-vanity-profile-style';
    style.textContent = [
      '.ac-vanity{margin-top:22px}',
      '.ac-vanity-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.7fr);gap:18px;align-items:start}',
      '.ac-vanity-field{display:flex;align-items:center;border:1px solid var(--border,#d9e0e8);border-radius:var(--radius-md,14px);background:var(--surface,#fff);overflow:hidden}',
      '.ac-vanity-field span{padding:0 0 0 14px;color:var(--text-muted,#65717f);font-size:var(--type-sm,14px);white-space:nowrap}',
      '.ac-vanity-field input{min-width:0;flex:1;border:0!important;box-shadow:none!important;padding:14px 14px 14px 2px!important;background:transparent!important;font:600 var(--type-sm,14px)/1.2 var(--font-ui,Inter,sans-serif)!important;color:var(--text,#17202b)}',
      '.ac-vanity-field input:focus{outline:0}',
      '.ac-vanity-actions{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}',
      '.ac-vanity-actions button{border:0;border-radius:var(--radius-sm,10px);padding:11px 16px;font:700 var(--type-sm,14px)/1 var(--font-ui,Inter,sans-serif);cursor:pointer}',
      '.ac-vanity-save{background:var(--navy,#102b46);color:#fff}',
      '.ac-vanity-clear{background:var(--surface-muted,#edf2f6);color:var(--text,#17202b)}',
      '.ac-vanity-actions button:disabled{opacity:.55;cursor:not-allowed}',
      '.ac-vanity-note{display:block;min-height:20px;margin-top:9px;font-size:var(--type-xs,12px);color:var(--text-muted,#65717f)}',
      '.ac-vanity-note.ok{color:#087a68}.ac-vanity-note.error{color:#a93636}',
      '.ac-vanity-preview{padding:16px;border-radius:var(--radius-md,14px);background:var(--surface-muted,#f4f7fa)}',
      '.ac-vanity-preview span{display:block;font-size:var(--type-xs,12px);font-weight:800;letter-spacing:.06em;color:var(--text-muted,#65717f);text-transform:uppercase}',
      '.ac-vanity-preview b{display:block;margin-top:6px;font-size:var(--type-sm,14px);overflow-wrap:anywhere}',
      '.ac-vanity-preview small{display:block;margin-top:8px;font-size:var(--type-xs,12px);line-height:1.55;color:var(--text-muted,#65717f)}',
      '.ac-vanity-status{margin-top:10px;padding-top:10px;border-top:1px solid var(--border,#d9e0e8)}',
      '@media(max-width:768px){.ac-vanity-grid{grid-template-columns:1fr}.ac-vanity-field{align-items:stretch;flex-direction:column}.ac-vanity-field span{padding:11px 14px 0}.ac-vanity-field input{padding:5px 14px 12px!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  function waitForAccount() {
    return new Promise(function (resolve) {
      var attempts = 0;
      var timer = setInterval(function () {
        var app = document.getElementById('ac-app');
        attempts += 1;
        if (app && !app.hidden && app.querySelector('.ac-section')) {
          clearInterval(timer);
          resolve(app);
        } else if (attempts > 120) {
          clearInterval(timer);
          resolve(null);
        }
      }, 100);
    });
  }

  async function init() {
    if (!window.NJPTRSupabaseRuntime) return;
    injectStyles();
    var client = window.NJPTRSupabaseRuntime.createClient();
    var auth = await client.auth.getUser();
    var user = auth && auth.data && auth.data.user;
    if (!user) return;

    var app = await waitForAccount();
    if (!app || document.getElementById('ac-vanity')) return;

    var profileResult = await client.from('profiles').select('account_role,vanity_slug,vanity_slug_reserved_at,vanity_slug_release_after').eq('id', user.id).maybeSingle();
    if (profileResult.error || !profileResult.data) return;
    var profile = profileResult.data;

    var entitlementResult = await client.from('account_entitlements').select('plan_tier,billing_tier,subscription_status,current_period_end,cancel_at_period_end').eq('user_id', user.id).maybeSingle();
    var entitlement = entitlementResult.data || {};
    var canReserve = eligible(entitlement, profile.account_role);

    var section = document.createElement('section');
    section.id = 'ac-vanity';
    section.className = 'ac-section ac-vanity';
    section.innerHTML = '<header><div><span>AGENT PORTAL</span><h2>Reserve your Watchdog address</h2><p>Your vanity address is protected by your Agent-or-higher entitlement and remains reserved through the paid term plus the existing grace period after cancellation.</p></div></header>' +
      '<div class="ac-vanity-grid"><div><label for="ac-vanity-input">Portal address</label><div class="ac-vanity-field"><span>watchdogindex.com/agent/</span><input id="ac-vanity-input" maxlength="40" autocomplete="off" spellcheck="false" aria-describedby="ac-vanity-note"></div>' +
      '<div class="ac-vanity-actions"><button class="ac-vanity-save" id="ac-vanity-save" type="button">Reserve address</button><button class="ac-vanity-clear" id="ac-vanity-clear" type="button">Release address</button></div><small class="ac-vanity-note" id="ac-vanity-note" aria-live="polite"></small></div>' +
      '<aside class="ac-vanity-preview"><span>Reserved URL</span><b id="ac-vanity-url">Not reserved yet</b><small id="ac-vanity-help">Reserve a short, professional slug now. Publishing, lead capture and QR distribution remain disabled until the public portal security boundary is live.</small><div class="ac-vanity-status" id="ac-vanity-status"></div></aside></div>';

    var anchor = app.querySelector('.ac-profile-hero');
    if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(section, anchor.nextSibling);
    else app.appendChild(section);

    var input = document.getElementById('ac-vanity-input');
    var save = document.getElementById('ac-vanity-save');
    var clear = document.getElementById('ac-vanity-clear');
    var note = document.getElementById('ac-vanity-note');
    var url = document.getElementById('ac-vanity-url');
    var status = document.getElementById('ac-vanity-status');

    function renderState(row) {
      var slug = row && row.vanity_slug || '';
      input.value = slug;
      url.textContent = slug ? PORTAL_ROOT + slug : 'Not reserved yet';
      clear.disabled = !slug;
      save.textContent = slug ? 'Save address' : 'Reserve address';
      if (!canReserve) {
        input.disabled = true;
        save.disabled = true;
        clear.disabled = true;
        note.className = 'ac-vanity-note';
        note.textContent = 'Agent portal addresses require an active Agent, Pro, Pro+ or Teams entitlement.';
      }
      var bits = [];
      if (row && row.vanity_slug_reserved_at) bits.push('Reserved ' + fmtDate(row.vanity_slug_reserved_at));
      if (row && row.vanity_slug_release_after) bits.push('Protected until ' + fmtDate(row.vanity_slug_release_after));
      status.textContent = bits.join(' · ');
    }

    function setNote(message, kind) {
      note.className = 'ac-vanity-note' + (kind ? ' ' + kind : '');
      note.textContent = message || '';
    }

    input.addEventListener('input', function () {
      var normalized = normalize(input.value);
      if (input.value !== normalized) input.value = normalized;
      var check = validate(normalized);
      setNote(check.ok ? (normalized ? 'This will reserve ' + PORTAL_ROOT + normalized : '') : check.message, check.ok ? '' : 'error');
    });

    save.addEventListener('click', async function () {
      if (!canReserve) return;
      var value = normalize(input.value);
      var check = validate(value);
      if (!check.ok || !value) {
        setNote(check.message || 'Enter a portal address first.', 'error');
        return;
      }
      save.disabled = true;
      clear.disabled = true;
      setNote('Checking and reserving…');
      var result = await client.from('profiles').update({ vanity_slug: value }).eq('id', user.id).select('vanity_slug,vanity_slug_reserved_at,vanity_slug_release_after').single();
      save.disabled = false;
      if (result.error) {
        clear.disabled = !profile.vanity_slug;
        if (result.error.code === '23505') setNote('That address is already reserved. Choose another.', 'error');
        else if (result.error.code === '23514') setNote('That address does not meet Watchdog’s slug rules.', 'error');
        else setNote(result.error.message || 'Watchdog could not reserve that address.', 'error');
        return;
      }
      profile = Object.assign(profile, result.data || {});
      renderState(profile);
      setNote('Address reserved. The public portal itself remains unpublished until its anonymous access controls are complete.', 'ok');
    });

    clear.addEventListener('click', async function () {
      if (!canReserve || !profile.vanity_slug) return;
      clear.disabled = true;
      save.disabled = true;
      setNote('Releasing address…');
      var result = await client.from('profiles').update({ vanity_slug: null }).eq('id', user.id).select('vanity_slug,vanity_slug_reserved_at,vanity_slug_release_after').single();
      save.disabled = false;
      if (result.error) {
        clear.disabled = false;
        setNote(result.error.message || 'Watchdog could not release that address.', 'error');
        return;
      }
      profile = Object.assign(profile, result.data || {});
      renderState(profile);
      setNote('Address released. It can now be reserved by another eligible member.', 'ok');
    });

    renderState(profile);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
