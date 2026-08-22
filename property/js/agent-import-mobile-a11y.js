(function(){
  'use strict';

  var mobileQuery = window.matchMedia('(max-width: 760px)');
  if (!mobileQuery.matches) return;

  var modal = document.getElementById('ad-import-modal');
  var dialog = modal && modal.querySelector('.ad-modal-card');
  var closeButton = document.getElementById('ad-import-close');
  if (!modal || !dialog || !closeButton) return;

  var lastTrigger = null;
  var focusSelector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function isOpen(){
    return !modal.hidden;
  }

  function focusables(){
    return Array.prototype.slice.call(dialog.querySelectorAll(focusSelector)).filter(function(el){
      return !el.hidden && !el.closest('[hidden]') && el.getAttribute('aria-hidden') !== 'true';
    });
  }

  function rememberTrigger(event){
    var trigger = event.target.closest('#ad-import-open, #ad-import-side');
    if (trigger) lastTrigger = trigger;
  }

  function focusDialog(){
    window.requestAnimationFrame(function(){
      if (!isOpen()) return;
      closeButton.focus({preventScroll:true});
    });
  }

  function restoreFocus(){
    var target = lastTrigger && lastTrigger.isConnected ? lastTrigger : document.getElementById('ad-import-open');
    if (!target) return;
    window.requestAnimationFrame(function(){
      target.focus({preventScroll:true});
    });
  }

  function handleKeydown(event){
    if (!isOpen()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeButton.click();
      return;
    }

    if (event.key !== 'Tab') return;
    var items = focusables();
    if (!items.length) {
      event.preventDefault();
      closeButton.focus({preventScroll:true});
      return;
    }

    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('click', rememberTrigger, true);
  document.addEventListener('keydown', handleKeydown, true);

  var observer = new MutationObserver(function(records){
    records.forEach(function(record){
      if (record.attributeName !== 'hidden') return;
      if (isOpen()) focusDialog();
      else restoreFocus();
    });
  });
  observer.observe(modal, {attributes:true, attributeFilter:['hidden']});
})();
