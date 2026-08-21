(function () {
  'use strict';

  const VOICE_API = '/api/watchdog-intelligence-voice';
  const USAGE_API = '/api/watchdog-intelligence-voice-browser-usage';
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

  async function reserve(kind) {
    try {
      return await post(USAGE_API, { kind });
    } catch (error) {
      if ([401, 403, 429].includes(Number(error?.status))) throw error;
      return null;
    }
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
      await reserve('transcription');
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
        if ($('#dwa-voice-status')?.dataset.state === 'recording') statusLine('No speech was captured. Choose Voice to try again.', 'error');
        return;
      }
      const input = $('#dwa-input');
      if (input) {
        input.value = transcript;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      statusLine('Transcript ready. Review it, then choose Ask Watchdog.', 'ready');
    };

    try { recognition.start(); } catch (error) {
      recognition = null;
      resetVoiceButton();
      statusLine(error?.message || 'Browser voice recognition could not start.', 'error');
    }
  }

  function briefText(message) {
    const conclusion = $(':scope > p', message)?.textContent?.trim() || '';
    if (!conclusion) return '';
    const sections = $$('.dwa-section', message);
    const sectionItems = (label, max) => {
      const section = sections.find((node) => $('strong', node)?.textContent?.trim().toLowerCase() === label);
      return section ? $$('li', section).slice(0, max).map((item) => item.textContent.trim()).filter(Boolean) : [];
    };
    const evidence = sectionItems('evidence', 4);
    const caveats = sectionItems('caveats', 2);
    const parts = ['Watchdog Intelligence brief.', conclusion];
    if (evidence.length) parts.push(`Key evidence. ${evidence.join(' ')}`);
    if (caveats.length) parts.push(`Important context. ${caveats.join(' ')}`);
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 2400);
  }

  function resetListen() {
    if (activeListenButton) {
      activeListenButton.disabled = false;
      activeListenButton.innerHTML = '<i class="fas fa-volume-high"></i> Listen';
    }
    activeListenButton = null;
    activeUtterance = null;
  }

  async function speakBrowser(button) {
    const message = button.closest('.dwa-msg.assistant');
    const text = message ? briefText(message) : '';
    if (!text) {
      toast('No governed Watchdog response is available to read.');
      return;
    }
    if (activeListenButton) {
      window.speechSynthesis.cancel();
      const same = activeListenButton === button;
      resetListen();
      if (same) return;
    }
    try {
      button.disabled = true;
      await reserve('speech');
      button.disabled = false;
    } catch (error) {
      button.disabled = false;
      toast(error?.message || 'Voice Intelligence is unavailable.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || 'en-US';
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.onend = resetListen;
    utterance.onerror = resetListen;
    activeUtterance = utterance;
    activeListenButton = button;
    button.innerHTML = '<i class="fas fa-stop"></i> Stop';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function ensureListen(message) {
    if (!browserEligible || !canSpeak || !message || !briefText(message)) return;
    if ($('[data-dwa-listen]', message)) return;
    const footer = document.createElement('div');
    footer.className = 'dwa-voice-message-tools';
    footer.innerHTML = '<button type="button" data-dwa-listen><i class="fas fa-volume-high"></i> Listen</button><span>Spoken from the written Watchdog response</span>';
    message.appendChild(footer);
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

  window.addEventListener('beforeunload', () => {
    stopRecognition();
    if (canSpeak) window.speechSynthesis.cancel();
  });
})();
