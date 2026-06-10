// Fixpre — Neon (Postgres) durum API'si
// Tüm uygulama verisini tek bir JSON satırında saklar.
// GET  /api/state        -> { data, updatedAt }
// PUT  /api/state {data}  -> kaydeder
// Erişim: x-fixpre-key başlığı, Vercel'deki FIXPRE_KEY ortam değişkeniyle eşleşmeli.

const { neon } = require("@neondatabase/serverless");

module.exports = async (req, res) => {
  const key = req.headers["x-fixpre-key"];
  if (!process.env.FIXPRE_KEY || key !== process.env.FIXPRE_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "DATABASE_URL missing" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`create table if not exists app_state (
      id int primary key,
      data jsonb not null,
      updated_at timestamptz default now()
    )`;

    if (req.method === "GET") {
      const rows = await sql`select data, updated_at from app_state where id = 1`;
      res.status(200).json(rows.length
        ? { data: rows[0].data, updatedAt: rows[0].updated_at }
        : { data: null, updatedAt: null });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const data = body && body.data;
      if (data === undefined || data === null) { res.status(400).json({ error: "no data" }); return; }
      const r = await sql`
        insert into app_state (id, data, updated_at)
        values (1, ${JSON.stringify(data)}::jsonb, now())
        on conflict (id) do update set data = excluded.data, updated_at = now()
        returning updated_at`;
      res.status(200).json({ ok: true, updatedAt: r[0].updated_at });
      return;
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
