(function () {
  'use strict';

  const API = '/api/watchdog-intelligence-voice';
  const USAGE_API = '/api/watchdog-intelligence-voice-browser-usage';
  const NARRATION_SRC = '/property/js/watchdog-intelligence-narration.js?v=20260823';
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
  let narrationPromise = null;
  let pendingVoiceQuery = null;

  function toast(message) {
    const node = $('#pl-toast');
    if (!node) return;
    node.textContent = message;
    node.style.display = 'block';
    clearTimeout(window.__wivToast);
    window.__wivToast = window.setTimeout(() => { node.style.display = 'none'; }, 4200);
  }

  function resolveClient() {
    if (client) return client;
    try {
      client = window.NJPTRAccess?.client?.() || window.NJPTRSupabaseRuntime?.createClient?.() || null;
    } catch (_) {
      client = null;
    }
    return client;
  }

  async function waitForClient() {
    let runtime = resolveClient();
    if (runtime) return runtime;
    try {
      await Promise.race([
        Promise.resolve(window.njptrAccessReady),
        new Promise((resolve) => window.setTimeout(resolve, 800)),
      ]);
    } catch (_) { /* The bounded retry below remains authoritative. */ }
    for (let attempt = 0; attempt < 15 && !runtime; attempt += 1) {
      runtime = resolveClient();
      if (!runtime) await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return runtime;
  }

  async function accessToken() {
    const runtime = await waitForClient();
    const session = await runtime?.auth?.getSession?.();
    return session?.data?.session?.access_token || '';
  }

  async function authenticatedRequest(url, body) {
    const token = await accessToken();
    if (!token) throw new Error('Sign in is required for Voice Intelligence.');
    const response = await fetch(url, {
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

  async function voiceRequest(body) {
    return authenticatedRequest(API, body);
  }

  function normalizedQuestion(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function currentSurface() {
    return $('#dwa-panel')?.dataset?.watchdogSurface || 'unknown';
  }

  function lifecycleSnapshot(pending) {
    if (!pending) return null;
    return {
      model: String(pending.model || ''),
      edited: pending.edited === true,
      reviewedMs: Math.max(0, Number(pending.reviewedMs || 0)),
      surface: String(pending.surface || currentSurface()),
      submitted: pending.submitted === true,
    };
  }

  function clearPendingVoiceQuery() {
    pendingVoiceQuery = null;
  }

  async function reportQueryLifecycle(event, snapshot) {
    if (!snapshot) return;
    try {
      await authenticatedRequest(USAGE_API, {
        kind: 'event',
        event,
        model: snapshot.model,
        metadata: {
          edited: snapshot.edited,
          reviewed_ms: snapshot.reviewedMs,
          surface: snapshot.surface,
        },
      });
    } catch (_) {
      /* Evaluation telemetry must never block the governed Analyst workflow. */
    }
  }

  function captureVoiceSubmission() {
    const input = $('#dwa-input');
    if (!pendingVoiceQuery || pendingVoiceQuery.submitted || !input) return;
    const submitted = normalizedQuestion(input.value);
    if (!submitted) return;
    pendingVoiceQuery.submitted = true;
    pendingVoiceQuery.edited = submitted !== pendingVoiceQuery.transcript;
    pendingVoiceQuery.reviewedMs = Date.now() - pendingVoiceQuery.readyAt;
    pendingVoiceQuery.surface = currentSurface();
    void reportQueryLifecycle('query_submitted', lifecycleSnapshot(pendingVoiceQuery));
  }

  async function loadStatus(force) {
    if (status && !force) return status;
    status = await voiceRequest({ action: 'status' });
    return status;
  }

  function ensureNarration() {
    if (window.WatchdogIntelligenceNarration) return Promise.resolve(window.WatchdogIntelligenceNarration);
    if (narrationPromise) return narrationPromise;
    narrationPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = NARRATION_SRC;
      script.async = true;
      script.onload = () => window.WatchdogIntelligenceNarration ? resolve(window.WatchdogIntelligenceNarration) : reject(new Error('Watchdog narration contract did not initialize.'));
      script.onerror = () => reject(new Error('Watchdog narration contract could not load.'));
      document.head.appendChild(script);
    });
    return narrationPromise;
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

  function sectionItems(message, label, max) {
    const sections = $$('.dwa-section', message);
    const section = sections.find((node) => $('strong', node)?.textContent?.trim().toLowerCase() === label);
    return section ? $$('li', section).slice(0, max).map((item) => item.textContent.trim()).filter(Boolean) : [];
  }

  function sourceLabels(message, max) {
    const sections = $$('.dwa-section', message);
    const section = sections.find((node) => $('strong', node)?.textContent?.trim().toLowerCase() === 'sources');
    return section ? $$('.dwa-source', section).slice(0, max).map((item) => item.textContent.trim()).filter(Boolean) : [];
  }

  function extractBrief(message) {
    return {
      conclusion: $(':scope > p', message)?.textContent?.trim() || '',
      evidence: sectionItems(message, 'evidence', 8),
      missing_evidence: sectionItems(message, 'missing evidence', 6),
      caveats: sectionItems(message, 'caveats', 5),
      sources: sourceLabels(message, 6),
    };
  }

  function narrationContext(message) {
    const previous = message.previousElementSibling;
    const prompt = previous?.classList?.contains('user') ? previous.textContent?.trim() || '' : '';
    const surface = message.closest('#dwa-panel')?.dataset?.watchdogSurface || '';
    const tool = message.querySelector('[data-dwa-evidence-note]') ? 'inspect_lineage' : '';
    return { prompt, surface, tool, hasEvidence: sectionItems(message, 'evidence', 1).length > 0, hasSources: sourceLabels(message, 1).length > 0 };
  }

  function availableFormatKeys(contract, message) {
    const context = narrationContext(message);
    const keys = ['quick', 'professional'];
    if (context.hasEvidence || context.hasSources || context.tool === 'inspect_lineage') keys.push('evidence');
    if (/daily|watchlist/.test(context.surface.toLowerCase()) || /what changed|change|changed|latest|material/.test(context.prompt.toLowerCase())) keys.push('changes');
    return contract.FORMAT_ORDER.filter((key) => keys.includes(key));
  }

  function selectedFormat(message, contract) {
    const select = $('[data-dwa-narration-format]', message);
    return contract.FORMATS[select?.value] ? select.value : 'quick';
  }

  async function speak(message, button) {
    try {
      clearPlayback();
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Preparing';
      const contract = await ensureNarration();
      const brief = extractBrief(message);
      if (!brief.conclusion) throw new Error('No governed Analyst response is available to read.');
      const format = selectedFormat(message, contract);
      const data = await voiceRequest({ action: 'speak', format, brief });
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

  async function wireListenButton(message) {
    if (!status?.enabled || !message || message.dataset.voiceWired === 'true') return;
    if (!extractBrief(message).conclusion) return;
    let contract;
    try { contract = await ensureNarration(); } catch (_) { return; }
    message.dataset.voiceWired = 'true';
    message.querySelector('.dwa-voice-message-tools')?.remove();
    const keys = availableFormatKeys(contract, message);
    const context = narrationContext(message);
    const defaultFormat = context.tool === 'inspect_lineage' && keys.includes('evidence') ? 'evidence'
      : /what changed|change|changed|latest|material/.test(context.prompt.toLowerCase()) && keys.includes('changes') ? 'changes'
        : 'quick';
    const footer = document.createElement('div');
    footer.className = 'dwa-voice-message-tools dwa-narration-tools';
    footer.innerHTML = `<label class="dwa-narration-label"><span>Listen as</span><select data-dwa-narration-format aria-label="Choose Watchdog narration format">${keys.map((key) => `<option value="${key}"${key === defaultFormat ? ' selected' : ''}>${contract.FORMATS[key].label}</option>`).join('')}</select></label><button type="button" data-dwa-listen aria-label="${contract.FORMATS[defaultFormat].aria}"><i class="fas fa-volume-high"></i> Listen</button><span class="dwa-narration-note">Spoken only from the written governed response</span>`;
    message.appendChild(footer);
    const select = $('[data-dwa-narration-format]', footer);
    const button = $('[data-dwa-listen]', footer);
    select?.addEventListener('change', () => {
      const format = contract.FORMATS[select.value] || contract.FORMATS.quick;
      button?.setAttribute('aria-label', format.aria);
    });
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
            const transcript = String(data.text || '');
            input.value = transcript;
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            pendingVoiceQuery = {
              transcript: normalizedQuestion(transcript),
              model: String(data.model || ''),
              readyAt: Date.now(),
              submitted: false,
              edited: false,
              reviewedMs: 0,
              surface: currentSurface(),
            };
          }
          setVoiceStatus('Transcript ready. Review it, then choose Ask Watchdog.', 'ready');
        } catch (error) {
          clearPendingVoiceQuery();
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
      stopTimer = window.setTimeout(stopRecording, 45000);
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

    const input = $('#dwa-input', panel);
    const send = $('#dwa-send', panel);
    send?.addEventListener('click', captureVoiceSubmission);
    input?.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') captureVoiceSubmission();
    });
    input?.addEventListener('input', (event) => {
      if (event.isTrusted && pendingVoiceQuery?.submitted) clearPendingVoiceQuery();
    });

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
    observePanel();
    const existing = $('#dwa-panel');
    if (existing) installComposeControls(existing);
    try {
      await Promise.resolve(window.njptrAccessReady);
      resolveClient();
    } catch (_) {
      resolveClient();
    }
  }

  window.addEventListener('watchdog:contextual-analyst-response', () => {
    const snapshot = lifecycleSnapshot(pendingVoiceQuery);
    if (!snapshot?.submitted) return;
    clearPendingVoiceQuery();
    void reportQueryLifecycle('query_converted', snapshot);
  });
  window.addEventListener('watchdog:intelligence-command-local', clearPendingVoiceQuery);
  window.addEventListener('watchdog:intelligence-command-cancelled', clearPendingVoiceQuery);
  window.addEventListener('watchdog:contextual-analyst-open', () => {
    if (pendingVoiceQuery) clearPendingVoiceQuery();
  });

  window.addEventListener('beforeunload', () => {
    clearTimeout(stopTimer);
    stream?.getTracks?.().forEach((track) => track.stop());
    clearPlayback();
    clearPendingVoiceQuery();
  });

  install();
})();
