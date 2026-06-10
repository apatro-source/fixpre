// Fixpre — Güvenli kimlik doğrulama (hash'li şifre + JWT)
//  POST {action:"register", name, email, password}
//  POST {action:"login", email, password}
//  POST {action:"createUser", name, email, password, role, } (Bearer token)
//  POST {action:"setPassword", userId?, password}            (Bearer token)
//  POST {action:"updateEmail", userId, email}                (Bearer token)
//  POST {action:"deleteUser", userId}                        (Bearer token)
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");

function genId(p) { return (p || "id_") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function sign(payload) { return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "180d" }); }
function readToken(req) {
  const a = req.headers["authorization"] || "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], process.env.JWT_SECRET); } catch (e) { return null; }
}
async function initTables(sql) {
  await sql`create table if not exists accounts (
    id text primary key, org_id text not null, email text unique not null,
    password_hash text not null, role text not null, created_at timestamptz default now()
  )`;
  await sql`create table if not exists org_state (
    org_id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now()
  )`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) { res.status(500).json({ error: "server_not_configured" }); return; }
  const sql = neon(process.env.DATABASE_URL);
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const action = body && body.action;

  try {
    await initTables(sql);

    if (action === "register") {
      const name = (body.name || "").trim();
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      if (!name || !email || !password) { res.status(400).json({ error: "missing" }); return; }
      const ex = await sql`select 1 from accounts where email = ${email}`;
      if (ex.length) { res.status(409).json({ error: "email_taken" }); return; }
      const orgId = genId("org_");
      const userId = genId("id_");
      const hash = await bcrypt.hash(password, 10);
      await sql`insert into accounts (id, org_id, email, password_hash, role) values (${userId}, ${orgId}, ${email}, ${hash}, 'yonetici')`;
      const data = {
        users: [{ id: userId, role: "yonetici", name, email, ownerId: orgId, managerId: null, venueIds: [], lang: "tr" }],
        venues: [], tasks: [], reports: [], undoLog: [], leaves: [], announcements: [],
      };
      await sql`insert into org_state (org_id, data, updated_at) values (${orgId}, ${JSON.stringify(data)}::jsonb, now())`;
      res.status(200).json({ token: sign({ uid: userId, org: orgId, role: "yonetici" }), userId, data });
      return;
    }

    if (action === "login") {
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      const rows = await sql`select id, org_id, password_hash, role from accounts where email = ${email}`;
      if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
        res.status(401).json({ error: "bad_credentials" }); return;
      }
      const acc = rows[0];
      const st = await sql`select data from org_state where org_id = ${acc.org_id}`;
      res.status(200).json({ token: sign({ uid: acc.id, org: acc.org_id, role: acc.role }), userId: acc.id, data: st.length ? st[0].data : null });
      return;
    }

    // Buradan sonrası token ister
    const claim = readToken(req);
    if (!claim) { res.status(401).json({ error: "no_token" }); return; }

    if (action === "createUser") {
      const role = body.role;
      if (role !== "sef" && role !== "personel") { res.status(400).json({ error: "bad_role" }); return; }
      if (claim.role !== "yonetici" && claim.role !== "sef") { res.status(403).json({ error: "forbidden" }); return; }
      if (role === "sef" && claim.role !== "yonetici") { res.status(403).json({ error: "forbidden" }); return; }
      const name = (body.name || "").trim();
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      if (!name || !email || !password) { res.status(400).json({ error: "missing" }); return; }
      const ex = await sql`select 1 from accounts where email = ${email}`;
      if (ex.length) { res.status(409).json({ error: "email_taken" }); return; }
      const userId = genId("id_");
      const hash = await bcrypt.hash(password, 10);
      await sql`insert into accounts (id, org_id, email, password_hash, role) values (${userId}, ${claim.org}, ${email}, ${hash}, ${role})`;
      res.status(200).json({ userId });
      return;
    }

    if (action === "setPassword") {
      const userId = body.userId || claim.uid;
      const password = body.password || "";
      if (!password) { res.status(400).json({ error: "missing" }); return; }
      const rows = await sql`select org_id from accounts where id = ${userId}`;
      if (!rows.length || rows[0].org_id !== claim.org) { res.status(403).json({ error: "forbidden" }); return; }
      if (userId !== claim.uid && claim.role !== "yonetici" && claim.role !== "sef") { res.status(403).json({ error: "forbidden" }); return; }
      const hash = await bcrypt.hash(password, 10);
      await sql`update accounts set password_hash = ${hash} where id = ${userId}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "updateEmail") {
      const userId = body.userId || claim.uid;
      const email = (body.email || "").trim().toLowerCase();
      if (!email) { res.status(400).json({ error: "missing" }); return; }
      const rows = await sql`select org_id from accounts where id = ${userId}`;
      if (!rows.length || rows[0].org_id !== claim.org) { res.status(403).json({ error: "forbidden" }); return; }
      const ex = await sql`select 1 from accounts where email = ${email} and id <> ${userId}`;
      if (ex.length) { res.status(409).json({ error: "email_taken" }); return; }
      await sql`update accounts set email = ${email} where id = ${userId}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "deleteUser") {
      const userId = body.userId;
      if (claim.role !== "yonetici" && claim.role !== "sef") { res.status(403).json({ error: "forbidden" }); return; }
      const rows = await sql`select org_id from accounts where id = ${userId}`;
      if (rows.length && rows[0].org_id === claim.org) {
        await sql`delete from accounts where id = ${userId}`;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "unknown_action" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
