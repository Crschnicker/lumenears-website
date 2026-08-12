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
| `index.html` | Single-page campaign site: hero, campaign video, about, characters, games, how it works, why back now, reward tiers, stretch goals + timeline, FAQ/risks/AI disclosure, launch-list form |
| `pledge.html` | Tier picker + launch-list signup, linked from every "Back this project" button |

## Before launch

1. **Kickstarter URL.** Open `js/lumenears.js` and set `KICKSTARTER_URL` to the live
   campaign link. Every element with `data-ks-link` (nav buttons, hero CTA, tier buttons,
   footer) repoints to it automatically and opens in a new tab. While it's empty those
   links fall back to `pledge.html`.
2. **Campaign video.** Set `CAMPAIGN_VIDEO.src` in `js/lumenears.js` — a local file
   (`video/lumenears.mp4`), `youtube:VIDEO_ID`, or `vimeo:VIDEO_ID`. The section stays
   hidden while it is empty, so there is never a broken player. Hosted embeds are
   click-to-load: no third-party scripts or cookies until the viewer presses play.
3. **Forms.** The two forms are static — they call `preventDefault()` and show a note.
   Point them at your email provider (Mailchimp/ConvertKit/Formspree action URL) and
   drop the `data-static-form` attribute.
4. **Placeholders.** `hello@lumenears.com`, the social links in the footer, and the
   Terms/Privacy links are all `#` or made-up. Fill them in.

## Structure

```
css/
  bootstrap.min.css              Bootstrap 5.2
  bootstrap-icons.css            icon font
  templatemo-festava-live.css    base template (unmodified)
  lumenears.css                  the LumenEars theme — all overrides live here
js/
  lumenears.js                   KS link rewrite, scroll reveals, tier preselect, form stubs
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
| Creator Edition | $289 | Studio lifetime access |
| Duo Pack | $449 | 2 headbands |
| Workshop 5-Pack | $999 | 5 headbands |
| Co-Creator | $2,500 | Limited to 10 |

Goal $40,000 · 30-day campaign · est. delivery Jun 2027 · hardware ships to the US.

## Credits

Built on [TemplateMo 583 Festava Live](https://templatemo.com/tm-583-festava-live).
