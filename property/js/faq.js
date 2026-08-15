(function () {
  "use strict";

  window.wdFaqToggle = function (el) {
    var item = el.closest(".faq-item");
    if (!item) return;
    item.classList.toggle("active");
  };

  function initFaqSearch() {
    var input = document.getElementById("faq-search");
    var empty = document.getElementById("faq-empty");
    if (!input) return;

    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      var items = document.querySelectorAll(".faq-item");
      var cats = document.querySelectorAll(".faq-cat");
      var anyVisible = false;

      items.forEach(function (item) {
        var text = item.textContent.toLowerCase();
        var match = !q || text.indexOf(q) !== -1;
        item.style.display = match ? "" : "none";
        if (match && q) {
          item.classList.add("active");
        } else if (!q) {
          item.classList.remove("active");
        }
        if (match) anyVisible = true;
      });

      cats.forEach(function (cat) {
        var visibleCount = 0;
        cat.querySelectorAll(".faq-item").forEach(function (item) {
          if (item.style.display !== "none") visibleCount++;
        });
        cat.style.display = visibleCount ? "" : "none";
      });

      if (empty) empty.classList.toggle("show", q.length > 0 && !anyVisible);
    });
  }

  document.addEventListener("DOMContentLoaded", initFaqSearch);
})();
