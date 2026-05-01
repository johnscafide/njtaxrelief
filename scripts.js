/* ============================================================
   NJPropertyTaxRelief.com — Main JavaScript (Full Production)
   Includes: EmailJS, Navigation, All Calculators, Lead Magnets
   ============================================================ */

(function () {
    emailjs.init({ publicKey: 'u262kw5AoJcBI342V' });
})();

/* --- 1. GLOBAL UI SAFETY (Null Checks) --- */
const safeGet = (id) => document.getElementById(id);

/* --- 2. CHECKLIST POPUP & MODAL --- */
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const popup = safeGet('rebate-popup');
        const minimized = safeGet('popup-minimized');
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
    const popup = safeGet('rebate-popup');
    const minimized = safeGet('popup-minimized');
    if (popup) popup.style.display = 'none';
    if (minimized) minimized.style.display = 'block';
    sessionStorage.setItem('checklistClosed', 'true');
}

function restorePopup() {
    const popup = safeGet('rebate-popup');
    const minimized = safeGet('popup-minimized');
    if (popup) popup.style.display = 'block';
    if (minimized) minimized.style.display = 'none';
}

function handleChecklistDownload() {
    const emailEl = safeGet('popup-email');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) { alert("Please enter your email to receive the checklist."); return; }

    emailjs.send('service_gptqbyx', 'template_q1kaure', {
        email: email,
        topic: 'Checklist Download Request',
        name: 'Checklist Lead'
    });

    window.open('NJ_Tax_Relief_Checklist.pdf', '_blank');
    minimizePopup();
}

/* --- 3. LISTING AUDIT LEAD MAGNET --- */
function handleAuditRequest() {
    const addrEl = safeGet('audit-address');
    const nameEl = safeGet('audit-name');
    const emailEl = safeGet('audit-email');
    if (!addrEl || !emailEl) return;

    const address = addrEl.value.trim();
    const name = nameEl ? nameEl.value.trim() : 'Valued Homeowner';
    const email = emailEl.value.trim();

    if (!address || !email) { alert("Please provide the property address and email."); return; }

    emailjs.send('service_gptqbyx', 'template_q1kaure', {
        name: name,
        email: email,
        topic: 'Tax-Optimized Listing Audit Request',
        town: address
    }).then(() => {
        alert("Success! John or Heather will begin your audit and reach out within 24 hours.");
        addrEl.value = ""; emailEl.value = ""; if(nameEl) nameEl.value = "";
    });
}

/* --- 4. NAVIGATION & MOBILE MENU --- */
document.addEventListener("DOMContentLoaded", function() {
    const navElement = safeGet('main-nav');
    if (navElement) {
        fetch('nav.html').then(r => r.text()).then(data => {
            navElement.innerHTML = data;
            initNavLogic();
        });
    }
});

function initNavLogic() {
    window.toggleMobileMenu = function() {
        const navLinks = safeGet('navLinks');
        if (navLinks) navLinks.classList.toggle('active');
    };
    const megaTrigger = document.querySelector('.mega-trigger');
    if (window.innerWidth <= 992 && megaTrigger) {
        megaTrigger.onclick = function() {
            const content = this.nextElementSibling;
            if (content) content.style.display = (content.style.display === 'block') ? 'none' : 'block';
        };
    }
}

/* --- 5. ANCHOR CALCULATOR --- */
var answers = {};
var currentStep = 1;

function selectChoice(key, val, btn) {
    answers[key] = val;
    btn.parentElement.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected', 'active-choice'));
    btn.classList.add('selected', 'active-choice');
    const nb = safeGet('next' + currentStep);
    if (nb) nb.disabled = false;
    if (key === 'tenure') {
        const mid = safeGet('income-mid-btn');
        if (mid) mid.style.opacity = (val === 'rent') ? '0.4' : '1';
    }
}

