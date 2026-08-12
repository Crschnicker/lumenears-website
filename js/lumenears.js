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

    /* -----------------------------------------------------
       1b. Campaign video
       Set `src` and the video section appears. Leave it empty
       and the section stays hidden — no broken player, no gap.

         local file : "video/lumenears.mp4"  (drop the file in video/)
         YouTube    : "youtube:dQw4w9WgXcQ"
         Vimeo      : "vimeo:123456789"

       Embeds are click-to-load, so YouTube/Vimeo scripts and
       cookies never touch a visitor who doesn't press play.
    ----------------------------------------------------- */
    var CAMPAIGN_VIDEO = {
        src: "",
        poster: "images/lumenears/hero-ears.jpg"
    };

    if (KICKSTARTER_URL) {
        var ksLinks = document.querySelectorAll("[data-ks-link]");
        for (var i = 0; i < ksLinks.length; i++) {
            ksLinks[i].setAttribute("href", KICKSTARTER_URL);
            ksLinks[i].setAttribute("target", "_blank");
            ksLinks[i].setAttribute("rel", "noopener");
        }
    }

    /* -----------------------------------------------------
       1c. Render the video section (only if one is configured)
    ----------------------------------------------------- */
    (function renderVideo() {
        var section = document.querySelector("[data-video-section]");
        var mount = document.querySelector("[data-video-mount]");

        if (!section || !mount || !CAMPAIGN_VIDEO.src) {
            return;
        }

        var src = CAMPAIGN_VIDEO.src;
        var host = null;
        var id = null;

        if (src.indexOf("youtube:") === 0) {
            host = "youtube";
            id = src.slice(8);
        } else if (src.indexOf("vimeo:") === 0) {
            host = "vimeo";
            id = src.slice(6);
        }

        if (!host) {
            // Self-hosted file — no facade needed.
            var video = document.createElement("video");
            video.className = "video-player";
            video.setAttribute("controls", "");
            video.setAttribute("playsinline", "");
            video.setAttribute("preload", "none");
            if (CAMPAIGN_VIDEO.poster) {
                video.setAttribute("poster", CAMPAIGN_VIDEO.poster);
            }
            video.innerHTML =
                '<source src="' + src + '" type="video/mp4">' +
                "Your browser does not support the video tag.";
            mount.appendChild(video);
            section.hidden = false;
            return;
        }

        // Hosted embed: show a poster + play button, swap in the iframe on click.
        var facade = document.createElement("button");
        facade.type = "button";
        facade.className = "video-facade";
        facade.setAttribute("aria-label", "Play the LumenEars campaign video");
        if (CAMPAIGN_VIDEO.poster) {
            facade.style.backgroundImage = "url('" + CAMPAIGN_VIDEO.poster + "')";
        }
        facade.innerHTML = '<span class="video-play"><i class="bi-play-fill"></i></span>';

        facade.addEventListener("click", function () {
            var iframe = document.createElement("iframe");
            iframe.className = "video-player";
            iframe.setAttribute("allow",
                "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
            iframe.setAttribute("allowfullscreen", "");
            iframe.setAttribute("title", "LumenEars campaign video");
            iframe.src = host === "youtube"
                ? "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0"
                : "https://player.vimeo.com/video/" + id + "?autoplay=1";
            mount.innerHTML = "";
            mount.appendChild(iframe);
        });

        mount.appendChild(facade);
        section.hidden = false;
    })();

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
