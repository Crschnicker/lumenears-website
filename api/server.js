/*=======================================================
  LumenEars — waitlist API

  One job: take an email address from the site's popup,
  store it in Postgres, and send the signup a confirmation
  from Resend. Everything else (the campaign, the pledge
  flow) lives on Kickstarter.

  Env it expects — see render.yaml:
    DATABASE_URL     Postgres, wired up by the blueprint
    RESEND_API_KEY   secret, set by hand in the dashboard
    RESEND_FROM      "LumenEars <help@lumenears.com>"
    ALLOWED_ORIGINS  comma-separated list for CORS
    SITE_URL         absolute base for the email's images and links
    RATE_LIMIT_MAX   signups per IP per 10 minutes (default 5)
    ADMIN_TOKEN      secret, guards the CSV export
=======================================================*/
"use strict";

const http = require("http");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "LumenEars <onboarding@resend.dev>";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
// Absolute, because an email has no origin to resolve relative URLs against.
const SITE_URL = (process.env.SITE_URL || "https://lumenears.com").replace(/\/$/, "");

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

// Render's internal database hostname has no dot in it and speaks plaintext
// inside the private network; the external one is a real domain and needs TLS.
const databaseUrl = process.env.DATABASE_URL || "";
const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /\.render\.com/.test(databaseUrl) ? { rejectUnauthorized: false } : false,
    max: 5
});

/* -------------------------------------------------------
   Schema. Kept here rather than in a migration tool so a
   fresh database is usable the moment the service boots.
------------------------------------------------------- */
const SCHEMA = `
    CREATE TABLE IF NOT EXISTS waitlist (
        id                 bigserial PRIMARY KEY,
        email              text,
        phone              text,
        source             text,
        user_agent         text,
        created_at         timestamptz NOT NULL DEFAULT now(),
        confirmation_sent  boolean NOT NULL DEFAULT false
    );

    -- Signups arrived as email-only before the popup offered SMS, so the
    -- live table needs bringing forward. All of this is a no-op on a table
    -- that already looks like the definition above.
    ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS phone text;
    ALTER TABLE waitlist ALTER COLUMN email DROP NOT NULL;

    ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_contact_present;
    ALTER TABLE waitlist ADD CONSTRAINT waitlist_contact_present
        CHECK (email IS NOT NULL OR phone IS NOT NULL);

    -- NULLs are distinct in a Postgres unique index, so someone who left
    -- only a phone number does not collide with everyone else who did.
    CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_key
        ON waitlist (lower(email));

    CREATE UNIQUE INDEX IF NOT EXISTS waitlist_phone_key
        ON waitlist (phone);
`;

let ready = pool.query(SCHEMA).catch((error) => {
    console.error("schema setup failed:", error.message);
    // Rethrow on the next await so /healthz reports the service as unhealthy
    // instead of silently accepting signups it cannot store.
    throw error;
});

/* -------------------------------------------------------
   A signup is a handful of requests a day, so the rate
   limiter is a Map rather than Redis. It exists to blunt a
   bored script, not to survive a real flood.
------------------------------------------------------- */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = Number(process.env.RATE_LIMIT_MAX || 5);
const hits = new Map();

function rateLimited(ip) {
    const now = Date.now();
    const seen = (hits.get(ip) || []).filter((time) => now - time < WINDOW_MS);

    seen.push(now);
    hits.set(ip, seen);

    if (hits.size > 5000) {
        for (const [key, times] of hits) {
            if (!times.length || now - times[times.length - 1] > WINDOW_MS) {
                hits.delete(key);
            }
        }
    }

    return seen.length > MAX_PER_WINDOW;
}

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */
// Deliberately loose: the confirmation email is what actually proves an
// address works, so this only rejects what is obviously not an address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Stored E.164 so a number typed as (949) 555-0134 and one typed as
// +1 949 555 0134 are the same person to the unique index.
function normalizePhone(raw) {
    const input = String(raw).trim();

    if (!input) {
        return null;
    }

    const digits = input.replace(/\D/g, "");

    // A bare 10-digit number is North American; this campaign ships from
    // California, so that assumption is the friendly one.
    if (!input.startsWith("+") && digits.length === 10) {
        return "+1" + digits;
    }

    if (!input.startsWith("+") && digits.length === 11 && digits.startsWith("1")) {
        return "+" + digits;
    }

    if (digits.length < 8 || digits.length > 15) {
        return null;
    }

    return "+" + digits;
}

