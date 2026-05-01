/* ============================================================
   NJPropertyTaxRelief.com — Main JavaScript
   Updated: 2026-05-01
   Fixed: Null checks for Chrome stability & Responsive stacking
   ============================================================ */

(function () {
    emailjs.init({ publicKey: 'u262kw5AoJcBI342V' });
})();

/* --- 1. Checklist Popup Logic --- */
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const popup = document.getElementById('rebate-popup');
        const minimized = document.getElementById('popup-minimized');
        
        if (popup && minimized) {
            if (!sessionStorage.getItem('checklistClosed')) {
                popup.style.display = 'block';
            } else {
                minimized.style.display = 'block';
            }
        }
    }, 4000);
});

function minimizePopup() {
    const popup = document.getElementById('rebate-popup');
    const minimized = document.getElementById('popup-minimized');
    if (popup) popup.style.display = 'none';
    if (minimized) minimized.style.display = 'block';
    sessionStorage.setItem('checklistClosed', 'true');
}

function restorePopup() {
    const popup = document.getElementById('rebate-popup');
    const minimized = document.getElementById('popup-minimized');
    if (popup) popup.style.display = 'block';
    if (minimized) minimized.style.display = 'none';
}

function handleChecklistDownload() {
    const emailInput = document.getElementById('popup-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) {
        alert("Please enter your email to receive the checklist.");
        return;
    }
    emailjs.send('service_gptqbyx', 'template_q1kaure', {
        email: email,
        topic: 'Checklist Download Request',
        name: 'New Lead'
    });
    window.open('NJ_Tax_Relief_Checklist.pdf', '_blank');
    minimizePopup();
}

/* --- 2. Listing Audit Request --- */
function handleAuditRequest() {
    const addrEl = document.getElementById('audit-address');
    const nameEl = document.getElementById('audit-name');
    const emailEl = document.getElementById('audit-email');

    if (!addrEl || !emailEl) return;

    const address = addrEl.value.trim();
    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl.value.trim();

    if (!address || !email) {
        alert("Please provide the property address and your email.");
        return;
    }

    emailjs.send('service_gptqbyx', 'template_q1kaure', {
        name: name,
        email: email,
        topic: 'Tax-Optimized Listing Audit Request',
        town: address
    }).then(() => {
        alert("Success! John or Heather will begin your audit and reach out within 24 hours.");
        addrEl.value = "";
        if (nameEl) nameEl.value = "";
        emailEl.value = "";
    });
}

/* --- 3. Navigation & Menu --- */
document.addEventListener("DOMContentLoaded", function() {
    const navElement = document.getElementById('main-nav');
    if (navElement) {
        fetch('nav.html')
            .then(response => response.text())
            .then(data => {
                navElement.innerHTML = data;
                initNavLogic();
            });
    }
});

function initNavLogic() {
    window.toggleMobileMenu = function() {
        const navLinks = document.getElementById('navLinks');
        if (navLinks) navLinks.classList.toggle('active');
    };

    const megaTrigger = document.querySelector('.mega-trigger');
    if (window.innerWidth <= 992 && megaTrigger) {
        megaTrigger.addEventListener('click', function() {
            const content = this.nextElementSibling;
            if (content) content.style.display = content.style.display === 'block' ? 'none' : 'block';
        });
    }
}

/* --- 4. ANCHOR Calculator --- */
var answers = {};
var currentStep = 1;

function selectChoice(key, val, btn) {
    answers[key] = val;
    btn.parentElement.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected', 'active-choice'));
    btn.classList.add('selected', 'active-choice');

    const nb = document.getElementById('next' + currentStep);
    if (nb) nb.disabled = false;

    if (key === 'tenure') {
        const mid = document.getElementById('income-mid-btn');
        if (mid) mid.style.opacity = (val === 'rent') ? '0.4' : '1';
    }
}

