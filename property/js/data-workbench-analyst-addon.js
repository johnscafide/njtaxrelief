(function () {
  'use strict';

  const FEATURE = 'watchdog_intelligence';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  let client = null;
  let sessionId = '';

  function activeEntitlement(row) {
    const status = String(row?.status || '').toLowerCase();
    if (!['active', 'trialing'].includes(status)) return false;
    if (!row?.current_period_end) return true;
    const end = Date.parse(row.current_period_end);
    return !Number.isFinite(end) || end > Date.now();
  }

  function pins() {
    const checked = $$('[data-row]:checked').map((node) => node.dataset.row).filter(Boolean);
    const visible = $$('[data-row]').map((node) => node.dataset.row).filter(Boolean);
    return [...new Set(checked.length ? checked : visible)]
      .filter((pin) => /^\d{4}_.+/.test(pin))
      .slice(0, 100);
  }

  function close() {
    $('#dwa-backdrop')?.remove();
    $('#dwa-panel')?.remove();
  }

  function shell() {
    close();
    const backdrop = document.createElement('div');
    const panel = document.createElement('aside');
    backdrop.id = 'dwa-backdrop';
    backdrop.className = 'dwa-backdrop';
    panel.id = 'dwa-panel';
    panel.className = 'dwa-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `
      <header class="dwa-head">
        <div><span>WATCHDOG INTELLIGENCE</span><h2>Ask Watchdog</h2><p>Natural-language analysis over approved Watchdog tools.</p></div>
        <button class="dwa-close" type="button" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </header>
      <div class="dwa-body" id="dwa-body"></div>`;
    document.body.append(backdrop, panel);
    backdrop.onclick = close;
    $('.dwa-close', panel).onclick = close;
    return $('#dwa-body', panel);
  }

  function friendly(error) {
    const message = String(error?.message || '');
    if (/403|plan required|minimum_plan/i.test(message)) {
      return 'That Watchdog operation requires a higher underlying data or model entitlement. Your Intelligence add-on remains active for the operations available to your plan.';
    }
    if (/429|usage/i.test(message)) return 'Watchdog Analyst has reached its current usage limit. Try again later.';
    return 'Watchdog could not complete that request right now. No unsupported conclusion was generated.';
  }

  function providerNote(data) {
    if (data?.provider_status === 'complete') return `AI explanation | ${esc(data.model || 'provider model')} | prompt v${esc(data.prompt?.version || '?')}`;
    if (data?.provider_status === 'provider_unavailable') return 'Deterministic mode: governed analysis remains available while the AI prose provider is unavailable.';
    return data?.access_path === 'watchdog_intelligence_add_on' ? 'Watchdog Intelligence add-on access.' : 'Governed Watchdog response.';
  }

  function analystMessage(response) {
    const value = response || {};
    const evidence = Array.isArray(value.evidence) ? value.evidence : [];
    const missing = Array.isArray(value.missing_evidence) ? value.missing_evidence : [];
    const caveats = Array.isArray(value.caveats) ? value.caveats : [];
    const actions = Array.isArray(value.suggested_actions) ? value.suggested_actions : [];
    const sources = Array.isArray(value.sources) ? value.sources : [];
    return `
      <div class="dwa-msg assistant">
        <b>Watchdog Analyst</b>
        <p>${esc(value.conclusion || 'No conclusion returned.')}</p>
        ${evidence.length ? `<div class="dwa-section"><strong>Evidence</strong><ul>${evidence.slice(0, 12).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
        ${missing.length ? `<div class="dwa-section"><strong>Missing evidence</strong><ul>${missing.slice(0, 10).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
        ${caveats.length ? `<div class="dwa-section"><strong>Caveats</strong><ul>${caveats.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
        ${sources.length ? `<div class="dwa-section"><strong>Sources</strong>${sources.map((item) => item?.url ? `<a class="dwa-source" target="_blank" rel="noopener noreferrer" href="${esc(item.url)}">${esc(item.label || 'Source')} <i class="fas fa-arrow-up-right-from-square"></i></a>` : '').join('')}</div>` : ''}
        ${actions.length ? `<div class="dwa-action-row">${actions.filter((action) => ['create_case', 'create_report', 'watch_property'].includes(action)).map((action) => `<button type="button" data-dwa-addon-action="${esc(action)}">${action === 'create_case' ? 'Create case' : action === 'create_report' ? 'Create report' : 'Watch property'}</button>`).join('')}</div>` : ''}
        <div class="dwa-provider" data-dwa-provider-note></div>
      </div>`;
  }

  function actionPrompt(action) {
    if (action === 'create_case') return 'Create a case from the current finding.';
    if (action === 'create_report') return 'Create a report from the current finding.';
    return 'Watch this property from the current finding.';
  }

  async function ask(prompt) {
    const input = $('#dwa-input');
    const send = $('#dwa-send');
    const chat = $('#dwa-chat');
    if (!prompt.trim() || !chat) return;

    chat.insertAdjacentHTML('beforeend', `<div class="dwa-msg user"><p>${esc(prompt)}</p></div>`);
    if (input) input.value = '';
    if (send) {
      send.disabled = true;
      send.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Working';
    }
    const pending = document.createElement('div');
    pending.className = 'dwa-msg assistant';
    pending.innerHTML = '<b>Watchdog Analyst</b><p>Running an approved governed operation...</p>';
    chat.appendChild(pending);
    chat.scrollTop = chat.scrollHeight;

    try {
      const result = await client.functions.invoke('intelligence-analyst', {
        body: { prompt, session_id: sessionId || null, context: { pams_pins: pins(), surface: 'data_workbench_agent_addon' } }
      });
      if (result.error) throw result.error;
      sessionId = result.data?.session_id || sessionId;
      pending.outerHTML = analystMessage(result.data?.response);
      const assistantMessages = $$('.dwa-msg.assistant', chat);
      const newest = assistantMessages[assistantMessages.length - 1];
      const note = newest ? $('[data-dwa-provider-note]', newest) : null;
      if (note) note.textContent = providerNote(result.data);
      if (newest) $$('[data-dwa-addon-action]', newest).forEach((button) => {
        button.onclick = () => ask(actionPrompt(button.dataset.dwaAddonAction));
      });
    } catch (error) {
      pending.innerHTML = `<b>Watchdog Analyst</b><p>${esc(friendly(error))}</p>`;
    } finally {
      if (send) {
        send.disabled = false;
        send.innerHTML = '<i class="fas fa-paper-plane"></i> Ask Watchdog';
      }
      chat.scrollTop = chat.scrollHeight;
    }
  }

  function open() {
    const host = shell();
    host.innerHTML = `
      <div class="dwa-note"><b>Watchdog Intelligence add-on.</b> Voice and Analyst use the same approved-tool, source-backed architecture. The add-on does not silently unlock data or model capabilities above your underlying plan.</div>
      <div class="dwa-chips">
        <button class="dwa-chip">What do you know about the selected property?</button>
        <button class="dwa-chip">What changed for this property?</button>
        <button class="dwa-chip">Show the source lineage for this finding.</button>
      </div>
      <div class="dwa-chat" id="dwa-chat"></div>
      <div class="dwa-compose">
        <textarea id="dwa-input" maxlength="1800" placeholder="Ask about selected properties, evidence, changes, sources or actions..."></textarea>
        <div class="dwa-compose-row"><small>${pins().length} selected or visible governed propert${pins().length === 1 ? 'y' : 'ies'} in context</small><button class="dwa-send" id="dwa-send" type="button"><i class="fas fa-paper-plane"></i> Ask Watchdog</button></div>
      </div>`;
    $$('.dwa-chip', host).forEach((button) => { button.onclick = () => ask(button.textContent); });
    $('#dwa-send', host).onclick = () => ask($('#dwa-input', host).value);
    $('#dwa-input', host).addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        ask(event.target.value);
      }
    });
  }

  async function install() {
    try {
      await Promise.resolve(window.njptrAccessReady);
      client = window.NJPTRAccess?.client?.();
      if (!client) return;
      const usage = await client.rpc('get_agent_usage');
      if (usage.data?.plan !== 'agent') return;
      const session = await client.auth.getSession();
      const userId = session?.data?.session?.user?.id;
      if (!userId) return;
      const entitlement = await client.from('account_feature_entitlements')
        .select('status,current_period_end')
        .eq('user_id', userId)
        .eq('feature_key', FEATURE)
        .maybeSingle();
      if (!activeEntitlement(entitlement.data)) return;

      const timer = setInterval(() => {
        const existing = $('#dw-analyst');
        if (!existing) return;
        clearInterval(timer);
        const button = existing.cloneNode(true);
        button.classList.remove('locked');
        button.dataset.addonAccess = 'watchdog_intelligence';
        button.innerHTML = '<i class="fas fa-message-dots"></i> Ask Watchdog';
        button.onclick = open;
        existing.replaceWith(button);
      }, 120);
    } catch (_) { /* Existing plan gate remains authoritative if add-on lookup fails. */ }
  }

  install();
})();