(function () {
  'use strict';

  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client = null;
  var busy = false;
  var paddleReady = null;

  function sb() {
    if (!client && window.supabase) {
      client = window.supabase.createClient(URL, KEY, {
        auth: {
          persistSession: true,
          autoRefresh