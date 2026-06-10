// Fixpre — Organizasyon verisi (token korumalı; her org kendi satırı)
//  GET  -> { data, updatedAt }   (yalnızca token'ın org'u)
//  PUT  {data} -> kaydeder       (yalnızca token'ın org'u)
const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");

function readToken(req) {
  const a = req.headers["authorization"] || "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], process.env.JWT_SECRET); } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) { res.status(500).json({ error: "server_not_configured" }); return; }
  const claim = readToken(req);
  if (!claim) { res.status(401).json({ error: "no_token" }); return; }
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`create table if not exists org_state (
      org_id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now()
    )`;

    if (req.method === "GET") {
      const rows = await sql`select data, updated_at from org_state where org_id = ${claim.org}`;
      res.status(200).json(rows.length ? { data: rows[0].data, updatedAt: rows[0].updated_at } : { data: null, updatedAt: null });
      return;
    }
    if (req.method === "PUT") {
      let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const data = body && body.data;
      if (data === undefined || data === null) { res.status(400).json({ error: "no_data" }); return; }
      const r = await sql`
        insert into org_state (org_id, data, updated_at) values (${claim.org}, ${JSON.stringify(data)}::jsonb, now())
        on conflict (org_id) do update set data = excluded.data, updated_at = now()
        returning updated_at`;
      res.status(200).json({ ok: true, updatedAt: r[0].updated_at });
      return;
    }
    res.status(405).json({ error: "method" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
