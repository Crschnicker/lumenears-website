# LumenEars — campaign site

Marketing site for **LumenEars**, a headband with two round, full-color screens that
play living characters, react to how you move, and let you play games with friends.

Static HTML/CSS/JS — no build step. Open `index.html` or serve the folder.

```bash
python -m http.server 5173
```

## Pages

| File | What it is |
| --- | --- |
| `terms.html` | Terms &amp; Conditions |
| `privacy.html` | Privacy Policy |
| `index.html` | The whole site: hero video, campaign video, about, characters, games, how it works, why back now, reward tiers, stretch goals + timeline, FAQ/risks/AI disclosure, Kickstarter hand-off |

There is no on-site pledge flow. Every CTA opens the Kickstarter campaign in a new tab;
the tier list on the page is information only.

## Before launch

1. **Kickstarter URL — the one required edit.** Open `js/lumenears.js` and set
   `KICKSTARTER_URL` to the live campaign link. All 14 elements with `data-ks-link` (nav
   buttons, hero CTA, the eight tier buttons, the back-the-campaign CTA, footer) repoint
   to it automatically and open in a new tab. **While it is empty every one of those
   buttons is greyed out and does nothing** — there is no on-site pledge page to fall
   back to, so the site is not launch-ready until this is filled in.
2. **Hero video.** On pointer devices the hero *is* the video, full bleed: the headline,
   lead, CTAs and meta row start invisible and fade in when the bottom-left corner is
   hovered (or focused via keyboard). The copy is never removed from the DOM — only its
   opacity changes — so screen readers and search engines still see it.

   Phones have no hover, so `@media (hover: none), (pointer: coarse)` gives them a
   different hero: copy plus a **Watch the video** button that plays the clip fullscreen
   with sound. There the background loop is switched off entirely (`preload="none"`, no
   autoplay) so a phone never downloads 6 MB it will not show. The `<video>` stays in the
   DOM at 1×1 and invisible, because a `display: none` element cannot enter fullscreen.
   `hero.mp4` therefore carries an audio track: muted for the desktop loop, unmuted when
   someone taps to watch.

   `video/hero.mp4` is a web encode of the raw master (`Hero Video.mp4`,
   gitignored). The master opens on 2.1s of black, runs a "Say hello to LumenEars" title
   card to ~8s, and ends on 2s of black — all trimmed out so the loop starts on the
   product and never flashes black. To regenerate after replacing the master:

   ```bash
   ffmpeg -ss 9.0 -to 59.70 -i "Hero Video.mp4" -vf "scale=1600:-2" -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart video/hero.mp4
   ffmpeg -ss 1 -i video/hero.mp4 -frames:v 1 -q:v 3 images/lumenears/hero-video-poster.jpg
   ```

   Re-check the trim points against the new footage — `ffmpeg -i in.mp4 -vf blackdetect -f null -`
   finds the black runs. 139 MB master in, 5.9 MB out (video + AAC audio).

3. **Campaign video.** Set `CAMPAIGN_VIDEO.src` in `js/lumenears.js` — a local file
   (`video/lumenears.mp4`), `youtube:VIDEO_ID`, or `vimeo:VIDEO_ID`. The section stays
   hidden while it is empty, so there is never a broken player. Hosted embeds are
   click-to-load: no third-party scripts or cookies until the viewer presses play.
4. **Forms.** There are none. Email capture was removed along with the pledge page —
   the site collects nothing and everything routes to Kickstarter.
5. **Legal pages.** `terms.html` and `privacy.html` are written and linked from the
   footer. Two deliberately loud yellow placeholders remain in `privacy.html`
   (`[HOSTING PROVIDER]`, `[RETENTION PERIOD]`) and must be filled in — search for
   `legal-todo`. The pages are drafted from what the site actually does; they are not
   legal advice and should be reviewed by a lawyer. Governing law is set to Orange
   County, California.
6. **Google Fonts.** The pages load Outfit from `fonts.googleapis.com`, which sends every
   visitor's IP to Google and is disclosed in the privacy policy. Self-hosting the font
   removes that third-party request and shortens the policy.

## Deploying

`render.yaml` is a Render Blueprint: a static site, no build step, publishing the repo
root. In Render, choose **New > Blueprint**, pick this repo, and it reads the file.
Pushes to `main` redeploy automatically; pull requests get preview environments.

The blueprint sets cache headers (long and immutable for `video/`, `images/` and
`fonts/`; revalidate-always for `css/` and `js/`, whose filenames are not content-hashed)
and rewrites `/terms` and `/privacy` onto their `.html` files.

`Hero Video.mp4` is gitignored, so the 133 MB master never reaches Render — only the 5 MB
`video/hero.mp4` encode ships.

### Custom domain

Add the domain under the service's **Settings > Custom Domains**, then at the registrar:

| Record | Host | Value |
| --- | --- | --- |
| A | `@` (apex) | `216.24.57.1` |
| CNAME | `www` | `<service-name>.onrender.com` |

Render shows the exact values for the service after the domain is added — use those if
they differ. TLS is issued automatically once the records resolve.

## Structure

```
css/
  bootstrap.min.css              Bootstrap 5.2
  bootstrap-icons.css            icon font
  templatemo-festava-live.css    base template (unmodified)
  lumenears.css                  the LumenEars theme — all overrides live here
video/
  hero.mp4                       hero background loop (web encode; the raw master is gitignored)
js/
  lumenears.js                   KS link rewrite, campaign video embed, scroll reveals
  click-scroll.js                nav scroll-spy (reworked to read sections from the nav)
  custom.js                      template helper (mobile menu, smooth scroll)
images/lumenears/                campaign artwork, optimized for web
```

`templatemo-festava-live.css` is left untouched so the template can be diffed or updated;
everything LumenEars-specific is layered on top in `lumenears.css`.

## Content source

Copy, reward tiers, stretch goals, timeline, risks and the AI disclosure are taken from
the Kickstarter campaign page. Reward tiers as listed:

| Tier | Price | Notes |
| --- | --- | --- |
| Glow Supporter | $25 | Digital only |
| Early Glow | $189 | Limited to 150 |
| Early Bird | $209 | Limited to 350 |
| LumenEars | $239 | Standard |
| Creator Edition | $289 | Every world pack |
| Duo Pack | $449 | 2 headbands |
| Workshop 5-Pack | $999 | 5 headbands |
| Co-Creator | $2,500 | Limited to 10 |

Goal $40,000 · 30-day campaign · est. delivery Jun 2027 · hardware ships to the US.

## Credits

Built on [TemplateMo 583 Festava Live](https://templatemo.com/tm-583-festava-live).
