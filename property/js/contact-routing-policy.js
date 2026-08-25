/* Watchdog public contact-routing policy.
   Customer-facing contact paths are brand-first: Contact Watchdog or Account Support.
   Direct staff email addresses, phone numbers, personal-name contact links and agent-email actions must not be exposed. */
(function () {
  'use strict';
  if (window.__WATCHDOG_CONTACT_ROUTING_POLICY__) return;
  window.__WATCHDOG_CONTACT_ROUTING_POLICY__ = true;

  var CONTACT_URL = 'https://www.watchdogindex.com/contact';
  var SUPPORT_URL = 'https://www.watchdogindex.com/support';
  var PERSONAL_EMAILS = [
    /john@johnscafide\.com/gi,
    /heather@heatherscafide\.com/gi
  ];
  var PERSONAL_PHONES = [
    /(?:\+?1[\s.-]*)?\(?856\)?[\s.-]*404[\s.-]*1098/g,
    /(?:\+?1[\s.-]*)?\(?856\)?[\s.-]*310[\s.-]*6746/g,
    /(?:\+?1[\s.-]*)?\(?609\)?[\s.-]*540[\s.-]*5505/g
  ];

  function isShareMailto(href) {
    return /^mailto:\?(?:subject|body)=/i.test(String(href || ''));
  }

  function shouldUseSupport(anchor) {
    var text = String(anchor && anchor.textContent || '').toLowerCase();
    var href = String(anchor && anchor.getAttribute && anchor.getAttribute('href') || '').toLowerCase();
    return /support|billing|account|privacy|delete|deletion|data request/.test(text + ' ' + href);
  }

  function setContactAnchor(anchor, support) {
    if (!anchor || !anchor.setAttribute) return;
    anchor.setAttribute('href', support ? SUPPORT_URL : CONTACT_URL);
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
    anchor.removeAttribute('onclick');
    if (/email|phone|call|contact|message|support/i.test(anchor.textContent || '')) {
      anchor.innerHTML = '<i class="fas ' + (support ? 'fa-circle-question' : 'fa-message') + '" aria-hidden="true"></i> ' + (support ? 'Account Support' : 'Contact Watchdog');
    }
  }

  function cleanAnchors(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll('a[href]').forEach(function (anchor) {
      var href = String(anchor.getAttribute('href') || '').trim();
      var lower = href.toLowerCase();
      var label = String(anchor.textContent || '').toLowerCase();

      if (/^mailto:/i.test(href) && !isShareMailto(href)) {
        setContactAnchor(anchor, shouldUseSupport(anchor));
        return;
      }
      if (/^tel:/i.test(href)) {
        setContactAnchor(anchor, shouldUseSupport(anchor));
        return;
      }
      if (lower === '/#contact' || lower === '/index.html#contact' || lower === '/contact.html' || /njpropertytaxrelief\.com\/contact\.html/i.test(href)) {
        setContactAnchor(anchor, false);
        return;
      }
      if (/^https?:\/\/(?:www\.)?johnscafide\.com(?:\/|$)/i.test(href) || /^https?:\/\/johnscafide\.opuselitesj\.com(?:\/|$)/i.test(href)) {
        anchor.setAttribute('href', CONTACT_URL + '?topic=real-estate');
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
        if (/opuselitesj\.com|johnscafide/i.test(anchor.textContent || '')) anchor.textContent = 'Contact Watchdog';
        return;
      }
      if (/email\s+(?:agent|john|heather)|call\s+(?:john|heather)|book\s+a\s+call/.test(label)) {
        setContactAnchor(anchor, false);
      }
    });
  }

  function cleanTextValue(value) {
    var output = String(value || '');
    PERSONAL_EMAILS.forEach(function (pattern) { output = output.replace(pattern, 'Contact Watchdog'); });
    PERSONAL_PHONES.forEach(function (pattern) { output = output.replace(pattern, 'Contact Watchdog'); });
    output = output.replace(/John Scafide,\s*NJ License #2079591/gi, 'Licensed NJ real-estate professional');
    output = output.replace(/\bJohn Scafide\b/g, 'Watchdog');
    output = output.replace(/\bJohn or Heather\b/gi, 'the Watchdog team');
    output = output.replace(/\bEmail Agent\b/gi, 'Contact Watchdog');
    output = output.replace(/\bEmail John\b/gi, 'Contact Watchdog');
    output = output.replace(/\bEmail Heather\b/gi, 'Contact Watchdog');
    output = output.replace(/\bSend to John\b/gi, 'Send to Watchdog');
    output = output.replace(/\bSend to Heather\b/gi, 'Send to Watchdog');
    output = output.replace(/\bJohn will get back to you\b/gi, 'Watchdog will get back to you');
    output = output.replace(/\bHeather will get back to you\b/gi, 'Watchdog will get back to you');
    output = output.replace(/Watchdog,\s*NJ License #2079591/gi, 'Licensed NJ real-estate professional');
    output = output.replace(/\bby emailing\b/gi, 'through');
    output = output.replace(/\bFor anything else, email\b/gi, 'For anything else, use');
    return output;
  }

  function cleanText(scope) {
    var root = scope && scope.nodeType ? scope : document.body;
    if (!root || !document.createTreeWalker) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function (textNode) {
      var parent = textNode.parentElement;
      if (!parent || /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION)$/i.test(parent.tagName)) return;
      var next = cleanTextValue(textNode.nodeValue);
      if (next !== textNode.nodeValue) textNode.nodeValue = next;
    });
  }

  function cleanMetadata() {
    if (/John Scafide/i.test(document.title || '')) document.title = (document.title || '').replace(/John Scafide/gi, 'Watchdog');
    document.querySelectorAll('meta[content]').forEach(function (meta) {
      var content = String(meta.getAttribute('content') || '');
      var next = cleanTextValue(content);
      if (next !== content) meta.setAttribute('content', next);
    });
  }

  function replaceAgentRail(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll('.plm-agent').forEach(function (rail) {
      if (rail.getAttribute('data-watchdog-contact-policy') === '1') return;
      var content = String(rail.textContent || '');
      if (!/John|Heather|Email|856[- .()]|johnscafide|heatherscafide/i.test(content + ' ' + rail.innerHTML)) return;
      rail.setAttribute('data-watchdog-contact-policy', '1');
      rail.innerHTML =
        '<div class="plm-agent-row">' +
          '<div><div class="plm-agent-nm">Watchdog Real Estate Support</div>' +
          '<div class="plm-agent-ti">Licensed New Jersey real-estate professionals</div>' +
          '<div class="plm-agent-lic">Questions and service requests stay inside Watchdog.</div></div>' +
        '</div>' +
        '<div class="plm-agent-btns">' +
          '<a class="gold" href="' + CONTACT_URL + '?topic=real-estate"><i class="fas fa-message"></i> Message Watchdog</a>' +
          '<a href="' + SUPPORT_URL + '"><i class="fas fa-circle-question"></i> Account Support</a>' +
        '</div>';
    });
  }

  function removeDirectAgentImages(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll('img[src*="johnprofile"],img[src*="heatherheadshot"]').forEach(function (img) {
      var container = img.closest('.plm-agent,.prop-agent,.agent-card,.agent-contact');
      if (container) img.remove();
    });
  }

  function normalize(scope, includeMetadata) {
    var root = scope && scope.querySelectorAll ? scope : document;
    cleanAnchors(root);
    cleanText(root && root.nodeType ? root : document.body);
    if (includeMetadata) cleanMetadata();
    replaceAgentRail(root);
    removeDirectAgentImages(root);
  }

  function boot() {
    normalize(document, true);
    if (!window.MutationObserver || !document.documentElement) return;
    new MutationObserver(function (records) {
      var scopes = new Set();
      records.forEach(function (record) {
        (record.addedNodes || []).forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          scopes.add(node.parentElement || node);
        });
      });
      scopes.forEach(function (scope) { normalize(scope, false); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.WatchdogContactPolicy = Object.freeze({
    contactUrl: CONTACT_URL,
    supportUrl: SUPPORT_URL,
    refresh: function () { normalize(document, true); }
  });
})();
