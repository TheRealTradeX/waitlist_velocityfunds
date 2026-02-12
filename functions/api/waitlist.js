const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEFAULT_TABLE = "waitlist_signups";
const TABLE_RE = /^[A-Za-z0-9_]+$/;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function json(status, body = {}, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function cleanString(value, maxLen = 2048) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  return trimmed.slice(0, maxLen);
}

function safeTableName(value) {
  const candidate = cleanString(value, 128);
  if (candidate && TABLE_RE.test(candidate)) return candidate;
  return DEFAULT_TABLE;
}

async function ensureTable(db, table) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        email_normalized TEXT,
        created_at TEXT NOT NULL,
        referrer TEXT,
        landing_path TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        utm_content TEXT,
        utm_term TEXT,
        country TEXT,
        user_agent TEXT,
        ip_hash TEXT,
        status TEXT,
        block_reason TEXT
      )`
    )
    .run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS ${table}_created_at_idx ON ${table} (created_at)`).run();
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

async function sha256Hex(value) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(turnstileToken, secret, ip) {
  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", turnstileToken);
  if (ip) formData.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!response.ok) return false;

  const result = await response.json().catch(() => null);
  return Boolean(result && result.success === true);
}

function getAttribution(body) {
  return {
    referrer: cleanString(body.referrer, 2048),
    landing_path: cleanString(body.landing_path, 2048),
    utm_source: cleanString(body.utm_source, 256),
    utm_medium: cleanString(body.utm_medium, 256),
    utm_campaign: cleanString(body.utm_campaign, 256),
    utm_content: cleanString(body.utm_content, 512),
    utm_term: cleanString(body.utm_term, 512),
  };
}

export function onRequestGet({ env }) {
  const turnstileSiteKey = cleanString(env.TURNSTILE_SITE_KEY, 256);
  if (!turnstileSiteKey) {
    return json(500, { error: "TURNSTILE_SITE_KEY is not configured." });
  }

  return json(200, { turnstileSiteKey }, { "Cache-Control": "no-store" });
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON payload." });
  }

  const body = payload && typeof payload === "object" ? payload : {};
  const email = cleanString(body.email, 320) || "";
  const emailNormalized = normalizeEmail(email);
  const turnstileToken = cleanString(body.turnstileToken, 2048);

  if (!EMAIL_REGEX.test(emailNormalized)) {
    return json(400, { error: "A valid email address is required." });
  }
  if (!turnstileToken) {
    return json(400, { error: "Verification token is required." });
  }

  const db = env.WAITLIST_DB;
  if (!db) return json(500, { error: "WAITLIST_DB binding is not configured." });

  const turnstileSecret = cleanString(env.TURNSTILE_SECRET, 256);
  if (!turnstileSecret) return json(500, { error: "TURNSTILE_SECRET is not configured." });

  const ipSalt = cleanString(env.IP_SALT, 256);
  if (!ipSalt) return json(500, { error: "IP_SALT is not configured." });

  const table = safeTableName(env.WAITLIST_TABLE);
  const createdAt = new Date().toISOString();
  const country = cleanString(request.headers.get("CF-IPCountry"), 8) || "XX";
  const userAgent = cleanString(request.headers.get("User-Agent"), 2048);
  const ip = cleanString(request.headers.get("CF-Connecting-IP"), 128);
  const ipHash = ip ? await sha256Hex(`${ip}${ipSalt}`) : null;
  const attribution = getAttribution(body);

  try {
    await ensureTable(db, table);

    const verified = await verifyTurnstile(turnstileToken, turnstileSecret, ip);
    if (!verified) return json(403, { error: "Verification failed." });

    const existing = await db
      .prepare(`SELECT id FROM ${table} WHERE email_normalized = ?1 LIMIT 1`)
      .bind(emailNormalized)
      .first();
    if (existing?.id) {
      return json(409, {
        ok: false,
        message: "You're already on the Velocity Funds waitlist.",
      });
    }

    let blockReason = null;
    let status = "accepted";
    if (ipHash) {
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const recentByIp = await db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ip_hash = ?1 AND created_at >= ?2`)
        .bind(ipHash, windowStart)
        .first();
      const count = Number(recentByIp?.count) || 0;
      if (count >= RATE_LIMIT_MAX) {
        status = "blocked";
        blockReason = "rate_limit";
      }
    }

    await db
      .prepare(
        `INSERT INTO ${table}
        (email, email_normalized, created_at, referrer, landing_path,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         country, user_agent, ip_hash, status, block_reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
      )
      .bind(
        email,
        emailNormalized,
        createdAt,
        attribution.referrer,
        attribution.landing_path,
        attribution.utm_source,
        attribution.utm_medium,
        attribution.utm_campaign,
        attribution.utm_content,
        attribution.utm_term,
        country,
        userAgent,
        ipHash,
        status,
        blockReason
      )
      .run();

    if (status === "blocked") {
      return json(429, { error: "Too many attempts. Please try again later." });
    }

    return json(200, {
      ok: true,
      message: "You're on the Velocity Funds waitlist.",
    });
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes("unique")) {
      return json(409, {
        ok: false,
        message: "You're already on the Velocity Funds waitlist.",
      });
    }
    if (message.includes("no such column")) {
      return json(500, { error: "Waitlist schema is out of date. Apply the migration in README." });
    }

    console.error(error);
    return json(500, { error: "Unable to save your email right now." });
  }
}
