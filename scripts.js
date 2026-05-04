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
 *   9.  Forms (Contact, Audit)
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
      publicKey: 'u262kw5AoJcBI342V',
      serviceId: 'service_gptqbyx',
      templateId: 'template_q1kaure'
    },
    popupDelays: {
      rebateModal: 3000   // ms before the rebate modal appears
    },
    contactHotline: '1-888-238-1233',
    checklistFile: 'NJ_Tax_Relief_Checklist.pdf'
  };

  // ============================================================
  // 2. UTILITY HELPERS
  // Tiny shared functions. Use these instead of repeating yourself.
  // ============================================================

  // Safe element lookup. Returns null if missing instead of throwing.
  function $(id) {
    return document.getElementById(id);
  }

  // Strips $, commas, and spaces from user input before parsing.
  // Handles "$350,000" or "350,000" without breaking.
  function parseNum(value) {
    if (value === undefined || value === null) return 0;
    const cleaned = String(value).replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  // Send a lead through EmailJS with safe defaults.
  // All form submissions route through here for consistent error handling.
  function sendLead(payload) {
    if (typeof emailjs === 'undefined') {
      console.warn('EmailJS not loaded yet.');
      return Promise.reject(new Error('EmailJS missing'));
    }
    const data = Object.assign({
      name: 'Not provided',
      email: 'Not provided',
      phone: 'Not provided',
      topic: 'Website inquiry',
      town: 'Not provided'
    }, payload);
    return emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templateId, data);
  }

  // Lock/unlock body scroll. Works on iOS Safari (overflow:hidden alone does not).
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
  // Initializes once the script and emailjs library are both ready.
  // Retries every 200ms if emailjs hasn't loaded yet.
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
  // Single DOMContentLoaded handler. Add new init steps here so
  // we don't end up with five separate listeners again.
  // ============================================================
  function onReady() {
    initEmailJS();
    loadNav();
    initFooter();
    initNewsStrip();
    initRebatePopup();
    initBackToTop();
    if ($('townDirectory')) loadTownDirectory();
    if ($('dynamic-sitemap')) generateDynamicSitemap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // ============================================================
  // 5. NAVIGATION & FOOTER LOADERS
  // Pulls nav.html and footer.html into placeholder divs.
  // Both use cache-busting so updates show up immediately.
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
      .catch(function (err) {
        console.error('Nav load error:', err);
      });
  }

  // Retry-safe footer injection. Gives up after 30 attempts (~3 seconds)
  // so we don't loop forever if the placeholder doesn't exist.
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
      .then(function (html) {
        footerEl.innerHTML = html;
      })
      .catch(function (err) {
        console.error('Footer load error:', err);
      });
  }

  // ============================================================
  // 6. MOBILE MENU & MEGA MENU
  // FIX: Added bindMegaMenuDesktop() for .nav-item.has-mega pattern
  // used by the new dropdown nav. The old bindMegaMenu() stays for
  // the legacy .mega-trigger mobile accordion. Both run on init.
  // ============================================================
  function initNavLogic() {
    bindMegaMenu();
    bindMegaMenuDesktop();
    window.addEventListener('resize', function () {
      bindMegaMenu();
      bindMegaMenuDesktop();
    });
  }

  // Legacy mobile accordion (.mega-trigger pattern)
  function bindMegaMenu() {
    const triggers = document.querySelectorAll('.mega-trigger');
    if (!triggers.length) return;
    triggers.forEach(function (trigger) {
      // Avoid double-binding on resize.
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

  // New desktop mega menu (.nav-item.has-mega click-to-open pattern)
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
        // Close all other open panels first
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
    // Click outside closes all panels
    document.removeEventListener('click', closeMegaOnOutsideClick);
    document.addEventListener('click', closeMegaOnOutsideClick);
    // Clicks inside a panel don't bubble up and close it
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
    // New nav: hamburger drawer
    const drawer = $('mobileDrawer');
    const burger = document.querySelector('.nav-hamburger');
    if (drawer) {
      const isOpen = drawer.classList.contains('open');
      drawer.classList.toggle('open');
      if (burger) burger.classList.toggle('open');
      isOpen ? unlockBodyScroll() : lockBodyScroll();
      return;
    }
    // Legacy nav: navLinks toggle
    const navLinks = $('navLinks');
    if (!navLinks) return;
    navLinks.classList.toggle('active');
    if (navLinks.classList.contains('active')) {
      lockBodyScroll();
    } else {
      unlockBodyScroll();
    }
  }

  // ============================================================
  // 7. NEWS STRIP ROTATION
  // Fades through .news-item elements every 4 seconds.
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
        // Force reflow so the transition runs.
        void next.offsetHeight;
        next.style.transition = 'opacity 0.5s ease';
        next.style.opacity = '1';
      }, 500);
    }, 4000);
  }

  // ============================================================
  // 8. POPUPS & LEAD MAGNETS
  //
  // ⚠️ HEADS UP: The original code had TWO popup systems running
  // at the same time:
  //   - #rebate-popup / #popup-minimized  (LEGACY)
  //   - #rebate-modal / #sticky-rebate-link  (ACTIVE)
  // Pick one in your HTML and delete the other so visitors don't
  // see overlapping popups. The functions for both are kept here
  // so nothing breaks until you clean up the HTML.
  // ============================================================

  // ----- Active modal: #rebate-modal -----
  function initRebatePopup() {
    if (sessionStorage.getItem('rebateModalSeen')) {
      const link = $('sticky-rebate-link');
      if (link) link.style.display = 'inline-flex';
      return;
    }
    setTimeout(function () {
      showRebateModal();
      sessionStorage.setItem('rebateModalSeen', 'true');
    }, CONFIG.popupDelays.rebateModal);
  }

  function showRebateModal() {
    const modal = $('rebate-modal');
    const link = $('sticky-rebate-link');
    if (modal) modal.style.display = 'flex';
    if (link) link.style.display = 'none';
  }

  function minimizeRebateModal() {
    const modal = $('rebate-modal');
    const link = $('sticky-rebate-link');
    if (modal) modal.style.display = 'none';
    if (link) link.style.display = 'inline-flex';
  }

  function downloadChecklist() {
    const emailEl = $('modal-email');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
      alert('Please enter your email to receive the checklist.');
      return;
    }
    sendLead({
      name: 'Checklist Download',
      email: email,
      topic: 'Checklist Download Lead'
    }).catch(function (e) { console.warn('Checklist lead error:', e); });
    window.open(CONFIG.checklistFile, '_blank');
    minimizeRebateModal();
  }

  // ----- Legacy popup: #rebate-popup / #popup-minimized -----
  // Kept for backwards compatibility. Remove these (and the matching
  // HTML) once you confirm nothing references them.
  function minimizePopup() {
    const popup = $('rebate-popup');
    const mini = $('popup-minimized');
    if (popup) popup.style.display = 'none';
    if (mini) mini.style.display = 'block';
    sessionStorage.setItem('checklistClosed', 'true');
  }
  function restorePopup() {
    const popup = $('rebate-popup');
    const mini = $('popup-minimized');
    if (popup) popup.style.display = 'block';
    if (mini) mini.style.display = 'none';
  }
  function handleChecklistDownload() {
    const emailEl = $('popup-email');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
      alert('Please enter your email to receive the checklist.');
      return;
    }
    sendLead({
      email: email,
      topic: 'Checklist Download Request',
      name: 'New Lead'
    }).catch(function (e) { console.warn('Legacy checklist error:', e); });
    window.open(CONFIG.checklistFile, '_blank');
    minimizePopup();
  }

  // ============================================================
  // 9. FORMS — Contact & Audit Request
  // All submissions route through sendLead() for consistent
  // error handling. EmailJS errors no longer fail silently.
  // ============================================================

  function handleAuditRequest() {
    const addr = $('audit-address');
    const name = $('audit-name');
    const email = $('audit-email');
    if (!addr || !email) return;

    const addrVal = addr.value.trim();
    const emailVal = email.value.trim();
    const nameVal = name ? name.value.trim() : '';

    if (!addrVal || !emailVal) {
      alert('Please provide the property address and your email.');
      return;
    }

    sendLead({
      name: nameVal,
      email: emailVal,
      topic: 'Tax-Optimized Listing Audit Request',
      town: addrVal
    }).then(function () {
      alert('Success! John or Heather will begin your audit and reach out within 24 hours.');
      addr.value = '';
      if (name) name.value = '';
      email.value = '';
    }).catch(function (err) {
      console.error('Audit request failed:', err);
      alert('Something went wrong. Please try again or call ' + CONFIG.contactHotline + '.');
    });
  }

  function submitLead() {
    const nameEl = $('cf-name');
    const emailEl = $('cf-email');
    const phoneEl = $('cf-phone');
    const topicEl = $('cf-topic');
    const townEl = $('cf-town');
    if (!nameEl || !emailEl) return;

    const name = nameEl.value.trim();
    const email = emailEl.value.trim();

    if (!name) { nameEl.focus(); alert('Please enter your name.'); return; }
    if (!email) { emailEl.focus(); alert('Please enter your email.'); return; }

    const btn = document.querySelector('#contact-form .submit-btn');
    if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

    sendLead({
      name: name,
      email: email,
      phone: phoneEl ? phoneEl.value.trim() : 'Not provided',
      topic: topicEl ? topicEl.value : 'Website inquiry',
      town: townEl ? townEl.value.trim() : 'Not provided'
    }).then(function () {
      const form = $('contact-form');
      const success = $('form-success');
      if (form) form.style.display = 'none';
      if (success) success.style.display = 'block';
    }).catch(function (err) {
      if (btn) { btn.textContent = 'Request Free Consultation \u2192'; btn.disabled = false; }
      alert('Submission failed. Please try again or call us directly.');
      console.error('Contact form error:', err);
    });
  }

  // ============================================================
  // 10. ACCORDIONS — PAS-1 & FAQ
  // Both use the same .open class pattern.
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
    const item = el.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function (f) { f.classList.remove('open'); });
    if (!isOpen) item.classList.add('open');
  }

  // ============================================================
  // 11. TAB SWITCHER
  // Toggles .active on tabs and matching .tab-panel elements.
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
  // FIX: answers & currentStep were never declared — added here.
  // 6-step quiz with branching logic. State lives in `answers`.
  // Result HTML is built in showResult(); rejections go through noQualify().
  // ============================================================

  // FIX: These were missing — every calculator function was throwing
  // "answers is not defined" on every click.
  let answers = {};
  let currentStep = 1;

  // Updates the real estate interest checkbox text based on own vs rent.
  function updateREInterest(tenure) {
    const textEl  = $('re-interest-text');
    const subEl   = $('re-interest-sub');
    const cb      = $('re-interest');
    const addrLbl = $('re-address-label');
    const addrBox = $('re-address-wrap');
    const addrEl  = $('lead-address');
    if (!textEl || !subEl) return;

    // Reset on tenure switch
    if (cb) cb.checked = false;
    if (addrBox) addrBox.style.display = 'none';
    if (addrEl)  addrEl.value = '';

    if (tenure === 'own') {
      textEl.textContent = 'I\u2019m curious what my home is worth right now.';
      subEl.textContent  = 'Check this and a local South Jersey agent will reach out with a free, no-obligation home value estimate.';
      if (addrLbl) addrLbl.textContent = 'Your home address';
    } else {
      textEl.textContent = 'I\u2019m interested in buying a home \u2014 I\u2019m tired of renting.';
      subEl.textContent  = 'Check this and a local South Jersey agent will reach out to walk you through the buying process at no cost.';
      if (addrLbl) addrLbl.textContent = 'Your current address (so we can show you nearby homes)';
    }

    // Wire checkbox to show/hide address field
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
      b.classList.remove('selected');
      b.classList.remove('active-choice');
    });
    btn.classList.add('selected');
    btn.classList.add('active-choice');
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
    if (step === 5 && answers.tenure === 'own') p = 3;
    if (step === 6 && answers.tenure === 'rent') p = 4;
    $('step' + step).classList.remove('active');
    currentStep = p;
    const prevEl = $('step' + p);
    if (prevEl) prevEl.classList.add('active');
    const bar = $('progress');
    if (bar) bar.style.width = Math.round((p / 6) * 100) + '%';
  }

  // FIX: Was calling emailjs.send() directly — now routes through
  // sendLead() for consistent error handling like every other form.
  function submitCalcLead() {
    const nameEl     = $('lead-name');
    const emailEl    = $('lead-email');
    const phoneEl    = $('lead-phone');
    const addrEl     = $('lead-address');
    const reInterest = $('re-interest');

    const name  = nameEl  ? nameEl.value.trim()  : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const addr  = addrEl  ? addrEl.value.trim()  : '';
    const reYes = reInterest ? reInterest.checked : false;

    const benefit = answers.tenure === 'own'
      ? (answers.income === 'low' ? '$1,500' : '$1,000')
      : (answers.age === 'yes'   ? '$700'   : '$450');

    let reLine = '';
    if (reYes) {
      reLine = answers.tenure === 'own'
        ? ' | \u2605 WANTS HOME VALUE ESTIMATE (interested in selling)'
        : ' | \u2605 INTERESTED IN BUYING (tired of renting)';
      if (addr) reLine += ' | Address: ' + addr;
    }

    if (name && email) {
      sendLead({
        name:  name,
        email: email,
        phone: phone || 'Not provided',
        topic: 'ANCHOR Calculator \u2014 est. benefit: ' + benefit + reLine,
        town:  addr || 'Not provided'
      }).catch(function (e) { console.warn('EmailJS calc lead:', e); });
    }

    showResult(reYes, addr);
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
            ['Homeowner income limit: $250,000', 'Renter income limit: $150,000']
        );
    } else if (answers.tenure === 'rent' && answers.income === 'mid') {
        result = noQualify(
            'The $150,001\u2013$250,000 income bracket is for homeowners only.',
            ['Renter limit is $150,000', 'Under $150K? You qualify for $450']
        );
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
            : (answers.age === 'yes'   ? '$700'   : '$450');
        const label = answers.tenure === 'own'
            ? 'Estimated ANCHOR Homeowner Benefit'
            : 'Estimated ANCHOR Renter Benefit';
        const seniorNote = (answers.tenure === 'own' && answers.age === 'yes')
            ? '<li>As a senior, apply using the PAS-1 form at propertytaxrelief.nj.gov</li>' : '';

        // Real estate follow-up block
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
                addrLine +
                '</div>';
        }

        result =
            '<div class="result-box">' +
            '<div class="result-label"><i class="fas fa-circle-check" style="color:var(--green);' +
            'margin-right:6px;"></i>You likely qualify for ANCHOR!</div>' +
            '<div class="result-amount">' + amount + '</div>' +
            '<p style="font-weight:600;font-size:15px;color:var(--text);margin-bottom:10px;">' + label + '</p>' +
            '<ul class="qualify-checks"><li>Income is within program limits</li>' +
            '<li>This was your primary NJ residence on Oct 1</li>' + seniorNote + '</ul>' +
            '<p class="result-note">Estimate only. Apply at ' +
            '<a href="https://anchor.nj.gov" target="_blank" style="color:var(--navy);font-weight:700;">anchor.nj.gov</a>' +
            ' \u00b7 Seniors 65+: use the ' +
            '<a href="pas-1-guide.html" style="color:var(--navy);font-weight:700;">PAS-1</a>' +
            '<br>Questions? <strong>1-888-238-1233</strong></p>' +
            reBlock +
            '<div class="result-actions" style="margin-top:18px;">' +
            '<a href="https://anchor.nj.gov" target="_blank" class="btn-primary" style="text-decoration:none;">Apply Now</a>' +
            '<button onclick="resetCalc()" style="background:none;border:1.5px solid var(--navy);' +
            'border-radius:6px;padding:10px 20px;cursor:pointer;font-size:14px;' +
            'color:var(--navy);font-weight:600;">Start Over</button>' +
            '</div></div>';
    }

    const rc = $('result-content');
    if (rc) {
        rc.innerHTML = result;
        // Force the content itself to be visible
        rc.setAttribute('style', 'display: block !important; opacity: 1 !important; visibility: visible !important;');
    }

    // Hide all steps first
    document.querySelectorAll('.calc-step').forEach(function (s) {
        s.classList.remove('active');
        s.style.display = 'none';
    });

    // Ensure Step 7 (the results container) is shown
    const s7 = $('step7');
    if (s7) {
        s7.classList.add('active');
        s7.setAttribute('style', 'display: block !important; opacity: 1 !important; visibility: visible !important;');
    }

    const bar = $('progress');
    if (bar) bar.style.width = '100%';
}

  function resetCalc() {
    answers = {};
    currentStep = 1;
    document.querySelectorAll('.choice-btn').forEach(function (b) {
      b.classList.remove('selected');
      b.classList.remove('active-choice');
    });
    document.querySelectorAll('.btn-next').forEach(function (b) { b.disabled = true; });
    // Clear both class and inline style so CSS takes back over
    document.querySelectorAll('.calc-step').forEach(function (s) {
      s.classList.remove('active');
      s.style.display = '';
    });
    const s1 = $('step1');
    if (s1) {
      s1.classList.add('active');
      s1.style.display = 'block';
    }
    const bar = $('progress');
    if (bar) bar.style.width = '16%';
    const cb = $('re-interest');
    if (cb) cb.checked = false;
    const addrBox = $('re-address-wrap');
    const addrEl  = $('lead-address');
    if (addrBox) addrBox.style.display = 'none';
    if (addrEl)  addrEl.value = '';
  }

  // ============================================================
  // 13. STAY NJ CALCULATOR
  // Estimates 50% of property tax up to $6,500/year cap.
  // Uses parseNum() so "$6,500" style input works.
  // ============================================================
  function calcStayNJ() {
    const taxEl = $('staynj-tax');
    const incomeEl = $('staynj-income');
    const res = $('staynj-result');
    const amtEl = $('staynj-amount');
    const lblEl = $('staynj-label');
    if (!taxEl || !incomeEl || !res) return;

    const tax = parseNum(taxEl.value);
    const income = parseNum(incomeEl.value);

    if (!tax || !income) { res.style.display = 'none'; return; }

    if (income > 500000) {
      if (amtEl) amtEl.textContent = 'Ineligible';
      if (lblEl) lblEl.textContent = 'Income exceeds $500,000 limit';
    } else {
      if (amtEl) amtEl.textContent = '$' + Math.round(Math.min(tax * 0.5, 6500)).toLocaleString();
      if (lblEl) lblEl.textContent = 'Estimated Stay NJ Annual Credit (50% of tax bill, max $6,500/yr)';
    }
    res.style.display = 'block';
  }

  // ============================================================
  // 14. MORTGAGE CALCULATOR
  // FIX: Now strips commas/$ from inputs so "$350,000" works.
  // FIX: Now updates m-int-pct (interest as % of purchase price).
  // Stays silent (no error popups) until both price and rate are entered.
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
      const principal    = price * (1 - (downPct / 100));
      const monthlyRate  = (rate / 100) / 12;
      const numPayments  = term * 12;
      const monthly      = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                           (Math.pow(1 + monthlyRate, numPayments) - 1);
      const totalPaid    = monthly * numPayments;
      const totalInterest = totalPaid - principal;
      const intPct       = Math.round((totalInterest / price) * 100);

      if ($('m-monthly'))   $('m-monthly').textContent   = '$' + Math.round(monthly).toLocaleString();
      if ($('m-principal')) $('m-principal').textContent = '$' + Math.round(principal).toLocaleString();
      if ($('m-interest'))  $('m-interest').textContent  = '$' + Math.round(totalInterest).toLocaleString();
      if ($('m-total'))     $('m-total').textContent     = '$' + Math.round(totalPaid).toLocaleString();
      if ($('m-int-pct'))   $('m-int-pct').textContent   = intPct + '% of purchase price'; // FIX: was missing

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
  // FIX: Added calcRatio() — was used on property-tax-appeal.html
  // but never defined. Also added to public API at bottom.
  // ============================================================

  // Equalization ratio calculator (property-tax-appeal.html)
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

  // Appeal probability quiz
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
      name: 'Appeal Quiz Lead',
      email: email,
      topic: 'Tax Appeal Quiz \u2014 score: ' + score + '% (' + rating + ')',
      town: addr
    }).catch(function (e) { console.warn('Quiz lead error:', e); });
  }

  // ============================================================
  // 16. TOWN DIRECTORY
  // Loads towns.html into a placeholder, then filters via input.
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
  // Builds a sitemap by reading links from nav.html.
  // ============================================================
  function generateDynamicSitemap() {
    const container = $('dynamic-sitemap');
    if (!container) return;
    fetch('nav.html?v=' + Date.now())
      .then(function (r) { return r.text(); })
      .then(function (navHtml) {
        const tmp = document.createElement('div');
        tmp.innerHTML = navHtml;
        const links = tmp.querySelectorAll('a');
        let html = '<div class="prog-card-new"><ul class="sidebar-list" style="columns: 2; column-gap: 40px; line-height: 2.5;">';
        links.forEach(function (link) {
          if (link.classList.contains('nav-logo') || link.classList.contains('mobile-menu-icon')) return;
          const href = link.getAttribute('href');
          const text = (link.textContent || '').trim();
          if (!href || !text) return;
          html += '<li><a href="' + href + '" style="color:var(--navy); font-weight:600; text-decoration:none;">' +
                  '<i class="fas fa-chevron-right" style="font-size:10px; margin-right:8px; color:var(--gold);"></i>' +
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
  // Shows after 500px of scroll. Smooth-scrolls back to top.
  // Uses addEventListener so it doesn't clobber other scroll handlers.
  // ============================================================
  function initBackToTop() {
    window.addEventListener('scroll', function () {
      const btn = $('backToTop');
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
  // Functions called from inline HTML (onclick="...") need to be
  // attached to window. If you add a new function the HTML calls,
  // add it here too.
  // ============================================================
  window.toggleMobileMenu = toggleMobileMenu;

  // Forms / lead magnets
  window.handleAuditRequest      = handleAuditRequest;
  window.handleChecklistDownload = handleChecklistDownload;
  window.minimizePopup           = minimizePopup;
  window.restorePopup            = restorePopup;
  window.submitLead              = submitLead;
  window.showRebateModal         = showRebateModal;
  window.minimizeRebateModal     = minimizeRebateModal;
  window.downloadChecklist       = downloadChecklist;

  // Accordions / tabs
  window.toggleFAQ = toggleFAQ;
  window.togglePAS = togglePAS;
  window.switchTab = switchTab;

  // ANCHOR calculator
  window.selectChoice   = selectChoice;
  window.nextStep       = nextStep;
  window.prevStep       = prevStep;
  window.submitCalcLead = submitCalcLead;
  window.resetCalc      = resetCalc;

  // Other calculators
  window.calcMortgage = calcMortgage;
  window.calcStayNJ   = calcStayNJ;
  window.calcRatio    = calcRatio;   // FIX: was missing

  // Appeal quiz
  window.quizSelect  = quizSelect;
  window.quizNext    = quizNext;
  window.quizPrev    = quizPrev;
  window.submitQuiz  = submitQuiz;

  // Towns / utility
  window.filterTowns = filterTowns;
  window.scrollToTop = scrollToTop;

  // Property dashboard
  window.addPropertyToWatchlist = addPropertyToWatchlist; // FIX: was missing

/* --- PROPERTY DASHBOARD LOGIC --- */
const APIFY_TOKEN = 'apify_api_XdhChKEbRUhZwIHCVGaGkZvZ8AidZO4znzWg';
const ACTOR_ID = 'maxcopell/zillow-scraper';

// Load saved properties on page refresh
document.addEventListener("DOMContentLoaded", () => {
    const savedProperties = JSON.parse(localStorage.getItem('watchdogList')) || [];
    const list = document.getElementById('watchlist-items');
    if (!list) return;
    savedProperties.forEach(prop => {
        renderPropertyCard(prop);
    });
});

async function addPropertyToWatchlist() {
    const addr = document.getElementById('prop-input').value;
    if(!addr) return;

    const list = document.getElementById('watchlist-items');
    const tempId = 'id-' + Date.now();
    const loadingItem = `
        <div class="watch-item" id="${tempId}">
            <div class="watch-info">
                <span class="watch-addr">${addr}</span>
                <span class="watch-meta"><i class="fas fa-spinner fa-spin"></i> Fetching Live Data...</span>
            </div>
        </div>`;
    list.insertAdjacentHTML('afterbegin', loadingItem);
    
    document.getElementById('prop-input').value = "";
    document.getElementById('add-prop-form').style.display = 'none';

    try {
        const runRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "searchQuery": addr, "maxResults": 1 })
        });
        const runData = await runRes.json();
        const runId = runData.data.id;
        pollApifyResult(runId, tempId, addr);
    } catch (err) {
        console.error("Fetch Error:", err);
        document.getElementById(tempId).innerHTML = "Connection Error.";
    }
}

async function pollApifyResult(runId, elementId, addr) {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const data = await res.json();

    if (data.data.status === 'SUCCEEDED') {
        const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`);
        const items = await datasetRes.json();

        if (items.length > 0) {
            const p = items[0];
            const cleanProp = {
                id: elementId,
                address: addr,
                price: p.price || p.zestimate || "N/A",
                city: p.address?.city || "NJ",
                trend: (Math.random() * 4).toFixed(1),
                isUp: Math.random() > 0.4
            };
            saveToStorage(cleanProp);
            updatePropertyUI(elementId, cleanProp);
        } else {
            document.getElementById(elementId).innerHTML = "No Zillow data found.";
        }
    } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.data.status)) {
        document.getElementById(elementId).innerHTML = "Search failed.";
    } else {
        setTimeout(() => pollApifyResult(runId, elementId, addr), 3000);
    }
}

function updatePropertyUI(elementId, prop) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = `
        <div class="watch-info">
            <span class="watch-addr">${prop.address}</span>
            <span class="watch-meta">${prop.city}</span>
        </div>
        <div class="watch-stats">
            <div class="watch-price">${typeof prop.price === 'number' ? '$' + prop.price.toLocaleString() : prop.price}</div>
            <div class="watch-trend ${prop.isUp ? 'up' : 'down'}">
                <i class="fas fa-caret-${prop.isUp ? 'up' : 'down'}"></i> ${prop.trend}%
            </div>
        </div>
    `;
}

function renderPropertyCard(prop) {
    const list = document.getElementById('watchlist-items');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'watch-item';
    item.id = prop.id;
    item.innerHTML = `
        <div class="watch-info">
            <span class="watch-addr">${prop.address}</span>
            <span class="watch-meta">${prop.city}</span>
        </div>
        <div class="watch-stats">
            <div class="watch-price">${typeof prop.price === 'number' ? '$' + prop.price.toLocaleString() : prop.price}</div>
            <div class="watch-trend ${prop.isUp ? 'up' : 'down'}">
                <i class="fas fa-caret-${prop.isUp ? 'up' : 'down'}"></i> ${prop.trend}%
            </div>
        </div>
    `;
    list.appendChild(item);
}

function saveToStorage(prop) {
    let current = JSON.parse(localStorage.getItem('watchdogList')) || [];
    current.push(prop);
    localStorage.setItem('watchdogList', JSON.stringify(current));
}

})();
