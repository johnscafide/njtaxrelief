/* ============================================================
   PROFESSIONAL HUB
   njpropertytaxrelief.com/property
   ============================================================ */
(function () {
  'use strict';

  var EJS_PUBLIC  = 'u262kw5AoJcBI342V';
  var EJS_SERVICE = 'service_gptqbyx';
  var EJS_TMPL    = 'template_contact';

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.plModalNote = function (title, html) {
    var n = el('plm-note-overlay');
    n.innerHTML = '<div class="plm-note-box">' +
      '<button class="plm-note-x" onclick="plCloseNote()"><i class="fas fa-xmark"></i></button>' +
      '<h3>' + esc(title) + '</h3>' + html + '</div>';
    n.classList.add('open');
  };
  window.plCloseNote = function () { el('plm-note-overlay').classList.remove('open'); };

  window.phJoin = function () {
    plModalNote('Early access',
      '<p>Tell us who you are and what you would use it for. You will hear the day it opens, at the price ' +
      'early users get.</p>' +
      '<div class="pl-form" style="grid-template-columns:1fr;">' +
        '<input id="ph-name" type="text" placeholder="Your name" autocomplete="name">' +
        '<input id="ph-email" type="email" placeholder="Email" autocomplete="email">' +
        '<input id="ph-co" type="text" placeholder="Company or firm">' +
        '<select id="ph-role">' +
          '<option value="">What do you do?</option>' +
          '<option>Real estate agent or broker</option>' +
          '<option>Tax appeal attorney</option>' +
          '<option>Lender or mortgage broker</option>' +
          '<option>Bank or credit union</option>' +
          '<option>Appraiser</option>' +
          '<option>Investor</option>' +
          '<option>Municipal or government</option>' +
          '<option>Something else</option>' +
        '</select>' +
        '<textarea id="ph-need" rows="3" placeholder="What would you actually use it for? Be specific, it ' +
        'shapes what gets built next."></textarea>' +
        '<button onclick="phSend()">Put me on the list</button>' +
      '</div>' +
      '<div class="auth-fine">No card, no commitment. We will not add you to any other list.</div>');
  };

  window.phSend = function () {
    var name = (el('ph-name').value || '').trim();
    var email = (el('ph-email').value || '').trim();
    if (!name || !email) { alert('Please add your name and email.'); return; }
    var co = (el('ph-co').value || '').trim();
    var role = (el('ph-role').value || '').trim() || 'Not stated';
    var need = (el('ph-need').value || '').trim();

    if (typeof emailjs !== 'undefined') {
      emailjs.init({ publicKey: EJS_PUBLIC });
      emailjs.send(EJS_SERVICE, EJS_TMPL, {
        name: name, email: email, phone: 'Not provided',
        topic: '\u2b50 PRO HUB \u2b50 early access request, ' + role,
        tenure: 'Professional', lead_type: 'Professional', finance: 'Not provided',
        town: 'Not provided', address: co || 'Not provided',
        message: ['Professional Hub early access request',
                  'Role: ' + role, 'Company: ' + (co || 'not given'),
                  'What they would use it for:', need || 'not stated',
                  'Source: /property/pro.html'].join('\n')
      }).catch(function (e) { console.warn(e); });
    }
    if (typeof gtag === 'function') gtag('event', 'generate_lead', { source: 'pro_hub' });

    el('plm-note-overlay').innerHTML =
      '<div class="plm-note-box" style="text-align:center;">' +
        '<div style="font-size:42px;color:var(--green);margin-bottom:12px;"><i class="fas fa-circle-check"></i></div>' +
        '<h3>You are on the list</h3>' +
        '<p>You will hear the day it opens. If you named something specific you need, that goes straight ' +
        'into what gets built next.</p>' +
        '<button class="db-btn" onclick="plCloseNote()">Close</button>' +
      '</div>';
  };
})();