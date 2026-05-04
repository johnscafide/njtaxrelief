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
 *   6.  Mobile Menu
 *   7.  News Strip Rotation
 *   8.  Popups & Lead Magnets
 *   9.  Forms (Contact, Audit)
 *   10. Accordions (PAS-1, FAQ)
 *   11. Tab Switcher
 *   12. ANCHOR Eligibility Calculator
 *   13. Stay NJ Calculator
 *   14. Mortgage Calculator
 *   15. Appeal Quiz
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
  // 6. MOBILE MENU
  // Hooks up after nav.html loads. Includes proper iOS scroll lock.
  // Re-binds the mega menu click handler on resize.
  // ============================================================
  function initNavLogic() {
    bindMegaMenu();
    window.addEventListener('resize', bindMegaMenu);
  }

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

  function toggleMobileMenu() {
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
  // 6-step quiz with branching logic. State lives in `answers`.
  // Result HTML is built in showResult(); rejections go through noQualify().
  // ============================================================
  
 
// Update real estate interest checkbox based on own vs rent
function updateREInterest(tenure) {
  var textEl = document.getElementById('re-interest-text');
  var subEl  = document.getElementById('re-interest-sub');
  var cb     = document.getElementById('re-interest');
  if (!textEl || !subEl) return;
  if (cb) cb.checked = false;
  if (tenure === 'own') {
    textEl.textContent = "I\u2019m curious what my home is worth right now.";
    subEl.textContent  = "Check this and a local South Jersey agent will reach out with a free, no-obligation home value estimate.";
  } else {
    textEl.textContent = "I\u2019m interested in buying a home \u2014 I\u2019m tired of renting.";
    subEl.textContent  = "Check this and a local South Jersey agent will reach out to walk you through the buying process at no cost.";
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
  var nb = document.getElementById('next' + currentStep);
  if (nb) nb.disabled = false;
  if (key === 'tenure') {
    var mid = document.getElementById('income-mid-btn');
    if (mid) mid.style.opacity = (val === 'rent') ? '0.4' : '1';
    updateREInterest(val);
  }
}
 
function nextStep(step) {
  var n = step + 1;
  if (step === 3 && answers.tenure === 'own') n = 5;
  if (step === 4 && answers.tenure === 'rent') n = 6;
  if (step === 5) n = 6;
  document.getElementById('step' + step).classList.remove('active');
  currentStep = n;
  var nextEl = document.getElementById('step' + n);
  if (nextEl) nextEl.classList.add('active');
  var bar = document.getElementById('progress');
  if (bar) bar.style.width = Math.min(100, Math.round((n / 6) * 100)) + '%';
}
 
function prevStep(step) {
  var p = step - 1;
  if (step === 5 && answers.tenure === 'own') p = 3;
  if (step === 6 && answers.tenure === 'rent') p = 4;
  document.getElementById('step' + step).classList.remove('active');
  currentStep = p;
  var prevEl = document.getElementById('step' + p);
  if (prevEl) prevEl.classList.add('active');
  var bar = document.getElementById('progress');
  if (bar) bar.style.width = Math.round((p / 6) * 100) + '%';
}
 
function submitCalcLead() {
  var nameEl     = document.getElementById('lead-name');
  var emailEl    = document.getElementById('lead-email');
  var phoneEl    = document.getElementById('lead-phone');
  var reInterest = document.getElementById('re-interest');
 
  var name  = nameEl  ? nameEl.value.trim()  : '';
  var email = emailEl ? emailEl.value.trim() : '';
  var phone = phoneEl ? phoneEl.value.trim() : '';
  var reYes = reInterest ? reInterest.checked : false;
 
  var benefit = answers.tenure === 'own'
    ? (answers.income === 'low' ? '$1,500' : '$1,000')
    : (answers.age === 'yes'   ? '$700'   : '$450');
 
  var reLine = '';
  if (reYes) {
    reLine = answers.tenure === 'own'
      ? ' | \u2605 WANTS HOME VALUE ESTIMATE (interested in selling)'
      : ' | \u2605 INTERESTED IN BUYING (tired of renting)';
  }
 
  if (name && email) {
    emailjs.send('service_gptqbyx', 'template_q1kaure', {
      name:  name,
      email: email,
      phone: phone || 'Not provided',
      topic: 'ANCHOR Calculator \u2014 est. benefit: ' + benefit + reLine,
      town:  'Not provided'
    }).catch(function (e) { console.warn('EmailJS calc lead:', e); });
  }
 
  showResult(reYes);
}
 
function showResult(reYes) {
  var result = '';
 
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
    var amount = answers.tenure === 'own'
      ? (answers.income === 'low' ? '$1,500' : '$1,000')
      : (answers.age === 'yes'   ? '$700'   : '$450');
    var label = answers.tenure === 'own'
      ? 'Estimated ANCHOR Homeowner Benefit'
      : 'Estimated ANCHOR Renter Benefit';
    var seniorNote = (answers.tenure === 'own' && answers.age === 'yes')
      ? '<li>As a senior, apply using the PAS-1 form at propertytaxrelief.nj.gov</li>' : '';
 
    // Real estate follow-up — only if they checked the box
    var reBlock = '';
    if (reYes) {
      var reTitle = answers.tenure === 'own'
        ? 'We\u2019ll reach out with your free home value estimate'
        : 'We\u2019ll reach out to talk through the buying process';
      var reBody = answers.tenure === 'own'
        ? 'John or Heather Scafide will follow up with real comparable sales from your neighborhood so you know exactly what your home is worth today \u2014 no obligation, no pressure.'
        : 'John or Heather Scafide will follow up to walk you through buying in South Jersey \u2014 from what you can afford to which neighborhoods fit your budget. No cost, no pressure.';
      reBlock =
        '<div style="margin-top:16px;background:var(--info-bg);border:1px solid #c0d0e8;' +
        'border-radius:8px;padding:14px 16px;text-align:left;">' +
        '<div style="font-weight:700;font-size:14px;color:var(--navy-dark);margin-bottom:5px;">' +
        '<i class="fas fa-star" style="color:var(--gold);margin-right:6px;"></i>' + reTitle + '</div>' +
        '<p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:0;">' + reBody + '</p>' +
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
 
  var rc = document.getElementById('result-content');
  if (rc) rc.innerHTML = result;
  document.getElementById('step7').classList.add('active');
  document.querySelectorAll('.calc-step:not(#step7)').forEach(function (s) { s.classList.remove('active'); });
  var bar = document.getElementById('progress');
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
  answers = {};
  currentStep = 1;
  document.querySelectorAll('.choice-btn').forEach(function (b) {
    b.classList.remove('selected');
    b.classList.remove('active-choice');
  });
  document.querySelectorAll('.btn-next').forEach(function (b) { b.disabled = true; });
  document.querySelectorAll('.calc-step').forEach(function (s) { s.classList.remove('active'); });
  var s1 = document.getElementById('step1');
  if (s1) s1.classList.add('active');
  var bar = document.getElementById('progress');
  if (bar) bar.style.width = '16%';
  var cb = document.getElementById('re-interest');
  if (cb) cb.checked = false;
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
  // FIXED: Now strips commas/$ from inputs so "$350,000" works.
  // Stays silent (no error popups) until both price and rate are entered.
  // ============================================================
  function calcMortgage() {
    const priceEl = $('m-price');
    const downEl = $('m-down');
    const rateEl = $('m-rate');
    const termEl = $('m-term');

    const price = parseNum(priceEl ? priceEl.value : 0);
    const downPct = parseNum(downEl ? downEl.value : 0);
    const rate = parseNum(rateEl ? rateEl.value : 0);
    const term = parseInt(termEl ? termEl.value : 30, 10) || 30;

    const monthlyDisplay = $('m-monthly');
    const principalDisplay = $('m-principal');
    const interestDisplay = $('m-interest');
    const totalDisplay = $('m-total');
    const emptyState = $('mort-empty-state');
    const resultBox = $('mort-top-result');
    const breakdown = $('mort-breakdown');

    if (price > 0 && rate > 0) {
      const principal = price * (1 - (downPct / 100));
      const monthlyRate = (rate / 100) / 12;
      const numPayments = term * 12;
      const monthly = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                      (Math.pow(1 + monthlyRate, numPayments) - 1);
      const totalPaid = monthly * numPayments;
      const totalInterest = totalPaid - principal;

      if (monthlyDisplay) monthlyDisplay.innerText = '$' + Math.round(monthly).toLocaleString();
      if (principalDisplay) principalDisplay.innerText = '$' + Math.round(principal).toLocaleString();
      if (interestDisplay) interestDisplay.innerText = '$' + Math.round(totalInterest).toLocaleString();
      if (totalDisplay) totalDisplay.innerText = '$' + Math.round(totalPaid).toLocaleString();

      if (emptyState) emptyState.style.display = 'none';
      if (resultBox) resultBox.style.display = 'block';
      if (breakdown) breakdown.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'block';
      if (resultBox) resultBox.style.display = 'none';
      if (breakdown) breakdown.style.display = 'none';
    }
  }

  // ============================================================
  // 15. APPEAL QUIZ
  // 4 yes/no questions to score appeal probability.
  // FIXED: Was only console.logging the lead. Now actually
  // sends through EmailJS so leads stop getting lost.
  // ============================================================
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
    const addrEl = $('quiz-addr');
    const emailEl = $('quiz-email');
    const addr = addrEl ? addrEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';

    if (!addr || !email) {
      alert('Please provide an address and email to receive your report.');
      return;
    }

    let score = 0;
    if (quizData.sales === 'yes') score += 40;
    if (quizData.reval === 'yes') score += 30;
    if (quizData.errors === 'yes') score += 20;
    if (quizData.recent === 'no') score += 10;

    const rating = score > 60 ? 'HIGH' : score > 30 ? 'MODERATE' : 'LOW';
    const color = score > 60 ? 'var(--green)' : 'var(--gold)';

    const step5 = $('q-step5');
    if (step5) step5.classList.remove('active');
    const finalDiv = $('q-result');
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

    // Actually send the lead now (was missing in original).
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
  window.handleAuditRequest = handleAuditRequest;
  window.handleChecklistDownload = handleChecklistDownload;
  window.minimizePopup = minimizePopup;
  window.restorePopup = restorePopup;
  window.submitLead = submitLead;
  window.showRebateModal = showRebateModal;
  window.minimizeRebateModal = minimizeRebateModal;
  window.downloadChecklist = downloadChecklist;

  // Accordions / tabs
  window.toggleFAQ = toggleFAQ;
  window.togglePAS = togglePAS;
  window.switchTab = switchTab;

  // ANCHOR calculator
  window.selectChoice = selectChoice;
  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.submitCalcLead = submitCalcLead;
  window.resetCalc = resetCalc;

  // Other calculators
  window.calcMortgage = calcMortgage;
  window.calcStayNJ = calcStayNJ;

  // Appeal quiz
  window.quizSelect = quizSelect;
  window.quizNext = quizNext;
  window.quizPrev = quizPrev;
  window.submitQuiz = submitQuiz;

  // Towns / utility
  window.filterTowns = filterTowns;
  window.scrollToTop = scrollToTop;

/* --- PROPERTY DASHBOARD LOGIC --- */
const APIFY_TOKEN = 'apify_api_XdhChKEbRUhZwIHCVGaGkZvZ8AidZO4znzWg';
const ACTOR_ID = 'maxcopell/zillow-scraper';

// 1. LOAD SAVED PROPERTIES ON PAGE REFRESH
document.addEventListener("DOMContentLoaded", () => {
    const savedProperties = JSON.parse(localStorage.getItem('watchdogList')) || [];
    const list = document.getElementById('watchlist-items');
    
    // Clear the "Demo" hardcoded items if you want a clean slate
    // list.innerHTML = ''; 

    savedProperties.forEach(prop => {
        renderPropertyCard(prop);
    });
});

async function addPropertyToWatchlist() {
    const addr = document.getElementById('prop-input').value;
    if(!addr) return;

    // UI: Add loading state
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
    
    // Close form and clear input
    document.getElementById('prop-input').value = "";
    document.getElementById('add-prop-form').style.display = 'none';

    try {
        // TRIGGER APIFY
        const runRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "searchQuery": addr, "maxResults": 1 })
        });
        const runData = await runRes.json();
        const runId = runData.data.id;

        // Start polling for the result
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
        // Get the data from the dataset
        const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`);
        const items = await datasetRes.json();

        if (items.length > 0) {
            const p = items[0];
            const cleanProp = {
                id: elementId,
                address: addr,
                price: p.price || p.zestimate || "N/A",
                city: p.address?.city || "NJ",
                trend: (Math.random() * 4).toFixed(1), // Demo trend
                isUp: Math.random() > 0.4
            };

            // Save to LocalStorage and Update UI
            saveToStorage(cleanProp);
            updatePropertyUI(elementId, cleanProp);
        } else {
            document.getElementById(elementId).innerHTML = "No Zillow data found.";
        }
    } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.data.status)) {
        document.getElementById(elementId).innerHTML = "Search failed.";
    } else {
        // Still running, check again in 3 seconds
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
