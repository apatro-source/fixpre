// Fixpre — Organizasyon verisi (token korumalı; her org kendi satırı)
//  GET  -> { data, updatedAt }   (yalnızca token'ın org'u)
//  PUT  {data} -> kaydeder       (yalnızca token'ın org'u)
const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");

const SUPER_EMAIL = "h.dirmilli48@gmail.com";

function readToken(req) {
  const a = req.headers["authorization"] || "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], process.env.JWT_SECRET); } catch (e) { return null; }
}

const DEMO_PLAN = { maxVenues: 1, maxStaff: 4, maxChefs: 1, unlimited: false, expiresAt: null, expired: false, daysLeft: null };

async function getPlan(sql, orgId) {
  const owner = await sql`select email from accounts where org_id = ${orgId} and role = 'yonetici' limit 1`;
  if (owner.length && owner[0].email === SUPER_EMAIL) return { maxVenues: 999999, maxStaff: 999999, maxChefs: 999999, unlimited: true, expiresAt: null, expired: false, daysLeft: null };
  const p = await sql`select max_venues, max_staff, max_chefs, unlimited, expires_at from org_plans where org_id = ${orgId}`;
  if (!p.length) return { ...DEMO_PLAN };
  const row = p[0];
  const exp = row.expires_at ? new Date(row.expires_at) : null;
  const now = Date.now();
  if (exp && exp.getTime() <= now) return { ...DEMO_PLAN, expiresAt: exp.toISOString(), expired: true, daysLeft: 0 };
  const daysLeft = exp ? Math.ceil((exp.getTime() - now) / 86400000) : null;
  return { maxVenues: row.max_venues, maxStaff: row.max_staff, maxChefs: row.max_chefs, unlimited: row.unlimited, expiresAt: exp ? exp.toISOString() : null, expired: false, daysLeft };
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
    await sql`create table if not exists org_plans (
      org_id text primary key, max_venues int not null default 1, max_staff int not null default 4,
      max_chefs int not null default 1, unlimited boolean not null default false, updated_at timestamptz default now()
    )`;
    await sql`alter table org_plans add column if not exists max_chefs int not null default 1`;
    await sql`alter table org_plans add column if not exists expires_at timestamptz`;

    if (req.method === "GET") {
      const plan = await getPlan(sql, claim.org);
      // Hafif sürüm kontrolü (?v=1): büyük jsonb'yi OKUMA, yalnızca zaman damgası + plan döndür.
      // Polling bunu kullanır; veri ancak updatedAt değişince tam indirilir (bant genişliği + Neon tasarrufu).
      if (req.query && (req.query.v || req.query.check)) {
        const vr = await sql`select (extract(epoch from updated_at)*1000)::bigint as ver from org_state where org_id = ${claim.org}`;
        res.status(200).json({ updatedAt: vr.length ? Number(vr[0].ver) : null, plan });
        return;
      }
      const rows = await sql`select data, (extract(epoch from updated_at)*1000)::bigint as ver from org_state where org_id = ${claim.org}`;
      res.status(200).json(rows.length
        ? { data: rows[0].data, updatedAt: Number(rows[0].ver), plan }
        : { data: null, updatedAt: null, plan });
      return;
    }
    if (req.method === "PUT") {
      let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const data = body && body.data;
      if (data === undefined || data === null) { res.status(400).json({ error: "no_data" }); return; }
      const baseVer = (body.baseUpdatedAt != null) ? Math.trunc(Number(body.baseUpdatedAt)) : null;

      // Sürüm kilidi: yalnızca istemcinin gördüğü sürüm = buluttaki sürüm ise yaz (eski veri üzerine yazamaz)
      let r = [];
      if (baseVer != null) {
        r = await sql`update org_state set data = ${JSON.stringify(data)}::jsonb, updated_at = now()
          where org_id = ${claim.org} and (extract(epoch from updated_at)*1000)::bigint = ${baseVer}
          returning (extract(epoch from updated_at)*1000)::bigint as ver`;
      }
      if (r.length) { res.status(200).json({ ok: true, updatedAt: Number(r[0].ver) }); return; }

      // Yazılamadı: ya satır yok (ilk yazım) ya da sürüm uyuşmuyor (çakışma)
      const cur = await sql`select data, (extract(epoch from updated_at)*1000)::bigint as ver from org_state where org_id = ${claim.org}`;
      if (!cur.length) {
        const ins = await sql`insert into org_state (org_id, data, updated_at) values (${claim.org}, ${JSON.stringify(data)}::jsonb, now())
          returning (extract(epoch from updated_at)*1000)::bigint as ver`;
        res.status(200).json({ ok: true, updatedAt: Number(ins[0].ver) });
        return;
      }
      // Çakışma: bulutta daha yeni veri var -> ESKİYLE YAZMA, mevcut veriyi döndür
      res.status(409).json({ conflict: true, data: cur[0].data, updatedAt: Number(cur[0].ver) });
      return;
    }
    res.status(405).json({ error: "method" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