function corsHeaders(origin) {
    const headers = {
        Vary: "Origin",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
    };

    if (origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))) {
        headers["Access-Control-Allow-Origin"] = origin;
    }

    return headers;
}

function send(res, status, body, extraHeaders) {
    const payload = typeof body === "string" ? body : JSON.stringify(body);

    res.writeHead(status, Object.assign({
        "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    }, extraHeaders || {}));

    res.end(payload);
}

function readJson(req, limitBytes) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let raw = "";

        req.on("data", (chunk) => {
            size += chunk.length;

            if (size > limitBytes) {
                reject(new Error("body too large"));
                req.destroy();
                return;
            }

            raw += chunk;
        });

        req.on("end", () => {
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error("body is not JSON"));
            }
        });

        req.on("error", reject);
    });
}

function clientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") ||
        req.socket.remoteAddress ||
        "unknown";
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

/* -------------------------------------------------------
   Confirmation email
------------------------------------------------------- */
async function sendConfirmation(email) {
    if (!RESEND_API_KEY) {
        console.warn("RESEND_API_KEY is unset — stored the signup, skipped the email");
        return false;
    }

    const safeEmail = escapeHtml(email);

    // Inline styles and a table-free layout: every desktop client strips
    // <style> blocks, and dark backgrounds are the first thing they break.
    const html = `
<div style="margin:0;padding:24px 12px;background:#050915;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:540px;margin:0 auto;background:#0b1129;border:1px solid #24325c;border-radius:18px;overflow:hidden">

    <div style="height:4px;background:linear-gradient(90deg,#4cc9ff 0%,#6c4cff 100%)"></div>

    <!-- Remote images: every client blocks these by default, so nothing here
         carries meaning the words do not repeat. -->
    <a href="${SITE_URL}" style="text-decoration:none">
      <img src="${SITE_URL}/images/email/hero.jpg" width="540" alt="The LumenEars headband: two round full-color screens on a light blue band, each showing an animated nebula."
        style="display:block;width:100%;max-width:540px;height:auto;border:0">
    </a>

    <div style="padding:36px 34px 30px">
      <p style="margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#4cc9ff;font-weight:600">
        LumenEars
      </p>

      <h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;color:#ffffff;font-weight:700">
        You're in.
      </h1>

      <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#c2cee9">
        Thanks for joining. LumenEars is a headband with two full-color screens where the ears
        would be &mdash; characters walk, blink and play across them in real time, and they react
        when you move.
      </p>

      <div style="margin:26px 0;padding:20px 22px;background:#0f1733;border:1px solid #24325c;border-radius:14px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8b9ac0;font-weight:600">
          What happens next
        </p>
        <p style="margin:0;font-size:15px;line-height:1.65;color:#e8eefc">
          We'll email <strong style="color:#ffffff">${safeEmail}</strong> once, the day the Kickstarter
          campaign goes live. That email has the campaign link and the launch-day pledge tiers, which
          are the lowest LumenEars will ever be priced.
        </p>
      </div>

      <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#c2cee9">
        That's it. No newsletter, no drip campaign, nothing in between.
      </p>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#c2cee9">
        Worth doing now: add <strong style="color:#ffffff">help@lumenears.com</strong> to your contacts,
        so launch day doesn't land in spam. It's the one email that matters.
      </p>
    </div>

    <div style="padding:0 34px">
      <img src="${SITE_URL}/images/email/cast.jpg" width="472" alt="The eight launch characters: an elephant, an ice queen, a fox, a forest guardian, a dragon, a lion, a mermaid and more, against a starfield."
        style="display:block;width:100%;height:auto;border:1px solid #24325c;border-radius:12px">
      <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#8b9ac0;text-align:center">
        Eight characters come with every headband at launch.
      </p>
    </div>

    <div style="padding:28px 34px 30px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#c2cee9">
        Want to watch it come together in the meantime? We post prototypes, new characters and
        behind-the-scenes progress here:
      </p>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.9">
        <a href="https://www.instagram.com/lumen.ears/" style="color:#4cc9ff;text-decoration:none;font-weight:600">Instagram &rarr; @lumen.ears</a><br>
        <a href="https://www.tiktok.com/@lumen.ears" style="color:#4cc9ff;text-decoration:none;font-weight:600">TikTok &rarr; @lumen.ears</a><br>
        <a href="${SITE_URL}" style="color:#4cc9ff;text-decoration:none;font-weight:600">lumenears.com</a>
      </p>

      <p style="margin:0;font-size:15px;line-height:1.6;color:#8b9ac0">
        &mdash; Conner &amp; Eesha<br>
        <span style="font-size:13px">LumenEars &middot; Irvine, California</span>
      </p>
    </div>

    <div style="padding:18px 34px 24px;border-top:1px solid #1a2547">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6d7c9d">
        Didn't sign up? Ignore this email and you'll hear nothing further, or reply and we'll remove
        the address.
      </p>
    </div>

  </div>
</div>
    `.trim();

    const text = [
        "You're in.",
        "",
        "Thanks for joining. LumenEars is a headband with two full-color screens where",
        "the ears would be — characters walk, blink and play across them in real time,",
        "and they react when you move.",
        "",
        "WHAT HAPPENS NEXT",
        "",
        "We'll email you once, the day the Kickstarter campaign goes live. That email",
        "has the campaign link and the launch-day pledge tiers, which are the lowest",
        "LumenEars will ever be priced.",
        "",
        "That's it. No newsletter, no drip campaign, nothing in between.",
        "",
        "Worth doing now: add help@lumenears.com to your contacts, so launch day",
        "doesn't land in spam. It's the one email that matters.",
        "",
        "FOLLOW ALONG",
        "",
        "We post prototypes, new characters and behind-the-scenes progress here:",
        "",
        "  Instagram   https://www.instagram.com/lumen.ears/",
        "  TikTok      https://www.tiktok.com/@lumen.ears",
        "  Website     " + SITE_URL,
        "",
        "— Conner & Eesha",
        "LumenEars · Irvine, California",
        "",
        "Didn't sign up? Ignore this email, or reply and we'll remove the address."
    ].join("\n");

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: RESEND_FROM,
            to: [email],
            subject: "You're on the LumenEars waitlist",
            html,
            text
        })
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    return true;
}

