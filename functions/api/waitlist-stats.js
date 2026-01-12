const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
};

export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

const DEFAULT_TABLE = "waitlist_signups";
const TABLE_RE = /^[A-Za-z0-9_]+$/;

function json(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
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

function getAuthToken(request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const adminHeader = request.headers.get("X-Admin-Token");
  if (adminHeader) return adminHeader.trim();
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  return queryToken ? queryToken.trim() : null;
}

export async function onRequestGet({ request, env }) {
  const token = cleanString(env.WAITLIST_STATS_TOKEN);
  if (!token) return json(403, { error: "WAITLIST_STATS_TOKEN is not configured." });

  const provided = cleanString(getAuthToken(request));
  if (!provided || provided !== token) return json(401, { error: "Unauthorized." });

  const db = env.WAITLIST_DB;
  if (!db) return json(500, { error: "WAITLIST_DB binding is not configured." });

  const table = safeTableName(env.WAITLIST_TABLE);
  await ensureTable(db, table);

  const totalRow = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  const total = Number(totalRow?.count) || 0;

  const byDay = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM ${table}
       GROUP BY day
       ORDER BY day DESC
       LIMIT 30`
    )
    .all();

  const recent = await db
    .prepare(
      `SELECT email, created_at
       FROM ${table}
       ORDER BY created_at DESC
       LIMIT 200`
    )
    .all();

  return json(200, {
    total,
    by_day: byDay?.results || [],
    recent: recent?.results || [],
  });
}
