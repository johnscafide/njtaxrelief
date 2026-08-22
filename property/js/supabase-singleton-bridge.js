(function () {
  'use strict';

  if (!window.supabase || typeof window.supabase.createClient !== 'function' ||
      !window.NJPTRSupabaseRuntime || typeof window.NJPTRSupabaseRuntime.createClient !== 'function' ||
      window.supabase.__watchdogSingletonBridge) return;

  var shared;
  try {
    shared = window.NJPTRSupabaseRuntime.createClient();
  } catch (_error) {
    return;
  }

  var originalCreateClient = window.supabase.createClient.bind(window.supabase);
  window.supabase.createClient = function (url, key, options) {
    var value = String(url || '');
    if (value.indexOf('uvkvaxljhhngydvlrzom') !== -1 || value.indexOf('pxossnwmrygxlpxtstnl') !== -1) {
      return shared;
    }
    return originalCreateClient(url, key, options);
  };

  try {
    Object.defineProperty(window.supabase, '__watchdogSingletonBridge', { value: true });
  } catch (_error) {
    window.supabase.__watchdogSingletonBridge = true;
  }
})();
