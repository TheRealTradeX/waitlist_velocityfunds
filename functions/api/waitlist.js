const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WAITLIST_COOKIE = "vf_waitlist_id";
const DEFAULT_TABLE = "waitlist_signups";
const TABLE_RE = /^[A-Za-z0-9_]+$/;

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

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function buildCookieHeader(name, value, { secure = false, maxAge = 31536000 } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", `Max-Age=${maxAge}`, "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function createId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getLocation(request) {
  const cf = request.cf || {};
  return {
    country: cf.country || request.headers.get("CF-IPCountry") || null,
    region: cf.region || cf.regionCode || null,
    city: cf.city || null,
    postal_code: cf.postalCode || null,
    timezone: cf.timezone || null,
    latitude: typeof cf.latitude === "number" ? cf.latitude : null,
    longitude: typeof cf.longitude === "number" ? cf.longitude : null,
    continent: cf.continent || null,
  };
}

function getUtmParams(pageUrl, payloadUtm) {
  if (payloadUtm && typeof payloadUtm === "object") {
    const { source, medium, campaign, term, content } = payloadUtm;
    if (source || medium || campaign || term || content) {
      return {
        source: cleanString(source),
        medium: cleanString(medium),
        campaign: cleanString(campaign),
        term: cleanString(term),
        content: cleanString(content),
      };
    }
  }
  if (!pageUrl) return null;
  try {
    const url = new URL(pageUrl);
    const params = url.searchParams;
    const utm = {
      source: params.get("utm_source"),
      medium: params.get("utm_medium"),
      campaign: params.get("utm_campaign"),
      term: params.get("utm_term"),
      content: params.get("utm_content"),
    };
    const hasValue = Object.values(utm).some((value) => value);
    return hasValue ? utm : null;
  } catch {
    return null;
  }
}

function getSourceIp(request) {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (!forwardedFor) return null;
  return forwardedFor.split(",")[0].trim();
}

function safeTableName(value) {
  const candidate = cleanString(value);
  if (candidate && TABLE_RE.test(candidate)) return candidate;
  return DEFAULT_TABLE;
}

async function ensureTable(db, table) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        email_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        ip_address TEXT,
        cookie_id TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        postal_code TEXT,
        timezone TEXT,
        latitude REAL,
        longitude REAL,
        continent TEXT,
        user_agent TEXT,
        accept_language TEXT,
        locale TEXT,
        client_time TEXT,
        page_url TEXT,
        referrer TEXT,
        cookies_enabled INTEGER,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        utm_term TEXT,
        utm_content TEXT,
        location_json TEXT,
        client_context_json TEXT
      )`
    )
    .run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS ${table}_created_at_idx ON ${table} (created_at)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS ${table}_country_idx ON ${table} (country)`).run();
}

async function insertWaitlistRecord(db, table, record) {
  const statement = db.prepare(
    `INSERT INTO ${table} (
      email,
      email_hash,
      created_at,
      ip_address,
      cookie_id,
      country,
      region,
      city,
      postal_code,
      timezone,
      latitude,
      longitude,
      continent,
      user_agent,
      accept_language,
      locale,
      client_time,
      page_url,
      referrer,
      cookies_enabled,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      location_json,
      client_context_json
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5,
      ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
      ?14, ?15, ?16, ?17, ?18, ?19, ?20,
      ?21, ?22, ?23, ?24, ?25,
      ?26, ?27
    )`
  );

  return statement
    .bind(
      record.email,
      record.email_hash,
      record.created_at,
      record.ip_address,
      record.cookie_id,
      record.country,
      record.region,
      record.city,
      record.postal_code,
      record.timezone,
      record.latitude,
      record.longitude,
      record.continent,
      record.user_agent,
      record.accept_language,
      record.locale,
      record.client_time,
      record.page_url,
      record.referrer,
      record.cookies_enabled,
      record.utm_source,
      record.utm_medium,
      record.utm_campaign,
      record.utm_term,
      record.utm_content,
      record.location_json,
      record.client_context_json
    )
    .run();
}

