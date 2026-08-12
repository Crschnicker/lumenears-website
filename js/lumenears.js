/*=======================================================
  LumenEars — site behaviour
=======================================================*/
(function () {
    "use strict";

    /* -----------------------------------------------------
       1. Kickstarter link
       Paste the live campaign URL here once and every
       "Back this project" button on the site points at it.
       Leave it empty and those buttons fall back to
       pledge.html (the on-site launch-list page).
    ----------------------------------------------------- */
    var KICKSTARTER_URL = "";

    if (KICKSTARTER_URL) {
        var ksLinks = document.querySelectorAll("[data-ks-link]");
        for (var i = 0; i < ksLinks.length; i++) {
            ksLinks[i].setAttribute("href", KICKSTARTER_URL);
            ksLinks[i].setAttribute("target", "_blank");
            ksLinks[i].setAttribute("rel", "noopener");
        }
    }

    /* -----------------------------------------------------
       2. Reveal on scroll
    ----------------------------------------------------- */
    var revealables = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
        for (var r = 0; r < revealables.length; r++) {
            revealables[r].classList.add("is-visible");
        }
    } else {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });

        for (var j = 0; j < revealables.length; j++) {
            observer.observe(revealables[j]);
        }
    }

    /* -----------------------------------------------------
       3. Preselect a reward tier from ?tier=... (pledge page)
    ----------------------------------------------------- */
    var tier = new URLSearchParams(window.location.search).get("tier");

    if (tier) {
        var radio = document.querySelector('input[name="pledge-tier"][value="' + tier + '"]');

        if (radio) {
            radio.checked = true;
        }

        var tierSelect = document.querySelector("select[data-tier-target]");

        if (tierSelect) {
            for (var o = 0; o < tierSelect.options.length; o++) {
                if (tierSelect.options[o].value === tier) {
                    tierSelect.selectedIndex = o;
                    break;
                }
            }
        }
    }

    /* -----------------------------------------------------
       4. Forms are static — no backend is wired up yet.
          Hook these up to your email provider before launch.
    ----------------------------------------------------- */
    var staticForms = document.querySelectorAll("form[data-static-form]");

    for (var f = 0; f < staticForms.length; f++) {
        staticForms[f].addEventListener("submit", function (event) {
            event.preventDefault();

            var note = this.querySelector("[data-form-note]");
            if (note) {
                note.innerHTML =
                    '<i class="bi-info-circle me-1"></i> This form is not connected yet — ' +
                    'point it at your email provider before launch.';
            }
        });
    }
})();
