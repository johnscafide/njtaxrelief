(function(){
  'use strict';
  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro'&&path!=='/pro')return;

  function applyBuyerReassurance(){
    var fastNote=document.querySelector('.pro-fast-price-note');
    if(fastNote){
      fastNote.textContent='Annual plans equal ten monthly payments: save $118 on Agent, $258 on Pro, or $798 on Pro+ versus paying monthly for 12 months.';
    }

    var checkoutNote=document.querySelector('.pro-checkout-note');
    if(checkoutNote&&!document.getElementById('pro-renewal-reassurance')){
      var note=document.createElement('p');
      note.className='pro-checkout-note';
      note.id='pro-renewal-reassurance';
      note.innerHTML='<i class="fas fa-rotate-left"></i><strong> Clear renewal control:</strong> once enrolled, recurring subscriptions can be canceled at any time through the Stripe Customer Portal. Under the current self-service configuration, cancellation stops the next renewal and paid access generally continues through the current paid term. Refund requests are reviewed individually under the published <a href="/refunds">Refund Policy</a>.';
      checkoutNote.insertAdjacentElement('afterend',note);
    }

    var faqGrid=document.querySelector('.pro-billing-faq .pro-faq-grid');
    if(faqGrid&&!faqGrid.querySelector('[data-faq-added="cancellation"]')){
      var card=document.createElement('article');
      card.className='pro-faq-card new-buyer-question pro-reveal is-visible';
      card.setAttribute('data-faq-added','cancellation');
      card.innerHTML='<i class="fas fa-rotate-left"></i><h3>Can I cancel before the next renewal?</h3><p>Yes. Once enrolled, recurring subscriptions can be canceled through the Stripe Customer Portal. Cancellation generally stops the next renewal while paid access continues through the end of the current paid period. Refund requests are reviewed individually under the <a href="/refunds">Refund Policy</a>.</p>';
      faqGrid.appendChild(card);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyBuyerReassurance,{once:true});
  else applyBuyerReassurance();
})();
