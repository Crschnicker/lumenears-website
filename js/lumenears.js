/*=======================================================
  LumenEars — site behaviour
=======================================================*/
(function () {
    "use strict";

    /* -----------------------------------------------------
       1. Kickstarter link  <-- THE ONE THING TO SET
       Paste the live campaign URL here once and every
       "Back this project" button on the site points at it
       and opens it in a new tab.

       Until it is filled in those buttons are visibly
       disabled: there is no on-site pledge flow to fall back
       to any more, so a dead button beats a dead end.
    ----------------------------------------------------- */
    var KICKSTARTER_URL = "";   // e.g. "https://www.kickstarter.com/projects/lumenears/lumenears"

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

    var ksLinks = document.querySelectorAll("[data-ks-link]");

    for (var i = 0; i < ksLinks.length; i++) {
        if (KICKSTARTER_URL) {
            ksLinks[i].setAttribute("href", KICKSTARTER_URL);
            ksLinks[i].setAttribute("target", "_blank");
            ksLinks[i].setAttribute("rel", "noopener");
        } else {
            ksLinks[i].classList.add("is-ks-pending");
            ksLinks[i].setAttribute("aria-disabled", "true");
            ksLinks[i].setAttribute("title", "Campaign link coming soon");
            ksLinks[i].addEventListener("click", function (event) {
                event.preventDefault();
            });
        }
    }

    if (!KICKSTARTER_URL) {
        var ksNote = document.querySelector("[data-ks-note]");
        if (ksNote) {
            ksNote.innerHTML =
                '<i class="bi-info-circle me-1"></i> Campaign link goes live with the ' +
                "Kickstarter — set KICKSTARTER_URL in js/lumenears.js.";
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
       1d. Nav sticks only after the hero
       A sticky-from-the-start navbar sits on top of the
       full-bleed hero video and clips it. Instead the nav
       scrolls away with the hero and re-attaches, fixed,
       once the hero is out of view. The spacer takes over
       its height at that moment so nothing jumps.
    ----------------------------------------------------- */
    (function stickyNavAfterHero() {
        var navbar = document.querySelector(".navbar");
        var hero = document.querySelector(".hero-section");
        var spacer = document.querySelector(".navbar-spacer");

        if (!navbar || !hero || !spacer) {
            return;
        }

        function setStuck(stuck) {
            if (stuck === navbar.classList.contains("is-stuck")) {
                return;
            }
            spacer.style.height = navbar.offsetHeight + "px";
            navbar.classList.toggle("is-stuck", stuck);
            spacer.classList.toggle("is-active", stuck);
        }

        if (!("IntersectionObserver" in window)) {
            return;   // no observer: leave the nav in flow, video stays unclipped
        }

        new IntersectionObserver(function (entries) {
            setStuck(!entries[0].isIntersecting);
        }, { threshold: 0 }).observe(hero);
    })();

    /* -----------------------------------------------------
       1e. Mobile hero: text + a watch button
       Phones get no hover and no background loop, so the
       hero is copy plus a button that plays the video
       fullscreen, with sound. The video element stays in
       the DOM (1px, invisible) because a display:none
       element cannot be put into fullscreen.
    ----------------------------------------------------- */
    (function heroWatch() {
        var video = document.querySelector("[data-hero-video]");
        var button = document.querySelector("[data-hero-watch]");

        if (!video || !button) {
            return;
        }

        var noHover = window.matchMedia("(hover: none), (pointer: coarse)");

        // Don't spend a phone's data on a loop it will never see.
        function applyMode() {
            if (noHover.matches) {
                video.removeAttribute("autoplay");
                video.setAttribute("preload", "none");
                video.pause();
            } else if (video.paused && !video.dataset.userPlaying) {
                video.setAttribute("preload", "metadata");
                video.play().catch(function () { /* autoplay blocked; poster stands in */ });
            }
        }

        applyMode();

        if (noHover.addEventListener) {
            noHover.addEventListener("change", applyMode);
        }

        function goFullscreen(el) {
            var fn = el.requestFullscreen
                || el.webkitRequestFullscreen
                || el.webkitEnterFullscreen   // iOS Safari: video element only
                || el.msRequestFullscreen;

            if (fn) {
                try {
                    fn.call(el);
                } catch (e) { /* fall through to inline playback */ }
            }
        }

        function restore() {
            video.dataset.userPlaying = "";
            video.controls = false;
            video.muted = true;
            video.loop = true;
            if (noHover.matches) {
                video.pause();
            }
        }

        button.addEventListener("click", function () {
            video.dataset.userPlaying = "1";
            video.controls = true;
            video.muted = false;
            video.loop = false;
            video.currentTime = 0;
            goFullscreen(video);
            video.play().catch(function () { /* user can hit play in the controls */ });
        });

        document.addEventListener("fullscreenchange", function () {
            if (!document.fullscreenElement) {
                restore();
            }
        });

        video.addEventListener("webkitendfullscreen", restore);
        video.addEventListener("ended", restore);
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

})();
