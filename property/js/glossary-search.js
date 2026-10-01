/* /glossary: filter the term cards as you type. Every term is already in the
   page HTML; this only hides the ones that don't match. */
(function () {
  'use strict';
  var input = document.getElementById('gl-q');
  var count = document.getElementById('gl-count');
  var empty = document.getElementById('gl-empty');
  if (!input) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll('.gl-term'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.gl-section'));
  var total = cards.length;

  function apply() {
    var words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var shown = 0;
    cards.forEach(function (card) {
      var text = card.getAttribute('data-search') || '';
      var hit = words.every(function (w) { return text.indexOf(w) > -1; });
      card.hidden = !hit;
      if (hit) shown++;
    });
    sections.forEach(function (s) { s.hidden = !s.querySelector('.gl-term:not([hidden])'); });
    empty.hidden = shown > 0;
    count.textContent = words.length ? shown + ' of ' + total + ' terms' : total + ' terms';
  }

  input.addEventListener('input', apply);
  var q = new URLSearchParams(window.location.search).get('q');
  if (q) { input.value = q; apply(); }
})();
