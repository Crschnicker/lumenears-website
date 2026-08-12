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
    ADMIN_TOKEN      secret, guards the CSV export
=======================================================*/
"use strict";

const http = require("http");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "LumenEars <onboarding@resend.dev>";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

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
        email              text NOT NULL,
        source             text,
        user_agent         text,
        created_at         timestamptz NOT NULL DEFAULT now(),
        confirmation_sent  boolean NOT NULL DEFAULT false
    );

    CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_key
        ON waitlist (lower(email));
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
const MAX_PER_WINDOW = 5;
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

    const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b1129;color:#e8eefc;padding:32px;border-radius:16px;max-width:520px">
            <h1 style="margin:0 0 16px;font-size:24px;color:#fff">You're on the LumenEars waitlist</h1>
            <p style="margin:0 0 14px;line-height:1.6;color:#c2cee9">
                Thanks for signing up. LumenEars is a headband with two full-color screens where
                the ears would be &mdash; characters walk, blink and play across them in real time.
            </p>
            <p style="margin:0 0 14px;line-height:1.6;color:#c2cee9">
                We'll email <strong style="color:#fff">${safeEmail}</strong> the moment the Kickstarter
                campaign goes live, with the launch-day pledge tiers. That's the only reason we'll write.
            </p>
            <p style="margin:24px 0 0;line-height:1.6;color:#8b9ac0;font-size:13px">
                Didn't sign up? Ignore this email and you'll hear nothing further, or reply and we'll
                remove the address.
            </p>
        </div>
    `;

    const text = [
        "You're on the LumenEars waitlist.",
        "",
        "Thanks for signing up. We'll email you the moment the Kickstarter campaign",
        "goes live, with the launch-day pledge tiers. That's the only reason we'll write.",
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

    const email = String(body.email || "").trim().toLowerCase();

    if (!EMAIL_RE.test(email) || email.length > 254) {
        send(res, 400, { ok: false, error: "That email address doesn't look right." }, headers);
        return;
    }

    await ready;

    const inserted = await pool.query(
        `INSERT INTO waitlist (email, source, user_agent)
         VALUES ($1, $2, $3)
         ON CONFLICT (lower(email)) DO NOTHING
         RETURNING id`,
        [email, String(body.source || "popup").slice(0, 60), String(req.headers["user-agent"] || "").slice(0, 300)]
    );

    // Already on the list: say so plainly and send nothing. Re-sending the
    // confirmation on every repeat submit would turn the form into a way to
    // mailbomb someone else's address.
    if (inserted.rowCount === 0) {
        send(res, 200, { ok: true, alreadyOnList: true }, headers);
        return;
    }

    send(res, 200, { ok: true, alreadyOnList: false }, headers);

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
        "SELECT email, source, created_at, confirmation_sent FROM waitlist ORDER BY created_at"
    );

    const csv = ["email,source,created_at,confirmation_sent"]
        .concat(rows.map((row) => [
            row.email,
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
