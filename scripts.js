/* ============================================================
 * NJPropertyTaxRelief.com :: Main JavaScript
 * Each section is labeled.
 * I appreciate you finding this useful if you are a lurker.
 * I only ask, if you use this, please credit John@johnscafide.com
 * or Venmo a tip: https://www.venmo.com/u/John-Scafide
 *
 * SECTIONS:
 *   1.  Config & Constants
 *   2.  Utility Helpers
 *   3.  EmailJS Setup
 *   4.  Page Init (single DOMContentLoaded)
 *   5.  Navigation & Footer Loaders
 *   6.  Mobile Menu & Mega Menu
 *   7.  News Strip Rotation
 *   8.  Popups & Lead Magnets
 *   9.  Forms (Contact, Audit, Comps — all three)
 *   10. Accordions (PAS-1, FAQ)
 *   11. Tab Switcher
 *   12. ANCHOR Eligibility Calculator
 *   13. Stay NJ Calculator
 *   14. Mortgage Calculator
 *   15. Appeal Calculator & Quiz
 *   16. Town Directory
 *   17. Dynamic Sitemap
 *   18. Back to Top
 *   19. Public API (functions exposed for HTML onclick)
 * ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // 1. CONFIG & CONSTANTS
  // Update keys, IDs, and shared values here in one place.
  // PLEASE DO NOT COPY THIS!
  // ============================================================
  const CONFIG = {
    emailjs: {
      publicKey:    'u262kw5AoJcBI342V',
      serviceId:    'service_gptqbyx',
      templateId:   'template_contact',   // default contact form
      templateAudit: 'template_audit',    // tax-optimized listing audit form
      templateComps: 'template_comps'     // free MLS comps request form
    },
    popupDelays: {
      rebateModal: 4000
    },
    contactHotline: '1-888-238-1233',
    checklistFile:  'NJ_Tax_Relief_Checklist.pdf',
    stripeLink:     'https://buy.stripe.com/9B69ASdhjg442OLdoWfw400',
    guidePrice:     '$5',
    anchorApplicationUrl: 'https://www.watchdogindex.com/anchor/application/2025/'
  };

  // ============================================================
  // 2. UTILITY HELPERS
  // ============================================================

  function $(id) {
    return document.getElementById(id);
  }

  function parseNum(value) {
    if (value === undefined || value === null) return 0;
    const cleaned = String(value).replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  // Central migration for legacy NJPropertyTaxRelief application CTAs.
  // Keep official/status/source links intact, but route any action whose intent is
  // to apply, file, complete or purchase PAS-1 help into Watchdog's free 2025 flow.
  function isAnchorApplicationAction(anchor) {
    if (!anchor || !anchor.getAttribute) return false;
    const href = (anchor.getAttribute('href') || '').trim();
    if (!href) return false;
    const lowerHref = href.toLowerCase();

    if (lowerHref.indexOf('book.titan.email/johnscafide/nj-pas-1-property-tax-relief') !== -1) {
      return true;
    }

    const isNjReliefHost = lowerHref.indexOf('anchor.nj.gov') !== -1 ||
      lowerHref.indexOf('propertytaxrelief.nj.gov') !== -1;
    if (!isNjReliefHost) return false;

    const parent = anchor.closest('p,li,div,section,article') || anchor;
    const context = ((anchor.textContent || '') + ' ' + (parent.textContent || '')).toLowerCase();
    const hasApplicationIntent = /\b(apply|application|file|filing|complete|start|pas-1|anc-1)\b/.test(context);
    const clearlyOfficialOnly = /\b(check status|status tool|official resources?|official site|official source|treasury source|verify|instructions|hotline)\b/.test(context) &&
      !/\b(apply|application|file|filing|complete|start)\b/.test(context);

    return hasApplicationIntent && !clearlyOfficialOnly;
  }

  function rewriteLegacyAnchorCopy(root) {
    root = root || document;

    const replacements = [
      [/Professional filing assistance available from John Scafide for \$20 flat fee/gi, 'Free guided 2025 application available through Watchdog'],
      [/Professional help available for \$20/gi, 'Free guided Watchdog application available'],
      [/John Scafide will complete your PAS-1 line by line for a flat \$20 fee\./gi, "Watchdog's free guided 2025 application walks you through the PAS-1 line by line and prepares the official form."],
      [/John Scafide offers PAS-1 filing assistance for a \$20 flat fee/gi, 'Watchdog offers a free guided 2025 PAS-1 application online'],
      [/I offer a \$20 flat-fee session to ensure your PAS-1 is filed perfectly\./gi, "Use Watchdog's free guided 2025 application to work through the PAS-1 question by question and prepare the official form."],
      [/PAS-1 filing help\s*[—-]\s*\$20 flat fee/gi, 'Free guided PAS-1 application'],
      [/PAS-1 filing help \(\$20\)/gi, 'Free guided PAS-1 application'],
      [/Book PAS-1 Help\s*[—-]\s*\$20/gi, 'Start Free PAS-1 Application'],
      [/Book \$20 Filing Help/gi, 'Start Free Application'],
      [/Book My \$20 PAS-1 Help/gi, 'Start My Free Application']
    ];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node || !node.nodeValue || node.nodeValue.indexOf('$20') === -1) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (parent && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      let text = node.nodeValue;
      replacements.forEach(function (pair) { text = text.replace(pair[0], pair[1]); });
      node.nodeValue = text;
    });

    document.querySelectorAll('meta[content]').forEach(function (meta) {
      let content = meta.getAttribute('content') || '';
      if (content.indexOf('$20') === -1) return;
      replacements.forEach(function (pair) { content = content.replace(pair[0], pair[1]); });
      meta.setAttribute('content', content);
    });

    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (script) {
      let text = script.textContent || '';
      if (text.indexOf('book.titan.email/johnscafide/nj-pas-1-property-tax-relief') === -1 && text.indexOf('"price": "20.00"') === -1) return;
      text = text
        .replace(/https:\/\/book\.titan\.email\/johnscafide\/nj-pas-1-property-tax-relief/g, CONFIG.anchorApplicationUrl)
        .replace(/"price"\s*:\s*"20\.00"/g, '"price": "0.00"')
        .replace(/Step-by-step PAS-1 filing help for NJ seniors\. Covers ANCHOR, Stay NJ, and Senior Freeze in one session\./g,
          'Free guided 2025 NJ property tax relief application through Watchdog using the official State form.');
      script.textContent = text;
    });
  }

  function upgradeAnchorApplicationSurface(root) {
    root = root || document;
    const anchors = root.querySelectorAll ? root.querySelectorAll('a[href]') : [];
    anchors.forEach(function (anchor) {
      if (!isAnchorApplicationAction(anchor)) return;
      anchor.href = CONFIG.anchorApplicationUrl;
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
      anchor.dataset.watchdogAnchorApplication = '2025';

      const label = (anchor.textContent || '').trim();
      if (/book|filing help|pas-1 help|apply now|apply at|start/i.test(label)) {
        anchor.textContent = /pas-1/i.test(label) ? 'Start Free PAS-1 Application' : 'Start Free Application';
      } else if (/anchor\.nj\.gov|propertytaxrelief\.nj\.gov/i.test(label)) {
        anchor.textContent = 'Watchdog guided application';
      }
    });
    rewriteLegacyAnchorCopy(root);
  }

  function initAnchorApplicationRouting() {
    upgradeAnchorApplicationSurface(document);
    if (typeof MutationObserver === 'undefined' || !document.documentElement) return;
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          upgradeAnchorApplicationSurface(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Core send function. Accepts an optional templateId so different
  // forms can target different EmailJS templates while still sharing
  // the same error-handling and default-value logic.
  function sendLead(payload, templateId) {
    if (typeof emailjs === 'undefined') {
      console.warn('EmailJS not loaded yet.');
      return Promise.reject(new Error('EmailJS missing'));
    }
    const template = templateId || CONFIG.emailjs.templateId;
    const data = Object.assign({
      name:     'Not provided',
      email:    'Not provided',
      phone:    'Not provided',
      topic:    'Website inquiry',
      town:     'Not provided',
      address:  'Not provided',
      county:   'Not provided',
      taxbill:  'Not provided',
      timeline: 'Not provided'
    }, payload);
    return emailjs.send(CONFIG.emailjs.serviceId, template, data);
  }

  let savedScrollY = 0;
  function lockBodyScroll() {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + savedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }
  function unlockBodyScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScrollY);
  }

  // ============================================================
  // 3. EMAILJS SETUP
  // ============================================================
  function initEmailJS() {
    if (typeof emailjs === 'undefined') {
      setTimeout(initEmailJS, 200);
      return;
    }
    try {
      emailjs.init({ publicKey: CONFIG.emailjs.publicKey });
    } catch (e) {
      console.error('EmailJS init failed:', e);
    }
  }

  // ============================================================
  // 4. PAGE INIT
  // ============================================================
  function onReady() {
    initEmailJS();
    initAnchorApplicationRouting();
    loadNav();
    initFooter();
    initNewsStrip();
    initRebatePopup();
    initBackToTop();
    if ($('townDirectory'))    loadTownDirectory();
    if ($('dynamic-sitemap'))  generateDynamicSitemap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // ============================================================
  // 5. NAVIGATION & FOOTER LOADERS
  // ============================================================
  function loadNav() {
    const navEl = $('main-nav');
    if (!navEl) return;
    fetch('nav.html?v=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('nav.html not found');
        return r.text();
      })
      .then(function (html) {
        navEl.innerHTML = html;
        initNavLogic();
      })
      .catch(function (err) { console.error('Nav load error:', err); });
  }

  function initFooter(attempts) {
    attempts = attempts || 0;
    const footerEl = $('main-footer');
    if (!footerEl) {
      if (attempts < 30) setTimeout(function () { initFooter(attempts + 1); }, 100);
      return;
    }
    fetch('footer.html?v=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('footer.html not found');
        return r.text();
      })
      .then(function (html) { footerEl.innerHTML = html; })
      .catch(function (err) { console.error('Footer load error:', err); });
  }

  // ============================================================
  // 6. MOBILE MENU & MEGA MENU
  // ============================================================
  function initNavLogic() {
    bindMegaMenu();
    bindMegaMenuDesktop();
    window.addEventListener('resize', function () {
      bindMegaMenu();
      bindMegaMenuDesktop();
    });
  }

  function bindMegaMenu() {
    const triggers = document.querySelectorAll('.mega-trigger');
    if (!triggers.length) return;
    triggers.forEach(function (trigger) {
      if (trigger.dataset.bound === '1') return;
      if (window.innerWidth <= 992) {
        trigger.dataset.bound = '1';
        trigger.addEventListener('click', function () {
          const content = this.nextElementSibling;
          if (!content) return;
          content.style.display = (content.style.display === 'block') ? 'none' : 'block';
        });
      }
    });
  }

  function bindMegaMenuDesktop() {
    const items = document.querySelectorAll('.nav-item.has-mega');
    if (!items.length) return;
    items.forEach(function (item) {
      if (item.dataset.megaBound === '1') return;
      item.dataset.megaBound = '1';
      const btn = item.querySelector('.nav-link-btn');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.nav-item.has-mega').forEach(function (i) {
          i.classList.remove('open');
          const b = i.querySelector('.nav-link-btn');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { item.classList.remove('open'); btn.focus(); }
      });
    });
    document.removeEventListener('click', closeMegaOnOutsideClick);
    document.addEventListener('click', closeMegaOnOutsideClick);
    document.querySelectorAll('.mega-panel').forEach(function (p) {
      p.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }

  function closeMegaOnOutsideClick() {
    document.querySelectorAll('.nav-item.has-mega').forEach(function (i) {
      i.classList.remove('open');
      const b = i.querySelector('.nav-link-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleMobileMenu() {
    const drawer = $('mobileDrawer');
    const burger = document.querySelector('.nav-hamburger');
    if (drawer) {
      const isOpen = drawer.classList.contains('open');
      drawer.classList.toggle('open');
      if (burger) burger.classList.toggle('open');
      isOpen ? unlockBodyScroll() : lockBodyScroll();
      return;
    }
    const navLinks = $('navLinks');
    if (!navLinks) return;
    navLinks.classList.toggle('active');
    navLinks.classList.contains('active') ? lockBodyScroll() : unlockBodyScroll();
  }

  // ============================================================
  // 7. NEWS STRIP ROTATION
  // ============================================================
  function initNewsStrip() {
    const items = document.querySelectorAll('.news-item');
    if (items.length < 2) return;
    let idx = 0;
    items.forEach(function (item, i) {
      if (i !== 0) item.style.display = 'none';
    });
    setInterval(function () {
      items[idx].style.opacity = '0';
      setTimeout(function () {
        items[idx].style.display = 'none';
        idx = (idx + 1) % items.length;
        const next = items[idx];
        next.style.display = 'flex';
        next.style.opacity = '0';
        void next.offsetHeight;
        next.style.transition = 'opacity 0.5s ease';
        next.style.opacity = '1';
      }, 500);
    }, 4000);
  }

  // ============================================================
  // 8. POPUPS & LEAD MAGNETS
  // ============================================================
  function initRebatePopup() {
    if (sessionStorage.getItem('rebateModalSeen')) {
      const link = $('sticky-rebate-link');
      if (link) {
        link.style.display = 'inline-flex';
        injectRebateAnimCSS();
        requestAnimationFrame(function () { link.classList.add('rebate-visible'); });
        startRebateShakeLoop(link);
      }
      return;
    }
    setTimeout(function () {
      showRebateModal();
      sessionStorage.setItem('rebateModalSeen', 'true');
    }, CONFIG.popupDelays.rebateModal);
  }

  let _rebateAnimInjected = false;
  let _rebateShakeTimer   = null;

  function injectRebateAnimCSS() {
    if (_rebateAnimInjected) return;
    _rebateAnimInjected = true;
    const style = document.createElement('style');
    style.textContent = [
      '@keyframes rebateGlow {',
      '  0%,100% { box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 0 rgba(184,151,42,0); }',
      '  50%     { box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 18px 6px rgba(184,151,42,0.65); }',
      '}',
      '@keyframes rebateShake {',
      '  0%,100% { transform: translateX(0) rotate(0deg); }',
      '  15%     { transform: translateX(-6px) rotate(-2.5deg); }',
      '  30%     { transform: translateX(6px) rotate(2.5deg); }',
      '  45%     { transform: translateX(-5px) rotate(-1.5deg); }',
      '  60%     { transform: translateX(5px) rotate(1.5deg); }',
      '  75%     { transform: translateX(-3px) rotate(-0.5deg); }',
      '  90%     { transform: translateX(3px); }',
      '}',
      '#sticky-rebate-link {',
      '  position: fixed !important;',
      '  bottom: 24px !important;',
      '  left: 24px !important;',
      '  right: auto !important;',
      '  top: auto !important;',
      '  z-index: 9997 !important;',
      '  display: none;',
      '  align-items: center !important;',
      '  gap: 10px !important;',
      '  background: #b8192a !important;',
      '  color: #fff !important;',
      '  font-family: "Source Sans 3", sans-serif !important;',
      '  font-size: 14px !important;',
      '  font-weight: 700 !important;',
      '  padding: 13px 22px !important;',
      '  border-radius: 50px !important;',
      '  text-decoration: none !important;',
      '  white-space: nowrap !important;',
      '  cursor: pointer !important;',
      '  box-shadow: 0 4px 24px rgba(0,0,0,0.35) !important;',
      '  transition: transform 0.15s, background 0.15s !important;',
      '}',
      '#sticky-rebate-link:hover {',
      '  background: #d42030 !important;',
      '  transform: translateY(-2px) !important;',
      '}',
      '#sticky-rebate-link i { font-size: 16px !important; flex-shrink: 0 !important; }',
      '#sticky-rebate-link.rebate-visible { animation: rebateGlow 2.4s ease-in-out infinite !important; }',
      '#sticky-rebate-link.rebate-shake  { animation: rebateShake 0.65s ease-in-out !important; }',
      '@media (max-width: 680px) {',
      '  #sticky-rebate-link { left:0 !important; right:0 !important; bottom:0 !important;',
      '    border-radius:0 !important; width:100% !important; box-sizing:border-box !important;',
      '    justify-content:center !important; padding:15px 20px !important;',
      '    font-size:15px !important; gap:10px !important; }',
      '  #rebate-modal { bottom:0 !important; right:0 !important; left:0 !important;',
      '    max-width:100% !important; width:100% !important; border-radius:0 !important; }',
      '  #rebate-modal > div { border-radius:0 !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function startRebateShakeLoop(link) {
    if (_rebateShakeTimer) { clearInterval(_rebateShakeTimer); _rebateShakeTimer = null; }
    function doShake() {
      if (!link || link.style.display === 'none') return;
      link.classList.remove('rebate-shake');
      void link.offsetWidth;
      link.classList.add('rebate-shake');
      setTimeout(function () { link.classList.remove('rebate-shake'); }, 700);
    }
    const firstTimer = setTimeout(function () {
      doShake();
      _rebateShakeTimer = setInterval(doShake, 150 * 1000);
    }, 20 * 1000);
    link._firstShakeTimer = firstTimer;
  }

  function showRebateModal() {
    const modal = $('rebate-modal');
    const link  = $('sticky-rebate-link');
    if (modal) modal.style.display = 'flex';
    if (link) {
      link.style.display = 'none';
      link.classList.remove('rebate-visible', 'rebate-shake');
    }
    if (_rebateShakeTimer) { clearInterval(_rebateShakeTimer); _rebateShakeTimer = null; }
    if (link && link._firstShakeTimer) { clearTimeout(link._firstShakeTimer); }
  }

  function minimizeRebateModal() {
    const modal = $('rebate-modal');
    const link  = $('sticky-rebate-link');
    if (modal) modal.style.display = 'none';
    if (link) {
      link.style.display = 'inline-flex';
      injectRebateAnimCSS();
      requestAnimationFrame(function () { link.classList.add('rebate-visible'); });
      startRebateShakeLoop(link);
    }
  }

  function downloadChecklist() {
    window.open(CONFIG.stripeLink, '_blank');
    minimizeRebateModal();
  }

  // Legacy popup kept for backwards compatibility
  function minimizePopup() {
    const popup = $('rebate-popup');
    const mini  = $('popup-minimized');
    if (popup) popup.style.display = 'none';
    if (mini)  mini.style.display  = 'block';
    sessionStorage.setItem('checklistClosed', 'true');
  }
  function restorePopup() {
    const popup = $('rebate-popup');
    const mini  = $('popup-minimized');
    if (popup) popup.style.display = 'block';
    if (mini)  mini.style.display  = 'none';
  }
  function handleChecklistDownload() {
    const emailEl = $('popup-email');
    const email   = emailEl ? emailEl.value.trim() : '';
    if (!email) { alert('Please enter your email to receive the checklist.'); return; }
    sendLead({ email: email, topic: 'Checklist Download Request', name: 'New Lead' })
      .catch(function (e) { console.warn('Legacy checklist error:', e); });
    window.open(CONFIG.checklistFile, '_blank');
    minimizePopup();
  }

  // ============================================================
  // 9. FORMS — Contact, Listing Audit, Free Comps
  // All submissions route through sendLead() with the appropriate
  // template ID so each form gets its own styled email.
  // ============================================================

  // ── Original listing audit (legacy audit-address field on other pages) ──
  function handleAuditRequest() {
    const addr  = $('audit-address');
    const name  = $('audit-name');
    const email = $('audit-email');
    if (!addr || !email) return;

    const addrVal  = addr.value.trim();
    const emailVal = email.value.trim();
    const nameVal  = name ? name.value.trim() : '';

    if (!addrVal || !emailVal) {
      alert('Please provide the property address and your email.');
      return;
    }

    sendLead({
      name:     nameVal,
      email:    emailVal,
      address:  addrVal,
      topic:    'Tax-Optimized Listing Audit Request',
      town:     addrVal
    }, CONFIG.emailjs.templateAudit)
      .then(function () {
        alert('Success! John or Heather will begin your audit and reach out within 24 hours.');
        addr.value  = '';
        email.value = '';
        if (name) name.value = '';
      })
      .catch(function (err) {
        console.error('Audit request failed:', err);
        alert('Something went wrong. Please try again or call ' + CONFIG.contactHotline + '.');
      });
  }

  // ── New homepage listing audit form (audit-addr / audit-name / audit-email) ──
  function submitAudit() {
    const nameEl     = $('audit-name');
    const emailEl    = $('audit-email');
    const addrEl     = $('audit-addr');
    const timelineEl = $('audit-timeline');

    const name     = nameEl     ? nameEl.value.trim()     : '';
    const email    = emailEl    ? emailEl.value.trim()    : '';
    const addr     = addrEl     ? addrEl.value.trim()     : '';
    const timeline = timelineEl ? timelineEl.value        : 'Not provided';

    if (!name || !email || !addr) {
      alert('Please fill in the address, name, and email to continue.');
      return;
    }

    const btn = document.querySelector('.btn-audit-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    sendLead({
      name:     name,
      email:    email,
      address:  addr,
      timeline: timeline,
      topic:    'Tax-Optimized Listing Audit — ' + timeline,
      town:     addr
    }, CONFIG.emailjs.templateAudit)
      .then(function () {
        if (btn) { btn.disabled = true; btn.textContent = 'Submitted!'; }
        const successEl = $('audit-success');
        if (successEl) successEl.style.display = 'block';
      })
      .catch(function (err) {
        console.error('Audit submit failed:', err);
        if (btn) { btn.disabled = false; btn.textContent = 'Get my free audit →'; }
        alert('Something went wrong. Please try again or call ' + CONFIG.contactHotline + '.');
      });
  }

  // ── Free MLS comps request form ──
  function submitComps() {
    const nameEl    = $('comps-name');
    const emailEl   = $('comps-email');
    const addrEl    = $('comps-addr');
    const countyEl  = $('comps-county');
    const taxbillEl = $('comps-taxbill');

    const name    = nameEl    ? nameEl.value.trim()    : '';
    const email   = emailEl   ? emailEl.value.trim()   : '';
    const addr    = addrEl    ? addrEl.value.trim()    : '';
    const county  = countyEl  ? countyEl.value         : 'Not provided';
    const taxbill = taxbillEl ? taxbillEl.value.trim() : 'Not provided';

    if (!name || !email || !addr) {
      alert('Please fill in your name, address, and email to continue.');
      return;
    }

    const btn = document.querySelector('.btn-comps-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    sendLead({
      name:    name,
      email:   email,
      address: addr,
      county:  county,
      taxbill: taxbill,
      topic:   'Free MLS Comps Request — ' + county,
      town:    addr
    }, CONFIG.emailjs.templateComps)
      .then(function () {
        if (btn) { btn.disabled = true; btn.textContent = 'Submitted!'; }
        const successEl = $('comps-success');
        if (successEl) successEl.style.display = 'block';
      })
      .catch(function (err) {
        console.error('Comps submit failed:', err);
        if (btn) { btn.disabled = false; btn.textContent = 'Send me free comps →'; }
        alert('Something went wrong. Please try again or call ' + CONFIG.contactHotline + '.');
      });
  }

  // ── Main contact / consultation form ──
  function submitLead() {
    const nameEl  = $('cf-name');
    const emailEl = $('cf-email');
    const phoneEl = $('cf-phone');
    const topicEl = $('cf-topic');
    const townEl  = $('cf-town');
    if (!nameEl || !emailEl) return;

    const name  = nameEl.value.trim();
    const email = emailEl.value.trim();

    if (!name)  { nameEl.focus();  alert('Please enter your name.');  return; }
    if (!email) { emailEl.focus(); alert('Please enter your email.'); return; }

    const btn = document.querySelector('#contact-form .submit-btn') ||
                document.querySelector('.btn-contact-submit');
    if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

    sendLead({
      name:  name,
      email: email,
      phone: phoneEl ? phoneEl.value.trim() : 'Not provided',
      topic: topicEl ? topicEl.value        : 'Website inquiry',
      town:  townEl  ? townEl.value.trim()  : 'Not provided'
    }, CONFIG.emailjs.templateId)
      .then(function () {
        const form    = $('contact-form');
        const success = $('form-success');
        if (form)    form.style.display    = 'none';
        if (success) success.style.display = 'block';
        // New homepage dynamic form success
        const dynSuccess = $('contact-success');
        if (dynSuccess) dynSuccess.style.display = 'block';
      })
      .catch(function (err) {
        if (btn) { btn.textContent = 'Request Free Consultation →'; btn.disabled = false; }
        alert('Submission failed. Please try again or call us directly.');
        console.error('Contact form error:', err);
      });
  }

  // Alias used by the new homepage dynamic contact form
  function submitContact() {
    submitLead();
  }

  // ── Dynamic contact form field reveal ──
  function showDynamicFields() {
    const val  = $('cf-topic');
    if (!val) return;
    const topic = val.value;
    const wrap  = $('dynamic-fields-wrap');
    document.querySelectorAll('.dynamic-group').forEach(function (d) { d.classList.remove('show'); });
    const map = { sell: 'df-sell', buy: 'df-buy', appeal: 'df-appeal', pas1: 'df-pas1' };
    if (map[topic]) {
      if (wrap) wrap.style.display = 'block';
      const grp = $(map[topic]);
      if (grp) grp.classList.add('show');
    } else {
      if (wrap) wrap.style.display = 'none';
    }
  }

  // ============================================================
  // 10. ACCORDIONS — PAS-1 & FAQ
  // ============================================================
  function togglePAS(trigger) {
    const item = trigger.parentElement;
    const body = item.querySelector('.pas-acc-body');
    const isOpen = trigger.classList.contains('open');
    document.querySelectorAll('.pas-acc-trigger').forEach(function (t) { t.classList.remove('open'); });
    document.querySelectorAll('.pas-acc-body').forEach(function (b) { b.classList.remove('open'); });
    if (!isOpen && body) {
      trigger.classList.add('open');
      body.classList.add('open');
    }
  }

  function toggleFAQ(el) {
    const item   = el.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function (f) { f.classList.remove('open'); });
    if (!isOpen) item.classList.add('open');
  }

  // ============================================================
  // 11. TAB SWITCHER
  // ============================================================
  function switchTab(name, event) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    const panel = $('tab-' + name);
    if (panel) panel.classList.add('active');
  }

  // ============================================================
  // 12. ANCHOR ELIGIBILITY CALCULATOR
  // ============================================================
  let answers     = {};
  let currentStep = 1;

  function updateREInterest(tenure) {
    const textEl  = $('re-interest-text');
    const subEl   = $('re-interest-sub');
    const cb      = $('re-interest');
    const addrLbl = $('re-address-label');
    const addrBox = $('re-address-wrap');
    const addrEl  = $('lead-address');
    if (!textEl || !subEl) return;
    if (cb)      cb.checked            = false;
    if (addrBox) addrBox.style.display = 'none';
    if (addrEl)  addrEl.value          = '';
    if (tenure === 'own') {
      textEl.textContent = 'I\u2019m curious what my home is worth right now.';
      subEl.textContent  = 'Check this and a local South Jersey agent will reach out with a free, no-obligation home value estimate.';
      if (addrLbl) addrLbl.textContent = 'Your home address';
    } else {
      textEl.textContent = 'I\u2019m interested in buying a home \u2014 I\u2019m tired of renting.';
      subEl.textContent  = 'Check this and a local South Jersey agent will reach out to walk you through the buying process at no cost.';
      if (addrLbl) addrLbl.textContent = 'Your current address (so we can show you nearby homes)';
    }
    if (cb) {
      cb.onchange = function () {
        if (addrBox) addrBox.style.display = this.checked ? 'block' : 'none';
        if (!this.checked && addrEl) addrEl.value = '';
      };
    }
  }

  function selectChoice(key, val, btn) {
    answers[key] = val;
    btn.parentElement.querySelectorAll('.choice-btn').forEach(function (b) {
      b.classList.remove('selected', 'active-choice');
    });
    btn.classList.add('selected', 'active-choice');
    const nb = $('next' + currentStep);
    if (nb) nb.disabled = false;
    if (key === 'tenure') {
      const mid = $('income-mid-btn');
      if (mid) mid.style.opacity = (val === 'rent') ? '0.4' : '1';
      updateREInterest(val);
    }
  }

  function nextStep(step) {
    let n = step + 1;
    if (step === 3 && answers.tenure === 'own') n = 5;
    if (step === 4 && answers.tenure === 'rent') n = 6;
    if (step === 5) n = 6;
    $('step' + step).classList.remove('active');
    currentStep = n;
    const nextEl = $('step' + n);
    if (nextEl) nextEl.classList.add('active');
    const bar = $('progress');
    if (bar) bar.style.width = Math.min(100, Math.round((n / 6) * 100)) + '%';
  }

  function prevStep(step) {
    let p = step - 1;
    if (step === 5 && answers.tenure === 'own')  p = 3;
    if (step === 6 && answers.tenure === 'rent') p = 4;
    $('step' + step).classList.remove('active');
    currentStep = p;
    const prevEl = $('step' + p);
    if (prevEl) prevEl.classList.add('active');
    const bar = $('progress');
    if (bar) bar.style.width = Math.round((p / 6) * 100) + '%';
  }

  function submitCalcLead() {
    const nameEl      = $('lead-name');
    const emailEl     = $('lead-email');
    const phoneEl     = $('lead-phone');
    const addrEl      = $('lead-address');
    const reInterestEl = $('re-interest');

    const name       = nameEl      ? nameEl.value.trim()      : '';
    const email      = emailEl     ? emailEl.value.trim()     : '';
    const phone      = phoneEl     ? phoneEl.value.trim()     : '';
    const address    = addrEl      ? addrEl.value.trim()      : '';
    const reInterested = reInterestEl ? reInterestEl.checked  : false;

    if (name && email) {
      const benefit = answers.tenure === 'own'
        ? (answers.income === 'low' ? '$1,500' : '$1,000')
        : (answers.age   === 'yes' ? '$700'   : '$450');
      let topic = 'ANCHOR Calculator \u2014 estimated benefit: ' + benefit;
      if (reInterested) topic += ' \u2014 ALSO interested in real estate help';

      sendLead({
        name:    name,
        email:   email,
        phone:   phone || 'Not provided',
        topic:   topic,
        town:    address || 'Not provided',
        address: address || 'Not provided'
      }, CONFIG.emailjs.templateId)
        .catch(function (e) { console.warn('Calc lead error:', e); });
    }
    showResult();
  }

  function showResult(reYes, addr) {
    let result = '';
    if (answers.primary === 'no') {
      result = noQualify(
        'Your property was not your NJ primary residence on October 1 of the benefit year.',
        ['Primary residence on Oct 1 is required',
         'Vacation homes and investment properties do not qualify']
      );
    } else if (answers.income === 'high') {
      result = noQualify('Income exceeds ANCHOR program limits.',
        ['Homeowner income limit: $250,000', 'Renter income limit: $150,000']);
    } else if (answers.tenure === 'rent' && answers.income === 'mid') {
      result = noQualify(
        'The $150,001\u2013$250,000 income bracket is for homeowners only.',
        ['Renter limit is $150,000', 'Under $150K? You qualify for $450']);
    } else if (answers.taxes === 'no' && answers.tenure === 'own') {
      result =
        '<div class="result-box" style="background:#fffae8;border-color:#d4af37;">' +
        '<div class="result-label" style="color:#5a4000;">' +
        '<i class="fas fa-triangle-exclamation"></i> Possible Delinquency Issue</div>' +
        '<p style="font-size:15px;color:#5a4010;margin:12px 0 16px;">Homeowners more than ' +
        '12 months delinquent may not qualify. Call the hotline to confirm before applying.</p>' +
        '<div class="result-actions">' +
        '<a href="tel:18882381233" class="btn-primary" style="text-decoration:none;">Call 1-888-238-1233</a>' +
        '<button onclick="resetCalc()" style="background:none;border:1.5px solid var(--navy);' +
        'border-radius:6px;padding:10px 20px;cursor:pointer;font-size:14px;' +
        'color:var(--navy);font-weight:600;">Start Over</button>' +
        '</div></div>';
    } else {
      const amount = answers.tenure === 'own'
        ? (answers.income === 'low' ? '$1,500' : '$1,000')
        : (answers.age   === 'yes' ? '$700'   : '$450');
      const label = answers.tenure === 'own'
        ? 'Estimated ANCHOR Homeowner Benefit'
        : 'Estimated ANCHOR Renter Benefit';
      const seniorNote = (answers.tenure === 'own' && answers.age === 'yes')
        ? '<li>As a senior, use Watchdog\u2019s free guided 2025 application; it will route you to the PAS-1 when required.</li>' : '';

      let reBlock = '';
      if (reYes) {
        const reTitle = answers.tenure === 'own'
          ? 'We\u2019ll reach out with your free home value estimate'
          : 'We\u2019ll reach out to talk through the buying process';
        const reBody = answers.tenure === 'own'
          ? 'John or Heather Scafide will follow up with real comparable sales from your neighborhood so you know exactly what your home is worth today \u2014 no obligation, no pressure.'
          : 'John or Heather Scafide will follow up to walk you through buying in South Jersey \u2014 from what you can afford to which neighborhoods fit your budget. No cost, no pressure.';
        const addrLine = addr
          ? '<div style="font-size:13px;color:var(--navy);font-weight:600;margin-top:8px;"><i class="fas fa-location-dot" style="margin-right:5px;"></i>' + addr + '</div>'
          : '';
        reBlock =
          '<div style="margin-top:16px;background:var(--info-bg);border:1px solid #c0d0e8;' +
          'border-radius:8px;padding:14px 16px;text-align:left;">' +
          '<div style="font-weight:700;font-size:14px;color:var(--navy-dark);margin-bottom:5px;">' +
          '<i class="fas fa-star" style="color:var(--gold);margin-right:6px;"></i>' + reTitle + '</div>' +
          '<p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:0;">' + reBody + '</p>' +
          addrLine + '</div>';
      }

      result =
        '<div class="result-box">' +
        '<div class="result-label"><i class="fas fa-circle-check" style="color:var(--green);' +
        'margin-right:6px;"></i>You likely qualify for ANCHOR!</div>' +
        '<div class="result-amount">' + amount + '</div>' +
        '<p style="font-weight:600;font-size:15px;color:var(--text);margin-bottom:10px;">' + label + '</p>' +
        '<ul class="qualify-checks"><li>Income is within program limits</li>' +
        '<li>This was your primary NJ residence on Oct 1</li>' + seniorNote + '</ul>' +
        '<p class="result-note">Estimate only. Continue with the ' +
        '<a href="' + CONFIG.anchorApplicationUrl + '" style="color:var(--navy);font-weight:700;">free Watchdog guided application</a>' +
        ' to complete the official 2025 NJ form.' +
        ' \u00b7 Seniors 65+: review the ' +
        '<a href="pas-1-guide.html" style="color:var(--navy);font-weight:700;">PAS-1 guide</a>' +
        '<br>Questions? <strong>1-888-238-1233</strong></p>' +
        reBlock +
        '<div style="margin-top:20px;background:var(--navy-dark);border-radius:10px;' +
        'padding:20px;text-align:left;border:1px solid rgba(184,151,42,0.4);">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
        '<div style="background:var(--gold);color:var(--navy-dark);font-size:11px;font-weight:700;' +
        'padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">New</div>' +
        '<div style="font-size:14px;font-weight:700;color:#fff;">Don\u2019t leave money on the table</div>' +
        '</div>' +
        '<p style="font-size:13px;color:#c0cfdf;line-height:1.6;margin-bottom:14px;">' +
        'You now know your ANCHOR estimate \u2014 but there are 3 more programs you may qualify for. ' +
        'Get the complete guide package and make sure you collect every dollar.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' +
        '<div style="font-size:12px;color:#c0cfdf;display:flex;align-items:center;gap:6px;">' +
        '<i class="fas fa-file-pdf" style="color:var(--gold);"></i>NJ Property Tax Relief Master Guide</div>' +
        '<div style="font-size:12px;color:#c0cfdf;display:flex;align-items:center;gap:6px;">' +
        '<i class="fas fa-file-pdf" style="color:var(--gold);"></i>PAS-1 Complete Walkthrough</div>' +
        '<div style="font-size:12px;color:#c0cfdf;display:flex;align-items:center;gap:6px;">' +
        '<i class="fas fa-file-pdf" style="color:var(--gold);"></i>Property Tax Appeal Prep Kit</div>' +
        '<div style="font-size:12px;color:#c0cfdf;display:flex;align-items:center;gap:6px;">' +
        '<i class="fas fa-file-pdf" style="color:var(--gold);"></i>NJ Senior Benefits Checklist</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
        '<a href="' + CONFIG.stripeLink + '" target="_blank" ' +
        'style="display:inline-flex;align-items:center;gap:8px;background:var(--gold);color:var(--navy-dark);' +
        'font-weight:700;font-size:14px;padding:11px 22px;border-radius:6px;text-decoration:none;">' +
        '<i class="fas fa-download"></i>Get All 4 Guides \u2014 ' + CONFIG.guidePrice + '</a>' +
        '<span style="font-size:12px;color:#8aaac8;">Instant download \u00b7 PDF \u00b7 33 pages</span>' +
        '</div></div>' +
        '<div class="result-actions" style="margin-top:18px;">' +
        '<a href="' + CONFIG.anchorApplicationUrl + '" class="btn-primary" style="text-decoration:none;">Start Free Application</a>' +
        '<button onclick="resetCalc()" style="background:none;border:1.5px solid var(--navy);' +
        'border-radius:6px;padding:10px 20px;cursor:pointer;font-size:14px;' +
        'color:var(--navy);font-weight:600;">Start Over</button>' +
        '</div></div>';
    }

    const rc = $('result-content');
    if (rc) rc.innerHTML = result;

    document.querySelectorAll('.calc-step').forEach(function (s) {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const s7 = $('step7');
    if (s7) {
      s7.classList.add('active');
      s7.style.display     = 'block';
      s7.style.opacity     = '1';
      s7.style.visibility  = 'visible';
    }
    if (rc) {
      rc.style.display    = 'block';
      rc.style.opacity    = '1';
      rc.style.visibility = 'visible';
    }
    const bar = $('progress');
    if (bar) bar.style.width = '100%';
  }

  function noQualify(reason, points) {
    return '<div class="result-box no-qualify">' +
      '<div class="result-label" style="color:var(--red);">' +
      '<i class="fas fa-circle-xmark" style="margin-right:6px;"></i>May Not Qualify for ANCHOR</div>' +
      '<p style="font-size:14px;color:var(--text-muted);margin:12px 0;">' + reason + '</p>' +
      '<ul class="qualify-checks no">' +
      points.map(function (p) { return '<li>' + p + '</li>'; }).join('') +
      '</ul>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-top:12px;">Not sure? Call <strong>1-888-238-1233</strong></p>' +
      '<div class="result-actions">' +
      '<button onclick="resetCalc()" class="btn-primary">Start Over</button>' +
      '<a href="senior-programs.html" style="background:none;border:1.5px solid var(--navy);' +
      'color:var(--navy);padding:10px 20px;border-radius:6px;font-weight:600;text-decoration:none;' +
      'font-size:14px;">See Senior Programs</a>' +
      '</div></div>';
  }

  function resetCalc() {
    answers     = {};
    currentStep = 1;
    document.querySelectorAll('.choice-btn').forEach(function (b) {
      b.classList.remove('selected', 'active-choice');
    });
    document.querySelectorAll('.btn-next').forEach(function (b) { b.disabled = true; });
    document.querySelectorAll('.calc-step').forEach(function (s) {
      s.classList.remove('active');
      s.style.display = '';
    });
    const s1 = $('step1');
    if (s1) { s1.classList.add('active'); s1.style.display = 'block'; }
    const bar = $('progress');
    if (bar) bar.style.width = '16%';
    const cb     = $('re-interest');
    const addrBox = $('re-address-wrap');
    const addrEl  = $('lead-address');
    if (cb)      cb.checked            = false;
    if (addrBox) addrBox.style.display = 'none';
    if (addrEl)  addrEl.value          = '';
  }

  // ============================================================
  // 13. STAY NJ CALCULATOR
  // ============================================================
  function calcStayNJ() {
    const taxEl    = $('staynj-tax');
    const incomeEl = $('staynj-income');
    const res      = $('staynj-result');
    const amtEl    = $('staynj-amount');
    const lblEl    = $('staynj-label');
    if (!taxEl || !incomeEl || !res) return;

    const tax    = parseNum(taxEl.value);
    const income = parseNum(incomeEl.value);

    if (!tax || !income) { res.style.display = 'none'; return; }

    // FY2027 budget: income limit ~$200,000, benefit tiered by income.
    let cap;
    if      (income > 200000) cap = 0;
    else if (income > 150000) cap = 4000;
    else if (income > 100000) cap = 5000;
    else                      cap = 6500;

    if (cap === 0) {
      if (amtEl) amtEl.textContent = 'Not eligible';
      if (lblEl) lblEl.textContent = 'Income over ~$200,000 — no longer eligible (FY2027 budget)';
    } else {
      if (amtEl) amtEl.textContent = '$' + Math.round(Math.min(tax * 0.5, cap)).toLocaleString();
      if (lblEl) lblEl.textContent = 'Estimated Stay NJ annual credit (50% of tax bill, capped at $' + cap.toLocaleString() + ' for your income)';
    }
    res.style.display = 'block';
  }

  // ============================================================
  // 14. MORTGAGE CALCULATOR
  // ============================================================
  function calcMortgage() {
    const priceEl = $('m-price');
    const downEl  = $('m-down');
    const rateEl  = $('m-rate');
    const termEl  = $('m-term');

    const price   = parseNum(priceEl ? priceEl.value : 0);
    const downPct = parseNum(downEl  ? downEl.value  : 0);
    const rate    = parseNum(rateEl  ? rateEl.value  : 0);
    const term    = parseInt(termEl  ? termEl.value  : 30, 10) || 30;

    const emptyState = $('mort-empty-state');
    const resultBox  = $('mort-top-result');
    const breakdown  = $('mort-breakdown');

    if (price > 0 && rate > 0) {
      const principal     = price * (1 - (downPct / 100));
      const monthlyRate   = (rate / 100) / 12;
      const numPayments   = term * 12;
      const monthly       = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                            (Math.pow(1 + monthlyRate, numPayments) - 1);
      const totalPaid     = monthly * numPayments;
      const totalInterest = totalPaid - principal;
      const intPct        = Math.round((totalInterest / price) * 100);

      if ($('m-monthly'))   $('m-monthly').textContent   = '$' + Math.round(monthly).toLocaleString();
      if ($('m-principal')) $('m-principal').textContent = '$' + Math.round(principal).toLocaleString();
      if ($('m-interest'))  $('m-interest').textContent  = '$' + Math.round(totalInterest).toLocaleString();
      if ($('m-total'))     $('m-total').textContent     = '$' + Math.round(totalPaid).toLocaleString();
      if ($('m-int-pct'))   $('m-int-pct').textContent   = intPct + '% of purchase price';

      if (emptyState) emptyState.style.display = 'none';
      if (resultBox)  resultBox.style.display  = 'block';
      if (breakdown)  breakdown.style.display  = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'block';
      if (resultBox)  resultBox.style.display  = 'none';
      if (breakdown)  breakdown.style.display  = 'none';
    }
  }

  // ============================================================
  // 15. APPEAL CALCULATOR & QUIZ
  // ============================================================
  function calcRatio() {
    const assessed = parseNum($('r-assessed') ? $('r-assessed').value : 0);
    const ratio    = parseNum($('r-ratio')    ? $('r-ratio').value    : 0);
    const market   = parseNum($('r-market')   ? $('r-market').value   : 0);
    const res      = $('ratio-result');
    if (!assessed || !ratio || !market) { if (res) res.style.display = 'none'; return; }

    const implied = assessed / (ratio / 100);
    const diff    = implied - market;

    if ($('r-implied')) $('r-implied').textContent = '$' + Math.round(implied).toLocaleString();
    if ($('r-your'))    $('r-your').textContent    = '$' + Math.round(market).toLocaleString();
    if ($('r-diff')) {
      $('r-diff').textContent = (diff >= 0 ? '+' : '') + '$' + Math.round(Math.abs(diff)).toLocaleString();
      $('r-diff').style.color = diff > 0 ? '#f0d87a' : '#7ec8a0';
    }

    let verdict = '';
    if (diff > 15000) {
      verdict = '<strong style="color:#f0d87a;">You may be over-assessed.</strong> Your implied market value is $' +
        Math.round(diff).toLocaleString() + ' higher than your estimate. Request a free comp report to validate before filing.';
    } else if (diff > 0) {
      verdict = '<strong style="color:#f0d87a;">Marginal over-assessment.</strong> There may be a case here depending on the comps. Request a free comp report.';
    } else {
      verdict = '<strong style="color:#7ec8a0;">May not be over-assessed</strong> based on your estimate. Actual comparable sales could still tell a different story.';
    }
    if ($('r-verdict')) $('r-verdict').innerHTML = verdict;
    if (res) res.style.display = 'block';
  }

  let quizData = { sales: '', reval: '', errors: '', recent: '' };

  function quizSelect(key, val, step) {
    quizData[key] = val;
    quizNext(step);
  }

  function quizNext(step) {
    const cur = $('q-step' + step);
    const nxt = $('q-step' + (step + 1));
    if (cur) cur.classList.remove('active');
    if (nxt) nxt.classList.add('active');
    const bar = $('quiz-progress');
    if (bar) bar.style.width = ((step + 1) * 20) + '%';
  }

  function quizPrev(step) {
    const cur = $('q-step' + step);
    const prv = $('q-step' + (step - 1));
    if (cur) cur.classList.remove('active');
    if (prv) prv.classList.add('active');
    const bar = $('quiz-progress');
    if (bar) bar.style.width = ((step - 1) * 20) + '%';
  }

  function submitQuiz() {
    const addrEl  = $('quiz-addr');
    const emailEl = $('quiz-email');
    const addr    = addrEl  ? addrEl.value.trim()  : '';
    const email   = emailEl ? emailEl.value.trim() : '';

    if (!addr || !email) {
      alert('Please provide an address and email to receive your report.');
      return;
    }

    let score = 0;
    if (quizData.sales  === 'yes') score += 40;
    if (quizData.reval  === 'yes') score += 30;
    if (quizData.errors === 'yes') score += 20;
    if (quizData.recent === 'no')  score += 10;

    const rating = score > 60 ? 'HIGH' : score > 30 ? 'MODERATE' : 'LOW';
    const color  = score > 60 ? 'var(--green)' : 'var(--gold)';

    const step5    = $('q-step5');
    const finalDiv = $('q-result');
    if (step5)    step5.classList.remove('active');
    if (finalDiv) finalDiv.classList.add('active');

    const renderEl = $('quiz-result-render');
    if (renderEl) {
      renderEl.innerHTML =
        '<h2 style="color:' + color + '; font-size:48px;">' + score + '%</h2>' +
        '<h3>' + rating + ' Probability</h3>' +
        '<p style="margin: 20px 0;">Based on your inputs, you have a ' + rating.toLowerCase() +
        ' chance of a successful tax appeal.</p>' +
        '<div class="prog-card-new gold" style="text-align:left;">' +
        '<strong>Next Steps:</strong> John will pull the live MLS comparables for <strong>' +
        addr + '</strong> and email them to you shortly to verify this score.</div>' +
        '<a href="index.html" class="btn-outline" style="margin-top:20px; display:inline-block;">Back to Home</a>';
    }

    sendLead({
      name:    'Appeal Quiz Lead',
      email:   email,
      topic:   'Tax Appeal Quiz \u2014 score: ' + score + '% (' + rating + ')',
      town:    addr,
      address: addr
    }, CONFIG.emailjs.templateId)
      .catch(function (e) { console.warn('Quiz lead error:', e); });
  }

  // ============================================================
  // 16. TOWN DIRECTORY
  // ============================================================
  function loadTownDirectory() {
    const directory = $('townDirectory');
    if (!directory) return;
    fetch('towns.html?v=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('towns.html not found');
        return r.text();
      })
      .then(function (data) { directory.innerHTML = data; })
      .catch(function (err) {
        console.error('Directory error:', err);
        directory.innerHTML = '<p>Directory temporarily unavailable.</p>';
      });
  }

  function filterTowns() {
    const input = $('townSearch');
    if (!input) return;
    const filter = input.value.toLowerCase();
    document.querySelectorAll('#townDirectory .town-card').forEach(function (card) {
      const text = card.getAttribute('data-town') || '';
      card.style.display = text.toLowerCase().includes(filter) ? 'flex' : 'none';
    });
  }

  // ============================================================
  // 17. DYNAMIC SITEMAP
  // ============================================================
  function generateDynamicSitemap() {
    const container = $('dynamic-sitemap');
    if (!container) return;
    fetch('nav.html?v=' + Date.now())
      .then(function (r) { return r.text(); })
      .then(function (navHtml) {
        const tmp   = document.createElement('div');
        tmp.innerHTML = navHtml;
        const links = tmp.querySelectorAll('a');
        let html = '<div class="prog-card-new"><ul class="sidebar-list" style="columns:2;column-gap:40px;line-height:2.5;">';
        links.forEach(function (link) {
          if (link.classList.contains('nav-logo') || link.classList.contains('mobile-menu-icon')) return;
          const href = link.getAttribute('href');
          const text = (link.textContent || '').trim();
          if (!href || !text) return;
          html += '<li><a href="' + href + '" style="color:var(--navy);font-weight:600;text-decoration:none;">' +
                  '<i class="fas fa-chevron-right" style="font-size:10px;margin-right:8px;color:var(--gold);"></i>' +
                  text + '</a></li>';
        });
        html += '</ul></div>';
        container.innerHTML = html;
      })
      .catch(function (err) {
        console.error('Sitemap error:', err);
        container.innerHTML = '<p>Error syncing sitemap. Please try again later.</p>';
      });
  }

  // ============================================================
  // 18. BACK TO TOP
  // ============================================================
  function initBackToTop() {
    window.addEventListener('scroll', function () {
      const btn     = $('backToTop');
      if (!btn) return;
      const scrolled = document.body.scrollTop || document.documentElement.scrollTop;
      btn.style.display = (scrolled > 500) ? 'block' : 'none';
    });
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================
  // 19. PUBLIC API
  // ============================================================
  window.toggleMobileMenu        = toggleMobileMenu;

  // Forms
  window.handleAuditRequest      = handleAuditRequest;   // legacy audit page
  window.submitAudit             = submitAudit;           // new homepage audit form
  window.submitComps             = submitComps;           // new homepage comps form
  window.submitContact           = submitContact;         // new homepage contact form
  window.submitLead              = submitLead;            // legacy contact form
  window.showDynamicFields       = showDynamicFields;     // topic-based field reveal
  window.handleChecklistDownload = handleChecklistDownload;
  window.minimizePopup           = minimizePopup;
  window.restorePopup            = restorePopup;
  window.showRebateModal         = showRebateModal;
  window.minimizeRebateModal     = minimizeRebateModal;
  window.downloadChecklist       = downloadChecklist;

  // Accordions / tabs
  window.toggleFAQ  = toggleFAQ;
  window.togglePAS  = togglePAS;
  window.switchTab  = switchTab;

  // ANCHOR calculator
  window.selectChoice   = selectChoice;
  window.nextStep       = nextStep;
  window.prevStep       = prevStep;
  window.submitCalcLead = submitCalcLead;
  window.resetCalc      = resetCalc;

  // Other calculators
  window.calcMortgage = calcMortgage;
  window.calcStayNJ   = calcStayNJ;
  window.calcRatio    = calcRatio;

  // Appeal quiz
  window.quizSelect = quizSelect;
  window.quizNext   = quizNext;
  window.quizPrev   = quizPrev;
  window.submitQuiz = submitQuiz;

  // Towns / utility
  window.filterTowns = filterTowns;
  window.scrollToTop = scrollToTop;

  // Property dashboard
  window.addPropertyToWatchlist = addPropertyToWatchlist;

  // ============================================================
  // GOOGLE PLACES AUTOCOMPLETE
  // Called automatically by Google Maps script via callback param.
  // Add any new address field IDs to addressFieldIds below.
  // ============================================================
  function initAddressAutocomplete() {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) return;

    const addressFieldIds = [
      'audit-address',   // legacy audit form (other pages)
      'audit-addr',      // new homepage listing audit form
      'comps-addr',      // new homepage comps form
      'quiz-addr',       // appeal quiz
      'cf-town',         // legacy contact form
      'lead-address',    // ANCHOR calculator
      'a-lead-address',  // new combined ANCHOR calculator
      'est-address',     // standalone ANCHOR estimator
      'sn-address',      // standalone Stay NJ estimator
      'df-sell-addr',    // dynamic contact — sell
      'df-appeal-addr'   // dynamic contact — appeal
    ];

    addressFieldIds.forEach(function (id) {
      const input = document.getElementById(id);
      if (!input || input.dataset.autocompleted === '1') return;
      input.dataset.autocompleted = '1';

      const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address']
      });

      autocomplete.addListener('place_changed', function () {
        const place = autocomplete.getPlace();
        if (place && place.formatted_address) {
          const state = (place.address_components || []).find(function (part) {
            return (part.types || []).indexOf('administrative_area_level_1') !== -1;
          });
          const isEstimator = id === 'est-address' || id === 'sn-address';
          if (isEstimator && state && state.short_name !== 'NJ') {
            input.setCustomValidity('Please choose a New Jersey address.');
            input.reportValidity();
            return;
          }
          input.setCustomValidity('');
          input.value = place.formatted_address;
          input.dataset.googleAddress = '1';
          input.dispatchEvent(new CustomEvent('watchdog:address-selected', {
            bubbles: true,
            detail: { formattedAddress: place.formatted_address }
          }));
        }
      });

      input.addEventListener('input', function () {
        input.setCustomValidity('');
        input.dataset.googleAddress = '0';
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const dropdown = document.querySelector('.pac-container:not(:empty)');
          if (dropdown) e.preventDefault();
        }
      });
    });
  }

  window.initAddressAutocomplete = initAddressAutocomplete;

  // ============================================================
  // PROPERTY DASHBOARD
  // ============================================================
  const APIFY_TOKEN = 'apify_api_XdhChKEbRUhZwIHCVGaGkZvZ8AidZO4znzWg';
  const ACTOR_ID    = 'maxcopell/zillow-scraper';

  document.addEventListener('DOMContentLoaded', function () {
    const savedProperties = JSON.parse(localStorage.getItem('watchdogList')) || [];
    const list = $('watchlist-items');
    if (!list) return;
    savedProperties.forEach(function (prop) { renderPropertyCard(prop); });
  });

  async function addPropertyToWatchlist() {
    const addrInput = $('prop-input');
    const addr = addrInput ? addrInput.value : '';
    if (!addr) return;

    const list   = $('watchlist-items');
    const tempId = 'id-' + Date.now();
    const loadingItem =
      '<div class="watch-item" id="' + tempId + '">' +
      '<div class="watch-info">' +
      '<span class="watch-addr">' + addr + '</span>' +
      '<span class="watch-meta"><i class="fas fa-spinner fa-spin"></i> Fetching Live Data...</span>' +
      '</div></div>';
    if (list) list.insertAdjacentHTML('afterbegin', loadingItem);

    if (addrInput) addrInput.value = '';
    const addForm = $('add-prop-form');
    if (addForm) addForm.style.display = 'none';

    try {
      const runRes = await fetch(
        'https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + APIFY_TOKEN,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ searchQuery: addr, maxResults: 1 }) }
      );
      const runData = await runRes.json();
      pollApifyResult(runData.data.id, tempId, addr);
    } catch (err) {
      console.error('Fetch Error:', err);
      const el = $(tempId);
      if (el) el.innerHTML = 'Connection Error.';
    }
  }

  async function pollApifyResult(runId, elementId, addr) {
    const res  = await fetch('https://api.apify.com/v2/actor-runs/' + runId + '?token=' + APIFY_TOKEN);
    const data = await res.json();

    if (data.data.status === 'SUCCEEDED') {
      const datasetRes = await fetch(
        'https://api.apify.com/v2/actor-runs/' + runId + '/dataset/items?token=' + APIFY_TOKEN
      );
      const items = await datasetRes.json();
      if (items.length > 0) {
        const p = items[0];
        const cleanProp = {
          id:      elementId,
          address: addr,
          price:   p.price || p.zestimate || 'N/A',
          city:    (p.address && p.address.city) ? p.address.city : 'NJ',
          trend:   (Math.random() * 4).toFixed(1),
          isUp:    Math.random() > 0.4
        };
        saveToStorage(cleanProp);
        updatePropertyUI(elementId, cleanProp);
      } else {
        const el = $(elementId);
        if (el) el.innerHTML = 'No Zillow data found.';
      }
    } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.data.status)) {
      const el = $(elementId);
      if (el) el.innerHTML = 'Search failed.';
    } else {
      setTimeout(function () { pollApifyResult(runId, elementId, addr); }, 3000);
    }
  }

  function updatePropertyUI(elementId, prop) {
    const el = $(elementId);
    if (!el) return;
    el.innerHTML =
      '<div class="watch-info">' +
      '<span class="watch-addr">' + prop.address + '</span>' +
      '<span class="watch-meta">' + prop.city + '</span>' +
      '</div>' +
      '<div class="watch-stats">' +
      '<div class="watch-price">' + (typeof prop.price === 'number' ? '$' + prop.price.toLocaleString() : prop.price) + '</div>' +
      '<div class="watch-trend ' + (prop.isUp ? 'up' : 'down') + '">' +
      '<i class="fas fa-caret-' + (prop.isUp ? 'up' : 'down') + '"></i> ' + prop.trend + '%' +
      '</div></div>';
  }

  function renderPropertyCard(prop) {
    const list = $('watchlist-items');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'watch-item';
    item.id        = prop.id;
    item.innerHTML =
      '<div class="watch-info">' +
      '<span class="watch-addr">' + prop.address + '</span>' +
      '<span class="watch-meta">' + prop.city + '</span>' +
      '</div>' +
      '<div class="watch-stats">' +
      '<div class="watch-price">' + (typeof prop.price === 'number' ? '$' + prop.price.toLocaleString() : prop.price) + '</div>' +
      '<div class="watch-trend ' + (prop.isUp ? 'up' : 'down') + '">' +
      '<i class="fas fa-caret-' + (prop.isUp ? 'up' : 'down') + '"></i> ' + prop.trend + '%' +
      '</div></div>';
    list.appendChild(item);
  }

  function saveToStorage(prop) {
    const current = JSON.parse(localStorage.getItem('watchdogList')) || [];
    current.push(prop);
    localStorage.setItem('watchdogList', JSON.stringify(current));
  }

})();