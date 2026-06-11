// Fixpre — Görev son-saat hatırlatması (cron ile periyodik çağrılır)
//  GET/POST ?key=FIXPRE_KEY  -> dueTime'a 1 saat kalan, bugün yapılmamış görevlerin atananlarına push
//  Saat dilimi: Türkiye (UTC+3). Aynı görev/gün için tek hatırlatma (reminders_sent tablosu).
const { neon } = require("@neondatabase/serverless");
const webpush = require("web-push");

const VAPID_PUBLIC = "BJ-IwLxYsUxi3FBjcdKbsTfRo-XkBRHE3kck5-lNIDAz_2hs085MnLWff2RHriSjmfouHdLnC_AzYPyqx8ZId4o";
const TZ_OFFSET_MIN = 3 * 60;          // Türkiye UTC+3
const REMIND_BEFORE_MIN = 60;          // bitmesine 1 saat kala
const WINDOW_MIN = 15;                 // tetik aralığı: [bitiş-60dk, bitiş-45dk) — hep ~1 saat kala gider

function occursToday(t, d) {            // d: Türkiye'ye kaydırılmış tarih (getUTC* ile okunur)
  const r = t.recurrence || { type: "once" };
  if (r.type === "once" || r.type === "daily") return true;
  if (r.type === "weekly") return (r.days || []).includes(d.getUTCDay());
  if (r.type === "monthly") return (r.dates || []).includes(d.getUTCDate());
  return false;
}
function occKey(t, dateKey) {
  return (t.recurrence && t.recurrence.type !== "once") ? dateKey : "once";
}

module.exports = async (req, res) => {
  const key = (req.query && req.query.key) || req.headers["x-fixpre-key"];
  if (!process.env.FIXPRE_KEY || key !== process.env.FIXPRE_KEY) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!process.env.DATABASE_URL || !process.env.VAPID_PRIVATE_KEY) { res.status(500).json({ error: "not_configured" }); return; }
  const sql = neon(process.env.DATABASE_URL);
  webpush.setVapidDetails("https://fixpre.com", VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY);

  try {
    await sql`create table if not exists reminders_sent (
      org_id text, task_id text, date text, sent_at timestamptz default now(),
      primary key (org_id, task_id, date)
    )`;

    const nowTr = new Date(Date.now() + TZ_OFFSET_MIN * 60 * 1000);   // Türkiye saati
    const dateKey = nowTr.toISOString().slice(0, 10);                 // YYYY-MM-DD (TR)
    const nowMin = nowTr.getUTCHours() * 60 + nowTr.getUTCMinutes();  // gün içi dakika (TR)

    const orgs = await sql`select org_id, data from org_state`;
    const subs = await sql`select endpoint, sub, user_id from push_subs`;
    let sent = 0;

    for (const org of orgs) {
      const data = org.data || {};
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      for (const t of tasks) {
        if (!t.dueTime || !/^\d{1,2}:\d{2}$/.test(t.dueTime)) continue;
        if (!occursToday(t, nowTr)) continue;
        const [hh, mm] = t.dueTime.split(":").map(Number);
        const dueMin = hh * 60 + mm;
        const remindMin = dueMin - REMIND_BEFORE_MIN;
        if (nowMin < remindMin || nowMin >= remindMin + WINDOW_MIN) continue;   // sadece "~1 saat kala" aralığı (geç kalmaz)
        const ck = occKey(t, dateKey);
        if (t.completions && t.completions[ck]) continue;              // bugün zaten yapılmış
        const recips = Array.isArray(t.assignedUserIds) ? t.assignedUserIds : [];
        if (!recips.length) continue;

        const ex = await sql`select 1 from reminders_sent where org_id = ${org.org_id} and task_id = ${t.id} and date = ${dateKey}`;
        if (ex.length) continue;                                       // bu görev/gün için zaten gönderildi

        const targets = subs.filter((s) => recips.includes(s.user_id));
        const payload = JSON.stringify({ title: "⏰ Görev bitimine 1 saat", body: t.title, url: "/" });
        for (const row of targets) {
          try { await webpush.sendNotification(row.sub, payload); sent++; }
          catch (err) {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              await sql`delete from push_subs where endpoint = ${row.endpoint}`;
            }
          }
        }
        await sql`insert into reminders_sent (org_id, task_id, date) values (${org.org_id}, ${t.id}, ${dateKey}) on conflict do nothing`;
      }
    }

    res.status(200).json({ ok: true, sent, dateKey, nowMin });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
