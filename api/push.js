// Fixpre — Web Push API'si
//  POST {type:"subscribe", userId, sub}          -> aboneliği kaydeder
//  POST {type:"notify", toUserIds:[...], title, body, url} -> push gönderir
const { neon } = require("@neondatabase/serverless");
const webpush = require("web-push");

const VAPID_PUBLIC = "BJ-IwLxYsUxi3FBjcdKbsTfRo-XkBRHE3kck5-lNIDAz_2hs085MnLWff2RHriSjmfouHdLnC_AzYPyqx8ZId4o";

module.exports = async (req, res) => {
  const key = req.headers["x-fixpre-key"];
  if (!process.env.FIXPRE_KEY || key !== process.env.FIXPRE_KEY) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!process.env.DATABASE_URL) { res.status(500).json({ error: "DATABASE_URL missing" }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method not allowed" }); return; }

  const sql = neon(process.env.DATABASE_URL);
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const type = body && body.type;

  try {
    await sql`create table if not exists push_subs (
      endpoint text primary key,
      user_id text not null,
      sub jsonb not null,
      updated_at timestamptz default now()
    )`;

    if (type === "subscribe") {
      const userId = body.userId;
      const sub = body.sub;
      if (!userId || !sub || !sub.endpoint) { res.status(400).json({ error: "bad sub" }); return; }
      await sql`insert into push_subs (endpoint, user_id, sub, updated_at)
        values (${sub.endpoint}, ${userId}, ${JSON.stringify(sub)}::jsonb, now())
        on conflict (endpoint) do update set user_id = excluded.user_id, sub = excluded.sub, updated_at = now()`;
      res.status(200).json({ ok: true });
      return;
    }

    if (type === "notify") {
      if (!process.env.VAPID_PRIVATE_KEY) { res.status(500).json({ error: "VAPID_PRIVATE_KEY missing" }); return; }
      const toUserIds = Array.isArray(body.toUserIds) ? body.toUserIds : [];
      if (!toUserIds.length) { res.status(200).json({ ok: true, sent: 0 }); return; }
      webpush.setVapidDetails("https://fixpre.com", VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY);
      const payload = JSON.stringify({ title: body.title || "Fixpre", body: body.body || "", url: body.url || "/" });
      const rows = await sql`select endpoint, sub, user_id from push_subs`;
      const targets = rows.filter((r) => toUserIds.includes(r.user_id));
      let sent = 0;
      for (const row of targets) {
        try { await webpush.sendNotification(row.sub, payload); sent++; }
        catch (err) {
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            await sql`delete from push_subs where endpoint = ${row.endpoint}`;
          }
        }
      }
      res.status(200).json({ ok: true, sent });
      return;
    }

    res.status(400).json({ error: "unknown type" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
