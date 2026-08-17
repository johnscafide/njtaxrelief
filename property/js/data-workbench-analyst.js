(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const rank = (plan) => ({ standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 }[plan] ?? 0);

  let client = null;
  let plan = 'standard';
  let sessionId = '';
  let objective = 'general';
  let profession = 'general';

  function pins() {
    const checked = $$('[data-row]:checked').map((node) => node.dataset.row).filter(Boolean);
    const visible = $$('[data-row]').map((node) => node.dataset.row).filter(Boolean);
    return [...new Set(checked.length ? checked : visible)]
      .filter((pin) => /^\d{4}_.+/.test(pin))
      .slice(0, 100);
  }

  function close() {
    document.getElementById('dwa-backdrop')?.remove();
    document.getElementById('dwa-panel')?.remove();
  }

  function toast(message) {
    const node = $('#pl-toast');
    if (!node) return;
    node.textContent = message;
    node.style.display = 'block';
    clearTimeout(window.__dwaToast);
    window.__dwaToast = setTimeout(() => { node.style.display = 'none'; }, 3600);
  }

  function shell(title, subtitle) {
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
        <div><span>WATCHDOG INTELLIGENCE</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
        <button class="dwa-close" type="button" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </header>
      <div class="dwa-body" id="dwa-body"></div>`;
    document.body.append(backdrop, panel);
    backdrop.onclick = close;
    $('.dwa-close', panel).onclick = close;
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); }, { once: true });
    return $('#dwa-body', panel);
  }

  function friendly(error) {
    const message = String(error?.message || '');
    if (/403|pro plan|required/i.test(message)) return 'Your current plan does not include this Intelligence feature.';
    if (/429|usage/i.test(message)) return 'Watchdog Analyst has reached its preview usage limit. Try again later.';
    return 'Watchdog could not complete that request right now. Your governed Intelligence tools remain available.';
  }

  function providerNote(data) {
    if (data?.provider_status === 'complete') return `AI explanation | ${esc(data.model || 'provider model')} | prompt v${esc(data.prompt?.version || '?')}`;
    if (data?.provider_status === 'provider_unavailable') return 'Deterministic mode: governed analysis remains available while the AI prose provider is unavailable.';
    return 'Governed Watchdog response.';
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
        ${actions.length ? `<div class="dwa-action-row">${actions.filter((action) => ['create_case', 'create_report', 'watch_property'].includes(action)).map((action) => `<button type="button" data-dwa-action="${esc(action)}">${action === 'create_case' ? 'Create case' : action === 'create_report' ? 'Create report' : 'Watch property'}</button>`).join('')}</div>` : ''}
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
        body: { prompt, session_id: sessionId || null, context: { pams_pins: pins(), surface: 'data_workbench' } }
      });
      if (result.error) throw result.error;
      sessionId = result.data?.session_id || sessionId;
      pending.outerHTML = analystMessage(result.data?.response);
      const assistantMessages = $$('.dwa-msg.assistant', chat);
      const newest = assistantMessages[assistantMessages.length - 1];
      const note = newest ? $('[data-dwa-provider-note]', newest) : null;
      if (note) note.textContent = providerNote(result.data);
      if (newest) $$('[data-dwa-action]', newest).forEach((button) => {
        button.onclick = () => ask(actionPrompt(button.dataset.dwaAction));
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

  function openAnalyst() {
    const host = shell('Ask Watchdog', 'Natural-language analysis over approved Watchdog tools.');
    if (rank(plan) < 2) {
      host.innerHTML = '<div class="dwa-empty"><i class="fas fa-lock"></i><h3>Watchdog Analyst starts with Pro</h3><p>AI interaction is layered on top of governed Watchdog Intelligence. It does not bypass plan or evidence controls.</p><a href="/property/pro#plans">Compare Pro plans</a></div>';
      return;
    }
    host.innerHTML = `
      <div class="dwa-note"><b>Tool-only AI.</b> Analyst can interpret and orchestrate approved Watchdog operations. It has no raw SQL access and cannot invent property facts, seller intent, protected-class targeting, values, or guaranteed outcomes.</div>
      <div class="dwa-chips">
        <button class="dwa-chip">Which of these properties deserves assessment review?</button>
        <button class="dwa-chip">Compare the selected properties.</button>
        <button class="dwa-chip">What changed for this property?</button>
        <button class="dwa-chip">Show the source lineage for this finding.</button>
        ${rank(plan) >= 3 ? '<button class="dwa-chip">Find the top 25 properties in my farm that deserve review.</button>' : ''}
      </div>
      <div class="dwa-chat" id="dwa-chat"></div>
      <div class="dwa-compose">
        <textarea id="dwa-input" maxlength="1800" placeholder="Ask about selected properties, evidence, changes, comparisons, cases or reports..."></textarea>
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

  function dollars(cents) {
    if (cents === null || cents === undefined) return 'Not set';
    return (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  function optionalNumber(selector) {
    const node = $(selector);
    if (!node || node.value.trim() === '') return null;
    const value = Number(node.value);
    return Number.isFinite(value) ? value : null;
  }

  function localAssumptions() {
    const transaction = optionalNumber('#dwa-tx');
    const rate = optionalNumber('#dwa-rate');
    const probability = optionalNumber('#dwa-prob');
    const cost = optionalNumber('#dwa-cost');
    const fixed = optionalNumber('#dwa-fixed');
    return {
      estimated_transaction_value_cents: transaction === null ? null : Math.round(transaction * 100),
      fee_rate_percent: rate,
      conversion_probability_percent: probability,
      cost_cents: cost === null ? null : Math.round(cost * 100),
      fixed_value_cents: fixed === null ? null : Math.round(fixed * 100),
    };
  }

  function localScenario(assumptions) {
    const fixed = assumptions.fixed_value_cents;
    const transaction = assumptions.estimated_transaction_value_cents;
    const rate = assumptions.fee_rate_percent;
    const probability = assumptions.conversion_probability_percent;
    const cost = Math.max(0, assumptions.cost_cents || 0);
    let gross = null;
    if (fixed !== null) gross = Math.max(0, fixed);
    else if (transaction !== null && rate !== null) gross = Math.max(0, transaction * rate / 100);
    const raw = gross === null ? null : Math.max(0, Math.round(gross - cost));
    const adjusted = raw === null || probability === null ? null : Math.max(0, Math.round(raw * probability / 100));
    return { raw_scenario_value_cents: raw, probability_adjusted_value_cents: adjusted };
  }

  function paintLive() {
    const current = localScenario(localAssumptions());
    if ($('#dwa-raw')) $('#dwa-raw').textContent = dollars(current.raw_scenario_value_cents);
    if ($('#dwa-expected')) $('#dwa-expected').textContent = dollars(current.probability_adjusted_value_cents);
  }

  function assumptionValue(assumptions, key, divisor = 100) {
    const value = assumptions?.[key];
    return value === null || value === undefined ? '' : String(Number(value) / divisor);
  }

  function profileCopy(profile) {
    if (!profile) return 'Cold start';
    if (profile.status === 'active') return `Active: ${profile.sample_size} distinct finding examples`;
    if (profile.status === 'learning') return `Learning: ${profile.sample_size} of ${profile.minimum_evidence} distinct finding examples`;
    if (profile.status === 'reset') return 'Reset: using transparent default attention weights';
    return `Cold start: ${profile.sample_size || 0} of ${profile.minimum_evidence || 8} distinct finding examples`;
  }

  function learnedWeightMarkup(profile) {
    const weights = profile?.learned_weights && typeof profile.learned_weights === 'object' ? profile.learned_weights : {};
    const entries = Object.entries(weights).sort((a, b) => Math.abs(Number(b[1]) - 1) - Math.abs(Number(a[1]) - 1)).slice(0, 10);
    if (!entries.length) return '<small>No learned signal adjustments are active. Watchdog is using the governed default order.</small>';
    return `<small>Active signal attention adjustments:</small><div class="dwa-learned-weights">${entries.map(([id, multiplier]) => `<span><b>${esc(id)}</b> x${Number(multiplier).toFixed(3)}</span>`).join('')}</div>`;
  }

  function findingCard(finding) {
    const current = localScenario(localAssumptions());
    const priority = finding.personalized_priority || { score: finding.score, personalized: false };
    return `
      <article class="dwa-finding" data-finding-id="${esc(finding.id)}">
        <div class="dwa-finding-top">
          <div class="dwa-score">${Math.round(Number(finding.score || 0))}</div>
          <div><h3>${esc(finding.property_address || finding.pams_pin || 'Property')}</h3><p>Watchdog score | confidence ${Math.round(Number(finding.confidence || 0))}% | evidence ${Math.round(Number(finding.evidence_coverage || 0))}%</p></div>
          <div class="dwa-priority">Attention ${Math.round(Number(priority.score || finding.score || 0))}<br><small>${priority.personalized ? 'personalized order' : 'governed default'}</small></div>
        </div>
        <div class="dwa-scenario"><span><b>${dollars(current.raw_scenario_value_cents)}</b>raw scenario value</span><span><b>${dollars(current.probability_adjusted_value_cents)}</b>probability-adjusted scenario</span></div>
        <div class="dwa-feedback">
          <button class="good" data-record="useful"><i class="fas fa-thumbs-up"></i> Useful</button>
          <button class="bad" data-record="not_relevant"><i class="fas fa-thumbs-down"></i> Not relevant</button>
          <select class="dwa-outcome" data-outcome><option value="">Record outcome...</option><option value="reviewed">Reviewed</option><option value="contacted">Contacted</option><option value="appointment">Appointment</option><option value="client">Client</option><option value="under_contract">Under contract</option><option value="closed">Closed</option><option value="dismissed">Dismissed</option></select>
          <button data-value>Save value snapshot</button>
        </div>
      </article>`;
  }

  async function loadLearning() {
    const result = await client.functions.invoke('intelligence-learning', { body: { action: 'state', objective, profession } });
    if (result.error) throw result.error;
    profession = result.data?.profession || profession;
    return result.data;
  }

  async function saveAssumptions() {
    const status = $('#dwa-value-status');
    const button = $('#dwa-save-assumptions');
    if (button) button.disabled = true;
    try {
      const result = await client.functions.invoke('intelligence-learning', { body: { action: 'save_assumptions', objective, profession, assumptions: localAssumptions() } });
      if (result.error) throw result.error;
      if (status) status.textContent = 'Scenario assumptions saved. Recalculation is deterministic and uses no LLM call.';
      await refreshValueFindings();
    } catch (error) {
      if (status) status.textContent = friendly(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function recordFinding(id, eventType) {
    try {
      const result = await client.functions.invoke('intelligence-learning', { body: { action: 'record', finding_id: id, event_type: eventType, objective, profession } });
      if (result.error) throw result.error;
      toast('Outcome saved with finding lineage.');
      await refreshValueFindings();
    } catch (error) { toast(friendly(error)); }
  }

  async function saveValue(id) {
    try {
      const result = await client.functions.invoke('intelligence-learning', { body: { action: 'value', finding_id: id, objective, profession } });
      if (result.error) throw result.error;
      toast('Opportunity Value snapshot saved.');
    } catch (error) { toast(friendly(error)); }
  }

  function wireFindingActions(host) {
    $$('[data-finding-id]', host).forEach((card) => {
      const id = card.dataset.findingId;
      $$('[data-record]', card).forEach((button) => { button.onclick = () => recordFinding(id, button.dataset.record); });
      $('[data-outcome]', card).onchange = (event) => { if (event.target.value) recordFinding(id, event.target.value); };
      $('[data-value]', card).onclick = () => saveValue(id);
    });
  }

  async function refreshValueFindings() {
    const list = $('#dwa-findings');
    const copy = $('#dwa-profile-copy');
    const weights = $('#dwa-profile-weights');
    if (!list) return;
    try {
      const data = await loadLearning();
      if (copy) copy.textContent = profileCopy(data.profile);
      if (weights) weights.innerHTML = learnedWeightMarkup(data.profile);
      list.innerHTML = data.findings?.length ? data.findings.map(findingCard).join('') : '<div class="dwa-empty">Run Watchdog Intelligence to create findings, then return here to value and track them.</div>';
      wireFindingActions(list);
    } catch (error) {
      list.innerHTML = `<div class="dwa-empty">${esc(friendly(error))}</div>`;
    }
  }

  async function resetProfile() {
    try {
      const result = await client.functions.invoke('intelligence-learning', { body: { action: 'reset_profile', objective, profession } });
      if (result.error) throw result.error;
      toast('Learned attention profile reset to transparent defaults.');
      await refreshValueFindings();
    } catch (error) { toast(friendly(error)); }
  }

  async function openValue() {
    const host = shell('Opportunity Value + Learning', 'Turn governed findings into user-controlled scenarios and measurable outcomes.');
    if (rank(plan) < 2) {
      host.innerHTML = '<div class="dwa-empty"><i class="fas fa-lock"></i><h3>Opportunity Value starts with Pro</h3><p>Scenario math and outcome learning are part of Watchdog Intelligence.</p><a href="/property/pro#plans">Compare Pro plans</a></div>';
      return;
    }
    host.innerHTML = '<div class="dwa-empty"><i class="fas fa-circle-notch fa-spin"></i> Loading your Intelligence profile...</div>';
    try {
      const data = await loadLearning();
      const assumptions = data.assumptions?.assumptions || {};
      host.innerHTML = `
        <div class="dwa-note"><b>Scenario math, not predicted revenue.</b> Watchdog keeps governed property facts and scores separate from your transaction value, fee or value rate, probability, and cost assumptions. Changing these fields recomputes instantly without an LLM call.</div>
        <div class="dwa-value-grid">
          <div class="dwa-field"><label>Profession<select id="dwa-prof"><option value="general">General</option><option value="agent">Real estate agent</option><option value="investor">Investor</option><option value="attorney">Attorney</option><option value="appraiser">Appraiser</option><option value="lender">Lender / mortgage</option></select></label></div>
          <div class="dwa-field"><label>Estimated transaction value ($)<input id="dwa-tx" type="number" min="0" step="1000" value="${esc(assumptionValue(assumptions, 'estimated_transaction_value_cents'))}"></label></div>
          <div class="dwa-field"><label>Fee / value rate (%)<input id="dwa-rate" type="number" min="0" max="100" step="0.01" value="${esc(assumptionValue(assumptions, 'fee_rate_percent', 1))}"></label></div>
          <div class="dwa-field"><label>User-entered conversion probability (%)<input id="dwa-prob" type="number" min="0" max="100" step="0.1" value="${esc(assumptionValue(assumptions, 'conversion_probability_percent', 1))}"></label></div>
          <div class="dwa-field"><label>Cost assumption ($)<input id="dwa-cost" type="number" min="0" step="1" value="${esc(assumptionValue(assumptions, 'cost_cents'))}"></label></div>
          <div class="dwa-field"><label>Fixed opportunity value ($, optional)<input id="dwa-fixed" type="number" min="0" step="100" value="${esc(assumptionValue(assumptions, 'fixed_value_cents'))}"></label></div>
        </div>
        <div class="dwa-value-live"><article><b id="dwa-raw">Not set</b><span>Raw scenario value under your assumptions</span></article><article><b id="dwa-expected">Not set</b><span>Probability-adjusted scenario under your assumptions</span></article></div>
        <button class="dwa-save" id="dwa-save-assumptions" type="button">Save assumptions</button>
        <div class="dwa-status" id="dwa-value-status">Nothing here changes Watchdog facts or scores.</div>
        <div class="dwa-profile"><div><b>Personalized attention profile</b><small id="dwa-profile-copy">${esc(profileCopy(data.profile))}</small><div id="dwa-profile-weights">${learnedWeightMarkup(data.profile)}</div></div><button class="dwa-reset" id="dwa-reset" type="button">Reset learning</button></div>
        <div class="dwa-findings" id="dwa-findings">${data.findings?.length ? data.findings.map(findingCard).join('') : '<div class="dwa-empty">Run Watchdog Intelligence to create findings, then return here to value and track them.</div>'}</div>
        <div class="dwa-warning">Personalization only changes attention order after enough first-party outcomes exist. It never changes source facts, governed formulas, Watchdog scores, historical findings, or uses protected or sensitive personal attributes.</div>`;

      $('#dwa-prof').value = profession;
      $('#dwa-prof').onchange = async (event) => { profession = event.target.value; await refreshValueFindings(); };
      ['#dwa-tx', '#dwa-rate', '#dwa-prob', '#dwa-cost', '#dwa-fixed'].forEach((selector) => {
        $(selector)?.addEventListener('input', () => {
          paintLive();
          $$('[data-finding-id]', host).forEach((card) => {
            const current = localScenario(localAssumptions());
            const values = $$('.dwa-scenario b', card);
            if (values[0]) values[0].textContent = dollars(current.raw_scenario_value_cents);
            if (values[1]) values[1].textContent = dollars(current.probability_adjusted_value_cents);
          });
        });
      });
      paintLive();
      $('#dwa-save-assumptions').onclick = saveAssumptions;
      $('#dwa-reset').onclick = resetProfile;
      wireFindingActions(host);
    } catch (error) {
      host.innerHTML = `<div class="dwa-empty">${esc(friendly(error))}</div>`;
    }
  }

  async function install() {
    try {
      await Promise.resolve(window.njptrAccessReady);
      client = window.NJPTRAccess?.client?.();
      if (!client) return;
      const usage = await client.rpc('get_agent_usage');
      plan = usage.data?.plan || 'standard';
      const timer = setInterval(() => {
        const toolbar = $('.dw-toolbar');
        if (!toolbar) return;
        clearInterval(timer);
        if ($('#dw-analyst')) return;
        const analyst = document.createElement('button');
        analyst.id = 'dw-analyst';
        analyst.className = `dwa-trigger ${rank(plan) < 2 ? 'locked' : ''}`;
        analyst.innerHTML = `<i class="fas fa-message-dots"></i> Ask Watchdog${rank(plan) < 2 ? ' | Pro' : ''}`;
        analyst.onclick = openAnalyst;
        const valueButton = document.createElement('button');
        valueButton.id = 'dw-value-learning';
        valueButton.className = `dwa-trigger value ${rank(plan) < 2 ? 'locked' : ''}`;
        valueButton.innerHTML = `<i class="fas fa-chart-line"></i> Opportunity Value${rank(plan) < 2 ? ' | Pro' : ''}`;
        valueButton.onclick = openValue;
        const intelligence = $('#dw-intelligence');
        if (intelligence) {
          intelligence.insertAdjacentElement('afterend', valueButton);
          intelligence.insertAdjacentElement('afterend', analyst);
        } else {
          const refresh = $('#dw-refresh');
          refresh ? toolbar.insertBefore(valueButton, refresh) : toolbar.appendChild(valueButton);
          refresh ? toolbar.insertBefore(analyst, valueButton) : toolbar.appendChild(analyst);
        }
      }, 120);
    } catch (_) { /* Access guard owns the signed-out experience. */ }
  }

  window.WatchdogLearning = { open: openValue };
  install();
})();
