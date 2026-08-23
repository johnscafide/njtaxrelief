(function () {
  "use strict";

  function ensureDisclosureStyles() {
    if (document.getElementById("wd-faq-disclosure-guard")) return;
    var style = document.createElement("style");
    style.id = "wd-faq-disclosure-guard";
    style.textContent = ".faq-item>.faq-answer{display:block!important}.faq-item[hidden],.faq-cat[hidden]{display:none!important}";
    document.head.appendChild(style);
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function setCategoryNavigationState(cat, visible) {
    var link = document.querySelector('[data-faq-nav][href="#' + cat.id + '"]');
    if (!link) return;
    link.classList.toggle("is-filtered", !visible);
    link.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) link.removeAttribute("tabindex");
    else link.setAttribute("tabindex", "-1");
  }

  function initFaqSearch() {
    ensureDisclosureStyles();
    var input = document.getElementById("faq-search");
    var empty = document.getElementById("faq-empty");
    var status = document.getElementById("faq-status");
    if (!input) return;

    var items = Array.from(document.querySelectorAll(".faq-item"));
    var cats = Array.from(document.querySelectorAll(".faq-cat"));
    var total = items.length;

    function applyFilter() {
      var q = normalize(input.value);
      var visibleTotal = 0;

      items.forEach(function (item) {
        var match = !q || normalize(item.textContent).indexOf(q) !== -1;
        item.hidden = !match;
        if (match) {
          visibleTotal += 1;
          if (q) item.open = true;
        } else {
          item.open = false;
        }
        if (!q) item.open = false;
      });

      cats.forEach(function (cat) {
        var visible = Array.from(cat.querySelectorAll(".faq-item")).some(function (item) {
          return !item.hidden;
        });
        cat.hidden = !visible;
        setCategoryNavigationState(cat, visible);
      });

      if (empty) empty.classList.toggle("show", q.length > 0 && visibleTotal === 0);
      if (status) {
        status.textContent = q
          ? visibleTotal + " of " + total + " FAQ questions match your search."
          : total + " FAQ questions available.";
      }
    }

    input.addEventListener("input", applyFilter);
    input.addEventListener("search", applyFilter);
    applyFilter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFaqSearch, { once: true });
  } else {
    initFaqSearch();
  }
})();