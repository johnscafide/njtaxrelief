/* ============================================================

   NJPropertyTaxRelief.com — Main JavaScript

   Fixed: EmailJS v4 init syntax

   Fixed: Accordion uses .open class to match CSS

   Fixed: All missing functions restored

   ============================================================ */



/* ============================================================

   EMAILJS — v4 requires object syntax, not a bare string

   ============================================================ */

(function () {

  emailjs.init({ publicKey: 'u262kw5AoJcBI342V' });

})();



function handleAuditRequest() {

    const address = document.getElementById('audit-address').value.trim();

    const name = document.getElementById('audit-name').value.trim();

    const email = document.getElementById('audit-email').value.trim();



    if (!address || !email) {

        alert("Please provide the property address and your email.");

        return;

    }



    // Send to EmailJS

    emailjs.send('service_gptqbyx', 'template_q1kaure', {

        name: name,

        email: email,

        topic: 'Tax-Optimized Listing Audit Request',

        town: address

    }).then(() => {

        alert("Success! John or Heather will begin your audit and reach out within 24 hours.");

        document.getElementById('audit-address').value = "";

        document.getElementById('audit-name').value = "";

        document.getElementById('audit-email').value = "";

    });

}



// Show popup after 4 seconds

document.addEventListener('DOMContentLoaded', function() {

    setTimeout(function() {

        if (!sessionStorage.getItem('checklistClosed')) {

            document.getElementById('rebate-popup').style.display = 'block';

        } else {

            document.getElementById('popup-minimized').style.display = 'block';

        }

    }, 4000);

});



function minimizePopup() {

    document.getElementById('rebate-popup').style.display = 'none';

    document.getElementById('popup-minimized').style.display = 'block';

    sessionStorage.setItem('checklistClosed', 'true');

}



function restorePopup() {

    document.getElementById('rebate-popup').style.display = 'block';

    document.getElementById('popup-minimized').style.display = 'none';

}



function handleChecklistDownload() {

    const email = document.getElementById('popup-email').value.trim();

    if (!email) {

        alert("Please enter your email to receive the checklist.");

        return;

    }



    // Send to your EmailJS (Keep your existing service IDs)

    emailjs.send('service_gptqbyx', 'template_q1kaure', {

        email: email,

        topic: 'Checklist Download Request',

        name: 'New Lead'

    });



    // Trigger Download

    window.open('NJ_Tax_Relief_Checklist.pdf', '_blank');

    

    // Auto-minimize after download

    minimizePopup();

}

/* --- BULLETPROOF FOOTER LOADER --- */
function injectFooter() {
    const footerPlaceholder = document.getElementById('main-footer');
    
    if (footerPlaceholder) {
        // We use a timestamp to bypass browser cache: footer.html?v=123
        fetch('footer.html?v=' + new Date().getTime())
            .then(response => {
                if (!response.ok) throw new Error('Footer file not found');
                return response.text();
            })
            .then(data => {
                footerPlaceholder.innerHTML = data;
                console.log('Footer injected successfully.');
            })
            .catch(err => {
                console.error('Footer Fetch Error:', err);
            });
    } else {
        // If the element isn't found yet, try again in 100ms
        setTimeout(injectFooter, 100);
    }
}

// Start the injection process
injectFooter();

// Back to Top Logic
window.onscroll = function() { scrollFunction() };

function scrollFunction() {
  const btn = document.getElementById("backToTop");
  if (btn) {
    if (document.body.scrollTop > 500 || document.documentElement.scrollTop > 500) {
      btn.style.display = "block";
    } else {
      btn.style.display = "none";
    }
  }
}

function scrollToTop() {
  window.scrollTo({top: 0, behavior: 'smooth'});
}

/* ============================================================

   CONTACT FORM SUBMISSION

   ============================================================ */

