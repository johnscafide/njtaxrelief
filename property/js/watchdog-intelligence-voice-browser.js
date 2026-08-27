(function () {
  'use strict';

  const VOICE_API = '/api/watchdog-intelligence-voice';
  const USAGE_API = '/api/watchdog-intelligence-voice-browser-usage';
  const NARRATION_SRC = '/property/js/watchdog-intelligence-narration.js?v=20260823';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let recognition = null;
  let recognitionButton = null;
  let recognitionTimer = null;
  let browserEligible = false;
  let activeUtterance = null;
  let activeListenButton = null;
  let activeNarration = null;
  let narrationPromise = null;
  let pendingVoiceQuery = null;

  function toast(message) {
    const node = $('#pl-toast');
    if (!node) return;
    node.textContent = message;
    node.style.display = 'block';
    clearTimeout(window.__wivBrowserToast);
    window.__wivBrowserToast = setTimeout(() => { node.style.display = 'none'; }, 4300);
  }

  function statusLine(copy, state) {
    const node = $('#dwa-voice-status');
    if (!node) return;
    node.textContent = copy;
    node.dataset.state = state || 'idle';
  }

  async function token() {
    const client = window.NJPTRAccess?.client?.();
    const session = await client?.auth?.getSession?.();
    return session?.data?.session?.access_token || '';
  }

  async function post(url, body) {
    const accessToken = await token();
    if (!accessToken) throw new Error('Sign in is required for Voice Intelligence.');
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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

  async function reserve(kind, metadata) {
    try {
      return await post(USAGE_API, { kind, metadata: metadata || {} });
    } catch (error) {
      if ([401, 403, 429].includes(Number(error?.status))) throw error;
      return null;
    }
  }

  async function telemetry(event, metadata) {
    try {
      await post(USAGE_API, { kind: 'event', event, metadata: metadata || {} });
    } catch (_) { /* Telemetry must never block a valid governed Voice interaction. */ }
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
      edited: pending.edited === true,
      reviewedMs: Math.max(0, Number(pending.reviewedMs || 0)),
      surface: String(pending.surface || currentSurface()),
      submitted: pending.submitted === true,
    };
  }

  function clearPendingVoiceQuery() {
    pendingVoiceQuery = null;
  }

  async function queryTelemetry(event, snapshot) {
    if (!snapshot) return;
    try {
      await post(USAGE_API, {
        kind: 'event',
        event,
        model: 'browser_speech_recognition',
        metadata: {
          edited: snapshot.edited,
          reviewed_ms: snapshot.reviewedMs,
          surface: snapshot.surface,
        },
      });
    } catch (_) { /* Lifecycle telemetry must never block the governed Analyst workflow. */ }
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
    void queryTelemetry('query_submitted', lifecycleSnapshot(pendingVoiceQuery));
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

  function resetVoiceButton() {
    const button = recognitionButton || $('#dwa-voice');
    if (button) {
      button.disabled = false;
      button.classList.remove('recording');
      button.innerHTML = '<i class="fas fa-microphone"></i> Voice';
    }
    recognitionButton = null;
  }

  function stopRecognition() {
    clearTimeout(recognitionTimer);
    recognitionTimer = null;
    try { recognition?.stop?.(); } catch (_) { /* no-op */ }
  }

  async function startRecognition(button) {
    if (!Recognition) return;
    button.disabled = true;
    try {
      await reserve('transcription', { engine: 'browser_speech_recognition' });
    } catch (error) {
      resetVoiceButton();
      statusLine(error?.message || 'Voice Intelligence is unavailable.', 'error');
      return;
    }

    let finalText = '';
    let interimText = '';
    recognitionButton = button;
    recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      button.disabled = false;
      button.classList.add('recording');
      button.innerHTML = '<i class="fas fa-stop"></i> Stop';
      statusLine('Listening in your browser. Stop when your question is complete. Maximum 45 seconds.', 'recording');
      recognitionTimer = setTimeout(stopRecognition, 45000);
    };
    recognition.onresult = (event) => {
      interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = String(event.results[i][0]?.transcript || '');
        if (event.results[i].isFinal) finalText += `${text} `;
        else interimText += text;
      }
      const preview = `${finalText}${interimText}`.trim();
      if (preview) statusLine(`Listening: ${preview.slice(0, 140)}${preview.length > 140 ? '…' : ''}`, 'recording');
    };
    recognition.onerror = (event) => {
      const code = String(event?.error || '');
      if (code === 'aborted') return;
      const message = code === 'not-allowed' || code === 'service-not-allowed'
        ? 'Microphone access was blocked. Allow microphone access for Watchdog and try again.'
        : code === 'no-speech'
          ? 'No speech was detected. Try again and speak after the microphone starts.'
          : 'Browser voice recognition could not complete that recording.';
      statusLine(message, 'error');
    };
    recognition.onend = () => {
      clearTimeout(recognitionTimer);
      recognitionTimer = null;
      const transcript = `${finalText}${interimText}`.replace(/\s+/g, ' ').trim().slice(0, 1800);
      recognition = null;
      resetVoiceButton();
      if (!transcript) {
        clearPendingVoiceQuery();
        if ($('#dwa-voice-status')?.dataset.state === 'recording') statusLine('No speech was captured. Choose Voice to try again.', 'error');
        return;
      }
      const input = $('#dwa-input');
      if (input) {
        input.value = transcript;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        pendingVoiceQuery = {
          transcript: normalizedQuestion(transcript),
          readyAt: Date.now(),
          submitted: false,
          edited: false,
          reviewedMs: 0,
          surface: currentSurface(),
        };
      }
      statusLine('Transcript ready. Review it, then choose Ask Watchdog.', 'ready');
    };

    try { recognition.start(); } catch (error) {
      recognition = null;
      clearPendingVoiceQuery();
      resetVoiceButton();
      statusLine(error?.message || 'Browser voice recognition could not start.', 'error');
    }
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

  function resetListen() {
    if (activeListenButton) {
      activeListenButton.disabled = false;
      activeListenButton.innerHTML = '<i class="fas fa-volume-high"></i> Listen';
    }
    activeListenButton = null;
    activeUtterance = null;
    activeNarration = null;
  }

  async function stopActiveNarration(reason) {
    if (!activeListenButton) return;
    const prior = activeNarration;
    window.speechSynthesis.cancel();
    resetListen();
    if (prior) await telemetry(reason || 'narration_stopped', prior);
  }

  async function speakBrowser(button) {
    const message = button.closest('.dwa-msg.assistant');
    if (!message) return;
    let contract;
    try { contract = await ensureNarration(); } catch (error) { toast(error.message); return; }
    const brief = extractBrief(message);
    if (!brief.conclusion) {
      toast('No governed Watchdog response is available to read.');
      return;
    }
    if (activeListenButton) {
      const same = activeListenButton === button;
      await stopActiveNarration('narration_stopped');
      if (same) return;
    }

    const format = selectedFormat(message, contract);
    let narration;
    try { narration = contract.formatBrief(brief, format); } catch (error) { toast(error.message); return; }
    const context = narrationContext(message);
    const meta = { format: narration.format, narration_version: narration.version, engine: 'browser_speech_synthesis', text_chars: narration.text.length, surface: context.surface || 'unknown' };
    try {
      button.disabled = true;
      await reserve('speech', meta);
      button.disabled = false;
    } catch (error) {
      button.disabled = false;
      toast(error?.message || 'Voice Intelligence is unavailable.');
      return;
    }

    await telemetry('narration_started', meta);
    const utterance = new SpeechSynthesisUtterance(narration.text);
    utterance.lang = navigator.language || 'en-US';
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.onend = () => { telemetry('narration_completed', meta); resetListen(); };
    utterance.onerror = () => { telemetry('narration_failed', meta); resetListen(); };
    activeUtterance = utterance;
    activeListenButton = button;
    activeNarration = meta;
    button.innerHTML = '<i class="fas fa-stop"></i> Stop';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function ensureListen(message) {
    if (!browserEligible || !canSpeak || !message) return;
    const brief = extractBrief(message);
    if (!brief.conclusion) return;
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
  }

  function wireMessages(root) {
    $$('.dwa-msg.assistant', root || document).forEach((message) => {
      const copy = $(':scope > p', message)?.textContent || '';
      if (/Running an approved governed operation/i.test(copy)) return;
      ensureListen(message);
    });
  }

  async function enhancePanel(panel) {
    if (!panel) return;
    try {
      const current = await post(VOICE_API, { action: 'status' });
      browserEligible = Boolean(current?.eligible);
      if (!browserEligible) return;
      const button = $('#dwa-voice', panel);
      if (button && Recognition) {
        button.disabled = false;
        button.dataset.browserVoice = 'true';
        statusLine('Browser Voice is ready. Your browser handles recognition; Watchdog does not store the microphone recording.', 'idle');
      } else if (button && !Recognition) {
        statusLine('This browser does not support the zero-spend Voice transcription path. Typed Ask Watchdog remains available.', 'error');
      }
      wireMessages(panel);
    } catch (_) { /* Existing signed-in and plan gates remain authoritative. */ }
  }

  document.addEventListener('click', (event) => {
    const send = event.target.closest?.('#dwa-send');
    if (send) captureVoiceSubmission();

    const voice = event.target.closest?.('#dwa-voice');
    if (voice && Recognition && browserEligible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (recognition) stopRecognition();
      else startRecognition(voice);
      return;
    }
    const listen = event.target.closest?.('[data-dwa-listen]');
    if (listen && canSpeak && browserEligible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      speakBrowser(listen);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && event.target?.matches?.('#dwa-input')) captureVoiceSubmission();
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.matches?.('#dwa-input') && event.isTrusted && pendingVoiceQuery?.submitted) clearPendingVoiceQuery();
  }, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        const panel = node.matches('#dwa-panel') ? node : $('#dwa-panel', node);
        if (panel) {
          setTimeout(() => enhancePanel(panel), 120);
          setTimeout(() => enhancePanel(panel), 700);
        }
        if (browserEligible && (node.matches?.('.dwa-msg.assistant') || $('.dwa-msg.assistant', node))) wireMessages($('#dwa-panel') || node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('watchdog:contextual-analyst-response', () => {
    const snapshot = lifecycleSnapshot(pendingVoiceQuery);
    if (!snapshot?.submitted) return;
    clearPendingVoiceQuery();
    void queryTelemetry('query_converted', snapshot);
  });
  window.addEventListener('watchdog:intelligence-command-local', clearPendingVoiceQuery);
  window.addEventListener('watchdog:intelligence-command-cancelled', clearPendingVoiceQuery);
  window.addEventListener('watchdog:contextual-analyst-open', () => {
    if (pendingVoiceQuery) clearPendingVoiceQuery();
  });

  window.addEventListener('beforeunload', () => {
    stopRecognition();
    clearPendingVoiceQuery();
    if (canSpeak) window.speechSynthesis.cancel();
  });
})();