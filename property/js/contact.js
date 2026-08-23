(function () {
  'use strict';

  var PROD_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var PROD_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var CONTACT_ENDPOINT = PROD_URL + '/functions/v1/pro-demo-request';
  var VOICE_BUCKET = 'watchdog-voice-inbox';
  var MAX_SECONDS = 90;
  var MAX_BYTES = 6 * 1024 * 1024;

  var mode = 'message';
  var recorder = null;
  var stream = null;
  var chunks = [];
  var voiceBlob = null;
  var voiceMime = '';
  var startedAt = 0;
  var timer = null;
  var elapsedSeconds = 0;
  var storageClient = null;

  function q(id) { return document.getElementById(id); }
  function baseMime(value) { return String(value || '').toLowerCase().split(';')[0]; }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function setStatus(message, kind) {
    var node = q('contact-status');
    if (!node) return;
    node.textContent = message || '';
    node.className = 'contact-status' + (kind ? ' ' + kind : '');
  }
  function setBusy(busy) {
    ['contact-send','voice-send','voice-record','voice-stop','voice-reset'].forEach(function (id) {
      var button = q(id);
      if (button) button.disabled = !!busy || (id === 'voice-send' && !voiceBlob);
    });
  }
  function contactFields() {
    return {
      name: text(q('contact-name') && q('contact-name').value),
      email: text(q('contact-email') && q('contact-email').value),
      phone: text(q('contact-phone') && q('contact-phone').value),
      subject: text(q('contact-subject') && q('contact-subject').value),
      website: text(q('contact-website') && q('contact-website').value),
      source_path: location.pathname + location.search,
      referrer: document.referrer || ''
    };
  }
  function validateContact() {
    var data = contactFields();
    if (!data.name) return 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Please enter a valid email address.';
    return '';
  }
  function headers() {
    return { 'Content-Type': 'application/json', 'apikey': PROD_KEY, 'Authorization': 'Bearer ' + PROD_KEY };
  }
  async function post(payload) {
    var response = await fetch(CONTACT_ENDPOINT, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
    var body = {};
    try { body = await response.json(); } catch (_error) {}
    if (!response.ok || body.error) throw new Error(body.error || 'We could not save that message. Please try again.');
    return body;
  }
  function client() {
    if (storageClient) return storageClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') throw new Error('Secure upload is unavailable in this browser. Please send a written message instead.');
    storageClient = window.supabase.createClient(PROD_URL, PROD_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return storageClient;
  }
  function switchMode(next) {
    mode = next === 'voice' ? 'voice' : 'message';
    document.querySelectorAll('[data-contact-mode]').forEach(function (button) {
      var active = button.getAttribute('data-contact-mode') === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    q('message-panel').hidden = mode !== 'message';
    q('voice-panel').hidden = mode !== 'voice';
    setStatus('', '');
  }
  async function sendMessage(event) {
    event.preventDefault();
    var problem = validateContact();
    var message = text(q('contact-message') && q('contact-message').value);
    if (problem) return setStatus(problem, 'error');
    if (!message) return setStatus('Please enter a message.', 'error');
    setBusy(true);
    setStatus('Sending securely…', 'working');
    try {
      var data = contactFields();
      data.action = 'watchdog_contact_message';
      data.message = message;
      await post(data);
      q('contact-message').value = '';
      setStatus('Message received. Watchdog has it in the private communications inbox.', 'success');
    } catch (error) {
      setStatus(error.message || 'We could not send that message. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }
  function supportedMime() {
    var choices = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    if (!window.MediaRecorder) return '';
    for (var i = 0; i < choices.length; i += 1) {
      if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(choices[i])) return choices[i];
    }
    return '';
  }
  function updateTimer() {
    if (!startedAt) return;
    elapsedSeconds = Math.min(MAX_SECONDS, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    var node = q('voice-timer');
    if (node) node.textContent = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0') + ':' + String(elapsedSeconds % 60).padStart(2, '0') + ' / 01:30';
    if (elapsedSeconds >= MAX_SECONDS && recorder && recorder.state === 'recording') recorder.stop();
  }
  function stopStream() {
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    stream = null;
  }
  async function startRecording() {
    var problem = validateContact();
    if (problem) return setStatus(problem, 'error');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return setStatus('Browser recording is not available here. You can still send a written message.', 'error');
    resetVoice(false);
    setStatus('Requesting microphone access…', 'working');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var requestedMime = supportedMime();
      var options = requestedMime ? { mimeType: requestedMime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 };
      recorder = new MediaRecorder(stream, options);
      chunks = [];
      recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = function () { setStatus('Recording stopped because the browser reported a microphone error.', 'error'); stopStream(); };
      recorder.onstop = function () {
        window.clearInterval(timer);
        timer = null;
        updateTimer();
        stopStream();
        voiceMime = baseMime(recorder.mimeType || requestedMime || (chunks[0] && chunks[0].type));
        voiceBlob = new Blob(chunks, { type: voiceMime || 'audio/webm' });
        var preview = q('voice-preview');
        if (preview) {
          if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
          var url = URL.createObjectURL(voiceBlob);
          preview.src = url;
          preview.dataset.objectUrl = url;
          preview.hidden = false;
        }
        q('voice-record').hidden = false;
        q('voice-stop').hidden = true;
        q('voice-reset').hidden = false;
        q('voice-send').hidden = false;
        q('voice-send').disabled = !voiceBlob;
        if (voiceBlob.size > MAX_BYTES) {
          setStatus('That recording is larger than the 6 MB private-message limit. Please record a shorter message.', 'error');
          q('voice-send').disabled = true;
        } else {
          setStatus('Recording ready. Play it back, re-record it, or send it privately.', 'success');
        }
      };
      recorder.start(500);
      startedAt = Date.now();
      elapsedSeconds = 0;
      updateTimer();
      timer = window.setInterval(updateTimer, 250);
      q('voice-record').hidden = true;
      q('voice-stop').hidden = false;
      q('voice-reset').hidden = true;
      q('voice-send').hidden = true;
      q('voice-preview').hidden = true;
      setStatus('Recording. Your microphone audio stays in your browser until you choose Send voice message.', 'working');
    } catch (error) {
      stopStream();
      setStatus(error && error.name === 'NotAllowedError' ? 'Microphone access was not allowed. You can still send a written message.' : 'We could not start the microphone. You can still send a written message.', 'error');
    }
  }
  function stopRecording() {
    if (recorder && recorder.state === 'recording') recorder.stop();
  }
  function resetVoice(clearStatus) {
    if (recorder && recorder.state === 'recording') recorder.stop();
    window.clearInterval(timer);
    timer = null;
    stopStream();
    chunks = [];
    voiceBlob = null;
    voiceMime = '';
    startedAt = 0;
    elapsedSeconds = 0;
    var preview = q('voice-preview');
    if (preview) {
      if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
      preview.removeAttribute('src');
      preview.dataset.objectUrl = '';
      preview.hidden = true;
    }
    q('voice-record').hidden = false;
    q('voice-record').disabled = false;
    q('voice-stop').hidden = true;
    q('voice-reset').hidden = true;
    q('voice-send').hidden = true;
    var timerNode = q('voice-timer');
    if (timerNode) timerNode.textContent = '00:00 / 01:30';
    if (clearStatus !== false) setStatus('', '');
  }
  async function sendVoice() {
    var problem = validateContact();
    if (problem) return setStatus(problem, 'error');
    if (!voiceBlob || !voiceBlob.size) return setStatus('Record a voice message first.', 'error');
    if (voiceBlob.size > MAX_BYTES) return setStatus('That recording is larger than the 6 MB private-message limit. Please record it again.', 'error');
    var duration = Math.max(1, Math.min(MAX_SECONDS, elapsedSeconds || Math.ceil((Date.now() - startedAt) / 1000)));
    var mime = baseMime(voiceMime || voiceBlob.type);
    setBusy(true);
    setStatus('Preparing a private upload…', 'working');
    try {
      var data = contactFields();
      var reservation = await post(Object.assign({}, data, { action: 'watchdog_contact_voice_reserve', duration_seconds: duration, mime_type: mime }));
      if (!reservation.path || !reservation.upload_token || !reservation.finalize_token) throw new Error('The private upload could not be prepared.');
      var upload = await client().storage.from(reservation.bucket || VOICE_BUCKET).uploadToSignedUrl(reservation.path, reservation.upload_token, voiceBlob, { contentType: mime, upsert: false });
      if (upload.error) throw upload.error;
      await post({ action: 'watchdog_contact_voice_finalize', id: reservation.id, finalize_token: reservation.finalize_token });
      resetVoice(false);
      setStatus('Voice message received. The recording is private and available only in the Watchdog developer inbox.', 'success');
    } catch (error) {
      setStatus(error.message || 'We could not send that voice message. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-contact-mode]').forEach(function (button) {
      button.addEventListener('click', function () { switchMode(button.getAttribute('data-contact-mode')); });
    });
    var form = q('contact-form');
    if (form) form.addEventListener('submit', sendMessage);
    if (q('voice-record')) q('voice-record').addEventListener('click', startRecording);
    if (q('voice-stop')) q('voice-stop').addEventListener('click', stopRecording);
    if (q('voice-reset')) q('voice-reset').addEventListener('click', function () { resetVoice(true); });
    if (q('voice-send')) q('voice-send').addEventListener('click', sendVoice);
    switchMode('message');
  });

  window.addEventListener('pagehide', function () { stopStream(); });
})();