/* -------------------------------------------------------
   Routes
------------------------------------------------------- */
async function handleSignup(req, res, headers) {
    if (rateLimited(clientIp(req))) {
        send(res, 429, { ok: false, error: "Too many signups from this address. Try again later." }, headers);
        return;
    }

    let body;

    try {
        body = await readJson(req, 4096);
    } catch (error) {
        send(res, 400, { ok: false, error: "Could not read that request." }, headers);
        return;
    }

    // Bots fill in every field they find; the popup keeps this one hidden and
    // empty, so anything in it is not a person.
    if (body.company) {
        send(res, 200, { ok: true, alreadyOnList: false }, headers);
        return;
    }

    // The popup offers a phone number first and an email address behind a
    // toggle, so exactly one of these normally arrives. Either is enough.
    const rawEmail = String(body.email || "").trim().toLowerCase();
    const email = rawEmail && EMAIL_RE.test(rawEmail) && rawEmail.length <= 254 ? rawEmail : null;
    const phone = body.phone ? normalizePhone(body.phone) : null;

    if (!email && !phone) {
        send(res, 400, {
            ok: false,
            error: rawEmail || body.phone
                ? "That doesn't look like a valid number or email."
                : "Leave a mobile number or an email address."
        }, headers);
        return;
    }

    await ready;

    const source = String(body.source || "popup").slice(0, 60);
    const agent = String(req.headers["user-agent"] || "").slice(0, 300);

    // ON CONFLICT takes one target, so the channel that identifies this
    // signup decides which unique index guards it.
    const inserted = email
        ? await pool.query(
            `INSERT INTO waitlist (email, phone, source, user_agent)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (lower(email)) DO NOTHING
             RETURNING id`,
            [email, phone, source, agent]
        )
        : await pool.query(
            `INSERT INTO waitlist (email, phone, source, user_agent)
             VALUES (NULL, $1, $2, $3)
             ON CONFLICT (phone) DO NOTHING
             RETURNING id`,
            [phone, source, agent]
        );

    // Already on the list: say so plainly and send nothing. Re-sending the
    // confirmation on every repeat submit would turn the form into a way to
    // mailbomb someone else's address.
    if (inserted.rowCount === 0) {
        send(res, 200, { ok: true, alreadyOnList: true }, headers);
        return;
    }

    send(res, 200, { ok: true, alreadyOnList: false }, headers);

    // Nothing to confirm for an SMS signup: there is no SMS provider wired
    // up, so those numbers wait for the launch message to be sent by hand.
    if (!email) {
        return;
    }

    // The signup is safely stored, so the email is best-effort from here.
    try {
        const sent = await sendConfirmation(email);

        if (sent) {
            await pool.query("UPDATE waitlist SET confirmation_sent = true WHERE id = $1", [inserted.rows[0].id]);
        }
    } catch (error) {
        console.error("confirmation email failed:", error.message);
    }
}