function submitLead() {

  var nameEl  = document.getElementById('cf-name');

  var emailEl = document.getElementById('cf-email');

  var phoneEl = document.getElementById('cf-phone');

  var topicEl = document.getElementById('cf-topic');

  var townEl  = document.getElementById('cf-town');



  if (!nameEl || !emailEl) return;



  var name  = nameEl.value.trim();

  var email = emailEl.value.trim();



  if (!name)  { nameEl.focus();  alert('Please enter your name.');  return; }

  if (!email) { emailEl.focus(); alert('Please enter your email.'); return; }



  var btn = document.querySelector('#contact-form .submit-btn');

  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }



  emailjs.send('service_gptqbyx', 'template_q1kaure', {

    name:  name,

    email: email,

    phone: phoneEl ? phoneEl.value.trim() : 'Not provided',

    topic: topicEl ? topicEl.value        : 'Website inquiry',

    town:  townEl  ? townEl.value.trim()  : 'Not provided'

  })

  .then(function () {

    var form    = document.getElementById('contact-form');

    var success = document.getElementById('form-success');

    if (form)    form.style.display    = 'none';

    if (success) success.style.display = 'block';

  })

  .catch(function (err) {

    if (btn) { btn.textContent = 'Request Free Consultation \u2192'; btn.disabled = false; }

    alert('Submission failed. Please try again or call us directly.');

    console.error('EmailJS Error:', err);

  });

}

function toggleFAQ(el) {
    const item = el.parentElement;
    const isOpen = item.classList.contains('open');
    // Close all other FAQs first
    document.querySelectorAll('.faq-item').forEach(f => f.classList.remove('open'));
    // If it wasn't open, open it
    if (!isOpen) {
        item.classList.add('open');
    }
}


/* ============================================================

   MOBILE MENU

   ============================================================ */

// 1. LOAD NAV AUTOMATICALLY

document.addEventListener("DOMContentLoaded", function() {

    const navElement = document.getElementById('main-nav');

    if (navElement) {

        fetch('nav.html')

            .then(response => response.text())

            .then(data => {

                navElement.innerHTML = data;

                // Re-initialize mobile menu listener after loading

                initNavLogic();

            });

    }

});



function initNavLogic() {

    // Re-link mobile toggle

    window.toggleMobileMenu = function() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) {
        navLinks.classList.toggle('active');
        
        // Prevent background scrolling when menu is open
        if (navLinks.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
    }
};



    // Toggle Mega Menu on Mobile (Click instead of Hover)

    const megaTrigger = document.querySelector('.mega-trigger');

    if (window.innerWidth <= 992 && megaTrigger) {

        megaTrigger.addEventListener('click', function() {

            const content = this.nextElementSibling;

            content.style.display = content.style.display === 'block' ? 'none' : 'block';

        });

    }

}



/* ============================================================

   NEWS STRIP AUTO-ROTATION

   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  var newsItems = document.querySelectorAll('.news-item');

  var currentIndex = 0;



  if (newsItems.length > 1) {

    newsItems.forEach(function (item, index) {

      if (index !== 0) item.style.display = 'none';

    });



    setInterval(function () {

      newsItems[currentIndex].style.opacity = '0';



      setTimeout(function () {

        newsItems[currentIndex].style.display = 'none';

        currentIndex = (currentIndex + 1) % newsItems.length;

        newsItems[currentIndex].style.display = 'flex';

        newsItems[currentIndex].style.opacity = '0';

        newsItems[currentIndex].offsetHeight; // force reflow

        newsItems[currentIndex].style.transition = 'opacity 0.5s ease';

        newsItems[currentIndex].style.opacity = '1';

      }, 500);

    }, 4000);

  }

});



/* ============================================================

   PAS-1 ACCORDION

   FIX: was adding .active — CSS expects .open on trigger AND body

   ============================================================ */

function togglePAS(trigger) {

  var item   = trigger.parentElement;

  var body   = item.querySelector('.pas-acc-body');

  var isOpen = trigger.classList.contains('open');



  // Close all

  document.querySelectorAll('.pas-acc-trigger').forEach(function (t) {

    t.classList.remove('open');

  });

  document.querySelectorAll('.pas-acc-body').forEach(function (b) {

    b.classList.remove('open');

  });



  // Open this one if it wasn't already open

  if (!isOpen && body) {

    trigger.classList.add('open');

    body.classList.add('open');

  }

}



/* ============================================================

   FAQ ACCORDION

   FIX: was adding .active — CSS expects .open on .faq-item

   ============================================================ */

function toggleFAQ(el) {

  var item   = el.parentElement;

  var isOpen = item.classList.contains('open');



  document.querySelectorAll('.faq-item').forEach(function (f) {

    f.classList.remove('open');

  });



  if (!isOpen) item.classList.add('open');

}



/* ============================================================

   ANCHOR TAB SWITCHER

   ============================================================ */

