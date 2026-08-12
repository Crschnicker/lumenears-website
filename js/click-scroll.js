//jquery-click-scroll
//original by syamsul'isul' Arifin — reworked so the section list is
//derived from the nav itself instead of a hard-coded array. That way the
//nav keeps working on pages that do not have every section.

(function ($) {
    "use strict";

    $(function () {
        var $navLinks = $('.navbar-nav .nav-item .nav-link.click-scroll');

        if (!$navLinks.length) {
            return;
        }

        var offsetGap = 83;

        // Only keep links whose target section actually exists on this page.
        var targets = [];

        $navLinks.each(function (index) {
            var hash = ($(this).attr('href') || '').split('#')[1];
            var $section = hash ? $('#' + hash) : $();

            if ($section.length) {
                targets.push({ index: index, $section: $section });
            }
        });

        if (!targets.length) {
            return;
        }

        // Highlight the section currently in view.
        function setActive() {
            var docScroll = $(document).scrollTop() + 1;
            var current = null;

            $.each(targets, function (i, target) {
                if (docScroll >= target.$section.offset().top - offsetGap) {
                    current = target.index;
                }
            });

            if (current === null) {
                current = targets[0].index;
            }

            $navLinks.removeClass('active').addClass('inactive');
            $navLinks.eq(current).addClass('active').removeClass('inactive');
        }

        $(document).on('scroll', setActive);
        setActive();

        // Smooth-scroll on click.
        $navLinks.on('click', function (e) {
            var hash = ($(this).attr('href') || '').split('#')[1];
            var $section = hash ? $('#' + hash) : $();

            if (!$section.length) {
                return;
            }

            e.preventDefault();

            $('html, body').animate({
                scrollTop: $section.offset().top - offsetGap
            }, 300);
        });
    });
})(window.jQuery);