async function handleExport(req, res, url, headers) {
    if (!ADMIN_TOKEN || url.searchParams.get("token") !== ADMIN_TOKEN) {
        send(res, 401, { ok: false, error: "Unauthorized" }, headers);
        return;
    }

    await ready;

    const { rows } = await pool.query(
        "SELECT email, phone, source, created_at, confirmation_sent FROM waitlist ORDER BY created_at"
    );

    const csv = ["email,phone,source,created_at,confirmation_sent"]
        .concat(rows.map((row) => [
            row.email || "",
            row.phone || "",
            row.source || "",
            row.created_at.toISOString(),
            row.confirmation_sent
        ].join(",")))
        .join("\n");

    send(res, 200, csv, Object.assign({}, headers, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="lumenears-waitlist.csv"'
    }));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const headers = corsHeaders(req.headers.origin);

    try {
        if (req.method === "OPTIONS") {
            send(res, 204, "", headers);
            return;
        }

        if (req.method === "GET" && url.pathname === "/healthz") {
            await ready;
            await pool.query("SELECT 1");
            send(res, 200, { ok: true }, headers);
            return;
        }

        if (req.method === "POST" && url.pathname === "/waitlist") {
            await handleSignup(req, res, headers);
            return;
        }

        if (req.method === "GET" && url.pathname === "/waitlist/export") {
            await handleExport(req, res, url, headers);
            return;
        }

        send(res, 404, { ok: false, error: "Not found" }, headers);
    } catch (error) {
        console.error(`${req.method} ${url.pathname} failed:`, error);

        if (!res.headersSent) {
            send(res, 500, { ok: false, error: "Something went wrong on our end." }, headers);
        }
    }
});

server.listen(PORT, () => {
    console.log(`waitlist api listening on ${PORT}`);
});

// Render sends SIGTERM on deploy; finish in-flight writes before going away.
process.on("SIGTERM", () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
});