function switchTab(name, event) {

  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });

  document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });

  if (event && event.currentTarget) event.currentTarget.classList.add('active');

  var panel = document.getElementById('tab-' + name);

  if (panel) panel.classList.add('active');

}



/* ============================================================

   ANCHOR ELIGIBILITY CALCULATOR

   ============================================================ */

var answers = {};

var currentStep = 1;



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

  var nameEl  = document.getElementById('lead-name');

  var emailEl = document.getElementById('lead-email');

  var phoneEl = document.getElementById('lead-phone');



  var name  = nameEl  ? nameEl.value.trim()  : '';

  var email = emailEl ? emailEl.value.trim() : '';

  var phone = phoneEl ? phoneEl.value.trim() : '';



  if (name && email) {

    var benefit = answers.tenure === 'own'

      ? (answers.income === 'low' ? '$1,500' : '$1,000')

      : (answers.age === 'yes'   ? '$700'   : '$450');



    emailjs.send('service_gptqbyx', 'template_q1kaure', {

      name:  name,

      email: email,

      phone: phone || 'Not provided',

      topic: 'ANCHOR Calculator \u2014 estimated benefit: ' + benefit,

      town:  'Not provided'

    }).catch(function (e) { console.warn('EmailJS calc lead:', e); });

  }



  showResult();

}



function showResult() {

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

      '<div class="result-actions">' +

      '<a href="https://anchor.nj.gov" target="_blank" class="btn-primary" style="text-decoration:none;">Apply Now</a>' +

      '<button onclick="resetCalc()" style="background:none;border:1.5px solid var(--navy);' +

      'border-radius:6px;padding:10px 20px;cursor:pointer;font-size:14px;' +

      'color:var(--navy);font-weight:600;">Start Over</button>' +

      '</div></div>';

  }



  var rc = document.getElementById('result-content');

  if (rc) rc.innerHTML = result;



  document.getElementById('step7').classList.add('active');

  document.querySelectorAll('.calc-step:not(#step7)').forEach(function (s) {

    s.classList.remove('active');

  });



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

  document.querySelectorAll('.btn-next').forEach(function (b) {

    b.disabled = true;

  });

  document.querySelectorAll('.calc-step').forEach(function (s) {

    s.classList.remove('active');

  });

  var s1 = document.getElementById('step1');

  if (s1) s1.classList.add('active');

  var bar = document.getElementById('progress');

  if (bar) bar.style.width = '16%';

}

/* --- MORTGAGE CALCULATOR LOGIC --- */
function calcMortgage() {
    // 1. Get Elements safely
    const priceEl = document.getElementById('m-price');
    const downEl = document.getElementById('m-down');
    const rateEl = document.getElementById('m-rate');
    const termEl = document.getElementById('m-term');
    
    // 2. Output Elements
    const monthlyDisplay = document.getElementById('m-monthly');
    const principalDisplay = document.getElementById('m-principal');
    const interestDisplay = document.getElementById('m-interest');
    const totalDisplay = document.getElementById('m-total');
    
    const emptyState = document.getElementById('mort-empty-state');
    const resultBox = document.getElementById('mort-top-result');
    const breakdown = document.getElementById('mort-breakdown');

    // 3. Validation
    if (!priceEl || !rateEl || !monthlyDisplay) {
        console.error("Mortgage elements missing from page.");
        return;
    }

    const price = parseFloat(priceEl.value) || 0;
    const downPct = parseFloat(downEl.value) || 0;
    const rate = parseFloat(rateEl.value) || 0;
    const term = parseInt(termEl.value) || 30;

    if (price <= 0 || rate <= 0) {
        alert("Please enter a valid home price and interest rate.");
        return;
    }

    // 4. Calculations
    const principal = price * (1 - (downPct / 100));
    const monthlyRate = (rate / 100) / 12;
    const numberOfPayments = term * 12;

    const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
    
    const totalPaid = monthlyPayment * numberOfPayments;
    const totalInterest = totalPaid - principal;

    // 5. Update UI
    monthlyDisplay.innerText = '$' + Math.round(monthlyPayment).toLocaleString();
    if (principalDisplay) principalDisplay.innerText = '$' + Math.round(principal).toLocaleString();
    if (interestDisplay) interestDisplay.innerText = '$' + Math.round(totalInterest).toLocaleString();
    if (totalDisplay) totalDisplay.innerText = '$' + Math.round(totalPaid).toLocaleString();

    // 6. Toggle Visibility
    if (emptyState) emptyState.style.display = 'none';
    if (resultBox) resultBox.style.display = 'block';
    if (breakdown) breakdown.style.display = 'block';
}




