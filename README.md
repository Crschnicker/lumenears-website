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
| `api/` | Node service behind the waitlist popup: stores signups in Postgres, sends the confirmation through Resend |
| `index.html` | The whole site: hero video, campaign video, about, characters, games, how it works, why back now, reward tiers, stretch goals + timeline, about us/founder, FAQ/risks/AI disclosure, Kickstarter hand-off |

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

3. **Music.** `audio/neon-return.mp3` plays only when a visitor presses the toggle in the
   bottom-right corner. It is `preload="none"`, so the 1.7 MB file is never fetched
   otherwise, and the choice is stored in `localStorage`. A returning visitor who left it
   on gets it back on their first click — browsers refuse to start audio without a
   gesture, and the toggle would otherwise sit there lying about playing. Turning on the
   hero video's sound stops the music rather than talking over it. To swap the track,
   re-encode over the same filename:

   ```bash
   ffmpeg -y -i "New Track.mp3" -vn -c:a libmp3lame -b:a 112k -ar 44100 audio/neon-return.mp3
   ```

   (`-vn` matters: the master carried embedded cover art, which is dead weight here.)
4. **Campaign video.** Set `CAMPAIGN_VIDEO.src` in `js/lumenears.js` — a local file
   (`video/lumenears.mp4`), `youtube:VIDEO_ID`, or `vimeo:VIDEO_ID`. The section stays
   hidden while it is empty, so there is never a broken player. Hosted embeds are
   click-to-load: no third-party scripts or cookies until the viewer presses play.
5. **Waitlist API.** The popup needs the service in `api/` to be live — see
   [Waitlist](#waitlist) below. Set `WAITLIST_ENDPOINT` in `js/lumenears.js` to its
   real Render hostname, and set `RESEND_API_KEY` and `ADMIN_TOKEN` in the dashboard.
   Blank the endpoint and the popup never opens, so the site still works without it.
6. **Legal pages.** `terms.html` and `privacy.html` are written and linked from the
   footer. Two deliberately loud yellow placeholders remain in `privacy.html`
   (`[HOSTING PROVIDER]`, `[RETENTION PERIOD]`) and must be filled in — search for
   `legal-todo`. The pages are drafted from what the site actually does; they are not
   legal advice and should be reviewed by a lawyer. Governing law is set to Orange
   County, California.
7. **Google Fonts.** The pages load Outfit from `fonts.googleapis.com`, which sends every
   visitor's IP to Google and is disclosed in the privacy policy. Self-hosting the font
   removes that third-party request and shortens the policy.


## Waitlist

A popup opens 15 seconds into a first visit and asks for a mobile number — or an
email address, via the "Rather use email?" link — so the Kickstarter link can be sent
on launch day. It never reappears once someone joins or
closes it (one key in `localStorage`), and the footer link `data-waitlist-open` reopens
it on demand. `render.yaml` deploys the whole thing alongside the static site:

| Piece | Where |
| --- | --- |
| Popup markup | `index.html`, just above the script tags |
| Popup behaviour | `js/lumenears.js`, section 3 |
| API | `api/server.js` — `POST /waitlist`, `GET /healthz`, `GET /waitlist/export` |
| Storage | Render Postgres, one `waitlist` table created (and migrated) on boot |
| Email | Resend, one confirmation per new address |
| SMS | SignalWire Compatibility API, one welcome text per new number |
| Email images | `images/email/` — remote-loaded, so the copy must stand without them |

### Setting it up

1. Deploy the blueprint. Render creates `lumenears-waitlist-api` and its database.
2. Copy the service's real hostname into `WAITLIST_ENDPOINT` in `js/lumenears.js` —
   Render appends a suffix if the name is taken, so do not assume it.
3. Render prompts for every `sync: false` key when the blueprint syncs:
   `RESEND_API_KEY`, `ADMIN_TOKEN` (invent a long random string — it guards the CSV
   export), and the four SignalWire values: `SIGNALWIRE_SPACE_URL`
   (`yourspace.signalwire.com`), `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN` and
   `SIGNALWIRE_FROM` (the number you bought, in E.164). Leave the SignalWire values
   blank and signups still store — the service logs that it skipped the text.
4. Verify `lumenears.com` in Resend, then leave `RESEND_FROM` as
   `LumenEars <help@lumenears.com>`. Until the domain is verified, Resend only
   delivers from `onboarding@resend.dev`, which is what the code falls back to.

### Getting the list out

```bash
curl "https://<service>.onrender.com/waitlist/export?token=$ADMIN_TOKEN" -o waitlist.csv
```

### Things to know

- **The database is paid, the web service is not.** Render allows one free database per
  account and this account already has one, so the blueprint asks for `basic-256mb`
  (~$6/month). The API itself is still on the free plan, which sleeps after 15 minutes
  idle and takes ~50s to wake — the popup waits 70s and explains itself rather than
  failing, but the first signup after a quiet spell is slow. Changing the API's `plan`
  to `starter` (~$7/month) removes that, and is worth it while the campaign is live.
- **Two messages, and the copy says so.** A signup gets a confirmation now and one
  message at launch — nothing else. The consent wording in the popup, the wording
  recorded in `consent_text`, and the privacy policy all state the same thing, so
  changing what you send means changing all three.
- **The welcome text is one GSM-7 segment.** Adding an emoji or a curly quote flips the
  message to UCS-2, halving the limit to 70 characters and splitting it in two at double
  the cost. A test asserts the length.
- **Numbers are stored in E.164** (`+19495550134`), so the same person typing
  `(949) 555-0134` and `+1 949 555 0134` is one row.
- **Duplicates are not an error.** A repeat address or number returns
  `alreadyOnList: true` and sends no second email, so the form cannot be used to
  mailbomb a stranger.
- **Anti-spam** is a honeypot field plus `RATE_LIMIT_MAX` signups (default 5) per IP
  per 10 minutes, in memory.
- **CORS** is limited to `ALLOWED_ORIGINS` in `render.yaml`. Add any preview domain
  there or the browser will block the request.
- The privacy policy (section 4) and terms (section 2) describe this list. If what the
  list is used for changes, those change first.

### Running it locally

```bash
cd api && npm install
DATABASE_URL=postgres://localhost/lumenears RESEND_API_KEY= node server.js
```

With `RESEND_API_KEY` empty the signup is stored and the email is skipped, which is
usually what you want while testing.

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
audio/
  neon-return.mp3                opt-in soundtrack, 112 kbps (the raw master is gitignored)
js/
  lumenears.js                   KS link rewrite, campaign video embed, scroll reveals, waitlist popup
  click-scroll.js                nav scroll-spy (reworked to read sections from the nav)
  custom.js                      template helper (mobile menu, smooth scroll)
images/lumenears/                campaign artwork, optimized for web
api/
  server.js                      waitlist API — Postgres storage plus the Resend confirmation
  package.json                   one dependency (pg); Render runs `npm install` here
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
