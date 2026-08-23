(function () {
  "use strict";

  function ensureDisclosureStyles() {
    if (document.getElementById("wd-faq-disclosure-guard")) return;
    var style = document.createElement("style");
    style.id = "wd-faq-disclosure-guard";
    style.textContent = [
      ".faq-item>.faq-answer{display:block!important}",
      ".faq-item[hidden],.faq-cat[hidden]{display:none!important}",
      "body.wd-faq-page .wd-nav{position:sticky!important;top:0!important;background:rgba(255,255,255,.98)!important;backdrop-filter:blur(10px);box-shadow:0 1px 0 #dce5e8,0 4px 18px rgba(14,34,72,.06)!important}",
      "body.wd-faq-page .wd-nav .wd-nav-in{padding:13px 26px!important}",
      "body.wd-faq-page .wd-nav a,body.wd-faq-page .wd-nav button,body.wd-faq-page .wd-nav .wd-logo{color:#10294b!important;text-shadow:none!important}",
      "body.wd-faq-page .wd-public-trigger{background:#f5f8fa!important;border-color:#dbe4ea!important}",
      "body.wd-faq-page .wd-public-profile img{border-color:#dbe4ea!important}",
      "body.wd-faq-page .faqp-hero{padding:42px 24px 40px!important;background:#fff!important;border-bottom:1px solid #e3eaed!important}",
      "body.wd-faq-page .faqp-hero h1{margin:0!important;color:#10294b!important}",
      "body.wd-faq-page .faqp-wrap{padding-top:44px!important}",
      "body.wd-faq-page .faqp-side>nav{display:flex!important;flex-direction:column!important;gap:2px!important;background:transparent!important;background-image:none!important;border:0!important;border-left:1px solid #dce5e8!important;border-radius:0!important;box-shadow:none!important;padding:0 0 0 12px!important;margin:0!important;min-height:0!important}",
      "body.wd-faq-page .faqp-side>nav>a{display:block!important;background:transparent!important;background-image:none!important;border:0!important;border-radius:8px!important;box-shadow:none!important;color:#10294b!important;font:700 14px/1.35 'Source Sans 3',Arial,sans-serif!important;margin:0!important;padding:8px 10px!important;text-decoration:none!important;text-shadow:none!important}",
      "body.wd-faq-page .faqp-side>nav>a:hover,body.wd-faq-page .faqp-side>nav>a:focus-visible{background:#f3f8f7!important;color:#056b6d!important;outline:none!important}",
      "body.wd-faq-page .faq-question{list-style:none!important}",
      "body.wd-faq-page .faq-question::before,body.wd-faq-page .faq-question::after{content:none!important;display:none!important}",
      "body.wd-faq-page .faq-arrow::after{content:none!important;display:none!important}",
      "body.wd-faq-page .faq-arrow::before{content:'+'!important;display:block!important;color:inherit!important;font-family:Arial,sans-serif!important;font-size:20px!important;font-weight:600!important;line-height:1!important}",
      "@media(max-width:900px){body.wd-faq-page .faqp-side>nav{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;border-left:0!important;padding:0!important}body.wd-faq-page .faqp-wrap{padding-top:32px!important}}",
      "@media(max-width:560px){body.wd-faq-page .wd-nav .wd-nav-in{padding:10px 16px!important}body.wd-faq-page .faqp-hero{padding:28px 18px 30px!important}body.wd-faq-page .faqp-wrap{padding-top:26px!important}}"
    ].join("");
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
    document.body.classList.add("wd-faq-page", "nav-solid");
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