function nextStep(step) {
    let n = step + 1;
    if (step === 3 && answers.tenure === 'own') n = 5;
    if (step === 4 && answers.tenure === 'rent') n = 6;
    if (step === 5) n = 6;

    const cur = safeGet('step' + step);
    const nxt = safeGet('step' + n);
    if (cur) cur.classList.remove('active');
    if (nxt) nxt.classList.add('active');
    currentStep = n;
    const bar = safeGet('progress');
    if (bar) bar.style.width = Math.min(100, Math.round((n / 6) * 100)) + '%';
}

function prevStep(step) {
    let p = step - 1;
    if (step === 5 && answers.tenure === 'own') p = 3;
    if (step === 6 && answers.tenure === 'rent') p = 4;
    const cur = safeGet('step' + step);
    const prv = safeGet('step' + p);
    if (cur) cur.classList.remove('active');
    if (prv) prv.classList.add('active');
    currentStep = p;
    const bar = safeGet('progress');
    if (bar) bar.style.width = Math.round((p / 6) * 100) + '%';
}

function submitCalcLead() {
    const nameEl = safeGet('lead-name');
    const emailEl = safeGet('lead-email');
    if (nameEl && emailEl && nameEl.value && emailEl.value) {
        const benefit = (answers.tenure === 'own') ? (answers.income === 'low' ? '$1,500' : '$1,000') : (answers.age === 'yes' ? '$700' : '$450');
        emailjs.send('service_gptqbyx', 'template_q1kaure', {
            name: nameEl.value, email: emailEl.value, topic: 'ANCHOR Calc: ' + benefit
        });
    }
    showResult();
}

function showResult() {
    const rc = safeGet('result-content');
    if (!rc) return;
    let amount = (answers.tenure === 'own') ? (answers.income === 'low' ? '$1,500' : '$1,000') : (answers.age === 'yes' ? '$700' : '$450');
    rc.innerHTML = `<div class="result-box"><div class="result-amount">${amount}</div><button class="btn-primary" onclick="resetCalc()">Start Over</button></div>`;
    safeGet('step7').classList.add('active');
    document.querySelectorAll('.calc-step:not(#step7)').forEach(s => s.classList.remove('active'));
}

function resetCalc() {
    answers = {}; currentStep = 1;
    document.querySelectorAll('.calc-step').forEach(s => s.classList.remove('active'));
    safeGet('step1').classList.add('active');
    safeGet('progress').style.width = '16%';
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected', 'active-choice'));
}

/* --- 6. OTHER TOOLS (Stay NJ, Mortgage, FAQ) --- */
function calcStayNJ() {
    const t = safeGet('staynj-tax'); const i = safeGet('staynj-income'); const r = safeGet('staynj-result');
    if (!t || !i || !r) return;
    const tax = parseFloat(t.value) || 0; const inc = parseFloat(i.value) || 0;
    if (!tax || !inc) { r.style.display = 'none'; return; }
    safeGet('staynj-amount').textContent = '$' + Math.round(Math.min(tax * 0.5, 6500)).toLocaleString();
    r.style.display = 'block';
}

function calcMortgage() {
    const p = parseFloat(safeGet('m-price').value) || 0;
    const r = parseFloat(safeGet('m-rate').value) || 0;
    if (!p || !r) return;
    const monthly = (p * 0.8) * ((r/100/12) * Math.pow(1+(r/100/12), 360)) / (Math.pow(1+(r/100/12), 360) - 1);
    safeGet('m-monthly').textContent = '$' + Math.round(monthly).toLocaleString();
    safeGet('mort-empty-state').style.display = 'none';
    safeGet('mort-top-result').style.display = 'block';
}

function toggleFAQ(el) {
    const item = el.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(f => f.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
}

function submitLead() {
    const n = safeGet('cf-name'); const e = safeGet('cf-email');
    if (!n || !e || !n.value) return;
    emailjs.send('service_gptqbyx', 'template_q1kaure', { name: n.value, email: e.value, topic: safeGet('cf-topic').value })
    .then(() => { safeGet('contact-form').style.display = 'none'; safeGet('form-success').style.display = 'block'; });
}