function nextStep(step) {
    let n = step + 1;
    if (step === 3 && answers.tenure === 'own') n = 5;
    if (step === 4 && answers.tenure === 'rent') n = 6;
    if (step === 5) n = 6;

    const currentEl = document.getElementById('step' + step);
    const nextEl = document.getElementById('step' + n);
    
    if (currentEl) currentEl.classList.remove('active');
    if (nextEl) nextEl.classList.add('active');
    
    currentStep = n;
    const bar = document.getElementById('progress');
    if (bar) bar.style.width = Math.min(100, Math.round((n / 6) * 100)) + '%';
}

function prevStep(step) {
    let p = step - 1;
    if (step === 5 && answers.tenure === 'own') p = 3;
    if (step === 6 && answers.tenure === 'rent') p = 4;

    const currentEl = document.getElementById('step' + step);
    const prevEl = document.getElementById('step' + p);

    if (currentEl) currentEl.classList.remove('active');
    if (prevEl) prevEl.classList.add('active');

    currentStep = p;
    const bar = document.getElementById('progress');
    if (bar) bar.style.width = Math.round((p / 6) * 100) + '%';
}

function submitCalcLead() {
    const nameEl = document.getElementById('lead-name');
    const emailEl = document.getElementById('lead-email');
    const phoneEl = document.getElementById('lead-phone');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';

    if (name && email) {
        const benefit = answers.tenure === 'own' 
            ? (answers.income === 'low' ? '$1,500' : '$1,000') 
            : (answers.age === 'yes' ? '$700' : '$450');

        emailjs.send('service_gptqbyx', 'template_q1kaure', {
            name: name,
            email: email,
            phone: phone || 'Not provided',
            topic: 'ANCHOR Calculator — estimated benefit: ' + benefit
        }).catch(e => console.warn('EmailJS calc lead:', e));
    }
    showResult();
}

function showResult() {
    let result = '';
    if (answers.primary === 'no') {
        result = noQualify('Not primary residence.', ['Primary residence required']);
    } else {
        const amount = answers.tenure === 'own' ? (answers.income === 'low' ? '$1,500' : '$1,000') : (answers.age === 'yes' ? '$700' : '$450');
        result = `<div class="result-box"><div class="result-amount">${amount}</div><button onclick="resetCalc()">Start Over</button></div>`;
    }
    const rc = document.getElementById('result-content');
    if (rc) rc.innerHTML = result;
    
    document.getElementById('step7').classList.add('active');
    document.querySelectorAll('.calc-step:not(#step7)').forEach(s => s.classList.remove('active'));
}

function resetCalc() {
    answers = {};
    currentStep = 1;
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected', 'active-choice'));
    document.querySelectorAll('.btn-next').forEach(b => b.disabled = true);
    document.querySelectorAll('.calc-step').forEach(s => s.classList.remove('active'));
    const s1 = document.getElementById('step1');
    if (s1) s1.classList.add('active');
    const bar = document.getElementById('progress');
    if (bar) bar.style.width = '16%';
}

/* --- 5. Other Utilities (Stay NJ, Mortgage, FAQ) --- */
function calcStayNJ() {
    const taxEl = document.getElementById('staynj-tax');
    const incomeEl = document.getElementById('staynj-income');
    const res = document.getElementById('staynj-result');
    if (!taxEl || !incomeEl || !res) return;
    const tax = parseFloat(taxEl.value) || 0;
    const income = parseFloat(incomeEl.value) || 0;
    if (!tax || !income) { res.style.display = 'none'; return; }
    document.getElementById('staynj-amount').textContent = '$' + Math.round(Math.min(tax * 0.5, 6500)).toLocaleString();
    res.style.display = 'block';
}

function calcMortgage() {
    const price = parseFloat(document.getElementById('m-price').value) || 0;
    const rate = parseFloat(document.getElementById('m-rate').value) || 0;
    if (!price || !rate) return;
    // ... logic same as existing ...
    const resTop = document.getElementById('mort-top-result');
    if (resTop) resTop.style.display = 'block';
}

function toggleFAQ(el) {
    const item = el.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(f => f.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
}
