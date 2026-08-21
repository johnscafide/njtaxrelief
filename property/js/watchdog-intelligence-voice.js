(function () {
  'use strict';

  const API = '/api/watchdog-intelligence-voice';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let client = null;
  let status = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let stopTimer = null;
  let activeAudio = null;
  let activeAudioUrl = '';

  function toast(message) {
    const node = $('#pl-toast');
    if (!node) return;
    node.textContent = message;
    node.style.display = 'block';
    clearTimeout(window.__wivToast);
    window.__wivToast = setTimeout(() => { node.style.display = 'none'; }, 4200);
  }

  async function accessToken() {
    const session = await client?.auth?.getSession?.();
    return session?.data?.session?.access_token || '';
  }

  async function voiceRequest(body) {
    const token = await accessToken();
    if (!token) throw new Error('Sign in is required for Voice Intelligence.');
    const response = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error || `Voice Intelligence failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadStatus(force) {
    if (status && !force) return status;
    status = await voiceRequest({ action: 'status' });
    return status;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(binary);
  }

  async function blobToBase64(blob) {
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  }

  function setVoiceStatus(copy, state) {
    const node = $('#dwa-voice-status');
    if (!node) return;
    node.textContent = copy;
    node.dataset.state = state || 'idle';
  }

  function clearPlayback() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio = null;
    }
    if (activeAudioUrl) {
      URL.revokeObjectURL(activeAudioUrl);
      activeAudioUrl = '';
    }
    $$('[data-dwa-listen]').forEach((button) => {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-volume-high"></i> Listen';
    });
  }

  function extractBrief(message) {
    const conclusion = $(':scope > p', message)?.textContent?.trim() || '';
    const sections = $$('.dwa-section', message);
    const read = (label) => {
      const section = sections.find((node) => $('strong', node)?.textContent?.trim().toLowerCase() === label);
      return section ? $$('li', section).map((item) => item.textContent.trim()).filter(Boolean) : [];
    };
    return { conclusion, evidence: read('evidence'), caveats: read('caveats') };
  }

  async function speak(message, button) {
    try {
      clearPlayback();
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Preparing';
      const brief = extractBrief(message);
      if (!brief.conclusion) throw new Error('No governed Analyst response is available to read.');
      const data = await voiceRequest({ action: 'speak', brief });
      const raw = atob(String(data.audio_base64 || ''));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.media_type || 'audio/mpeg' });
      activeAudioUrl = URL.createObjectURL(blob);
      activeAudio = new Audio(activeAudioUrl);
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-stop"></i> Stop';
      button.onclick = clearPlayback;
      activeAudio.onended = () => {
        clearPlayback();
        message.dataset.voiceWired = 'false';
        wireListenButton(message);
      };
      activeAudio.onerror = () => {
        clearPlayback();
        message.dataset.voiceWired = 'false';
        wireListenButton(message);
        toast('Watchdog Voice could not play that brief.');
      };
      await activeAudio.play();
    } catch (error) {
      clearPlayback();
      message.dataset.voiceWired = 'false';
      wireListenButton(message);
      toast(error?.message || 'Watchdog Voice could not create that brief.');
    }
  }

  function wireListenButton(message) {
    if (!status?.enabled || !message || message.dataset.voiceWired === 'true') return;
    if (!extractBrief(message).conclusion) return;
    message.dataset.voiceWired = 'true';
    message.querySelector('.dwa-voice-message-tools')?.remove();
    const footer = document.createElement('div');
    footer.className = 'dwa-voice-message-tools';
    footer.innerHTML = '<button type="button" data-dwa-listen><i class="fas fa-volume-high"></i> Listen</button><span>Spoken brief from the written Watchdog response</span>';
    message.appendChild(footer);
    const button = $('[data-dwa-listen]', footer);
    button.onclick = () => speak(message, button);
  }

  function wireAssistantMessages(root) {
    $$('.dwa-msg.assistant', root || document).forEach((message) => {
      const text = $(':scope > p', message)?.textContent || '';
      if (/Running an approved governed operation/i.test(text)) return;
      wireListenButton(message);
    });
  }

  function stopRecording() {
    clearTimeout(stopTimer);
    stopTimer = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  async function beginRecording(button) {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('This browser does not support microphone recording for Watchdog Voice.');
      return;
    }
    try {
      await loadStatus(false);
      if (!status?.enabled) throw new Error(status?.eligible ? 'Watchdog Voice is temporarily unavailable.' : 'Your current plan does not include Voice Intelligence.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => {
        setVoiceStatus('Microphone recording failed.', 'error');
        stopRecording();
      };
      recorder.onstop = async () => {
        const mime = recorder?.mimeType || chunks[0]?.type || 'audio/webm';
        stream?.getTracks?.().forEach((track) => track.stop());
        stream = null;
        recorder = null;
        button.disabled = true;
        button.classList.remove('recording');
        button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Transcribing';
        setVoiceStatus('Transcribing locally captured audio. The recording is not saved by Watchdog.', 'working');
        try {
          const blob = new Blob(chunks, { type: mime });
          chunks = [];
          if (!blob.size) throw new Error('No microphone audio was captured.');
          if (blob.size > 2500000) throw new Error('That recording is too large. Keep voice questions under 45 seconds.');
          const data = await voiceRequest({ action: 'transcribe', media_type: mime.split(';')[0] || mime, audio_base64: await blobToBase64(blob) });
          const input = $('#dwa-input');
          if (input) {
            input.value = data.text || '';
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          setVoiceStatus('Transcript ready. Review it, then choose Ask Watchdog.', 'ready');
        } catch (error) {
          setVoiceStatus(error?.message || 'Watchdog could not transcribe that recording.', 'error');
        } finally {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-microphone"></i> Voice';
          button.onclick = () => beginRecording(button);
        }
      };
      recorder.start(250);
      button.classList.add('recording');
      button.innerHTML = '<i class="fas fa-stop"></i> Stop';
      button.onclick = stopRecording;
      setVoiceStatus('Listening. Stop when your question is complete. Maximum 45 seconds.', 'recording');
      stopTimer = setTimeout(stopRecording, 45000);
    } catch (error) {
      stream?.getTracks?.().forEach((track) => track.stop());
      stream = null;
      recorder = null;
      button.classList.remove('recording');
      button.innerHTML = '<i class="fas fa-microphone"></i> Voice';
      button.onclick = () => beginRecording(button);
      setVoiceStatus(error?.message || 'Watchdog Voice could not access the microphone.', 'error');
    }
  }

  async function installComposeControls(panel) {
    if ($('#dwa-voice', panel)) return;
    const compose = $('.dwa-compose', panel);
    const row = $('.dwa-compose-row', panel);
    if (!compose || !row) return;

    const button = document.createElement('button');
    button.id = 'dwa-voice';
    button.className = 'dwa-voice-button';
    button.type = 'button';
    button.innerHTML = '<i class="fas fa-microphone"></i> Voice';
    button.setAttribute('aria-label', 'Record a voice question for Watchdog');
    button.onclick = () => beginRecording(button);

    const statusLine = document.createElement('div');
    statusLine.id = 'dwa-voice-status';
    statusLine.className = 'dwa-voice-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.textContent = 'Checking Watchdog Voice pilot availability...';

    row.insertBefore(button, $('#dwa-send', row));
    compose.appendChild(statusLine);

    try {
      const current = await loadStatus(true);
      if (!current.enabled) {
        button.disabled = true;
        if (!current.eligible && current.packaging === 'watchdog_intelligence_add_on_required') {
          setVoiceStatus('Voice Intelligence is available with the Watchdog Intelligence add-on, or included with Pro+ and Teams.', 'error');
        } else {
          setVoiceStatus(current.eligible ? 'Watchdog Voice is temporarily unavailable.' : 'Voice Intelligence is not included with this plan.', 'error');
        }
        return;
      }
      const accessCopy = current.packaging === 'watchdog_intelligence_add_on'
        ? 'Watchdog Intelligence add-on active.'
        : 'Voice Intelligence included with your plan.';
      setVoiceStatus(`${accessCopy} Audio is transcribed for the question and is not stored by Watchdog.`, 'idle');
      wireAssistantMessages(panel);
    } catch (error) {
      button.disabled = true;
      setVoiceStatus(error?.message || 'Watchdog Voice is temporarily unavailable.', 'error');
    }
  }

  function observePanel() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const panel = node.matches('#dwa-panel') ? node : $('#dwa-panel', node);
          if (panel) installComposeControls(panel);
          if (node.matches?.('.dwa-msg.assistant') || $('.dwa-msg.assistant', node)) wireAssistantMessages($('#dwa-panel') || node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function install() {
    try {
      await Promise.resolve(window.njptrAccessReady);
      client = window.NJPTRAccess?.client?.();
      if (!client) return;
      observePanel();
      const existing = $('#dwa-panel');
      if (existing) installComposeControls(existing);
    } catch (_) { /* Access guard owns the signed-out experience. */ }
  }

  window.addEventListener('beforeunload', () => {
    clearTimeout(stopTimer);
    stream?.getTracks?.().forEach((track) => track.stop());
    clearPlayback();
  });

  install();
})();
