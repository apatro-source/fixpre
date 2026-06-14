// Fixpre — Paket ilgi/iletişim talepleri (lead)
//  POST {email, name, staff, chefs, venues, note, orgId}  -> kaydeder (herkes, auth gerekmez)
//  GET  -> { leads }  (yalnızca süper admin token'ı)
const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");

const SUPER_EMAIL = "h.dirmilli48@gmail.com";

function readToken(req) {
  const a = req.headers["authorization"] || "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], process.env.JWT_SECRET); } catch (e) { return null; }
}
function genId() { return "lead_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

module.exports = async (req, res) => {
  if (!process.env.DATABASE_URL) { res.status(500).json({ error: "server_not_configured" }); return; }
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`create table if not exists leads (
      id text primary key, email text, name text,
      staff int default 0, chefs int default 0, venues int default 0,
      note text, org_id text, created_at timestamptz default now()
    )`;
    await sql`alter table leads add column if not exists business text`;

    if (req.method === "POST") {
      let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const email = (body.email || "").trim().toLowerCase();
      if (!email || email.length > 160) { res.status(400).json({ error: "missing_email" }); return; }
      const name = (body.name || "").trim().slice(0, 120);
      const business = (body.business || "").trim().slice(0, 160);
      const note = (body.note || "").trim().slice(0, 1000);
      const staff = Math.max(0, parseInt(body.staff, 10) || 0);
      const chefs = Math.max(0, parseInt(body.chefs, 10) || 0);
      const venues = Math.max(0, parseInt(body.venues, 10) || 0);
      const orgId = (body.orgId || "").toString().slice(0, 64);
      await sql`insert into leads (id, email, name, business, staff, chefs, venues, note, org_id)
        values (${genId()}, ${email}, ${name}, ${business}, ${staff}, ${chefs}, ${venues}, ${note}, ${orgId})`;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "GET") {
      const claim = readToken(req);
      if (!claim) { res.status(401).json({ error: "no_token" }); return; }
      const me = await sql`select email from accounts where id = ${claim.uid}`;
      if (!me.length || me[0].email !== SUPER_EMAIL) { res.status(403).json({ error: "forbidden" }); return; }
      const rows = await sql`select id, email, name, business, staff, chefs, venues, note, org_id, created_at
        from leads order by created_at desc limit 500`;
      res.status(200).json({ leads: rows });
      return;
    }

    res.status(405).json({ error: "method" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