/* ============================================================

   STAY NJ CALCULATOR

   ============================================================ */

function calcStayNJ() {

  var taxEl    = document.getElementById('staynj-tax');

  var incomeEl = document.getElementById('staynj-income');

  var res      = document.getElementById('staynj-result');

  var amtEl    = document.getElementById('staynj-amount');

  var lblEl    = document.getElementById('staynj-label');

  if (!taxEl || !incomeEl || !res) return;



  var tax    = parseFloat(taxEl.value)    || 0;

  var income = parseFloat(incomeEl.value) || 0;



  if (!tax || !income) { res.style.display = 'none'; return; }



  if (income > 500000) {

    amtEl.textContent = 'Ineligible';

    lblEl.textContent = 'Income exceeds $500,000 limit';

  } else {

    amtEl.textContent = '$' + Math.round(Math.min(tax * 0.5, 6500)).toLocaleString();

    lblEl.textContent = 'Estimated Stay NJ Annual Credit (50% of tax bill, max $6,500/yr)';

  }

  res.style.display = 'block';

}

/* --- DYNAMIC SITEMAP GENERATOR --- */
function generateDynamicSitemap() {
    const sitemapContainer = document.getElementById('dynamic-sitemap');
    if (!sitemapContainer) return;

    fetch('nav.html')
        .then(response => response.text())
        .then(navHtml => {
            // Create a temporary element to parse the HTML string
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = navHtml;

            // Get all links from the navigation
            const navLinks = tempDiv.querySelectorAll('a');
            let sitemapHtml = '<div class="prog-card-new"><ul class="sidebar-list" style="columns: 2; column-gap: 40px; line-height: 2.5;">';

            navLinks.forEach(link => {
                // Skip the logo and the mobile toggle
                if (link.classList.contains('nav-logo') || link.classList.contains('mobile-menu-icon')) return;

                const href = link.getAttribute('href');
                const text = link.textContent.trim();
                
                sitemapHtml += `<li><a href="${href}" style="color:var(--navy); font-weight:600; text-decoration:none;"><i class="fas fa-chevron-right" style="font-size:10px; margin-right:8px; color:var(--gold);"></i>${text}</a></li>`;
            });

            sitemapHtml += '</ul></div>';
            sitemapContainer.innerHTML = sitemapHtml;
        })
        .catch(err => {
            console.error('Sitemap Sync Error:', err);
            sitemapContainer.innerHTML = '<p>Error syncing sitemap. Please try again later.</p>';
        });
}

// Run only if we are on the sitemap page
if (document.getElementById('dynamic-sitemap')) {
    generateDynamicSitemap();
}





/* ============================================================

   REBATE MODAL (Checklist Lead Magnet)

   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  if (!sessionStorage.getItem('rebateModalSeen')) {

    setTimeout(function () {

      showRebateModal();

      sessionStorage.setItem('rebateModalSeen', 'true');

    }, 3000);

  } else {

    var link = document.getElementById('sticky-rebate-link');

    if (link) link.style.display = 'inline-flex';

  }

});



function showRebateModal() {

  var modal = document.getElementById('rebate-modal');

  var link  = document.getElementById('sticky-rebate-link');

  if (modal) modal.style.display = 'flex';

  if (link)  link.style.display  = 'none';

}



function minimizeRebateModal() {

  var modal = document.getElementById('rebate-modal');

  var link  = document.getElementById('sticky-rebate-link');

  if (modal) modal.style.display = 'none';

  if (link)  link.style.display  = 'inline-flex';

}



function downloadChecklist() {

  var emailEl = document.getElementById('modal-email');

  var email   = emailEl ? emailEl.value.trim() : '';

  if (!email) { alert('Please enter your email to receive the checklist.'); return; }



  emailjs.send('service_gptqbyx', 'template_q1kaure', {

    name:  'Checklist Download',

    email: email,

    phone: 'Not provided',

    topic: 'Checklist Download Lead',

    town:  'Not provided'

  }).catch(function (e) { console.warn('Checklist lead error:', e); });



  window.open('NJ_Tax_Relief_Checklist.pdf', '_blank');

  minimizeRebateModal();

}
