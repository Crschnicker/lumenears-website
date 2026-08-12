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
       1a. Waitlist endpoint
       The Node service in api/, deployed alongside this site
       by render.yaml. Confirm the hostname in the Render
       dashboard after the first deploy — Render appends a
       suffix if the name is already taken.

       Blank it out and the popup never opens.
    ----------------------------------------------------- */
    var WAITLIST_ENDPOINT = "https://lumenears-waitlist-api.onrender.com/waitlist";

    // Loose on purpose: the confirmation email is the real check.
    var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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


    /* -----------------------------------------------------
       3. Waitlist popup
       Opens 15 seconds into a first visit and collects an
       email so the Kickstarter link can be sent on launch
       day. The endpoint is the Node service in api/ — see
       WAITLIST_ENDPOINT above. Leave that blank and the
       popup never opens, so the site degrades to what it
       was before.
    ----------------------------------------------------- */
    (function waitlistPopup() {
        var overlay = document.querySelector("[data-waitlist-overlay]");
        var modal = document.querySelector("[data-waitlist-modal]");
        var form = document.querySelector("[data-waitlist-form]");
        var phoneInput = document.querySelector("[data-waitlist-phone]");
        var input = document.querySelector("[data-waitlist-email]");
        var status = document.querySelector("[data-waitlist-status]");
        var submit = document.querySelector("[data-waitlist-submit]");
        var switcher = document.querySelector("[data-waitlist-switch]");
        var blurb = document.getElementById("waitlist-blurb");
        var fineprint = document.querySelector("[data-waitlist-fineprint]");
        var smsField = document.querySelector('[data-waitlist-field="sms"]');
        var emailField = document.querySelector('[data-waitlist-field="email"]');

        if (!overlay || !modal || !form || !input || !status || !submit) {
            return;
        }

        var STORAGE_KEY = "lumenears.waitlist";
        var lastFocused = null;
        var isOpen = false;
        var channel = "sms";

        var COPY = {
            sms: {
                blurb: "Leave a mobile number and we'll text you the Kickstarter link the moment the " +
                    "campaign goes live — along with the launch-day pledge tiers. That's the only " +
                    "reason we'll get in touch.",
                fineprint: "One text at launch, nothing else. Message and data rates may apply; reply " +
                    "STOP to opt out. We never share your number. ",
                swap: "Rather use email?"
            },
            email: {
                blurb: "Leave your email and we'll send you the Kickstarter link the moment the campaign " +
                    "goes live — along with the launch-day pledge tiers. That's the only reason " +
                    "we'll write.",
                fineprint: "One email at launch, nothing else. No newsletter, no sharing your address. ",
                swap: "Rather use a text?"
            }
        };

        // Swapping the channel swaps the copy with it, so the fine print never
        // promises a text to someone who typed an email address.
        function setChannel(next) {
            channel = next;

            var isSms = channel === "sms";

            if (smsField && emailField) {
                smsField.hidden = !isSms;
                emailField.hidden = isSms;
            }

            // Only the visible field submits, so the hidden one is cleared.
            if (isSms) {
                input.value = "";
                input.classList.remove("is-invalid");
            } else if (phoneInput) {
                phoneInput.value = "";
                phoneInput.classList.remove("is-invalid");
            }

            if (blurb) {
                blurb.textContent = COPY[channel].blurb;
            }

            if (fineprint) {
                fineprint.firstChild.nodeValue = COPY[channel].fineprint;
            }

            if (switcher) {
                switcher.textContent = COPY[channel].swap;
            }

            setStatus("");
        }

        function activeInput() {
            return channel === "sms" && phoneInput ? phoneInput : input;
        }

        // Matches the server: 10 digits is assumed North American, and
        // anything else has to look like an international number.
        function validPhone(value) {
            var digits = value.replace(/\D/g, "");

            if (value.charAt(0) !== "+" && (digits.length === 10 || (digits.length === 11 && digits.charAt(0) === "1"))) {
                return true;
            }

            return value.charAt(0) === "+" && digits.length >= 8 && digits.length <= 15;
        }

        // Private browsing and locked-down browsers throw on localStorage, and
        // a popup is not worth breaking the page over.
        function remembered() {
            try {
                return window.localStorage.getItem(STORAGE_KEY);
            } catch (error) {
                return null;
            }
        }

        function remember(value) {
            try {
                window.localStorage.setItem(STORAGE_KEY, value);
            } catch (error) {
                /* nothing to do */
            }
        }

        function openModal() {
            if (isOpen) {
                return;
            }

            isOpen = true;
            lastFocused = document.activeElement;
            overlay.hidden = false;

            // Next frame, so the transition has a start value to move from.
            window.requestAnimationFrame(function () {
                overlay.classList.add("is-open");
            });

            document.body.style.overflow = "hidden";
            input.focus();
        }

        function closeModal(reason) {
            if (!isOpen) {
                return;
            }

            isOpen = false;
            overlay.classList.remove("is-open");
            document.body.style.overflow = "";

            window.setTimeout(function () {
                overlay.hidden = true;
            }, 280);

            if (reason) {
                remember(reason);
            }

            if (lastFocused && lastFocused.focus) {
                lastFocused.focus();
            }
        }

        // Keep tabbing inside the dialog while it is open.
        function trapFocus(event) {
            if (event.key !== "Tab") {
                return;
            }

            var focusable = modal.querySelectorAll(
                "button, [href], input:not([tabindex='-1']), select, textarea"
            );

            if (!focusable.length) {
                return;
            }

            var first = focusable[0];
            var last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        function setStatus(message, kind) {
            status.textContent = message;
            status.className = "waitlist-status" + (kind ? " is-" + kind : "");
        }

        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) {
                closeModal("dismissed");
            }
        });

        document.addEventListener("keydown", function (event) {
            if (!isOpen) {
                return;
            }

            if (event.key === "Escape") {
                closeModal("dismissed");
            } else {
                trapFocus(event);
            }
        });

        var closers = document.querySelectorAll("[data-waitlist-close]");

        for (var c = 0; c < closers.length; c++) {
            closers[c].addEventListener("click", function () {
                closeModal("dismissed");
            });
        }

        // Anything can reopen the popup on purpose — the footer link uses this,
        // and it ignores the "already seen it" flag.
        var openers = document.querySelectorAll("[data-waitlist-open]");

        for (var o = 0; o < openers.length; o++) {
            openers[o].addEventListener("click", function (event) {
                event.preventDefault();
                openModal();
            });
        }

        if (switcher) {
            switcher.addEventListener("click", function () {
                setChannel(channel === "sms" ? "email" : "sms");
                activeInput().focus();
            });
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            var field = activeInput();
            var value = field.value.trim();
            var isSms = channel === "sms";

            if (isSms ? !validPhone(value) : !EMAIL_PATTERN.test(value)) {
                field.classList.add("is-invalid");
                setStatus(
                    isSms
                        ? "That mobile number doesn't look right."
                        : "That email address doesn't look right.",
                    "error"
                );
                field.focus();
                return;
            }

            field.classList.remove("is-invalid");
            submit.disabled = true;
            submit.textContent = "Adding you…";
            setStatus("");

            // The API sits on a free Render instance that sleeps when idle, so
            // the first request of the day can take the best part of a minute.
            var controller = "AbortController" in window ? new AbortController() : null;
            var timer = controller ? window.setTimeout(function () { controller.abort(); }, 70000) : null;

            window.fetch(WAITLIST_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: isSms ? "" : value,
                    phone: isSms ? value : "",
                    company: form.company ? form.company.value : "",
                    source: isSms ? "popup-sms" : "popup-email"
                }),
                signal: controller ? controller.signal : undefined
            }).then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            }).then(function (result) {
                if (!result.ok || !result.data.ok) {
                    throw new Error((result.data && result.data.error) || "Signup failed");
                }

                remember("joined");
                modal.setAttribute("data-state", "done");

                setStatus(
                    result.data.alreadyOnList
                        ? "You're already on the list — we'll be in touch on launch day."
                        : isSms
                            ? "You're on the list. We'll text you on launch day."
                            : "You're on the list. Check your inbox for a confirmation.",
                    "success"
                );

                window.setTimeout(function () {
                    closeModal("joined");
                }, 3200);
            }).catch(function (error) {
                setStatus(
                    error.name === "AbortError"
                        ? "That took too long. Try again, or email eesha@rclick.com."
                        : "Something went wrong. Try again, or email eesha@rclick.com.",
                    "error"
                );

                submit.disabled = false;
                submit.textContent = "Join the waitlist";
            }).then(function () {
                if (timer) {
                    window.clearTimeout(timer);
                }
            });
        });

        if (!WAITLIST_ENDPOINT || remembered()) {
            return;
        }

        window.setTimeout(openModal, 15000);
    })();

})();
