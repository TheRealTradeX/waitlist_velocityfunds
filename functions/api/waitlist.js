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
        email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )`
    )
    .run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS ${table}_created_at_idx ON ${table} (created_at)`).run();
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

  try {
    await ensureTable(db, table);

    await db
      .prepare(`INSERT INTO ${table} (email, created_at) VALUES (?1, ?2)`)
      .bind(email, new Date().toISOString())
      .run();

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

    console.error(error);
    return json(500, { error: "Unable to save your email right now." });
  }
}
