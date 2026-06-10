// Fixpre — Eski tek-blob (app_state) veriyi yeni güvenli yapıya taşır.
// Her organizasyonu org_state satırına, her kullanıcıyı accounts'a (şifre hash'lenir) aktarır.
// Tek seferlik; FIXPRE_KEY ile korunur. ?force=1 ile yeniden çalıştırılabilir.
const bcrypt = require("bcryptjs");
const { neon } = require("@neondatabase/serverless");

module.exports = async (req, res) => {
  if (!process.env.FIXPRE_KEY || req.headers["x-fixpre-key"] !== process.env.FIXPRE_KEY) {
    res.status(401).json({ error: "unauthorized" }); return;
  }
  if (!process.env.DATABASE_URL) { res.status(500).json({ error: "no_db" }); return; }
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`create table if not exists accounts (
      id text primary key, org_id text not null, email text unique not null,
      password_hash text not null, role text not null, created_at timestamptz default now()
    )`;
    await sql`create table if not exists org_state (
      org_id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now()
    )`;

    const force = req.query && (req.query.force === "1" || req.query.force === "true");
    const acc = await sql`select count(*)::int as n from accounts`;
    if (acc[0].n > 0 && !force) { res.status(200).json({ ok: true, skipped: true, accounts: acc[0].n }); return; }

    const old = await sql`select data from app_state where id = 1`;
    if (!old.length || !old[0].data) { res.status(200).json({ ok: true, note: "app_state bulunamadı" }); return; }
    const data = old[0].data;
    const users = data.users || [];

    const orgs = {};
    const ensure = (org) => { if (!orgs[org]) orgs[org] = { users: [], venues: [], tasks: [], reports: [], undoLog: [], leaves: [], announcements: [] }; };
    users.forEach((u) => ensure(u.ownerId || u.id));
    users.forEach((u) => { const o = u.ownerId || u.id; if (orgs[o]) orgs[o].users.push(Object.assign({}, u)); });
    (data.venues || []).forEach((v) => { if (orgs[v.ownerId]) orgs[v.ownerId].venues.push(v); });
    (data.tasks || []).forEach((t) => { if (orgs[t.ownerId]) orgs[t.ownerId].tasks.push(t); });
    (data.reports || []).forEach((r) => { if (orgs[r.ownerId]) orgs[r.ownerId].reports.push(r); });
    (data.leaves || []).forEach((l) => { if (orgs[l.ownerId]) orgs[l.ownerId].leaves.push(l); });
    (data.announcements || []).forEach((a) => { if (orgs[a.ownerId]) orgs[a.ownerId].announcements.push(a); });
    (data.undoLog || []).forEach((x) => { if (orgs[x.ownerId]) orgs[x.ownerId].undoLog.push(x); });

    let orgsCreated = 0, accountsCreated = 0;
    for (const orgId of Object.keys(orgs)) {
      const od = orgs[orgId];
      for (const u of od.users) {
        if (u.email && u.password) {
          const email = String(u.email).trim().toLowerCase();
          const ex = await sql`select 1 from accounts where email = ${email}`;
          if (!ex.length) {
            const hash = await bcrypt.hash(String(u.password), 10);
            try {
              await sql`insert into accounts (id, org_id, email, password_hash, role) values (${u.id}, ${orgId}, ${email}, ${hash}, ${u.role || "personel"})`;
              accountsCreated++;
            } catch (e) { /* yinelenen e-posta vb. atla */ }
          }
        }
        delete u.password; // güvenli veride şifre tutulmaz
      }
      await sql`insert into org_state (org_id, data, updated_at) values (${orgId}, ${JSON.stringify(od)}::jsonb, now())
        on conflict (org_id) do update set data = excluded.data, updated_at = now()`;
      orgsCreated++;
    }
    res.status(200).json({ ok: true, orgsCreated, accountsCreated });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