function buildWaitlistEmail() {
  const subject = "You are on the Velocity Funds waitlist";
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; background:#0b0b0b; color:#ffffff; padding:24px;">
      <div style="max-width:520px; margin:0 auto; background:#0f1115; border:1px solid #1f2937; border-radius:16px; padding:24px;">
        <p style="letter-spacing:0.2em; text-transform:uppercase; color:#34d399; font-size:12px; margin:0 0 12px;">Velocity Funds</p>
        <h1 style="font-size:24px; margin:0 0 12px;">You are on the list.</h1>
        <p style="margin:0 0 16px; color:#d1d5db; line-height:1.6;">
          Thanks for joining the Velocity Funds launch waitlist. We will send launch updates and early access details.
        </p>
        <div style="border-top:1px solid #1f2937; padding-top:16px; margin-top:16px;">
          <p style="margin:0 0 8px; color:#9ca3af; font-size:14px;">What happens next</p>
          <ul style="margin:0; padding-left:18px; color:#d1d5db; line-height:1.6;">
            <li>Launch timeline and access window</li>
            <li>Onboarding checklist and platform overview</li>
            <li>Founder updates and announcements</li>
          </ul>
        </div>
        <p style="margin:16px 0 0; color:#6b7280; font-size:12px;">If you did not request this, you can ignore this email.</p>
      </div>
    </div>
  `;
  const text = [
    "You are on the Velocity Funds waitlist.",
    "Thanks for joining the Velocity Funds launch waitlist. We will send launch updates and early access details.",
    "What happens next:",
    "- Launch timeline and access window",
    "- Onboarding checklist and platform overview",
    "- Founder updates and announcements",
  ].join("\n");

  return { subject, html, text };
}

async function sendResendEmail(env, email) {
  const apiKey = cleanString(env.RESEND_API_KEY);
  const from = cleanString(env.RESEND_FROM_EMAIL) || cleanString(env.RESEND_FROM);
  const replyTo = cleanString(env.RESEND_REPLY_TO);

  if (!apiKey || !from) {
    return { status: "skipped" };
  }

  const content = buildWaitlistEmail();
  const payload = {
    from,
    to: [email],
    subject: content.subject,
    html: content.html,
    text: content.text,
  };

  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend error: ${response.status} ${errorText}`);
  }

  return { status: "sent" };
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON payload." });
  }

  const body = payload && typeof payload === "object" ? payload : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(email)) {
    return json(400, { error: "A valid email address is required." });
  }

  const db = env.WAITLIST_DB;
  if (!db) return json(500, { error: "WAITLIST_DB binding is not configured." });

  const table = safeTableName(env.WAITLIST_TABLE);

  const cookieHeader = request.headers.get("Cookie") || "";
  const existingCookieId = getCookie(cookieHeader, WAITLIST_COOKIE);
  const cookieId = existingCookieId || cleanString(body.cookie_id) || createId();
  const now = new Date().toISOString();
  const emailHash = await sha256(email);

  const pageUrl = cleanUrl(body.page_url);
  const utm = getUtmParams(pageUrl, body.utm);
  const location = getLocation(request);

  const clientContext = {
    user_agent: cleanString(request.headers.get("User-Agent")),
    accept_language: cleanString(request.headers.get("Accept-Language")),
    locale: cleanString(body.locale),
    timezone: cleanString(body.timezone),
    client_time: cleanString(body.client_time),
    page_url: pageUrl,
    referrer: cleanUrl(body.referrer),
    cookies_enabled: typeof body.cookies_enabled === "boolean" ? body.cookies_enabled : null,
    utm,
  };

  const record = {
    email,
    email_hash: emailHash,
    created_at: now,
    ip_address: getSourceIp(request),
    cookie_id: cookieId,
    country: location.country,
    region: location.region,
    city: location.city,
    postal_code: location.postal_code,
    timezone: location.timezone || clientContext.timezone,
    latitude: location.latitude,
    longitude: location.longitude,
    continent: location.continent,
    user_agent: clientContext.user_agent,
    accept_language: clientContext.accept_language,
    locale: clientContext.locale,
    client_time: clientContext.client_time,
    page_url: clientContext.page_url,
    referrer: clientContext.referrer,
    cookies_enabled: typeof clientContext.cookies_enabled === "boolean" ? Number(clientContext.cookies_enabled) : null,
    utm_source: utm?.source || null,
    utm_medium: utm?.medium || null,
    utm_campaign: utm?.campaign || null,
    utm_term: utm?.term || null,
    utm_content: utm?.content || null,
    location_json: JSON.stringify(location),
    client_context_json: JSON.stringify(clientContext),
  };

  const responseHeaders = {};
  if (!existingCookieId) {
    responseHeaders["Set-Cookie"] = buildCookieHeader(WAITLIST_COOKIE, cookieId, {
      secure: request.url.startsWith("https://"),
    });
  }

  try {
    await ensureTable(db, table);
    await insertWaitlistRecord(db, table, record);

    let emailStatus = "skipped";
    try {
      const emailResult = await sendResendEmail(env, email);
      emailStatus = emailResult.status;
    } catch (error) {
      console.error(error);
      emailStatus = "failed";
    }

    return json(
      200,
      {
        ok: true,
        email_status: emailStatus,
        message: "You are on the Velocity Funds waitlist. We will keep you posted.",
      },
      responseHeaders
    );
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes("unique")) {
      return json(
        409,
        {
          ok: false,
          message: "You are already on the waitlist. We will keep you posted.",
        },
        responseHeaders
      );
    }
    console.error(error);
    return json(500, { error: "Unable to save your email right now." }, responseHeaders);
  }
}
