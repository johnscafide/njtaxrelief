// content-architecture: dynamic — authenticated professional invite panel on the Professional Profile page.
/* Invite your peers from the Professional Profile.
   Real estate agents see "Invite fellow co-op agents"; every other declared
   professional sees "Invite your professional sphere". Watchdog never sends
   anything here: the member copies their own invite and shares it by email,
   text or social media. The link is the tracked member referral link
   (get_or_create_my_watchdog_referral_code), the same one every invite surface
   uses, so a new account that arrives through it is credited to the inviter. */
(function () {
  'use strict';
  if (!window.NJPTRSupabaseRuntime) return;
  var db = window.NJPTRSupabaseRuntime.createClient();
  var state = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  var REFERRAL_ROOT = 'https://www.watchdogindex.com/?utm_source=watchdog_referral&utm_medium=member&utm_campaign=';

  async function inviteFor() {
    var result = await db.rpc('get_or_create_my_watchdog_referral_code');
    if (result.error || !result.data) throw result.error || new Error('Referral code unavailable');
    var code = String(result.data);
    return { code: code, link: REFERRAL_ROOT + encodeURIComponent(code) };
  }

  async function joinedFor(user) {
    var result = await db.from('watchdog_referral_conversions')
      .select('verified_at')
      .eq('inviter_user_id', user.id)
      .order('verified_at', { ascending: false })
      .limit(200);
    if (result.error) return null;
    var rows = Array.isArray(result.data) ? result.data : [];
    return { count: rows.length, latest: rows[0] && rows[0].verified_at || null };
  }

  /* Free-month referral rewards (read only; stripe-webhook records them and the
     daily sweep pays them out 90 days after the referred yearly plan starts). */
  async function rewardsFor(user) {
    var result = await db.from('watchdog_referral_rewards')
      .select('status,eligible_at,credited_at,amount_cents')
      .eq('inviter_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (result.error) return null;
    var rows = Array.isArray(result.data) ? result.data : [];
    var credited = rows.filter(function (r) { return r.status === 'credited'; });
    var holding = rows.filter(function (r) { return r.status === 'pending' || r.status === 'waiting_for_subscription'; });
    var next = holding.map(function (r) { return r.eligible_at; }).filter(Boolean).sort()[0] || null;
    return {
      credited: credited.length,
      creditedCents: credited.reduce(function (sum, r) { return sum + Number(r.amount_cents || 0); }, 0),
      holding: holding.length,
      waitingForPlan: holding.some(function (r) { return r.status === 'waiting_for_subscription'; }),
      next: next
    };
  }

  function day(value) {
    try { return value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; } catch (_) { return ''; }
  }

  function rewardsLine(r) {
    if (!r) return '';
    var parts = [];
    if (r.credited) parts.push(r.credited + (r.credited === 1 ? ' free month' : ' free months') + ' credited to your bill' + (r.creditedCents ? ' ($' + (r.creditedCents / 100).toFixed(2).replace(/\.00$/, '') + ')' : '') + '.');
    if (r.holding) parts.push(r.holding + ' more on hold' + (r.next ? ', next one lands ' + day(r.next) : '') + '.');
    if (r.waitingForPlan) parts.push('Rewards are applied while you have an active paid plan.');
    if (!parts.length) parts.push('When someone you invite starts a yearly plan, you get one month of your plan free once they have been on it for 90 days.');
    return parts.join(' ');
  }

  function joinedLine(joined) {
    if (!joined) return '';
    if (!joined.count) return 'Nobody has joined with your invite yet. When someone creates an account from your link, it shows up here.';
    var when = '';
    try { when = joined.latest ? new Date(joined.latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; } catch (_) {}
    return joined.count + (joined.count === 1 ? ' person has' : ' people have') + ' joined with your invite' + (when ? ', most recently ' + when : '') + '.';
  }

  function copy(profile, invite) {
    if (profile === 'real_estate') {
      return {
        eyebrow: 'CO-OP AGENTS',
        title: 'Invite fellow co-op agents',
        lead: 'Know agents you co-op with? Copy your invite and send it however you like: email, text or social media.',
        message: 'I use Watchdog for New Jersey property and tax research on my deals. Here is my invite if you want to try it: ' + invite.link + ' (invite code ' + invite.code + ')'
      };
    }
    return {
      eyebrow: 'YOUR PROFESSIONAL SPHERE',
      title: 'Invite your professional sphere',
      lead: 'Know colleagues or partners who would use Watchdog? Copy your invite and send it however you like: email, text or social media.',
      message: 'I use Watchdog for New Jersey property and tax research in my work. Here is my invite if you want to try it: ' + invite.link + ' (invite code ' + invite.code + ')'
    };
  }

  function remove() {
    var old = document.getElementById('ac-professional-invite');
    if (old) old.remove();
  }

  function render() {
    remove();
    var app = document.getElementById('ac-app');
    if (!app || !state) return;
    var text = copy(state.profession, state.invite);
    var section = document.createElement('section');
    section.id = 'ac-professional-invite';
    section.className = 'ac-section acp-editor api-invite' + (state.profession === 'real_estate' ? ' is-agent' : '');
    section.innerHTML =
      '<div class="api-copy">' +
        '<span class="api-eyebrow">' + esc(text.eyebrow) + '</span>' +
        '<h2>' + esc(text.title) + '</h2>' +
        '<p>' + esc(text.lead) + '</p>' +
      '</div>' +
      '<div class="api-share">' +
        '<div class="api-code"><small>Your invite code</small><b id="api-code-value">' + esc(state.invite.code) + '</b></div>' +
        '<label class="api-link"><span>Your invite link</span><input id="api-link" readonly value="' + esc(state.invite.link) + '"></label>' +
        '<div class="api-actions">' +
          '<button type="button" class="api-primary" data-api-copy="message"><i class="far fa-copy" aria-hidden="true"></i><span>Copy invite</span></button>' +
          '<button type="button" data-api-copy="link"><i class="fas fa-link" aria-hidden="true"></i><span>Copy link only</span></button>' +
        '</div>' +
        (state.joined ? '<div class="api-joined' + (state.joined.count ? ' has-joins' : '') + '"><b>' + state.joined.count + '</b><span>' + esc(joinedLine(state.joined)) + '</span></div>' : '') +
        (state.rewards ? '<div class="api-joined api-rewards' + (state.rewards.credited || state.rewards.holding ? ' has-joins' : '') + '"><b>' + (state.rewards.credited + state.rewards.holding) + '</b><span><strong>Free months earned.</strong> ' + esc(rewardsLine(state.rewards)) + '</span></div>' : '') +
        '<small class="api-note" id="api-note" aria-live="polite">"Copy invite" copies a short message with your link and code, ready to paste.</small>' +
      '</div>';
    app.appendChild(section);
  }

  function writeClipboard(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      area.remove();
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-api-copy]') : null;
    if (!button || !state) return;
    var kind = button.getAttribute('data-api-copy');
    var value = kind === 'link' ? state.invite.link : copy(state.profession, state.invite).message;
    var note = document.getElementById('api-note');
    writeClipboard(value).then(function () {
      if (note) note.textContent = kind === 'link' ? 'Invite link copied.' : 'Invite copied. Paste it into an email, text or post.';
      var label = button.querySelector('span');
      var original = label ? label.textContent : '';
      if (label) label.textContent = 'Copied';
      window.setTimeout(function () { if (label && document.body.contains(label)) label.textContent = original; }, 1800);
    }).catch(function () {
      if (note) note.textContent = 'Copy is blocked in this browser. Select the link above and copy it manually.';
      var input = document.getElementById('api-link');
      if (input) { input.focus(); input.select(); }
    });
  });

  async function load() {
    try {
      var session = await db.auth.getSession();
      var user = session && session.data && session.data.session && session.data.session.user;
      if (!user) { state = null; remove(); return; }
      var result = await db.from('watchdog_onboarding_profiles').select('persona,primary_profession').eq('user_id', user.id).maybeSingle();
      if (result.error) throw result.error;
      var row = result.data || {};
      var professional = (row.persona === 'professional' || row.persona === 'both') && !!row.primary_profession;
      if (!professional) { state = null; remove(); return; }
      var results = await Promise.all([inviteFor(), joinedFor(user), rewardsFor(user)]);
      state = { profession: row.primary_profession, invite: results[0], joined: results[1], rewards: results[2] };
      render();
    } catch (error) {
      console.warn('professional invite', error);
    }
  }

  function start() {
    if (String(document.body && document.body.getAttribute('data-account-profile-mode') || '') !== 'professional') return;
    load();
    document.addEventListener('watchdog:profile-updated', load);
    var app = document.getElementById('ac-app');
    if (app) new MutationObserver(function () {
      if (state && !document.getElementById('ac-professional-invite')) window.setTimeout(render, 0);
    }).observe(app, { childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
