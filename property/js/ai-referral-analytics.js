(function () {
  'use strict';

  var CANONICAL_HOSTS = new Set(['watchdogindex.com', 'www.watchdogindex.com']);
  var ENDPOINT = 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/product-analytics';
  var PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  if (!CANONICAL_HOSTS.has(String(location.hostname || '').toLowerCase())) return;

  // The public discovery runtime is already injected across Watchdog public
  // surfaces. Use it to bootstrap the consent-gated signup attribution helper
  // without turning private ANCHOR answers or auth identity into product events.
  if (!window.WatchdogSignupAnalytics && !document.querySelector('script[src="/property/js/signup-attribution.js"]')) {
    var signupScript = document.createElement('script');
    signupScript.src = '/property/js/signup-attribution.js';
    signupScript.defer = true;
    signupScript.setAttribute('data-watchdog-signup-attribution','1');
    (document.head || document.documentElement).appendChild(signupScript);
  }

  if (navigator.globalPrivacyControl === true || String(navigator.doNotTrack || '') === '1') return;
  if (!window.crypto || typeof window.crypto.randomUUID !== 'function') return;

  function lower(value) {
    return String(value || '').trim().toLowerCase();
  }

  function referrerHost() {
    if (!document.referrer) return '';
    try { return new URL(document.referrer).hostname.toLowerCase(); }
    catch (_error) { return ''; }
  }

  function sourceFromHost(host) {
    if (!host) return '';
    if (host === 'chatgpt.com' || host === 'chat.openai.com' || host.endsWith('.chatgpt.com')) return 'chatgpt';
    if (host === 'perplexity.ai' || host.endsWith('.perplexity.ai')) return 'perplexity';
    if (host === 'copilot.microsoft.com' || host.endsWith('.copilot.microsoft.com')) return 'microsoft_copilot';
    if (host === 'gemini.google.com' || host.endsWith('.gemini.google.com')) return 'google_gemini';
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'claude';
    if (host === 'grok.com' || host.endsWith('.grok.com')) return 'grok';
    if (host === 'you.com' || host.endsWith('.you.com')) return 'you_com';
    if (host === 'phind.com' || host.endsWith('.phind.com')) return 'phind';
    if (host === 'meta.ai' || host.endsWith('.meta.ai')) return 'meta_ai';
    return '';
  }

  function sourceFromUtm(value, medium) {
    var s = lower(value);
    var m = lower(medium);
    if (!s && !m) return '';
    if (s === 'chatgpt.com' || s === 'chatgpt' || s === 'openai') return 'chatgpt';
    if (s.indexOf('perplexity') !== -1) return 'perplexity';
    if (s.indexOf('copilot') !== -1 || s === 'microsoft_ai') return 'microsoft_copilot';
    if (s.indexOf('gemini') !== -1 || s === 'google_ai' || s === 'google-aio') return 'google_gemini';
    if (s.indexOf('claude') !== -1 || s === 'anthropic') return 'claude';
    if (s.indexOf('grok') !== -1) return 'grok';
    if (s === 'you.com' || s === 'you_com') return 'you_com';
    if (s.indexOf('phind') !== -1) return 'phind';
    if (s === 'meta_ai' || s === 'meta.ai') return 'meta_ai';
    if (['ai', 'answer_engine', 'assistant', 'llm'].indexOf(m) !== -1) return 'other_ai';
    return '';
  }

  var params = new URLSearchParams(location.search || '');
  var utmSource = params.get('utm_source') || '';
  var utmMedium = params.get('utm_medium') || '';
  var utmCampaign = params.get('utm_campaign') || '';
  var host = referrerHost();
  var aiSource = sourceFromUtm(utmSource, utmMedium) || sourceFromHost(host);

  // Do not treat ordinary Google/Bing search referrals as AI. Only explicit AI
  // sources or AI-tagged campaigns are recorded by this public-discovery runtime.
  if (!aiSource) return;

  var payload = {
    event_name: 'page_view',
    visitor_id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    path: location.pathname || '/',
    referrer_host: host,
    referrer_url: document.referrer || '',
    landing_path: location.pathname || '/',
    session_referrer_host: host,
    session_referrer_url: document.referrer || '',
    session_landing_path: location.pathname || '/',
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    session_utm_source: utmSource,
    session_utm_medium: utmMedium,
    session_utm_campaign: utmCampaign,
    properties: {
      source: aiSource,
      surface: 'public_discovery',
      interaction: 'ai_referral'
    }
  };

  fetch(ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + PUBLISHABLE_KEY
    },
    body: JSON.stringify(payload)
  }).catch(function () {
    // Analytics must never affect page behavior.
  });
})();
