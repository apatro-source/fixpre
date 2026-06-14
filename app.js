/* ============================================================
   Görev Yönetim Sistemi — yerel sürüm
   Veriler tarayıcının localStorage'ında saklanır.
   ============================================================ */

const STORE_KEY = "gys_data_v1";
const SESSION_KEY = "gys_session";

/* ---------------- Veri katmanı ---------------- */

function uid() {
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function loadDB() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    try { return migrate(JSON.parse(raw)); } catch (e) { /* yeniden tohumla */ }
  }
  // İlk kurulumda örnek bir yönetici hesabı oluştur
  const ownerId = uid();
  const db = {
    users: [
      {
        id: ownerId,
        role: "yonetici",
        name: "Sistem Yöneticisi",
        email: "yonetici@local",
        password: "1234",
        ownerId: ownerId,   // yönetici kendi organizasyonunun sahibidir
        managerId: null,
        venueIds: [],
        lang: "tr",
      },
    ],
    venues: [],
    tasks: [],
    reports: [],
    undoLog: [],
    leaves: [],
    announcements: [],
  };
  saveDB(db);
  return db;
}

function saveLocal(db) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { /* kota dolabilir */ }
}
function saveDB(db) {
  saveLocal(db);
  if (typeof cloudPush === "function") cloudPush(db); // sunucudaysak Neon'a da yaz
}

// Eski verileri yeni yapıya taşır.
// Tamamlama artık PAYLAŞIMLIDIR: her gün için tek kayıt -> { by: personelId, at: iso }
function migrate(db) {
  if (!db.reports) db.reports = [];   // bildirim/talep listesi
  if (!db.undoLog) db.undoLog = [];   // geri alma kayıtları
  if (!db.leaves) db.leaves = [];     // izin / mesai talepleri
  if (!db.announcements) db.announcements = []; // duyurular
  if (!db.shifts) db.shifts = [];     // onaylı izin/off günleri: { id, ownerId, userId, date, reason, by }
  if (!db.shiftReqs) db.shiftReqs = []; // vardiya/izin değişiklik talepleri
  if (!db.shiftDefs) db.shiftDefs = []; // vardiya tanımları: { id, ownerId, label, start, end }
  if (!db.shiftAssign) db.shiftAssign = []; // gün-vardiya ataması: { id, ownerId, userId, date, defId }
  if (!db.approvals) db.approvals = { leave: "yonetici", shift: "yonetici" }; // onay yetkisi: "yonetici" | "sef"
  if (!db.clock) db.clock = [];       // mesai oturumları: { id, ownerId, userId, venueId, inAt, outAt, inLat, inLng, far }
  if (!db.timeclock) db.timeclock = { enabled: false, requireLocation: false }; // mesai saati modülü (opsiyonel)
  (db.tasks || []).forEach((t) => {
    if (!t.recurrence) t.recurrence = { type: "once" };
    if (!t.reads) t.reads = {};   // okundu bilgisi: { occKey: { userId: iso } }
    let comp = (t.completions && typeof t.completions === "object") ? t.completions : {};
    // çok eski düz biçim: { userId: iso } -> { once: { userId: iso } }
    if (Object.values(comp).some((v) => typeof v === "string")) {
      comp = { once: comp };
    }
    // her gün kovasını paylaşımlı biçime çevir
    Object.keys(comp).forEach((key) => {
      const bucket = comp[key];
      if (!bucket || typeof bucket !== "object") { delete comp[key]; return; }
      if (typeof bucket.at === "string" && bucket.by) return; // zaten yeni biçim
      // eski { userId: iso } -> en erken tamamlayanı al
      const entries = Object.entries(bucket).filter(([, v]) => typeof v === "string");
      if (!entries.length) { delete comp[key]; return; }
      entries.sort((a, b) => new Date(a[1]) - new Date(b[1]));
      comp[key] = { by: entries[0][0], at: entries[0][1] };
    });
    t.completions = comp;
  });

  // Rol/sahiplik alanlarını normalize et (ownerId varsa KORUNUR — org kimliği bozulmasın)
  (db.users || []).forEach((u) => {
    if (!u.ownerId) u.ownerId = (u.role === "yonetici") ? u.id : (u.managerId || null);
    if (u.role === "personel" && u.chefId === undefined) u.chefId = null;
    if (!u.venueIds) u.venueIds = [];
    if (!u.lang) u.lang = "tr";
  });
  (db.venues || []).forEach((v) => { if (!v.ownerId) v.ownerId = v.managerId; });
  (db.tasks || []).forEach((t) => {
    if (!t.ownerId) t.ownerId = t.managerId;
    if (!t.createdBy) t.createdBy = t.ownerId;
  });

  return db;
}

// Bulut senkron durumu — loadDB() saveDB→cloudPush çağırdığı için BUNLAR loadDB'den ÖNCE tanımlanmalı (TDZ hatası olmasın)
let cloudEnabled = false;
let cloudReady = false;   // ilk bulut verisi gelene kadar push YAPMA (eski veriyle üzerine yazma olmasın)
let lastAppliedAt = null;
let pushTimer = null;
let pushing = false;

let DB = loadDB();

const SUPER_EMAIL = "h.dirmilli48@gmail.com";   // sınırsız + yetki veren hesap

// Satış paketleri (USD). Süper admin panelinde tek tık doldurma için.
const PACKAGES = [
  { key: "free",  name: "Deneme",       venues: 1, chefs: 1, staff: 4,  unlimited: false, price: "$0" },
  { key: "start", name: "Başlangıç",    venues: 1, chefs: 2, staff: 15, unlimited: false, price: "$9/ay" },
  { key: "pro",   name: "Profesyonel",  venues: 3, chefs: 6, staff: 50, unlimited: false, price: "$24/ay" },
  { key: "corp",  name: "Kurumsal",     venues: 1, chefs: 1, staff: 1,  unlimited: true,  price: "$49/ay" },
];
let orgPlan = { maxVenues: 1, maxStaff: 4, maxChefs: 1, unlimited: false }; // demo varsayılan; sunucudan güncellenir

/* ---------------- Oturum (güvenli: token + hash) ---------------- */
const TOKEN_KEY = "fixpre_token";
const UID_KEY = "fixpre_uid";

function authToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
function emptyDB() { return { users: [], venues: [], tasks: [], reports: [], undoLog: [], leaves: [], announcements: [], shifts: [], shiftReqs: [], shiftDefs: [], shiftAssign: [], approvals: { leave: "yonetici", shift: "yonetici" } }; }

function currentUser() {
  const id = localStorage.getItem(UID_KEY);
  if (!id) return null;
  return DB.users.find((u) => u.id === id) || null;
}

// /api/auth çağrısı (token varsa ekler)
async function authCall(payload) {
  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + authToken() },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("http_" + r.status));
  return j;
}

// Paket ilgi talebi gönder (auth gerekmez)
async function leadSubmit(payload) {
  const r = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("http_" + r.status));
  return j;
}
// İlgi taleplerini getir (yalnızca süper admin)
async function leadsGet() {
  const r = await fetch("/api/lead", { headers: { "Authorization": "Bearer " + authToken() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("http_" + r.status));
  return j;
}

async function doLogin(email, password) {
  const j = await authCall({ action: "login", email: (email || "").trim(), password });
  localStorage.setItem(TOKEN_KEY, j.token);
  localStorage.setItem(UID_KEY, j.userId);
  DB = migrate(j.data || emptyDB());
  if (j.plan) orgPlan = j.plan;
  if (j.updatedAt != null) lastAppliedAt = j.updatedAt;   // sürüm kilidi için temel sürüm
  // giriş ekranında seçilen dili kullanıcıya uygula (menü o dilde gelsin)
  const me = DB.users.find((x) => x.id === j.userId);
  if (me && me.lang !== guestLang()) { me.lang = guestLang(); saveDB(DB); }
  saveLocal(DB);
  pushChecked = false;   // bu cihazın push aboneliği yeni kullanıcıya bağlansın (yanlış kişiye bildirim gitmesin)
}

async function doRegister(name, email, password, orgName) {
  const j = await authCall({ action: "register", name, email: (email || "").trim(), password, orgName: (orgName || "").trim() });
  localStorage.setItem(TOKEN_KEY, j.token);
  localStorage.setItem(UID_KEY, j.userId);
  DB = migrate(j.data || emptyDB());
  if (j.plan) orgPlan = j.plan;
  if (j.updatedAt != null) lastAppliedAt = j.updatedAt;   // sürüm kilidi için temel sürüm
  saveLocal(DB);
  pushChecked = false;   // yeni hesap bu cihaza push için bağlansın
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(UID_KEY);
  DB = emptyDB();
  authMode = "login";
  pushChecked = false;   // çıkışta aboneliği bırak; sonraki kullanıcı kendine bağlasın
  render();
}

/* ---------------- Yardımcılar ---------------- */

function currentLocale() {
  const u = currentUser();
  return (typeof LOCALES !== "undefined" && LOCALES[(u && u.lang) || "tr"]) || "tr-TR";
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(currentLocale(), {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// iso zamanı, YYYY-MM-DD biçimindeki from/to aralığında mı?
function inRange(iso, from, to) {
  const d = new Date(iso);
  if (from && d < new Date(from + "T00:00:00")) return false;
  if (to && d > new Date(to + "T23:59:59")) return false;
  return true;
}

// Tarih aralığı filtresi (ortak UI)
function rangeFilter(prefix, from, to) {
  return `
    <div class="card">
      <h3>Tarih aralığı</h3>
      <div class="row">
        <div class="field"><label>Başlangıç</label><input id="${prefix}_from" type="date" value="${from}" /></div>
        <div class="field"><label>Bitiş</label><input id="${prefix}_to" type="date" value="${to}" /></div>
        <div class="field range-actions">
          <button class="btn-primary" id="${prefix}_apply">Filtrele</button>
          <button class="btn-ghost" id="${prefix}_clear">Temizle</button>
        </div>
      </div>
    </div>`;
}

function wireRange(prefix, setFrom, setTo) {
  const apply = document.getElementById(prefix + "_apply");
  if (apply) apply.onclick = () => {
    setFrom(document.getElementById(prefix + "_from").value);
    setTo(document.getElementById(prefix + "_to").value);
    render();
  };
  const clear = document.getElementById(prefix + "_clear");
  if (clear) clear.onclick = () => { setFrom(""); setTo(""); render(); };
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function userById(id) { return DB.users.find((u) => u.id === id); }
function venueById(id) { return DB.venues.find((v) => v.id === id); }

// Bir kullanıcının ait olduğu organizasyon (yönetici) id'si
function ownerIdOf(u) { return u.ownerId || u.id; }

// Organizasyon geneli (yöneticinin gördüğü her şey)
function orgVenues(o) { return DB.venues.filter((v) => v.ownerId === o); }
function orgStaff(o) { return DB.users.filter((x) => x.role === "personel" && x.ownerId === o); }
function orgChefs(o) { return DB.users.filter((x) => x.role === "sef" && x.ownerId === o); }
function orgTasks(o) { return DB.tasks.filter((t) => t.ownerId === o); }

// Role göre görünür kapsam:
//  - yönetici: organizasyonun tamamı
//  - şef: yalnızca kendi mekanları / kendi personeli / kendi oluşturduğu görevler
function visibleVenues(u) {
  const all = orgVenues(ownerIdOf(u));
  return u.role === "sef" ? all.filter((v) => (u.venueIds || []).includes(v.id)) : all;
}
function visibleStaff(u) {
  const all = orgStaff(ownerIdOf(u));
  // Şef: kendi sorumlu olduğu lokasyonlardaki TÜM personel (kim eklemiş olursa olsun)
  return u.role === "sef"
    ? all.filter((s) => (s.venueIds || []).some((v) => (u.venueIds || []).includes(v)))
    : all;
}
function visibleTasks(u) {
  const all = orgTasks(ownerIdOf(u));
  if (u.role !== "sef") return all;
  // Şef: sorumlu olduğu LOKASYONDAKİ tüm görevler (kim oluşturmuş olursa olsun) + kendi mekansız görevleri.
  // Böylece bir şef başka lokasyona geçince, yeni gelen şef o lokasyonun görevlerini devralıp yönetebilir.
  const myV = u.venueIds || [];
  return all.filter((t) => (t.venueId && myV.includes(t.venueId)) || (!t.venueId && t.createdBy === u.id));
}
// Bir görevi DÜZENLEYEBİLİR/SİLEBİLİR mi? (görme değil, müdahale yetkisi)
//  - yönetici: org'daki tüm görevler
//  - şef: YALNIZCA şef yapımı görevler (kendi lokasyonundaki) — yöneticinin görevine dokunamaz
//  - personel: hiçbiri (sadece görür/tamamlar)
function canEditTask(u, t) {
  if (!t || !u) return false;
  if (u.role === "yonetici") return t.ownerId === ownerIdOf(u);
  if (u.role === "sef") {
    const creator = userById(t.createdBy);
    if (creator && creator.role === "yonetici") return false;   // yöneticinin görevine müdahale edemez
    const myV = u.venueIds || [];
    return t.createdBy === u.id || (t.venueId && myV.includes(t.venueId));
  }
  return false;
}

// Bir göreve atanabilecek kişiler:
//  - yönetici: organizasyondaki şefler + personel
//  - şef: yalnızca kendi sorumlu olduğu mekanlardaki personel (mekana göre)
function assignableUsers(u) {
  const owner = ownerIdOf(u);
  if (u.role === "yonetici") return [...orgChefs(owner), ...orgStaff(owner)];
  const myVenues = u.venueIds || [];
  return orgStaff(owner).filter((s) => (s.venueIds || []).some((v) => myVenues.includes(v)));
}
function roleIcon(x) { return x && x.role === "sef" ? "👔" : "👤"; }

// Atanan kişi, görevin mekanı artık kendi mekanı değilse o görevi görmesin
// (mekan değişince görev otomatik düşer). Mekansız görevler herkese görünür.
function taskVenueOk(t, u) {
  if (!t.venueId) return true;
  return (u.venueIds || []).includes(t.venueId);
}

/* ---- Bildirim / Talep sistemi ---- */
const REPORT_CATS = [
  { key: "ariza", label: "Arıza", icon: "🔧" },
  { key: "eksik", label: "Eksik / İhtiyaç", icon: "📦" },
  { key: "talep", label: "Talep", icon: "📝" },
  { key: "oneri", label: "Öneri", icon: "💡" },
  { key: "diger", label: "Diğer", icon: "💬" },
];
function reportCat(key) { return REPORT_CATS.find((c) => c.key === key) || REPORT_CATS[4]; }

function orgReports(o) { return DB.reports.filter((r) => r.ownerId === o); }
// Bana gelen (çözebileceğim) bildirimler
function incomingReports(u) {
  const all = orgReports(ownerIdOf(u));
  if (u.role === "yonetici") return all;           // yönetici tüm lokasyonlardaki talepleri görür
  if (u.role === "sef") {
    // Şef, SORUMLU olduğu lokasyondaki TÜM talepleri görür (personel + aynı lokasyondaki diğer şef).
    // Böylece aynı talebi iki şef ayrı ayrı yazmaz. Farklı lokasyonun talebini görmez. Kendi yazdığı "Gönderdiğim"de.
    const myV = u.venueIds || [];
    return all.filter((r) => r.venueId && myV.includes(r.venueId) && r.createdBy !== u.id);
  }
  return [];
}

// Bildirimin kime gittiğini açıklayan etiket
function reportTargetLabel(r) {
  if (r.target === "tumsef") return "Tüm Şefler";
  if (r.target === "yonetici") return "Yönetici";
  const to = r.toUserId ? userById(r.toUserId) : null;
  return to ? to.name : "Yönetici";
}
// Benim gönderdiğim bildirimler
function myReports(u) { return orgReports(ownerIdOf(u)).filter((r) => r.createdBy === u.id); }

function venuesForUser(u) {
  if (u.role === "personel") return (u.venueIds || []).map(venueById).filter(Boolean);
  return visibleVenues(u);
}

// Gönderen, çözülen bildirimlerini görünce "görüldü" işaretle
function markReportsSeen(u) {
  let changed = false;
  myReports(u).forEach((r) => {
    if ((r.status === "cozuldu" || r.status === "bildirildi") && !r.seenByReporter) { r.seenByReporter = true; changed = true; }
  });
  if (changed) saveDB(DB);
}

/* ---- Tekrar (recurrence) yardımcıları ---- */
const WD = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const WD_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// O görevin "bugünkü" tamamlama kovasının anahtarı
function occKeyToday(t) {
  return (t.recurrence && t.recurrence.type !== "once") ? todayKey() : "once";
}
// Bir ISO zaman damgası BUGÜN mü (yerel tarih)
function isTodayIso(iso) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
// Görev bugün mü tamamlandı (tek seferlik görev dün tamamlandıysa "bugün biten" sayılmasın)
function doneTodayFor(t) {
  const c = t.completions[occKeyToday(t)];
  return !!(c && isTodayIso(c.at));
}

// Görev bugün aktif mi (personele görünmeli mi)?
function occursToday(t) {
  const r = t.recurrence || { type: "once" };
  if (r.type === "once" || r.type === "daily") return true;
  const d = new Date();
  if (r.type === "weekly") return (r.days || []).includes(d.getDay());
  if (r.type === "monthly") return (r.dates || []).includes(d.getDate());
  return false;
}

// O günkü tamamlama kaydı: { by, at } veya null
function completionOf(t, key) { return t.completions[key] || null; }

// Paylaşımlı: biri yaptıysa görev o gün için tamamlanmış sayılır
function doneForKey(t, key) {
  return t.assignedUserIds.length > 0 && !!t.completions[key];
}
// Görevi kim oluşturdu? (yönetici → "Yönetici"; şef/personel → adı)
function creatorText(t) {
  const c = userById(t.createdBy);
  if (!c) return "—";
  return c.role === "yonetici" ? "Yönetici" : c.name;
}
// Görevi oluşturandan BAŞKASI düzenlediyse "değiştirdi" notu (asıl oluşturan düzenlediyse boş)
function editedNote(t) {
  if (!t.lastEditBy || t.lastEditBy === t.createdBy) return "";
  const e = userById(t.lastEditBy);
  if (!e) return "";
  return `<div class="edited-note">✏️ ${esc(e.name)} <span>değiştirdi</span> · ${fmtDate(t.lastEditAt)}</div>`;
}
// Tamamlanmış tek seferlik görev mi? (listede gizlenir ama DB'de kalır → kayıt/performans korunur)
function isDoneOnce(t) {
  return t.recurrence && t.recurrence.type === "once" && t.completions && !!t.completions["once"];
}
// Başlama saati geldi mi? (yoksa her zaman true). Öncesinde görev tamamlanamaz.
function startReached(t) {
  if (!t.startTime || !/^\d{1,2}:\d{2}$/.test(t.startTime)) return true;
  const now = new Date();
  const [hh, mm] = t.startTime.split(":").map(Number);
  return (now.getHours() * 60 + now.getMinutes()) >= (hh * 60 + mm);
}

// Atanan kişi görevi görünce o günün "okundu" zamanını kaydeder (ilk görüşte)
function markReads(u, tasks) {
  let changed = false;
  tasks.forEach((t) => {
    const k = occKeyToday(t);
    if (!t.reads) t.reads = {};
    if (!t.reads[k]) t.reads[k] = {};
    if (!t.reads[k][u.id]) { t.reads[k][u.id] = new Date().toISOString(); changed = true; }
  });
  if (changed) saveDB(DB);
}

function recurrenceLabel(t) {
  const r = t.recurrence || { type: "once" };
  if (r.type === "once") return "Tek seferlik";
  if (r.type === "daily") return "Her gün tekrar eder";
  if (r.type === "weekly")
    return "Haftalık: " + (r.days || []).slice().sort((a, b) => a - b).map((d) => WD_SHORT[d]).join(", ");
  if (r.type === "monthly")
    return "Aylık: ayın " + (r.dates || []).slice().sort((a, b) => a - b).join(", ") + ". günleri";
  return "";
}

/* ---- Gecikme (geçmişte yapılmayan görevler) yardımcıları ---- */
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function fmtDay(dk) {
  const d = new Date(dk + "T00:00:00");
  const label = d.toLocaleDateString(currentLocale(), { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  if (dk === ymd(addDays(new Date(), -1))) return "Dün — " + label;
  return label;
}

/* ---- Vardiya / izin günü yardımcıları ---- */
// Haftanın pazartesisi (offset hafta kadar kaydır)
function weekMonday(offset) {
  const d = new Date();
  const wd = (d.getDay() + 6) % 7;            // Pzt=0 ... Paz=6
  return addDays(d, -wd + (offset || 0) * 7);
}
// Verilen pazartesiden 7 günün tarih anahtarları
function weekDateKeys(monday) {
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(monday, i)));
}
// Kişi o gün izinli/off mi (onaylı)
function isOff(userId, dateKey) {
  return (DB.shifts || []).some((s) => s.userId === userId && s.date === dateKey);
}
// Org'daki tüm çalışanlar (şefler + personel) — herkes birbirini görür
function orgWorkers(owner) {
  return [...orgChefs(owner), ...orgStaff(owner)];
}
// Onay yetkisi ayarı ("yonetici" | "sef")
function approvalSetting(key) { return (DB.approvals && DB.approvals[key]) || "yonetici"; }
// --- Mesai saati (time clock) yardımcıları ---
function clockOn() { return !!(DB.timeclock && DB.timeclock.enabled); }
function clockNeedsLoc() { return !!(DB.timeclock && DB.timeclock.requireLocation); }
function openClock(userId) { return (DB.clock || []).find((c) => c.userId === userId && !c.outAt) || null; }
function clockHoursStr(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return (h ? h + "s " : "") + (m % 60) + "dk";
}
function distMeters(a1, o1, a2, o2) {   // haversine (metre)
  const R = 6371000, rad = (x) => x * Math.PI / 180;
  const dLat = rad(a2 - a1), dLng = rad(o2 - o1);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const CLOCK_RADIUS_M = 100;   // mekâna en fazla bu kadar uzak olunabilir (m)
// KVKK aydınlatma metni (personele gösterilir; işletme kendi bilgisini ekleyebilir)
const KVKK_NOTICE = "İşletmeniz, mesai giriş/çıkış kaydının doğruluğu ve işyerinde bulunduğunuzun teyidi amacıyla, yalnızca giriş/çıkış yaptığınız anda konumunuzu bir kez alır. Sürekli veya canlı konum takibi yapılmaz; tam konumunuz saklanmaz, yalnızca işyerine yakın olup olmadığınız kaydedilir. Bu veriler yalnızca işvereniniz tarafından görülür ve üçüncü kişilerle paylaşılmaz. İşleme, çalışma ilişkisinin yürütülmesi kapsamında yapılır (KVKK). Haklarınız için işvereninize başvurabilirsiniz. Bu özellik isteğe bağlıdır.";
// Çeviri ile uyarı göster (statik metin çevrilir; suffix — örn. mesafe — aynen eklenir)
function tAlert(s, suffix) {
  const L = (typeof activeLang === "function") ? activeLang() : "tr";
  const msg = (typeof translateString === "function") ? translateString(s, L) : s;
  alert(msg + (suffix || ""));
}
function doClockIn(u) {
  if (openClock(u.id)) return;
  const venues = (u.venueIds || []).map(venueById).filter(Boolean);
  // KVKK/veri minimizasyonu: TAM KONUM SAKLANMAZ; yalnızca mekâna uzaklık (metre) tutulur.
  const save = (venueId, distM) => {
    DB.clock.push({ id: uid(), ownerId: ownerIdOf(u), userId: u.id, venueId: venueId || null,
      inAt: new Date().toISOString(), outAt: null, distM: (distM == null ? null : Math.round(distM)) });
    saveDB(DB); render();
  };
  if (clockNeedsLoc()) {
    if (!navigator.geolocation) { tAlert("Konum gerekli ama cihaz GPS desteklemiyor."); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const la = pos.coords.latitude, ln = pos.coords.longitude;   // anlık kullanılır, saklanmaz
      const withLoc = venues.filter((v) => v.lat != null);
      if (withLoc.length) {
        let best = null, bestD = Infinity;
        withLoc.forEach((v) => { const d = distMeters(la, ln, v.lat, v.lng); if (d < bestD) { bestD = d; best = v; } });
        if (bestD > CLOCK_RADIUS_M) { tAlert("Mekâna yakın değilsiniz. Mesaiye mekânda başlayın.", " (~" + Math.round(bestD) + " m)"); return; }
        save(best.id, bestD);
      } else { save(venues[0] ? venues[0].id : null, null); }  // mekan konumu ayarlı değil → uzaklık yok
    }, () => { tAlert("Konum alınamadı. Konum iznini verin."); }, { enableHighAccuracy: true, timeout: 10000 });
  } else {
    save(venues[0] ? venues[0].id : null, null);
  }
}
function doClockOut(u) {
  const open = openClock(u.id);
  if (!open) return;
  const finish = (distM) => {
    open.outAt = new Date().toISOString();
    open.outDistM = (distM == null ? null : Math.round(distM));
    saveDB(DB); render();
  };
  if (clockNeedsLoc()) {
    const v = open.venueId ? venueById(open.venueId) : null;
    if (!navigator.geolocation) { tAlert("Konum gerekli ama cihaz GPS desteklemiyor."); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const la = pos.coords.latitude, ln = pos.coords.longitude;   // anlık kullanılır, saklanmaz
      if (v && v.lat != null) {
        const d = distMeters(la, ln, v.lat, v.lng);
        if (d > CLOCK_RADIUS_M) { tAlert("Mekâna yakın değilsiniz. Mesaiyi mekânda bitirin.", " (~" + Math.round(d) + " m)"); return; }
        finish(d);
      } else { finish(null); }
    }, () => { tAlert("Konum alınamadı. Konum iznini verin."); }, { enableHighAccuracy: true, timeout: 10000 });
  } else {
    finish(null);
  }
}
function clockCard(u) {
  if (!clockOn() || u.role === "yonetici") return "";
  const open = openClock(u.id);
  if (open) {
    const dur = clockHoursStr(Date.now() - new Date(open.inAt).getTime());
    return `<div class="clock-card on">
      <div class="clock-info">🟢 <strong>Mesaidesiniz</strong><span> · ${fmtDate(open.inAt)} (${dur})</span></div>
      <button class="btn-danger" id="clock_out">🔴 Mesaiyi Bitir</button>
    </div>`;
  }
  const note = clockNeedsLoc()
    ? `<details class="kvkk-note"><summary>📍 Konumunuz yalnızca giriş anında, mekânda olduğunuzu doğrulamak için kullanılır; sürekli takip yapılmaz.</summary><p>${KVKK_NOTICE}</p></details>`
    : "";
  return `<div class="clock-card">
    <div class="clock-info">⏱️ <strong>Mesai Saati</strong></div>
    <button class="btn-green" id="clock_in">🟢 Mesaiye Başla</button>
  </div>${note}`;
}
function wireClock(u) {
  const i = document.getElementById("clock_in");
  if (i) i.onclick = () => doClockIn(u);
  const o = document.getElementById("clock_out");
  if (o) o.onclick = () => doClockOut(u);
}
// u, belirtilen personelin izin talebini onaylayabilir mi?
function canApproveLeave(u, staffId) {
  if (u.role === "yonetici") return true;
  if (u.role === "sef" && approvalSetting("leave") === "sef") return visibleStaff(u).some((s) => s.id === staffId);
  return false;
}
// u, belirtilen personelin vardiya/değişiklik talebini onaylayabilir mi?
function canApproveShift(u, staffId) {
  if (u.role === "yonetici") return true;
  if (u.role === "sef" && approvalSetting("shift") === "sef") return visibleStaff(u).some((s) => s.id === staffId);
  return false;
}
// Vardiya tanımları (A/B/C...) ve atamalar
function orgShiftDefs(owner) { return (DB.shiftDefs || []).filter((d) => d.ownerId === owner); }
function defById(id) { return (DB.shiftDefs || []).find((d) => d.id === id) || null; }
function assignOf(userId, dateKey) { return (DB.shiftAssign || []).find((a) => a.userId === userId && a.date === dateKey) || null; }
// Kişinin EN SIK kullandığı vardiya tanımı (çalışmaya dönen güne saat gelsin diye)
function usualDefId(userId) {
  const counts = {};
  (DB.shiftAssign || []).forEach((a) => { if (a.userId === userId && a.defId && defById(a.defId)) counts[a.defId] = (counts[a.defId] || 0) + 1; });
  let best = null, n = 0;
  Object.keys(counts).forEach((d) => { if (counts[d] > n) { n = counts[d]; best = d; } });
  return best;
}
// Bir hücrenin durumu: izinli / vardiya atanmış / sade çalışıyor
function cellState(userId, dateKey) {
  if (isOff(userId, dateKey)) return { kind: "off" };
  const a = assignOf(userId, dateKey);
  if (a) return { kind: "assign", defId: a.defId };
  return { kind: "work" };
}
// Hücreyi tek bir duruma getir (önce eski off + atamayı temizle)
function setCell(owner, userId, dateKey, kind, byId, defId) {
  for (let i = (DB.shifts || []).length - 1; i >= 0; i--)
    if (DB.shifts[i].userId === userId && DB.shifts[i].date === dateKey) DB.shifts.splice(i, 1);
  for (let i = (DB.shiftAssign || []).length - 1; i >= 0; i--)
    if (DB.shiftAssign[i].userId === userId && DB.shiftAssign[i].date === dateKey) DB.shiftAssign.splice(i, 1);
  if (kind === "off") DB.shifts.push({ id: uid(), ownerId: owner, userId, date: dateKey, reason: "Yönetici", by: byId });
  else if (kind === "assign" && defId) DB.shiftAssign.push({ id: uid(), ownerId: owner, userId, date: dateKey, defId, by: byId });
}

// Görev belirli bir günde aktif mi? (once hariç — recurring için)
function occursOn(t, d) {
  const r = t.recurrence || { type: "once" };
  if (r.type === "daily") return true;
  if (r.type === "weekly") return (r.days || []).includes(d.getDay());
  if (r.type === "monthly") return (r.dates || []).includes(d.getDate());
  return false;
}

function dkInRange(dk, from, to) {
  if (from && dk < from) return false;
  if (to && dk > to) return false;
  return true;
}

// Verilen görevlerde geçmişte (bugünden önce) yapılmamış (geciken) günleri bulur.
// Dönen her kayıt: { task, dateKey (tamamlama için), dayLabel, sortKey }
function pastMissedFor(tasks, fromStr, toStr) {
  const out = [];
  const tk = todayKey();
  tasks.forEach((t) => {
    const r = t.recurrence || { type: "once" };
    if (r.type === "once") {
      // son tarihi olmayan tek seferlik görev "gecikmiş" sayılmaz
      if (!t.dueAt || t.completions["once"]) return;
      const dk = ymd(new Date(t.dueAt));
      if (dk >= tk || !dkInRange(dk, fromStr, toStr)) return;
      out.push({ task: t, dateKey: "once", dayLabel: fmtDay(dk), sortKey: dk });
    } else {
      let startK = ymd(new Date(t.createdAt));
      if (fromStr && fromStr > startK) startK = fromStr;
      if (!fromStr) {
        const cap = ymd(addDays(new Date(), -120)); // çok eskiye gitmeyi sınırla
        if (cap > startK) startK = cap;
      }
      let endK = ymd(addDays(new Date(), -1)); // düne kadar
      if (toStr && toStr < endK) endK = toStr;
      if (startK > endK) return;
      let d = new Date(startK + "T00:00:00");
      const endD = new Date(endK + "T00:00:00");
      while (d <= endD) {
        const dk = ymd(d);
        if (occursOn(t, d) && !t.completions[dk]) {
          out.push({ task: t, dateKey: dk, dayLabel: fmtDay(dk), sortKey: dk });
        }
        d = addDays(d, 1);
      }
    }
  });
  out.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1)); // yeni tarih üstte
  return out;
}

/* ---------------- UI durumu ---------------- */

let authMode = "login";           // giriş ekranı: "login" | "register"
let activeTab = "bugun";          // yönetici sekmesi
let staffTab = "bugun";           // personel sekmesi
let logFrom = "", logTo = "";     // yönetici kayıtlar tarih aralığı
let histFrom = "", histTo = "";   // personel geçmiş tarih aralığı
let dashFrom = "", dashTo = "";   // pano geciken görevler tarih aralığı
let perfFrom = "", perfTo = "";   // performans tarih aralığı
let repFrom = "", repTo = "";     // talepler tarih aralığı
let mesaiFrom = "", mesaiTo = ""; // mesai kayıtları tarih aralığı
let selectedVenue = null;         // yöneticinin açtığı mekan (kategori)
let selectedChef = null;          // yöneticinin açtığı şef detayı
let editingStaff = null;          // düzenlenen personel/şef id'si
let editingTask = null;           // düzenlenen görev id'si
let sharingTask = null;           // şefin paylaşmak istediği görev id'si
let showProfile = false;          // profil (dil/şifre) penceresi açık mı
let showAnnounce = false;         // duyuru yap penceresi açık mı
let shiftWeekOffset = 0;          // vardiya ekranında hangi hafta (0 = bu hafta)

/* ---------------- Render ---------------- */

const app = document.getElementById("app");

function render() {
  const u = currentUser();
  if (!u) { renderLogin(); translateUI(); return; }
  window.onscroll = null;   // landing scroll efektini temizle
  if (orgPlan && orgPlan.expired) { renderDemoLock(u); translateUI(); return; }   // demo doldu → işlem durur
  if (u.role === "yonetici" || u.role === "sef") renderManager(u);
  else renderStaff(u);
  if (showProfile) mountProfile(u);
  if (showAnnounce) mountAnnounce(u);
  translateUI();
  scrollActiveTabIntoView();
  // izin daha önce verildiyse aboneliği sessizce tazele (tek sefer)
  if (cloudEnabled && !pushChecked) { pushChecked = true; ensurePushSubscribed(u, false); }
}

// Aktif sekmeyi (yana kaydırılabilir şeritte) görünür yap
function scrollActiveTabIntoView() {
  const at = app.querySelector(".tab.active");
  if (at && at.scrollIntoView) {
    try { at.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) { /* yoksay */ }
  }
}

// Giriş yapılmadan önce seçilen dil (misafir dili)
// Akıllı varsayılan dil: kullanıcı seçtiyse o; yoksa cihaz dili (destekliyorsak); değilse İngilizce
function guestLang() {
  const supported = (typeof LANGS !== "undefined") ? LANGS.map(([k]) => k) : ["tr", "en", "de", "ru", "es", "it"];
  // 1) URL ?hl=xx (hreflang adresleri + paylaşılan linkler için) — varsa öncelikli, kaydedilir
  try {
    const hl = (new URLSearchParams(location.search).get("hl") || "").slice(0, 2).toLowerCase();
    if (hl && supported.includes(hl)) { localStorage.setItem("fixpre_lang", hl); return hl; }
  } catch (e) { /* yoksay */ }
  // 2) Kullanıcının daha önce seçtiği dil
  const saved = localStorage.getItem("fixpre_lang");
  if (saved) return saved;
  // 3) Cihaz/tarayıcı dili (destekliyorsak)
  const navs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || "en"];
  for (const l of navs) {
    const code = String(l).slice(0, 2).toLowerCase();
    if (supported.includes(code)) return code;
  }
  return "en";   // desteklemediğimiz dil → İngilizce
}

// PWA "Ana ekrana ekle": Android/Chrome kurulum istemini yakala (modül başında bir kez)
let deferredInstallPrompt = null;
function isStandaloneApp() {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; }
}
function isIOSDevice() { return /iphone|ipad|ipod/i.test(navigator.userAgent || ""); }
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  const b = document.getElementById("installBtn");
  if (b) b.style.display = "";
});
window.addEventListener("appinstalled", function () {
  deferredInstallPrompt = null;
  const s = document.getElementById("lp-install");
  if (s) s.style.display = "none";
});

// Aktif dil
function activeLang() {
  const u = currentUser();
  return u ? (u.lang || "tr") : guestLang();
}
// Tek bir metni anlık çevir (dinamik hata/uyarı mesajları için)
function t(s) {
  return (typeof translateString === "function") ? translateString(s, activeLang()) : s;
}

// SEO: sayfa başlığı + açıklaması (TR baz; translateString ile aktif dile çevrilir)
const SEO_TITLE = "Fixpre — Kafe & Restoran için Personel Takip ve Vardiya Sistemi";
const SEO_DESC = "Kafe ve restoranlar için akıllı personel yönetimi: onaylı vardiya değişimi, mesai takibi, tekrarlayan görevler ve hiyerarşik düzen — hepsi tek panelde. 6 dil, ücretsiz başla.";
function applyMetaForLang(lang) {
  try {
    const tr = (typeof translateString === "function");
    const title = tr ? translateString(SEO_TITLE, lang) : SEO_TITLE;
    const desc = tr ? translateString(SEO_DESC, lang) : SEO_DESC;
    if (document.title !== title) document.title = title;
    const set = (sel, val) => { const el = document.querySelector(sel); if (el && el.getAttribute("content") !== val) el.setAttribute("content", val); };
    set('meta[name="description"]', desc);
    set('meta[property="og:title"]', title);
    set('meta[property="og:description"]', desc);
    set('meta[name="twitter:title"]', title);
    set('meta[name="twitter:description"]', desc);
    if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
  } catch (e) { /* yoksay */ }
}

// Render sonrası ekranı kullanıcının (veya giriş öncesi misafir) diline çevir
function translateUI() {
  if (typeof translateNode === "function") translateNode(app, activeLang());
  applyMetaForLang(activeLang());   // başlık/açıklama da aktif dile göre (çok dilli SEO)
}

// Tıklama/Enter sonrası dinamik olarak değişen metinleri (hata/uyarı) da çevir.
// TR kullanıcıda işlem yapmaz (erken döner); diğer dillerde err.textContent vb. anında çevrilir.
document.addEventListener("click", () => setTimeout(translateUI, 0), true);
document.addEventListener("keyup", (e) => { if (e.key === "Enter") setTimeout(translateUI, 0); }, true);

// Profil penceresi: dil tercihi + şifre değiştirme (her rol için)
// Duyuru yap penceresi (üst bardaki 📢 ikonu)
function mountAnnounce(u) {
  app.insertAdjacentHTML("beforeend", `
    <div class="modal-overlay" id="an_overlay">
      <div class="modal">
        ${announcementCompose(u)}
        <button class="btn-ghost" id="an_close" style="width:100%;margin-top:6px">Kapat</button>
      </div>
    </div>`);
  const close = () => { showAnnounce = false; render(); };
  document.getElementById("an_close").onclick = close;
  document.getElementById("an_overlay").onclick = (e) => { if (e.target.id === "an_overlay") close(); };
  wireAnnouncements(u);
}

function mountProfile(u) {
  const langOpts = LANGS.map(([k, l]) => `<option value="${k}" ${u.lang === k ? "selected" : ""}>${l}</option>`).join("");
  app.insertAdjacentHTML("beforeend", `
    <div class="modal-overlay" id="pf_overlay">
      <div class="modal">
        <h2>⚙️ Profil</h2>
        <div class="field"><label>Ad Soyad</label><input id="pf_name" value="${esc(u.name)}" /></div>
        ${u.role === "yonetici" ? `<div class="field"><label>İşletme adı</label><input id="pf_orgname" value="${esc(DB.orgName || "")}" /></div>` : ""}
        <div class="field"><label>Dil / Language</label><select id="pf_lang">${langOpts}</select></div>
        <div class="field"><label>Yeni Şifre (boş bırakırsanız değişmez)</label><input id="pf_pw" type="text" placeholder="••••" /></div>
        <div class="field"><label>Yeni Şifre (tekrar)</label><input id="pf_pw2" type="text" /></div>
        <div class="field">
          <label>Bildirimler</label>
          <button class="btn-ghost" id="pf_push" style="width:100%">🔔 Bildirimleri Aç</button>
        </div>
        ${u.email === SUPER_EMAIL ? `
        <div class="field" style="border-top:1px solid var(--border);padding-top:12px">
          <label>🔑 Yetki Ver (süper admin)</label>
          <input id="sa_email" placeholder="kullanici@eposta.com" />
          <div class="pkg-presets">
            ${PACKAGES.map((p) => `<button type="button" class="pkg-btn" data-pkg="${p.key}">${p.name}<span>${p.price}</span></button>`).join("")}
          </div>
          <div class="row" style="margin-top:8px">
            <div class="field"><label>Mekan</label><input id="sa_venues" type="number" min="1" value="1" /></div>
            <div class="field"><label>Şef</label><input id="sa_chefs" type="number" min="0" value="1" /></div>
            <div class="field"><label>Personel</label><input id="sa_staff" type="number" min="1" value="4" /></div>
          </div>
          <label class="check-pill" style="margin-top:8px"><input type="checkbox" id="sa_unlimited" /> Sınırsız</label>
          <div class="field" style="margin-top:8px"><label>Süre (gün) — 0 veya boş = süresiz</label><input id="sa_days" type="number" min="0" value="30" /></div>
          <button class="btn-ghost" id="sa_grant" style="width:100%;margin-top:10px">Yetkiyi Uygula</button>
          <div class="error-msg" id="sa_msg"></div>
        </div>` : ""}
        ${u.role === "yonetici" ? `
        <div class="field" style="border-top:1px solid var(--border);padding-top:12px">
          <label>✅ Onay Yetkileri — talepleri kim onaylasın?</label>
          <div class="field"><label>İzin / Mesai talepleri</label><select id="ap_leave">
            <option value="yonetici"${approvalSetting("leave") === "yonetici" ? " selected" : ""}>Sadece yönetici onaylar</option>
            <option value="sef"${approvalSetting("leave") === "sef" ? " selected" : ""}>Şefler de (kendi personeli)</option>
          </select></div>
          <div class="field"><label>Vardiya / değişiklik talepleri</label><select id="ap_shift">
            <option value="yonetici"${approvalSetting("shift") === "yonetici" ? " selected" : ""}>Sadece yönetici onaylar</option>
            <option value="sef"${approvalSetting("shift") === "sef" ? " selected" : ""}>Şefler de (kendi personeli)</option>
          </select></div>
        </div>` : ""}
        ${u.role === "yonetici" ? `
        <div class="field" style="border-top:1px solid var(--border);padding-top:12px">
          <label>⏱️ Mesai Saati Takibi (giriş-çıkış)</label>
          <label class="check-pill"><input type="checkbox" id="tc_enabled"${clockOn() ? " checked" : ""} /> Mesai saati takibini aç</label>
          <label class="check-pill" style="margin-top:6px"><input type="checkbox" id="tc_loc"${clockNeedsLoc() ? " checked" : ""} /> Konum zorunlu (mekâna yakın olunmalı)</label>
          <p style="color:var(--muted);font-size:12px;margin:6px 0 0">Konum zorunluysa her lokasyonun konumunu "Lokasyonlar"dan "📍 Konumu ayarla" ile kaydedin.</p>
          <details class="kvkk-note" style="margin-top:8px"><summary>ℹ️ Konum & KVKK aydınlatması (personele gösterilir)</summary><p>${KVKK_NOTICE}</p><p style="font-weight:700;margin-top:6px">Bu özelliği kullanırken personelinizi bilgilendirin; dilerseniz şirket adı/iletişiminizi ekleyin.</p></details>
        </div>` : ""}
        <div class="form-actions">
          <button class="btn-primary" id="pf_save">Kaydet</button>
          <button class="btn-ghost" id="pf_cancel">İptal</button>
        </div>
        <div class="error-msg" id="pf_err"></div>
      </div>
    </div>`);
  const close = () => { showProfile = false; render(); };
  const pushBtn = document.getElementById("pf_push");
  if (pushBtn) pushBtn.onclick = () => ensurePushSubscribed(u, true);

  document.querySelectorAll("[data-pkg]").forEach((b) => {
    b.onclick = () => {
      const p = PACKAGES.find((x) => x.key === b.dataset.pkg);
      if (!p) return;
      document.getElementById("sa_venues").value = p.venues;
      document.getElementById("sa_chefs").value = p.chefs;
      document.getElementById("sa_staff").value = p.staff;
      document.getElementById("sa_unlimited").checked = p.unlimited;
      document.querySelectorAll(".pkg-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    };
  });

  const grantBtn = document.getElementById("sa_grant");
  if (grantBtn) grantBtn.onclick = async () => {
    const targetEmail = document.getElementById("sa_email").value.trim();
    const maxVenues = parseInt(document.getElementById("sa_venues").value, 10) || 1;
    const maxChefs = parseInt(document.getElementById("sa_chefs").value, 10) || 0;
    const maxStaff = parseInt(document.getElementById("sa_staff").value, 10) || 4;
    const unlimited = document.getElementById("sa_unlimited").checked;
    const days = parseInt(document.getElementById("sa_days").value, 10) || 0;
    const msg = document.getElementById("sa_msg");
    if (!targetEmail) { msg.textContent = "E-posta girin."; return; }
    grantBtn.disabled = true; msg.textContent = "";
    try {
      await authCall({ action: "setPlan", targetEmail, maxVenues, maxChefs, maxStaff, unlimited, days });
      msg.style.color = "#059669";
      msg.textContent = days > 0
        ? `Yetki uygulandı ✅ ${days} gün sonra demo'ya döner`
        : "Yetki uygulandı ✅ (süresiz)";
    } catch (e) {
      grantBtn.disabled = false;
      msg.textContent = (String(e.message) === "not_found") ? "Bu e-postayla kayıt bulunamadı."
        : (String(e.message) === "forbidden") ? "Bu işlem için yetkiniz yok." : "Olmadı (bağlantı?).";
    }
  };
  document.getElementById("pf_cancel").onclick = close;
  document.getElementById("pf_overlay").onclick = (e) => { if (e.target.id === "pf_overlay") close(); };
  document.getElementById("pf_save").onclick = async () => {
    const name = document.getElementById("pf_name").value.trim();
    const lang = document.getElementById("pf_lang").value;
    const pw = document.getElementById("pf_pw").value;
    const pw2 = document.getElementById("pf_pw2").value;
    const err = document.getElementById("pf_err");
    if (!name) { err.textContent = "Ad gerekli."; return; }
    if (pw && pw.length < 4) { err.textContent = "Şifre en az 4 karakter olmalı."; return; }
    if (pw && pw !== pw2) { err.textContent = "Şifreler uyuşmuyor."; return; }
    const saveBtn = document.getElementById("pf_save");
    saveBtn.disabled = true; err.textContent = "";
    try {
      if (pw) { await authCall({ action: "setPassword", password: pw }); } // kendi şifresi
      u.name = name;
      u.lang = lang;
      const orgEl = document.getElementById("pf_orgname");
      if (orgEl) DB.orgName = orgEl.value.trim();   // işletme adı (yönetici)
      localStorage.setItem("fixpre_lang", lang); // cihaz dili de güncel kalsın
      // Yönetici: onay yetkileri
      const apL = document.getElementById("ap_leave");
      const apS = document.getElementById("ap_shift");
      if (apL && apS) {
        if (!DB.approvals) DB.approvals = {};
        DB.approvals.leave = apL.value;
        DB.approvals.shift = apS.value;
      }
      // Yönetici: mesai saati modülü
      const tcE = document.getElementById("tc_enabled");
      if (tcE) {
        const tcL = document.getElementById("tc_loc");
        if (!DB.timeclock) DB.timeclock = {};
        DB.timeclock.enabled = tcE.checked;
        DB.timeclock.requireLocation = tcL ? tcL.checked : false;
      }
      saveDB(DB);
      showProfile = false;
      render();
    } catch (e) {
      saveBtn.disabled = false;
      err.textContent = "Kaydedilemedi (bağlantı?).";
    }
  };
}

/* --- Giriş ekranı --- */
function renderLogin() {
  const isLogin = authMode !== "register";
  const formHtml = isLogin ? `
        <div class="field">
          <label>E-posta</label>
          <input id="email" type="email" placeholder="ornek@firma.com" autocomplete="username" />
        </div>
        <div class="field">
          <label>Şifre</label>
          <input id="password" type="password" placeholder="••••••" autocomplete="current-password" />
        </div>
        <button class="btn-primary" id="loginBtn">Giriş Yap</button>
      ` : `
        <p class="auth-note">Yönetici olarak kayıt olun. Şeflerinizi ve personelinizi giriş yaptıktan sonra siz eklersiniz.</p>
        <div class="field">
          <label>İşletme adı</label>
          <input id="r_orgname" placeholder="Örn: Mola Kafe" />
        </div>
        <div class="field">
          <label>Ad Soyad</label>
          <input id="r_name" placeholder="Adınız Soyadınız" />
        </div>
        <div class="field">
          <label>E-posta</label>
          <input id="r_email" type="email" placeholder="ornek@firma.com" autocomplete="username" />
        </div>
        <div class="row">
          <div class="field">
            <label>Şifre</label>
            <input id="r_pw" type="password" placeholder="••••••" autocomplete="new-password" />
          </div>
          <div class="field">
            <label>Şifre (tekrar)</label>
            <input id="r_pw2" type="password" placeholder="••••••" autocomplete="new-password" />
          </div>
        </div>
        <button class="btn-primary" id="registerBtn">Kayıt Ol</button>
      `;

  const gl = guestLang();
  const langSel = LANGS.map(([k, l]) => `<option value="${k}" ${gl === k ? "selected" : ""}>${l}</option>`).join("");

  // 4 güçlü özellik — her biri kendi İngilizce mockup görseliyle
  const feats = [
    ["✅", "Onaylı Vardiya Değişimi", "Personel takas ister, yönetici onaylar; plan otomatik güncellenir. Telefon trafiği biter.", "vardiya-swap.svg"],
    ["⏱️", "Onaylı Mesai Takibi", "Eksik veya fazla mesai talebi tek onayla; bakiye otomatik hesaplanır.", "mesai.svg"],
    ["🔁", "Tekrarlanan Görevler", "Günlük ve haftalık görevleri bir kez kur; her gün kendi kendine düşsün, kim yaptı anında gör.", "tekrar.svg"],
    ["👑", "Hiyerarşik Düzen", "Yönetici → Şef → Personel; yetki ve görünürlük tamamen sende.", "hiyerarsi.svg"],
  ];
  const steps = [
    ["1", "Kaydolun", "Yönetici olarak ücretsiz hesap açın — saniyeler içinde, kurulum yok."],
    ["2", "Ekip & lokasyon ekleyin", "Lokasyonları, şefleri ve personeli ekleyin; yetkileri siz belirleyin."],
    ["3", "Görev & vardiya atayın", "Görevleri, son saatleri ve haftalık vardiyaları tanımlayın."],
    ["4", "Anlık takip edin", "Tamamlanma, gecikme, izin ve performansı tek ekrandan izleyin."],
  ];
  const reviews = [
    ["Ayşe K.", "Kafe işletmecisi", "Excel ve WhatsApp karmaşası bitti. Sabah görevleri atıyorum, kim yaptı kim yapmadı anında görüyorum."],
    ["Mehmet D.", "Restoran müdürü", "Vardiya ve izin için sürekli telefon trafiği vardı; artık her şey uygulamada, onaylıyorum bitiyor."],
    ["Elif T.", "Market zinciri", "Çok şubemiz var; her lokasyonu ayrı yönetebiliyorum. Arayüz çok basit, personel hemen alıştı."],
  ];
  const faqs = [
    ["Fixpre ücretsiz mi?", "Evet, 7 gün boyunca tüm özellikleri ücretsiz deneyebilirsiniz; kredi kartı gerekmez. Ücretli paketler çok yakında."],
    ["Kurulum gerekiyor mu?", "Hayır. Tarayıcıdan girersiniz; isterseniz telefonunuza uygulama gibi ekleyebilirsiniz (PWA)."],
    ["Personelin telefonuna bildirim gider mi?", "Evet. Görev, talep ve duyurular; uygulama kapalıyken bile anlık bildirim olarak gider."],
    ["Birden fazla şubem var, yönetebilir miyim?", "Evet. Lokasyon bazlı düzen sayesinde her şubeyi, şefi ve personeli ayrı yönetirsiniz."],
    ["Vardiya ve izin değişikliğini nasıl yönetiyorum?", "Personel talep gönderir; takasta önce karşı personel, sonra yönetici/şef onaylar. Onaylanınca plan otomatik güncellenir."],
    ["Hangi dilleri destekliyor?", "Türkçe, İngilizce, Almanca, Rusça, İspanyolca ve İtalyanca — herkes kendi dilinde kullanır."],
    ["Verilerim güvende mi?", "Şifreler şifrelenir, her işletmenin verisi birbirinden izoledir ve bulutta yedeklenir."],
    ["Görevlere son saat koyabilir miyim?", "Evet. Son saat belirlersiniz; bitmesine 1 saat kala ilgili personele otomatik uyarı gider."],
    ["Personelin konumu sürekli takip ediliyor mu?", "Hayır. Konum yalnızca personel mesaiye giriş/çıkış yaparken, mekânda olduğunu doğrulamak için bir kez alınır — canlı veya sürekli takip yapılmaz. Tam konum saklanmaz; yalnızca mekâna yakın olup olmadığı kaydedilir. Bu özellik tamamen opsiyoneldir, işletme açıp kapatabilir."],
  ];
  app.innerHTML = `
    <div class="landing">
      <header class="lp-nav">
        <div class="brand"><img class="brand-logo" src="icon-192.png" alt="" /> Fixpre</div>
        <div class="lp-nav-right">
          <select id="login_lang" class="lp-lang">${langSel}</select>
          <a href="#giris" class="btn-primary btn-sm lp-login-link">Giriş Yap</a>
        </div>
      </header>

      <section class="lp-hero">
        <div class="lp-hero-grid">
          <div class="lp-hero-txt">
            <span class="lp-eyebrow">☕ Kafe & Restoranlar için</span>
            <h1>Personel Takibini Kolaylaştıran Akıllı Sistem</h1>
            <p class="lp-lead">Mesai, görev, kontrol ve raporlama — tek panelde.</p>
            <div class="lp-hero-cta">
              <a href="#giris" class="btn-primary lp-cta">🚀 Ücretsiz Başla</a>
              <a href="#ozellikler" class="lp-cta-ghost">Nasıl çalışır?</a>
            </div>
            <div class="lp-trial">🎁 7 gün ücretsiz deneme · kredi kartı gerekmez</div>
            <div class="lp-hero-mini"><span>✓ Kurulum yok</span><span>✓ Anlık bildirim</span><span>✓ 6 dil</span></div>
          </div>
          <div class="lp-hero-art">
            <img src="shots/dashboard.svg" alt="Fixpre kontrol paneli" loading="eager" />
          </div>
        </div>
      </section>

      <section class="lp-spotlight">
        <div class="lp-spot-card">
          <div class="lp-spot-txt">
            <span class="lp-badge">✨ YENİ</span>
            <h2>📍 Konumlu Mesai Takibi</h2>
            <p>Personel mesaiye telefondan başlar — sadece mekândayken. Giriş-çıkış ve çalışılan süre otomatik, doğru kaydedilir.</p>
          </div>
          <div class="lp-spot-art">
            <img src="shots/mesai-clock.svg" alt="Konumlu mesai takibi" loading="lazy" onerror="this.style.display='none'" />
          </div>
        </div>
      </section>

      <section class="lp-trustbar">
        <div class="lp-trust-item"><b>★★★★★</b><span>Kafe & restoranların tercihi</span></div>
        <div class="lp-trust-item"><b>📲</b><span>Telefonda tam ekran</span></div>
        <div class="lp-trust-item"><b>🔔</b><span>App kapalıyken bile bildirim</span></div>
        <div class="lp-trust-item"><b>🔒</b><span>Verisi izole & yedekli</span></div>
      </section>

      <section class="lp-feats" id="ozellikler">
        <div class="lp-sec-head">
          <span class="lp-eyebrow">Neden Fixpre?</span>
          <h2>İşletmeni tek panelden yönet</h2>
        </div>
        ${feats.map(([ic, ttl, d, img], i) => `
          <div class="lp-feat ${i % 2 ? "rev" : ""}">
            <div class="lp-feat-art">
              <img src="shots/${img}" alt="${ttl}" loading="lazy" onerror="this.closest('.lp-feat-art').classList.add('noimg')" />
              <span class="lp-feat-ph">${ic}</span>
            </div>
            <div class="lp-feat-txt">
              <div class="lp-feat-ic">${ic}</div>
              <h3>${ttl}</h3>
              <p>${d}</p>
            </div>
          </div>`).join("")}
      </section>

      <section class="lp-how">
        <h2>Nasıl çalışır?</h2>
        <p class="lp-lead">4 adımda başlayın — teknik bilgi gerekmez.</p>
        <div class="lp-steps">
          ${steps.map(([n, ttl, d]) => `<div class="lp-step"><div class="lp-step-n">${n}</div><h3>${ttl}</h3><p>${d}</p></div>`).join("")}
        </div>
      </section>

      <section class="lp-reviews">
        <h2>Kullananlar ne diyor?</h2>
        <div class="lp-reviews-grid">
          ${reviews.map(([n, role, txt]) => `
            <div class="lp-review">
              <div class="lp-stars">★★★★★</div>
              <p>"${txt}"</p>
              <div class="lp-review-who"><strong>${esc(n)}</strong> · ${role}</div>
            </div>`).join("")}
        </div>
        <p class="lp-lead lp-trust">🔒 Şifreler şifreli · 🏢 Her işletmenin verisi izole · ☁️ Bulutta yedekli</p>
      </section>

      <section class="lp-cta-band">
        <div class="lp-cta-inner">
          <h2>30 saniyede kur, bugün düzene gir.</h2>
          <p>7 gün ücretsiz · kredi kartı yok · kurulum yok.</p>
          <a href="#giris" class="btn-primary lp-cta lg">🚀 Ücretsiz Başla</a>
          <div class="lp-install" id="lp-install">
            <button class="lp-install-link" id="installBtn">📲 Ana ekrana ekle</button>
            <p class="lp-install-tip" id="installTip"></p>
          </div>
        </div>
      </section>

      <div class="login-wrap" id="giris">
        <div class="login-card">
          <h1><img class="brand-logo lg" src="icon-192.png" alt="" /> Fixpre</h1>
          <div class="sub">Personel görev yönetimi</div>
          <div class="domain">fixpre.com</div>
          <div class="auth-tabs">
            <button class="auth-tab ${isLogin ? "active" : ""}" data-auth="login">Giriş Yap</button>
            <button class="auth-tab ${!isLogin ? "active" : ""}" data-auth="register">Kayıt Ol</button>
          </div>
          ${formHtml}
          <div class="error-msg" id="loginErr"></div>
        </div>
      </div>

      <section class="lp-faq">
        <h2>Sıkça Sorulan Sorular</h2>
        ${faqs.map(([q, a]) => `<details class="lp-faq-item"><summary>${q}</summary><div class="lp-faq-a">${a}</div></details>`).join("")}
      </section>

      <section class="lp-seo">
        <h2>Personel takip ve vardiya programı</h2>
        <p class="lp-lead">Fixpre, işletmeler için online personel takip programı, vardiya planlama programı ve izin takip uygulamasıdır. Personele görev atama, haftalık vardiya çizelgesi oluşturma, vardiya değişikliği ve takası, izin/mesai takibi, talep ve duyuru yönetimini tek yerde sunar. Restoran personel yönetimi, kafe ve market vardiya programı arıyorsanız Excel'e gerek kalmadan ücretsiz başlayın.</p>
        <a href="#giris" class="btn-primary lp-cta">Hemen Ücretsiz Başla</a>
      </section>
      <footer class="lp-foot">© Fixpre · fixpre.com — personel görev, vardiya ve izin yönetim uygulaması</footer>
    </div>
  `;

  document.getElementById("login_lang").onchange = (e) => {
    localStorage.setItem("fixpre_lang", e.target.value);
    render();
  };

  // "Ana ekrana ekle" bölümü — kuruluysa gizle; değilse butonu cihaza göre çalıştır
  const installSec = document.getElementById("lp-install");
  if (installSec) {
    if (isStandaloneApp()) {
      installSec.style.display = "none";
    } else {
      const ios = isIOSDevice();
      const tip = document.getElementById("installTip");
      const btn = document.getElementById("installBtn");
      if (tip) {
        tip.textContent = ios
          ? t('iPhone: Safari\'de alttaki Paylaş düğmesine dokun, sonra "Ana Ekrana Ekle"yi seç.')
          : t('Butona dokun ve "Ekle"yi onayla. Görünmezse tarayıcı menüsünden (⋮) "Ana ekrana ekle" de.');
      }
      // beforeinstallprompt henüz gelmediyse butonu yine gösteriyoruz (yönerge için)
      if (btn) {
        btn.onclick = async () => {
          if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            try { await deferredInstallPrompt.userChoice; } catch (e2) {}
            deferredInstallPrompt = null;
          } else if (tip) {
            tip.classList.add("show");
            tip.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        };
      }
    }
  }

  // Üst bar: aşağı kayınca hafif cam efekti
  const lpNav = app.querySelector(".lp-nav");
  if (lpNav) {
    const onScroll = () => lpNav.classList.toggle("scrolled", window.scrollY > 10);
    window.onscroll = onScroll;
    onScroll();
  }

  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.onclick = () => { authMode = t.dataset.auth; render(); };
  });

  if (isLogin) {
    const tryLogin = async () => {
      const email = document.getElementById("email").value;
      const pw = document.getElementById("password").value;
      const err = document.getElementById("loginErr");
      const btn = document.getElementById("loginBtn");
      err.textContent = ""; btn.disabled = true;
      try {
        await doLogin(email, pw);
        activeTab = "bugun"; staffTab = "bugun";
        render();
      } catch (e) {
        btn.disabled = false;
        err.textContent = (String(e.message) === "bad_credentials")
          ? "E-posta veya şifre hatalı."
          : "Giriş yapılamadı. Bağlantını kontrol et.";
      }
    };
    document.getElementById("loginBtn").onclick = tryLogin;
    document.getElementById("password").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryLogin();
    });
  } else {
    const tryRegister = async () => {
      const orgName = document.getElementById("r_orgname").value.trim();
      const name = document.getElementById("r_name").value.trim();
      const email = document.getElementById("r_email").value.trim();
      const pw = document.getElementById("r_pw").value;
      const pw2 = document.getElementById("r_pw2").value;
      const err = document.getElementById("loginErr");
      if (!orgName || !name || !email || !pw) { err.textContent = "Lütfen tüm alanları doldurun."; return; }
      if (pw.length < 4) { err.textContent = "Şifre en az 4 karakter olmalı."; return; }
      if (pw !== pw2) { err.textContent = "Şifreler uyuşmuyor."; return; }
      const btn = document.getElementById("registerBtn");
      err.textContent = ""; btn.disabled = true;
      try {
        await doRegister(name, email, pw, orgName);
        const me = currentUser();
        if (me) { me.lang = guestLang(); saveDB(DB); } // seçilen dili uygula (varsayılan İngilizce)
        activeTab = "bugun"; staffTab = "bugun";
        render();
      } catch (e) {
        btn.disabled = false;
        err.textContent = (String(e.message) === "email_taken")
          ? "Bu e-posta zaten kayıtlı."
          : "Kayıt yapılamadı. Bağlantını kontrol et.";
      }
    };
    document.getElementById("registerBtn").onclick = tryRegister;
    document.getElementById("r_pw2").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryRegister();
    });
  }
}

/* --- Üst bar --- */
function topbar(u) {
  const roleBadge = u.role === "yonetici"
    ? `<span class="badge badge-mgr">Yönetici</span>`
    : u.role === "sef"
      ? `<span class="badge badge-chef">Şef</span>`
      : `<span class="badge badge-staff">Personel</span>`;
  return `
    <div class="topbar">
      <div class="brand"><img class="brand-logo" src="icon-192.png" alt="" /> Fixpre</div>
      <div class="user-info">
        ${roleBadge}
        <span>${esc(u.name)}</span>
        ${(u.role === "yonetici" || u.role === "sef") ? `<button class="btn-ghost btn-sm icon-btn" id="announceBtn" title="Duyuru Yap">📢</button>` : ""}
        <button class="btn-ghost btn-sm icon-btn" id="profileBtn" title="Profil">⚙️</button>
        <button class="btn-ghost btn-sm" id="logoutBtn">Çıkış</button>
      </div>
    </div>
  `;
}

function wireCommon() {
  const lb = document.getElementById("logoutBtn");
  if (lb) lb.onclick = logout;
  const pb = document.getElementById("profileBtn");
  if (pb) pb.onclick = () => { showProfile = true; render(); };
  const ab = document.getElementById("announceBtn");
  if (ab) ab.onclick = () => { showAnnounce = true; render(); };
}

/* ============================================================
   YÖNETİCİ EKRANI
   ============================================================ */
function renderManager(u) {
  const isOwner = u.role === "yonetici";
  const openReports = incomingReports(u).filter((r) => r.status === "acik").length;
  const bildirimLabel = "Talepler" + (openReports ? ` (${openReports})` : "");
  const leaveApproveCnt = (u.role === "sef" && approvalSetting("leave") === "sef")
    ? orgLeaves(ownerIdOf(u)).filter((l) => l.status === "beklemede" && canApproveLeave(u, l.createdBy)).length : 0;
  const leaveCount = isOwner
    ? orgLeaves(ownerIdOf(u)).filter((l) => l.status === "beklemede").length
    : myLeaves(u).filter((l) => l.status !== "beklemede" && !l.seenByReporter).length + leaveApproveCnt;
  const izinLabel = "İzin / Mesai" + (leaveCount ? ` (${leaveCount})` : "");
  const shiftApproveCnt = (u.role === "sef" && approvalSetting("shift") === "sef")
    ? (DB.shiftReqs || []).filter((r) => r.ownerId === ownerIdOf(u) && r.status === "beklemede" && canApproveShift(u, r.requesterId)).length : 0;
  const vardiyaCount = isOwner
    ? (DB.shiftReqs || []).filter((r) => r.ownerId === ownerIdOf(u) && r.status === "beklemede").length
    : (DB.shiftReqs || []).filter((r) => (r.withUserId === u.id && r.status === "personel_onay") ||
        (r.requesterId === u.id && (r.status === "onaylandi" || r.status === "reddedildi") && !r.seenByReporter)).length + shiftApproveCnt;
  const vardiyaLabel = "Vardiya" + (vardiyaCount ? ` (${vardiyaCount})` : "");
  const tabs = isOwner
    ? [
        ["bugun", "Pano"],
        ["gorevler", "Tüm Görevler"],
        ["sefler", "Şefler"],
        ["mekanlar", "Mekanlar"],
        ["personel", "Personel"],
        ["performans", "Performans"],
        ["vardiya", "Vardiya"],
        ["bildirim", bildirimLabel],
        ["izin", izinLabel],
        ["kayitlar", "Kayıtlar"],
        ["paketler", "Paketler"],
        ["leads", "İlgi Talepleri"],
      ]
    : [
        ["bugun", "Pano"],
        ["gorevler", "Görevler"],
        ["banaatanan", "Bana Atanan"],
        ["mekanlar", "Mekanlarım"],
        ["personel", "Personelim"],
        ["vardiya", "Vardiya"],
        ["bildirim", bildirimLabel],
        ["izin", izinLabel],
        ["kayitlar", "Kayıtlar"],
      ];

  // Gruplu üst menü (az sekme + açılır "Ekip" / "Daha Fazla")
  const nav = isOwner
    ? [
        { k: "bugun", l: "Pano" },
        { k: "gorevler", l: "Tüm Görevler" },
        { grp: "Ekip", items: [["sefler", "Şefler"], ["mekanlar", "Lokasyonlar"], ["personel", "Personel"]] },
        { k: "vardiya", l: vardiyaLabel },
        { k: "bildirim", l: bildirimLabel },
        { k: "izin", l: izinLabel },
        { grp: "Daha Fazla", items: [["performans", "Performans"], ["kayitlar", "Kayıtlar"], ["paketler", "Paketler"], ...(u.email === SUPER_EMAIL ? [["leads", "İlgi Talepleri"]] : [])] },
      ]
    : [
        { k: "bugun", l: "Pano" },
        { k: "gorevler", l: "Görevler" },
        { k: "banaatanan", l: "Bana Atanan" },
        { grp: "Ekip", items: [["mekanlar", "Lokasyonlarım"], ["personel", "Personelim"]] },
        { k: "vardiya", l: vardiyaLabel },
        { k: "bildirim", l: bildirimLabel },
        { k: "izin", l: izinLabel },
        { k: "kayitlar", l: "Kayıtlar" },
      ];
  // Mesai saati modülü açıksa "Mesai" sekmesini ekle ("Daha Fazla" grubuna; yoksa üst seviye)
  if (clockOn()) {
    tabs.push(["mesai", "Mesai Saati"]);
    const moreGrp = nav.find((x) => x.grp === "Daha Fazla");
    if (moreGrp) moreGrp.items.push(["mesai", "Mesai Saati"]);
    else nav.push({ k: "mesai", l: "Mesai Saati" });
  }

  // şef olmayan bir sekme açılmışsa Bugün'e düş
  if (!tabs.some(([k]) => k === activeTab)) activeTab = "bugun";

  let body = "";
  if (activeTab === "gorevler") body = mgrTasks(u);
  else if (activeTab === "sefler") body = mgrChefs(u);
  else if (activeTab === "banaatanan") body = assignedToMe(u);
  else if (activeTab === "personel") body = mgrStaff(u);
  else if (activeTab === "mekanlar") body = mgrVenues(u);
  else if (activeTab === "kayitlar") body = mgrLog(u);
  else if (activeTab === "bildirim") body = reportsView(u);
  else if (activeTab === "izin") body = leavesView(u);
  else if (activeTab === "performans") body = perfView(u);
  else if (activeTab === "paketler") body = packagesView(u);
  else if (activeTab === "leads") body = leadsView(u);
  else if (activeTab === "vardiya") body = shiftView(u);
  else if (activeTab === "mesai") body = mesaiView(u);
  else body = mgrDashboard(u);

  app.innerHTML = topbar(u) + `
    <div class="container">
      <div class="tabs">
        ${nav.map((item) => {
          if (item.grp) {
            const gActive = item.items.some(([k]) => k === activeTab);
            return `<details class="tab-group${gActive ? " active" : ""}">
              <summary class="tab${gActive ? " active" : ""}">${item.grp} ▾</summary>
              <div class="tab-menu">
                ${item.items.map(([k, l]) => `<button class="tab-sub${activeTab === k ? " active" : ""}" data-tab="${k}">${l}</button>`).join("")}
              </div>
            </details>`;
          }
          return `<button class="tab${activeTab === item.k ? " active" : ""}" data-tab="${item.k}">${item.l}</button>`;
        }).join("")}
      </div>
      ${body}
    </div>
    ${editingTask ? taskEditModal(u) : ""}
  `;
  wireCommon();
  wireClock(u);
  if (activeTab === "mesai") wireRange("mesai", (v) => mesaiFrom = v, (v) => mesaiTo = v);
  document.querySelectorAll("[data-tab]").forEach((t) => {
    t.onclick = () => {
      activeTab = t.dataset.tab;
      selectedVenue = null;
      selectedChef = null;
      editingStaff = null;
      editingTask = null;
      sharingTask = null;
      render();
    };
  });
  // sekmeye özel bağlamalar
  if (activeTab === "gorevler") wireMgrTasks(u);
  else if (activeTab === "sefler") wireMgrChefs(u);
  else if (activeTab === "banaatanan") wireChefAssigned(u);
  else if (activeTab === "personel") wireMgrStaff(u);
  else if (activeTab === "mekanlar") wireMgrVenues(u);
  else if (activeTab === "kayitlar") wireRange("log", (v) => logFrom = v, (v) => logTo = v);
  else if (activeTab === "bildirim") wireReports(u);
  else if (activeTab === "izin") wireLeaves(u);
  else if (activeTab === "performans") {
    wireRange("perf", (v) => perfFrom = v, (v) => perfTo = v);
    const pb = document.getElementById("perf_pdf");
    if (pb) pb.onclick = () => window.print();
  }
  else if (activeTab === "vardiya") wireShift(u);
  else if (activeTab === "paketler") wirePackages(u);
  else if (activeTab === "leads") wireLeadsView(u);
  else wireDashboard(u);

  if (editingTask) wireTaskEdit(u);
}

/* --- Görev düzenleme penceresi (modal) --- */
function taskEditModal(u) {
  const t = DB.tasks.find((x) => x.id === editingTask);
  if (!t || t.ownerId !== ownerIdOf(u)) return "";
  // Şef: kendi oluşturduğu VEYA kendi lokasyonundaki görevi düzenleyebilir (devralma)
  if (u.role === "sef" && !(t.createdBy === u.id || (t.venueId && (u.venueIds || []).includes(t.venueId)))) return "";
  const staff = assignableUsers(u);
  const venues = visibleVenues(u);
  const rec = t.recurrence || { type: "once" };
  const wdays = rec.days || [];
  const mdates = rec.dates || [];

  const venueOpts = `<option value="">Mekan seçin (opsiyonel)</option>` +
    venues.map((v) => `<option value="${v.id}" ${t.venueId === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("");

  const staffChecks = staff.length
    ? staff.map((s) => {
        const on = t.assignedUserIds.includes(s.id);
        return `<label class="check-pill ${on ? "sel" : ""}"><input type="checkbox" class="et_assignee" value="${s.id}" ${on ? "checked" : ""} />${roleIcon(s)} ${esc(s.name)}${s.role === "sef" ? " (şef)" : ""}</label>`;
      }).join("")
    : `<div class="empty">Atanabilecek kişi yok.</div>`;

  return `
    <div class="modal-overlay" id="et_overlay">
      <div class="modal">
        <h2>⚙️ Görevi Düzenle</h2>
        <div class="field"><label>Görev başlığı</label><input id="et_title" value="${esc(t.title)}" /></div>
        <div class="field"><label>Açıklama</label><textarea id="et_desc">${esc(t.description || "")}</textarea></div>
        <div class="field"><label>Mekan</label><select id="et_venue">${venueOpts}</select></div>
        <div class="field">
          <label>Tekrar</label>
          <select id="et_rec">
            <option value="once" ${rec.type === "once" ? "selected" : ""}>Tek seferlik</option>
            <option value="daily" ${rec.type === "daily" ? "selected" : ""}>Her gün tekrar etsin</option>
            <option value="weekly" ${rec.type === "weekly" ? "selected" : ""}>Haftalık — belirli günler</option>
            <option value="monthly" ${rec.type === "monthly" ? "selected" : ""}>Aylık — belirli tarihler</option>
          </select>
        </div>
        <div class="field" id="et_recw" style="display:${rec.type === "weekly" ? "" : "none"}">
          <label>Hangi günler?</label>
          <div class="checks">
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="check-pill ${wdays.includes(d) ? "sel" : ""}"><input type="checkbox" class="et_wday" value="${d}" ${wdays.includes(d) ? "checked" : ""} />${WD[d]}</label>`).join("")}
          </div>
        </div>
        <div class="field" id="et_recm" style="display:${rec.type === "monthly" ? "" : "none"}">
          <label>Ayın hangi günleri?</label>
          <div class="checks day-grid">
            ${Array.from({ length: 31 }, (_, i) => i + 1).map((n) => `<label class="check-pill mini ${mdates.includes(n) ? "sel" : ""}"><input type="checkbox" class="et_mday" value="${n}" ${mdates.includes(n) ? "checked" : ""} />${n}</label>`).join("")}
          </div>
        </div>
        <div class="field"><label>🕐 Başlama saati (opsiyonel) — bu saatten önce tamamlanamaz</label><input id="et_starttime" type="time" value="${t.startTime || ""}" /></div>
        <div class="field"><label>⏰ Son yapılma saati (opsiyonel) — bitmesine 1 saat kala uyarı gider</label><input id="et_duetime" type="time" value="${t.dueTime || ""}" /></div>
        <div class="field"><label>Atanan personel (birden fazla seçebilirsiniz)</label><div class="checks">${staffChecks}</div></div>
        <div class="form-actions">
          <button class="btn-primary" id="et_save">Kaydet</button>
          <button class="btn-ghost" id="et_cancel">İptal</button>
        </div>
        <div class="error-msg" id="et_err"></div>
      </div>
    </div>`;
}

function wireTaskEdit(u) {
  const overlay = document.getElementById("et_overlay");
  if (!overlay) return;

  document.querySelectorAll(".et_assignee, .et_wday, .et_mday").forEach((cb) => {
    cb.onchange = () => cb.closest(".check-pill").classList.toggle("sel", cb.checked);
  });

  const recSel = document.getElementById("et_rec");
  const sync = () => {
    const v = recSel.value;
    document.getElementById("et_recw").style.display = v === "weekly" ? "" : "none";
    document.getElementById("et_recm").style.display = v === "monthly" ? "" : "none";
  };
  recSel.onchange = sync;

  const close = () => { editingTask = null; render(); };
  document.getElementById("et_cancel").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  document.getElementById("et_save").onclick = () => {
    const t = DB.tasks.find((x) => x.id === editingTask);
    if (!t) { close(); return; }
    if (!canEditTask(currentUser(), t)) { close(); return; }   // yetkisiz değişikliği engelle
    const title = document.getElementById("et_title").value.trim();
    const desc = document.getElementById("et_desc").value.trim();
    const venueId = document.getElementById("et_venue").value || null;
    const recType = document.getElementById("et_rec").value;
    const assignees = Array.from(document.querySelectorAll(".et_assignee:checked")).map((c) => c.value);
    const err = document.getElementById("et_err");
    if (!title) { err.textContent = "Görev başlığı gerekli."; return; }
    if (!assignees.length) { err.textContent = "En az bir personel seçin."; return; }
    const recurrence = { type: recType };
    if (recType === "weekly") {
      recurrence.days = Array.from(document.querySelectorAll(".et_wday:checked")).map((c) => +c.value);
      if (!recurrence.days.length) { err.textContent = "Haftalık için en az bir gün seçin."; return; }
    }
    if (recType === "monthly") {
      recurrence.dates = Array.from(document.querySelectorAll(".et_mday:checked")).map((c) => +c.value);
      if (!recurrence.dates.length) { err.textContent = "Aylık için en az bir tarih seçin."; return; }
    }
    t.title = title;
    t.description = desc;
    t.venueId = venueId;
    t.recurrence = recurrence;
    t.assignedUserIds = assignees;
    t.startTime = document.getElementById("et_starttime").value || null;
    t.dueTime = document.getElementById("et_duetime").value || null;
    // Başka bir kişi düzenlediyse "değiştiren" notu; asıl oluşturan düzenlerse not silinir
    const editor = currentUser();
    if (editor && editor.id !== t.createdBy) { t.lastEditBy = editor.id; t.lastEditAt = new Date().toISOString(); }
    else { t.lastEditBy = null; t.lastEditAt = null; }
    saveDB(DB);
    editingTask = null;
    render();
  };
}

/* --- Pano (dashboard): özet + geciken görevler + bugün --- */
function statCard(label, value, kind, icon) {
  return `<div class="stat-card ${kind}">
    <div class="stat-icon">${icon || ""}</div>
    <div class="stat-body"><div class="stat-val">${value}</div><div class="stat-label">${label}</div></div>
  </div>`;
}

// Kırmızı geciken görevler panosu. forStaff=true ise "Şimdi tamamla"; withFilter=true ise tarih filtresi (içeride).
function overdueBoard(missed, forStaff, withFilter) {
  const rows = missed.map((m) => {
    const t = m.task;
    const v = t.venueId ? venueById(t.venueId) : null;
    const names = t.assignedUserIds.map((id) => { const x = userById(id); return x ? x.name : "Silinmiş"; }).join(", ") || "—";
    return `<div class="overdue-item">
      <div>
        <div class="title">${esc(t.title)}</div>
        <div class="meta">📅 ${m.dayLabel}${v ? " · 📍 " + esc(v.name) : ""}${forStaff ? "" : " · 👥 " + esc(names)}</div>
      </div>
      ${forStaff ? `<div class="overdue-actions">
        <input class="lnote" data-lnote="${t.id}|${m.dateKey}" placeholder="Not (ops.)" />
        <button class="btn-late" data-late="${t.id}|${m.dateKey}">Şimdi tamamla</button>
      </div>` : ""}
    </div>`;
  }).join("");
  const filter = withFilter ? `
    <details class="reads-toggle" style="margin-bottom:10px;border-top:none;padding-top:0">
      <summary>📅 Tarihe göre filtrele</summary>
      <div style="padding-top:8px">${rangeFilter("dash", dashFrom, dashTo)}</div>
    </details>` : "";
  return `
    <div class="overdue-board">
      <div class="overdue-head">🔴 Geciken Görevler (${missed.length})</div>
      ${filter}
      ${missed.length ? rows : `<div class="overdue-empty">Geciken görev yok. 🎉</div>`}
    </div>`;
}

// Bir görevin belirli günü için en son geri alma kaydı (görev kartında gösterilir)
function lastUndoFor(t, key) {
  const evs = DB.undoLog.filter((e) => e.taskId === t.id && e.dateKey === key);
  if (!evs.length) return null;
  return evs.slice().sort((a, b) => new Date(b.at) - new Date(a.at))[0];
}

// Bu haftanın (Pzt–Paz) en çok görev tamamlayan personeli — ödül/rekabet kartı
function weekStar(tasks) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7;                 // Pazartesi = 0
  const mon = new Date(d); mon.setDate(d.getDate() - dow);
  const nextMon = new Date(mon); nextMon.setDate(mon.getDate() + 7);
  const cnt = {};
  tasks.forEach((t) => {
    const comps = t.completions || {};
    Object.keys(comps).forEach((k) => {
      const c = comps[k];
      if (!c || !c.by || !c.at) return;
      const at = new Date(c.at);
      if (at >= mon && at < nextMon) cnt[c.by] = (cnt[c.by] || 0) + 1;
    });
  });
  let bestId = null, best = 0;
  Object.keys(cnt).forEach((id) => { if (cnt[id] > best) { best = cnt[id]; bestId = id; } });
  if (!bestId) return null;
  return { user: userById(bestId), count: best };
}
function weekStarCard(tasks) {
  const s = weekStar(tasks);
  if (!s || !s.user) return "";
  return `
    <div class="week-star">
      <div class="ws-crown">👑</div>
      <div class="ws-body">
        <div class="ws-label">★ Haftanın Yıldızı</div>
        <div class="ws-name">${esc(s.user.name)}</div>
      </div>
      <div class="ws-count">${s.count} ✓</div>
    </div>`;
}

// Bugünkü görev ilerleme yüzdesi + tempoya göre eğlenceli mesaj
function progressMsg(p) {
  if (p >= 100) return "🎉 Harikasınız! Tüm görevler tamam!";
  if (p >= 70) return "✈️ Uçuşa geçtik — az kaldı!";
  if (p >= 50) return "🏃 Hareketlilik başladı!";
  if (p >= 30) return "🔥 Tempo yükseliyor!";
  if (p > 0) return "☕ Isınıyoruz — ekip daha kahvede!";
  return "🌅 Gün yeni başlıyor — ilk görevi kapın!";
}
function progressCard(active, done) {
  const total = active.length + done.length;
  if (!total) return "";   // bugün görev yoksa gösterme
  const p = Math.round((done.length / total) * 100);
  const C = 326.73;                          // 2πr (r=52)
  const off = (C * (1 - p / 100)).toFixed(1);
  return `
    <div class="prog-card glass${p >= 100 ? " celebrate" : ""}">
      <div class="prog-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#ec4899"/>
          </linearGradient></defs>
          <circle cx="60" cy="60" r="52" fill="none" stroke="#eef2ff" stroke-width="12"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="url(#ringg)" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)"/>
          <text x="60" y="69" text-anchor="middle" font-size="27" font-weight="800" fill="#1e1b3a">${p}%</text>
        </svg>
      </div>
      <div class="prog-info">
        <div class="prog-eyebrow">BUGÜNKÜ İLERLEME</div>
        <div class="prog-msg">${progressMsg(p)}</div>
        <div class="prog-sub">${done.length} / ${total} ✓</div>
      </div>
    </div>`;
}

function mgrDashboard(u) {
  const all = visibleTasks(u);
  const todays = all.filter(occursToday);
  const active = todays.filter((t) => !doneForKey(t, occKeyToday(t)));
  const done = todays.filter((t) => doneTodayFor(t));   // yalnızca BUGÜN tamamlananlar
  const missed = pastMissedFor(all, dashFrom, dashTo);
  const openRep = incomingReports(u).filter((r) => r.status === "acik").length;
  const dateStr = new Date().toLocaleDateString(currentLocale(), {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  // Şefe atanan (kendisinin yapacağı) bugünkü görevler — panoda da göster
  const myAssigned = (u.role === "sef")
    ? DB.tasks.filter((t) => t.assignedUserIds.includes(u.id) && occursToday(t) && taskVenueOk(t, u))
        .sort((a, b) => {
          const ad = !!a.completions[occKeyToday(a)];
          const bd = !!b.completions[occKeyToday(b)];
          if (ad !== bd) return ad ? 1 : -1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        })
    : [];
  if (myAssigned.length) markReads(u, myAssigned);
  const myPending = myAssigned.filter((t) => !t.completions[occKeyToday(t)]).length;
  const assignedSection = myAssigned.length ? `
    <h3 style="margin:0 0 12px">📌 Bana Atanan Görevler (${myPending} bekliyor)</h3>
    ${myAssigned.map((t) => staffTaskCard(t, u, shareBlock(t, u))).join("")}
  ` : "";

  return `
    ${(orgPlan.expired || (orgPlan.daysLeft != null && orgPlan.daysLeft <= 7)) ? planStatusBanner() : ""}
    ${resolvedBanner(u)}
    ${leaveBanner(u)}
    ${(() => {
      const h = new Date().getHours();
      const g = h < 6 ? "🌙 İyi geceler" : h < 12 ? "☀️ Günaydın" : h < 18 ? "👋 İyi günler" : "🌆 İyi akşamlar";
      const first = esc((u.name || "").split(" ")[0] || "");
      return `<div class="dash-greet"><div class="dg-hi"><span>${g}</span>, ${first}!</div><div class="dg-date">📅 ${dateStr}</div></div>`;
    })()}
    ${clockCard(u)}
    ${weekStarCard(all)}
    <div class="stats">
      ${statCard("Bugün Aktif", active.length, "blue", "🔄")}
      ${statCard("Bugün Biten", done.length, "green", "✅")}
      ${statCard("Açık Talep", openRep, "amber", "📨")}
      ${statCard("Toplam Görev", all.length, "gray", "📋")}
    </div>
    ${progressCard(active, done)}

    ${assignedSection}
    ${announcementsBoard(u)}
    ${reportsPanel(u)}
    ${overdueBoard(missed, false, true)}

    <h3 style="margin:0 0 12px">🔄 Bugün Aktif (${active.length})</h3>
    ${active.length ? venueCategories(u, active) : `<div class="empty">Bugün bekleyen görev yok. 🎉</div>`}
    <h3 style="margin:26px 0 12px">✅ Bugün Biten (${done.length})</h3>
    ${done.length ? venueCategories(u, done) : `<div class="empty">Bugün henüz tamamlanan görev yok.</div>`}
  `;
}

// Pano bağlamaları: görev kartı butonları + geciken tarih filtresi
function wireDashboard(u) {
  wireDelTask();
  wireRange("dash", (v) => dashFrom = v, (v) => dashTo = v);
  wireReports(u);
  wireAnnouncements(u);
  if (u.role === "sef") wireChefAssigned(u); // panodaki "Bana Atanan" görevleri için
}

/* ============================================================
   PERSONEL PERFORMANSI (yalnızca yönetici)
   ============================================================ */
// Bir tamamlama zamanında mı yapıldı?
function perfOnTime(t, dateKey, at) {
  if (dateKey === "once") {
    if (!t.dueAt) return true;             // son tarihi yoksa zamanında say
    return new Date(at) <= new Date(t.dueAt);
  }
  const doneDay = ymd(new Date(at));
  if (doneDay > dateKey) return false;     // sonraki gün → geç
  if (doneDay < dateKey) return true;      // önceki gün (erken) → zamanında
  // aynı gün: son saat (dueTime) varsa, o saate kadar yapıldıysa zamanında; sonra → geç
  if (t.dueTime && /^\d{1,2}:\d{2}$/.test(t.dueTime)) {
    const d = new Date(at);
    const [hh, mm] = t.dueTime.split(":").map(Number);
    return (d.getHours() * 60 + d.getMinutes()) <= (hh * 60 + mm);
  }
  return true;
}

// Bugün son saati (dueTime) geçmiş ama henüz yapılmamış görevler → ekip gecikmesi
function dueTimeMissedToday(tasks, from, to) {
  const tk = todayKey();
  if (!dkInRange(tk, from, to)) return [];      // bugün aralık dışındaysa sayma
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return tasks.filter((t) => {
    if (!t.dueTime || !/^\d{1,2}:\d{2}$/.test(t.dueTime)) return false;
    if (!occursToday(t)) return false;
    if (t.completions[occKeyToday(t)]) return false;   // yapılmışsa geciken değil
    const [hh, mm] = t.dueTime.split(":").map(Number);
    return nowMin > hh * 60 + mm;                       // son saat geçtiyse
  });
}

function performanceData(owner, from, to) {
  const people = [...orgChefs(owner), ...orgStaff(owner)];
  const stats = {};
  people.forEach((p) => { stats[p.id] = { completed: 0, onTime: 0, late: 0, missed: 0 }; });
  const tasks = orgTasks(owner);
  tasks.forEach((t) => {
    Object.keys(t.completions).forEach((dateKey) => {
      const c = t.completions[dateKey];
      if (!c || !c.by || !stats[c.by] || !inRange(c.at, from, to)) return;
      stats[c.by].completed++;
      if (perfOnTime(t, dateKey, c.at)) stats[c.by].onTime++; else stats[c.by].late++;
    });
  });
  // ekipçe yapılmamış (geciken) görevleri sorumlu kişilerin HEPSİNE yaz
  pastMissedFor(tasks, from, to).forEach((m) => {
    (m.task.assignedUserIds || []).forEach((id) => { if (stats[id]) stats[id].missed++; });
  });
  // bugün son saati geçmiş + yapılmamış → atanan herkese geciken (kimse üstlenmemiş gibi)
  dueTimeMissedToday(tasks, from, to).forEach((t) => {
    (t.assignedUserIds || []).forEach((id) => { if (stats[id]) stats[id].missed++; });
  });
  return people.map((p) => ({ user: p, s: stats[p.id] }));
}

// Müşterinin (yöneticinin) gördüğü paket/fiyat ekranı — i18n ile 6 dilde
// Plan süresi durumu (geri sayım / doldu) — banner için
function planStatusBanner() {
  const pl = orgPlan || {};
  if (pl.expired) return `<div class="plan-banner bad">⏳ Demo süreniz doldu — devam etmek için ilgi talebi gönderin.</div>`;
  if (pl.daysLeft != null) {
    const warn = pl.daysLeft <= 7;
    return `<div class="plan-banner ${warn ? "warn" : "ok"}">⏳ Ücretsiz demo: ${pl.daysLeft} gün kaldı.</div>`;
  }
  return "";
}

// Demo süresi dolunca işlem durur; yönetici ilgi talebi gönderir, süper admin uzatınca açılır
function renderDemoLock(u) {
  const isMgr = u.role === "yonetici";
  const owner = ownerIdOf(u);
  const staff = orgStaff(owner).length, chefs = orgChefs(owner).length, venues = orgVenues(owner).length;
  const leadForm = `
    <div class="card">
      <h2>📩 Devam etmek için ilgi talebi gönderin</h2>
      <p style="color:var(--muted);font-size:13px;margin-bottom:14px">Talebinizi bırakın; size uygun planla en kısa sürede dönüş yapalım. Verileriniz güvende, silinmez.</p>
      <div class="field"><label>E-posta</label><input id="lead_email" type="email" value="${esc(u.email || "")}" placeholder="ornek@firma.com" /></div>
      <div class="row">
        <div class="field"><label>Personel sayısı</label><input id="lead_staff" type="number" min="0" value="${staff}" /></div>
        <div class="field"><label>Şef sayısı</label><input id="lead_chefs" type="number" min="0" value="${chefs}" /></div>
        <div class="field"><label>Lokasyon sayısı</label><input id="lead_venues" type="number" min="0" value="${venues}" /></div>
      </div>
      <div class="field"><label>Not (opsiyonel)</label><textarea id="lead_note" placeholder="Eklemek istedikleriniz..."></textarea></div>
      <button class="btn-primary" id="lead_send">Talebi Gönder</button>
      <div class="error-msg" id="lead_msg"></div>
    </div>`;
  app.innerHTML = topbar(u) + `
    <div class="container">
      <div class="card lp-soon" style="text-align:center">
        <div style="font-size:42px">⏳</div>
        <h2 style="margin:6px 0">Demo süreniz doldu</h2>
        <p style="color:var(--muted)">7 günlük ücretsiz demo sona erdi. ${isMgr ? "Devam etmek için aşağıdan ilgi talebi gönderin." : "Devam için işletme yöneticinizle görüşün."}</p>
      </div>
      ${isMgr ? leadForm : ""}
    </div>`;
  wireCommon();
  if (isMgr) wirePackages(u);
}

function currentPackageKey() {
  const pl = orgPlan || {};
  if (pl.unlimited) return "corp";
  const m = PACKAGES.find((p) => !p.unlimited &&
    p.venues === pl.maxVenues && p.staff === pl.maxStaff && p.chefs === pl.maxChefs);
  return m ? m.key : null;
}

function packagesView(u) {
  const owner = ownerIdOf(u);
  const staff = orgStaff(owner).length;
  const chefs = orgChefs(owner).length;
  const venues = orgVenues(owner).length;
  return `
    <div class="section-title">💎 Paketler</div>
    <div class="card lp-soon" style="text-align:center">
      <div style="font-size:38px">🚀</div>
      <h2 style="margin:6px 0">Paketlerimiz çok yakında!</h2>
      <p style="color:var(--muted)">Şimdilik <strong>demo sürümle</strong> Fixpre'yi ücretsiz keşfedin. Ücretli paketler aktif olunca size haber vereceğiz.</p>
    </div>
    <div class="card">
      <h2>📩 Paketlerden haberdar olun</h2>
      <p style="color:var(--muted);font-size:13px;margin-bottom:14px">E-postanızı bırakın; paketler açılınca size dönelim. İşletme büyüklüğünüzü yazarsanız size uygun teklif hazırlarız.</p>
      <div class="field"><label>E-posta</label><input id="lead_email" type="email" value="${esc(u.email || "")}" placeholder="ornek@firma.com" /></div>
      <div class="row">
        <div class="field"><label>Personel sayısı</label><input id="lead_staff" type="number" min="0" value="${staff}" /></div>
        <div class="field"><label>Şef sayısı</label><input id="lead_chefs" type="number" min="0" value="${chefs}" /></div>
        <div class="field"><label>Lokasyon sayısı</label><input id="lead_venues" type="number" min="0" value="${venues}" /></div>
      </div>
      <div class="field"><label>Not (opsiyonel)</label><textarea id="lead_note" placeholder="Eklemek istedikleriniz..."></textarea></div>
      <button class="btn-primary" id="lead_send">Gönder</button>
      <div class="error-msg" id="lead_msg"></div>
    </div>
  `;
}

function wirePackages(u) {
  const btn = document.getElementById("lead_send");
  if (!btn) return;
  btn.onclick = async () => {
    const email = document.getElementById("lead_email").value.trim();
    const msg = document.getElementById("lead_msg");
    if (!email) { msg.style.color = ""; msg.textContent = "Lütfen e-posta girin."; return; }
    btn.disabled = true; msg.style.color = ""; msg.textContent = "";
    try {
      await leadSubmit({
        email, name: u.name, business: DB.orgName || "",
        staff: parseInt(document.getElementById("lead_staff").value, 10) || 0,
        chefs: parseInt(document.getElementById("lead_chefs").value, 10) || 0,
        venues: parseInt(document.getElementById("lead_venues").value, 10) || 0,
        note: document.getElementById("lead_note").value.trim(),
        orgId: ownerIdOf(u),
      });
      msg.style.color = "#059669";
      msg.textContent = "Teşekkürler! Paketler açılınca size döneceğiz. 🚀";
    } catch (e) {
      btn.disabled = false;
      msg.textContent = "Gönderilemedi, tekrar deneyin.";
    }
  };
}

// Süper admin: gelen ilgi talepleri (lead) listesi
function leadsView(u) {
  return `
    <div class="section-title">📩 İlgi Talepleri</div>
    <p style="color:var(--muted);font-size:13px;margin:-8px 0 14px">Demo kullanıcılarının paket ilgi formundan gelenler (en yeni üstte).</p>
    <div id="leads_list"><div class="empty">Yükleniyor…</div></div>
  `;
}
function wireLeadsView(u) {
  leadsGet().then((res) => {
    const list = document.getElementById("leads_list");
    if (!list) return;
    const leads = (res && res.leads) || [];
    list.innerHTML = leads.length ? leads.map((l) => `
      <div class="list-item">
        <div>
          <div class="title">${l.business ? "🏢 " + esc(l.business) + " — " : ""}${esc(l.email)}${l.name ? " · " + esc(l.name) : ""}</div>
          <div class="meta">👥 ${l.staff} personel · 👔 ${l.chefs} şef · 📍 ${l.venues} lokasyon${l.note ? " · " + esc(l.note) : ""}</div>
          <div class="meta">${fmtDate(l.created_at)}</div>
        </div>
      </div>`).join("") : `<div class="empty">Henüz talep yok.</div>`;
  }).catch(() => {
    const list = document.getElementById("leads_list");
    if (list) list.innerHTML = `<div class="empty">Yüklenemedi.</div>`;
  });
}

/* ============================================================
   HAFTALIK VARDİYA + İZİN/VARDİYA DEĞİŞİKLİK TALEBİ
   ============================================================ */
function fmtDayShort(dk) {
  const d = new Date(dk + "T00:00:00");
  return d.toLocaleDateString(currentLocale(), { day: "2-digit", month: "short" });
}

// Talep sahibi karar görünce bildirimi temizle
function markShiftSeen(u) {
  let ch = false;
  (DB.shiftReqs || []).forEach((r) => {
    if (r.requesterId === u.id && r.status !== "beklemede" && !r.seenByReporter) { r.seenByReporter = true; ch = true; }
  });
  if (ch) saveDB(DB);
}

function shiftReqCard(u, r) {
  const who = userById(r.requesterId);
  const withU = r.withUserId ? userById(r.withUserId) : null;
  const approved = r.status === "onaylandi";
  const rejected = r.status === "reddedildi";
  const colleagueStage = r.status === "personel_onay";
  const mgrStage = r.status === "beklemede";
  const typeLabel = r.type === "takas" ? "🔄 İzin günü takası"
    : r.type === "vardiya" ? "🕐 Vardiya değişikliği"
    : r.type === "vardiyatakas" ? "🔁 Vardiya takası"
    : "🏖️ İzin günü";
  let detail;
  if (r.type === "vardiya") {
    const nd = defById(r.newDefId);
    detail = `${fmtDay(r.date)} → ${nd ? esc(nd.label) + " (" + nd.start + "–" + nd.end + ")" : "?"}`;
  } else if (r.type === "vardiyatakas") {
    detail = `${fmtDay(r.date)}${withU ? " · " + esc(withU.name) + " ile" : ""}`;
  } else {
    const baseDetail = r.type === "takas"
      ? `${fmtDay(r.date)}${withU ? " · " + esc(withU.name) + " ile" : ""}`
      : fmtDay(r.date);
    detail = baseDetail + (r.freeDate ? ` · eski izin: ${fmtDay(r.freeDate)} → çalışıyor` : "");
  }
  const st = colleagueStage ? `<span class="badge badge-open">Personel onayı bekliyor</span>`
    : mgrStage ? `<span class="badge badge-open">Yönetici onayı bekliyor</span>`
    : approved ? `<span class="badge badge-done">Onaylandı</span>`
    : `<span class="badge badge-rej">Reddedildi</span>`;
  const canColleague = colleagueStage && r.withUserId === u.id;
  const canMgr = mgrStage && canApproveShift(u, r.requesterId);
  return `
    <div class="report ${approved ? "resolved" : ""} ${rejected ? "rejected" : ""}">
      <div class="report-head"><span class="rcat">${typeLabel}</span>${st}</div>
      <div class="report-text"><strong>${detail}</strong>${r.note ? ` — ${esc(r.note)}` : ""}</div>
      <div class="report-meta">${roleIcon(who)} ${esc(who ? who.name : "?")} · ${fmtDate(r.createdAt)}</div>
      ${(approved || rejected) ? `<div class="report-reply">${approved ? "✅ Onaylandı" : "❌ Reddedildi"}${r.decisionNote ? ": " + esc(r.decisionNote) : ""}</div>` : ""}
      ${canColleague ? `
        <div class="report-actions">
          <button class="btn-green btn-sm" data-src-ok="${r.id}">Takası Onayla</button>
          <button class="btn-danger btn-sm" data-src-no="${r.id}">Reddet</button>
        </div>` : ""}
      ${canMgr ? `
        <div class="report-actions">
          <input class="srdec-note" data-srnote="${r.id}" placeholder="Not (opsiyonel)" />
          <button class="btn-green btn-sm" data-sr-ok="${r.id}">Onayla</button>
          <button class="btn-danger btn-sm" data-sr-no="${r.id}">Reddet</button>
        </div>` : ""}
    </div>`;
}

// Bir vardiya hücresinin görünümü (sınıf/içerik/başlık) — hem render hem yerinde güncelleme kullanır
function shiftCellContent(userId, dk) {
  const st = cellState(userId, dk);
  if (st.kind === "off") return { cls: "off", html: "🏖️", title: "İzinli" };
  if (st.kind === "assign") {
    const d = defById(st.defId);
    return d
      ? { cls: "shift", html: `<span class="sh-lab">${esc(d.label)}</span>`, title: `${d.label} ${d.start}–${d.end}` }
      : { cls: "on", html: "✅", title: "Çalışıyor" };
  }
  return { cls: "on", html: "✅", title: "Çalışıyor" };
}

function shiftView(u) {
  const owner = ownerIdOf(u);
  const isMgr = u.role === "yonetici";
  if (!isMgr) markShiftSeen(u);
  const people = orgWorkers(owner);
  const monday = weekMonday(shiftWeekOffset);
  const dates = weekDateKeys(monday);
  const todK = todayKey();

  const head = `<div class="sh-row sh-head">
    <div class="sh-name"></div>
    ${dates.map((dk) => {
      const d = new Date(dk + "T00:00:00");
      return `<div class="sh-cell sh-dayhdr${dk === todK ? " today" : ""}">${WD_SHORT[d.getDay()]}<span>${d.getDate()}</span></div>`;
    }).join("")}
  </div>`;

  // Şef onay yetkisi varsa kendi lokasyonunun ızgarasını da düzenleyebilir (kontrol yöneticide)
  const canEdit = isMgr || (u.role === "sef" && approvalSetting("shift") === "sef");
  const gridFor = (ppl) => {
    const rows = ppl.length ? ppl.map((p) => `
      <div class="sh-row">
        <div class="sh-name">${roleIcon(p)} ${esc(p.name)}</div>
        ${dates.map((dk) => {
          const c = shiftCellContent(p.id, dk);
          return canEdit
            ? `<button class="sh-cell ${c.cls}" data-shift="${p.id}|${dk}" title="${c.title}">${c.html}</button>`
            : `<div class="sh-cell ${c.cls}" title="${c.title}">${c.html}</div>`;
        }).join("")}
      </div>`).join("") : `<div class="empty" style="padding:12px">Bu lokasyonda kişi yok.</div>`;
    return `<div class="shift-grid">${head}${rows}</div>`;
  };
  // Lokasyonlara göre kategori (açılır) — yönetici dışındakiler YALNIZCA kendi lokasyon(lar)ını görür
  const myVenueIds = u.venueIds || [];
  const vlist = isMgr ? orgVenues(owner) : orgVenues(owner).filter((v) => myVenueIds.includes(v.id));
  const groupsHtml = vlist.map((v) => {
    const ppl = people.filter((p) => (p.venueIds || []).includes(v.id));
    return `<details class="cat" open style="margin-bottom:12px">
      <summary><span>📍 ${esc(v.name)} (${ppl.length})</span></summary>
      <div class="cat-body" style="padding:10px">${gridFor(ppl)}</div>
    </details>`;
  }).join("");
  const noVenue = isMgr ? people.filter((p) => !((p.venueIds || []).length)) : [];
  const noVenueHtml = noVenue.length
    ? `<details class="cat" style="margin-bottom:12px"><summary><span>📍 Lokasyonsuz (${noVenue.length})</span></summary><div class="cat-body" style="padding:10px">${gridFor(noVenue)}</div></details>`
    : "";
  // Lokasyonu olmayan personel TÜM org'a düşmesin: yalnızca kendi satırını görsün (sızıntı engeli)
  const gridSection = vlist.length
    ? (groupsHtml + noVenueHtml)
    : (isMgr
        ? gridFor(people)
        : gridFor(people.filter((p) => (p.venueIds || []).some((v) => myVenueIds.includes(v)) || p.id === u.id)));

  // Açıklama (legend) — tanımlı vardiyalar + saatleri
  const defs = orgShiftDefs(owner);
  const legend = `<p style="color:var(--muted);font-size:13px;margin:6px 0 12px">`
    + defs.map((d) => `<strong>${esc(d.label)}</strong> ${d.start}–${d.end}`).join(" · ")
    + (defs.length ? " · " : "")
    + `✅ Çalışıyor · 🏖️ İzinli${canEdit ? " · Hücreye tıkla: ✅→" + (defs.length ? defs.map((d) => esc(d.label)).join("→") + "→" : "") + "🏖️" : ""}</p>`;

  // Yönetici: vardiya tanımları (A 08:00–17:00 gibi)
  let defBlock = "";
  if (isMgr) {
    defBlock = `
      <details class="cat" style="margin:14px 0">
        <summary><span>⚙️ Vardiya Tanımları (${defs.length})</span></summary>
        <div class="cat-body" style="padding:14px">
          ${defs.length ? defs.map((d) => `
            <div class="list-item">
              <div><div class="title">${esc(d.label)}</div><div class="meta">${d.start} – ${d.end}</div></div>
              <button class="btn-danger btn-sm" data-del-def="${d.id}">Sil</button>
            </div>`).join("") : `<div class="empty">Henüz vardiya yok. Örn: A 08:00–17:00, B 13:30–22:00.</div>`}
          <div class="row" style="margin-top:10px">
            <div class="field"><label>Etiket</label><input id="def_label" placeholder="A" maxlength="6" /></div>
            <div class="field"><label>Başlangıç</label><input id="def_start" type="time" value="08:00" /></div>
            <div class="field"><label>Bitiş</label><input id="def_end" type="time" value="17:00" /></div>
          </div>
          <button class="btn-primary" id="def_add">Vardiya Ekle</button>
          <div class="error-msg" id="def_err"></div>
        </div>
      </details>`;
  }

  const canApproveAny = u.role === "yonetici" || (u.role === "sef" && approvalSetting("shift") === "sef");
  let mgrReqs = "";
  if (canApproveAny) {
    const pend = (DB.shiftReqs || []).filter((r) => r.ownerId === owner && r.status === "beklemede" && canApproveShift(u, r.requesterId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    mgrReqs = `
      <div class="section-title" style="margin-top:20px">Onayınızı Bekleyen Talepler (${pend.length})</div>
      ${pend.length ? pend.map((r) => shiftReqCard(u, r)).join("") : `<div class="empty">Bekleyen talep yok. 🎉</div>`}`;
  }

  let reqBlock = "";
  if (!isMgr) {
    const opts = people.filter((p) => p.id !== u.id).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    const defOpts = defs.map((d) => `<option value="${d.id}">${esc(d.label)} (${d.start}–${d.end})</option>`).join("");
    const incoming = (DB.shiftReqs || []).filter((r) => r.withUserId === u.id && r.status === "personel_onay")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const incomingBlock = incoming.length ? `
      <div class="section-title" style="margin-top:18px">📥 Size Gelen Takas Talepleri (${incoming.length})</div>
      ${incoming.map((r) => shiftReqCard(u, r)).join("")}` : "";
    const mine = (DB.shiftReqs || []).filter((r) => r.requesterId === u.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    reqBlock = `
      ${incomingBlock}
      <details class="cat" style="margin:18px 0">
        <summary><span>📝 Değişiklik / İzin Talebi</span></summary>
        <div class="cat-body" style="padding:14px">
          <div class="row">
            <div class="field"><label>Tür</label><select id="sr_type">
              <option value="izin">İzin günü istiyorum</option>
              <option value="vardiya">Vardiya değişikliği (yöneticiye)</option>
              <option value="vardiyatakas">Vardiya takası (arkadaşla)</option>
              <option value="takas">İzin günü takası (arkadaşla)</option>
            </select></div>
            <div class="field"><label>Gün</label><input id="sr_date" type="date" value="${todK}" /></div>
          </div>
          <div class="field" id="sr_newdef_f" style="display:none"><label>Yeni vardiyanız</label><select id="sr_newdef">${defOpts}</select></div>
          <div class="field" id="sr_free_f"><label>Eski izin gününüz — çalışmaya dönecek (opsiyonel)</label><input id="sr_free" type="date" /></div>
          <div class="row" id="sr_with_f" style="display:none">
            <div class="field"><label>Kiminle</label><select id="sr_with">${opts}</select></div>
          </div>
          <p id="sr_swap_hint" style="display:none;color:var(--muted);font-size:12.5px;margin:-4px 0 10px">
            Takas talebi önce seçtiğiniz kişiye, o onaylayınca yöneticiye gider.
          </p>
          <div class="field"><label>Açıklama</label><textarea id="sr_note" placeholder="Ör: Doktor randevum var, o gün izinli olmak istiyorum"></textarea></div>
          <button class="btn-primary" id="sr_send">Talebi Gönder</button>
          <div class="error-msg" id="sr_err"></div>
        </div>
      </details>
      <div class="section-title">Taleplerim (${mine.length})</div>
      ${mine.length ? mine.map((r) => shiftReqCard(u, r)).join("") : `<div class="empty">Henüz talebiniz yok.</div>`}`;
  }

  // Yazdırılabilir (PDF) vardiya tablosu — yalnızca yazdırmada görünür
  const printGrid = (ppl) => `
    <table class="sp-table">
      <thead><tr><th>Kişi</th>${dates.map((dk) => { const d = new Date(dk + "T00:00:00"); return `<th>${WD_SHORT[d.getDay()]} ${d.getDate()}</th>`; }).join("")}</tr></thead>
      <tbody>${ppl.map((p) => `<tr><td>${esc(p.name)}</td>${dates.map((dk) => { const c = shiftCellContent(p.id, dk); return `<td>${c.html || "—"}</td>`; }).join("")}</tr>`).join("")}</tbody>
    </table>`;
  const printFallback = isMgr ? people : people.filter((p) => (p.venueIds || []).some((v) => myVenueIds.includes(v)) || p.id === u.id);
  const printSections = vlist.length
    ? (vlist.map((v) => { const ppl = people.filter((p) => (p.venueIds || []).includes(v.id)); return ppl.length ? `<h3 class="sp-h">📍 ${esc(v.name)}</h3>${printGrid(ppl)}` : ""; }).join("")
       + (noVenue.length ? `<h3 class="sp-h">📍 Lokasyonsuz</h3>${printGrid(noVenue)}` : ""))
    : printGrid(printFallback);

  return `
    <div class="section-title">📅 Haftalık Vardiya</div>
    <div class="shift-nav">
      <button class="btn-ghost btn-sm" id="sh_prev">← Önceki</button>
      <span class="shift-range">${fmtDayShort(dates[0])} – ${fmtDayShort(dates[6])}${shiftWeekOffset === 0 ? " · Bu hafta" : ""}</span>
      <button class="btn-ghost btn-sm" id="sh_next">Sonraki →</button>
    </div>
    <button class="btn-ghost btn-sm no-print" id="shift_pdf" style="margin:0 0 10px">🖨️ PDF olarak indir</button>
    ${legend}
    ${gridSection}
    ${defBlock}
    ${mgrReqs}
    ${reqBlock}
    <div id="shift-print" class="print-only">
      <h2>📅 Haftalık Vardiya — Fixpre</h2>
      <div style="color:#555;margin-bottom:10px">${fmtDayShort(dates[0])} – ${fmtDayShort(dates[6])} · ${new Date().toLocaleDateString(currentLocale())}</div>
      ${printSections || "<div>Kişi yok.</div>"}
    </div>
  `;
}

function decideShiftReq(id, status, u) {
  const r = (DB.shiftReqs || []).find((x) => x.id === id);
  if (!r) return;
  const noteEl = document.querySelector(`.srdec-note[data-srnote="${id}"]`);
  r.status = status;
  r.decisionNote = noteEl ? noteEl.value.trim() : "";
  r.decidedBy = u.id; r.decidedAt = new Date().toISOString(); r.seenByReporter = false;
  if (status === "onaylandi") {
    const addOff = (userId, dk) => {
      if (!dk) return;
      // o gün varsa vardiya atamasını kaldır
      for (let i = (DB.shiftAssign || []).length - 1; i >= 0; i--)
        if (DB.shiftAssign[i].userId === userId && DB.shiftAssign[i].date === dk) DB.shiftAssign.splice(i, 1);
      if (!DB.shifts.some((s) => s.userId === userId && s.date === dk))
        DB.shifts.push({ id: uid(), ownerId: r.ownerId, userId, date: dk, reason: "Talep onayı", by: u.id });
    };
    const removeOff = (userId, dk) => {
      if (!dk) return;
      const i = DB.shifts.findIndex((s) => s.userId === userId && s.date === dk);
      if (i >= 0) DB.shifts.splice(i, 1);
      // çalışmaya dönen güne kişinin olağan vardiyasını ata (saat gelsin, sade tik kalmasın)
      if (!assignOf(userId, dk)) {
        const def = usualDefId(userId);
        if (def) DB.shiftAssign.push({ id: uid(), ownerId: r.ownerId, userId, date: dk, defId: def, by: u.id });
      }
    };
    if (r.type === "takas") {
      // İzin günü takası: istenen gün ↔ eski izin günü iki kişi arasında yer değiştirir
      addOff(r.requesterId, r.date);        // isteyen: yeni izin günü
      removeOff(r.requesterId, r.freeDate); // isteyen: eski izin günü → çalışıyor
      if (r.withUserId) {
        addOff(r.withUserId, r.freeDate);   // karşı kişi: o gün izinli olur
        removeOff(r.withUserId, r.date);    // karşı kişi: istenen günde çalışır
      }
    } else if (r.type === "vardiya") {
      // Yöneticiye vardiya değişikliği: o gün isteyenin vardiyası değişir
      setCell(r.ownerId, r.requesterId, r.date, "assign", u.id, r.newDefId);
    } else if (r.type === "vardiyatakas") {
      // Arkadaşla vardiya takası: o günkü vardiyalar iki kişi arasında yer değiştirir
      const aDef = (assignOf(r.requesterId, r.date) || {}).defId || null;
      const bDef = r.withUserId ? ((assignOf(r.withUserId, r.date) || {}).defId || null) : null;
      setCell(r.ownerId, r.requesterId, r.date, aDef || bDef ? "assign" : "work", u.id, bDef);
      if (r.withUserId) setCell(r.ownerId, r.withUserId, r.date, aDef || bDef ? "assign" : "work", u.id, aDef);
    } else {
      addOff(r.requesterId, r.date);
      if (r.freeDate) removeOff(r.requesterId, r.freeDate);   // eski izin günü → çalışıyor
    }
  }
  saveDB(DB);
  const targets = [r.requesterId];
  if (r.withUserId) targets.push(r.withUserId);
  notifyUsers(targets, "Vardiya/izin talebiniz", status === "onaylandi" ? "Onaylandı ✅" : "Reddedildi ❌", "/");
  render();
}

function wireShift(u) {
  const owner = ownerIdOf(u);
  const prev = document.getElementById("sh_prev");
  if (prev) prev.onclick = () => { shiftWeekOffset--; render(); };
  const next = document.getElementById("sh_next");
  if (next) next.onclick = () => { shiftWeekOffset++; render(); };
  const spdf = document.getElementById("shift_pdf");
  if (spdf) spdf.onclick = () => window.print();

  // Yönetici: hücreye tıkla → çalışıyor → vardiyalar (A,B,C…) → izinli → çalışıyor
  document.querySelectorAll("[data-shift]").forEach((b) => {
    b.onclick = () => {
      const [pid, dk] = b.dataset.shift.split("|");
      const defs = orgShiftDefs(owner);
      const st = cellState(pid, dk);
      let nextKind = "work", nextDef = null;
      if (st.kind === "work") {
        if (defs.length) { nextKind = "assign"; nextDef = defs[0].id; } else nextKind = "off";
      } else if (st.kind === "assign") {
        const i = defs.findIndex((d) => d.id === st.defId);
        if (i >= 0 && i < defs.length - 1) { nextKind = "assign"; nextDef = defs[i + 1].id; } else nextKind = "off";
      } else { nextKind = "work"; }
      setCell(owner, pid, dk, nextKind, u.id, nextDef);
      saveDB(DB);
      // Sayfa/ızgara kaymasın diye TÜM ekranı yeniden çizme; sadece bu hücreyi güncelle
      const c = shiftCellContent(pid, dk);
      b.className = "sh-cell " + c.cls;
      b.title = c.title;
      b.innerHTML = c.html;
    };
  });

  // Yönetici: vardiya tanımı ekle / sil
  const defAdd = document.getElementById("def_add");
  if (defAdd) defAdd.onclick = () => {
    const label = document.getElementById("def_label").value.trim();
    const start = document.getElementById("def_start").value;
    const end = document.getElementById("def_end").value;
    const err = document.getElementById("def_err");
    if (!label) { err.textContent = "Etiket girin (ör. A)."; return; }
    if (!start || !end) { err.textContent = "Başlangıç ve bitiş saati girin."; return; }
    DB.shiftDefs.push({ id: uid(), ownerId: owner, label, start, end });
    saveDB(DB); render();
  };
  document.querySelectorAll("[data-del-def]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.delDef;
      const i = DB.shiftDefs.findIndex((d) => d.id === id);
      if (i >= 0) DB.shiftDefs.splice(i, 1);
      DB.shiftAssign = (DB.shiftAssign || []).filter((a) => a.defId !== id);
      saveDB(DB); render();
    };
  });

  // Personel/şef: türe göre alanları göster/gizle
  const typeSel = document.getElementById("sr_type");
  if (typeSel) {
    const show = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? "" : "none"; };
    const sync = () => {
      const t = typeSel.value;
      const withType = (t === "takas" || t === "vardiyatakas");
      show("sr_free_f", t === "izin" || t === "takas");
      show("sr_with_f", withType);
      show("sr_newdef_f", t === "vardiya");
      show("sr_swap_hint", withType);
    };
    typeSel.onchange = sync; sync();
  }
  const send = document.getElementById("sr_send");
  if (send) send.onclick = () => {
    const type = document.getElementById("sr_type").value;
    const date = document.getElementById("sr_date").value;
    const note = document.getElementById("sr_note").value.trim();
    const err = document.getElementById("sr_err");
    if (!date) { err.textContent = "Tarih seçin."; return; }
    const withType = (type === "takas" || type === "vardiyatakas");
    const freeDate = (type === "izin" || type === "takas") ? (document.getElementById("sr_free").value || null) : null;
    const withUserId = withType ? (document.getElementById("sr_with").value || null) : null;
    const newDefId = type === "vardiya" ? (document.getElementById("sr_newdef").value || null) : null;
    if (withType && !withUserId) { err.textContent = "Takas için kişi seçin."; return; }
    if (type === "vardiya" && !newDefId) { err.textContent = "Yeni vardiya seçin (yönetici önce vardiya tanımlamalı)."; return; }
    // arkadaşla takas: önce karşı personel onaylar; diğerleri doğrudan yöneticiye
    const status = withType ? "personel_onay" : "beklemede";
    const req = {
      id: uid(), ownerId: owner, requesterId: u.id, type, date, freeDate,
      withUserId, withDate: null, newDefId, note, status,
      createdAt: new Date().toISOString(), decidedBy: null, decidedAt: null, decisionNote: "", seenByReporter: true,
      colleagueOk: null,
    };
    DB.shiftReqs.push(req);
    saveDB(DB);
    if (withType) {
      notifyUsers([withUserId], "Takas talebi onayınızı bekliyor", u.name, "/");
    } else {
      const recips = [owner];
      if (approvalSetting("shift") === "sef" && u.chefId) recips.push(u.chefId);
      notifyUsers(recips, "İzin/değişiklik talebi", u.name, "/");
    }
    render();
  };

  // Karşı personelin takas onayı/reddi (yöneticiye gitmeden önce)
  document.querySelectorAll("[data-src-ok]").forEach((b) => { b.onclick = () => colleagueDecide(b.dataset.srcOk, true, u); });
  document.querySelectorAll("[data-src-no]").forEach((b) => { b.onclick = () => colleagueDecide(b.dataset.srcNo, false, u); });
  // Yönetici onay/ret
  document.querySelectorAll("[data-sr-ok]").forEach((b) => { b.onclick = () => decideShiftReq(b.dataset.srOk, "onaylandi", u); });
  document.querySelectorAll("[data-sr-no]").forEach((b) => { b.onclick = () => decideShiftReq(b.dataset.srNo, "reddedildi", u); });
}

// Takas edilen personelin ön onayı
function colleagueDecide(id, ok, u) {
  const r = (DB.shiftReqs || []).find((x) => x.id === id);
  if (!r || r.withUserId !== u.id || r.status !== "personel_onay") return;
  if (ok) {
    r.status = "beklemede"; r.colleagueOk = true;   // sıra onaylayanda (yönetici/şef)
    saveDB(DB);
    const recips = [r.ownerId];
    const reqUser = userById(r.requesterId);
    if (approvalSetting("shift") === "sef" && reqUser && reqUser.chefId) recips.push(reqUser.chefId);
    notifyUsers(recips, "Takas — personel onayladı", u.name, "/");
  } else {
    r.status = "reddedildi"; r.colleagueOk = false;
    r.decisionNote = "Takas edilen personel reddetti";
    r.decidedAt = new Date().toISOString(); r.seenByReporter = false;
    saveDB(DB);
    notifyUsers([r.requesterId], "Takas talebiniz", "Personel reddetti ❌", "/");
  }
  render();
}

function perfRow(r) {
  const s = r.s;
  const vNames = (r.user.venueIds || []).map((id) => { const v = venueById(id); return v ? v.name : null; }).filter(Boolean);
  const pct = s.completed ? Math.round((s.onTime / s.completed) * 100) : null;
  const pctCls = pct === null ? "bal-zero" : (pct >= 80 ? "bal-green" : pct >= 50 ? "bal-amber" : "bal-red");
  return `<tr>
      <td>${roleIcon(r.user)} ${esc(r.user.name)}</td>
      <td>${vNames.length ? esc(vNames.join(", ")) : "—"}</td>
      <td><strong>${s.completed}</strong></td>
      <td style="color:#059669;font-weight:700">${s.onTime}</td>
      <td style="color:#d97706;font-weight:700">${s.late}</td>
      <td style="color:#b91c1c;font-weight:700">${s.missed}</td>
      <td>${pct === null ? "—" : `<span class="bal ${pctCls}">%${pct}</span>`}</td>
    </tr>`;
}
function perfTableHtml(items) {
  const rows = items.length ? items.map(perfRow).join("") : `<tr><td colspan="7" class="empty">Kişi yok.</td></tr>`;
  return `<div style="overflow-x:auto"><table>
    <thead><tr><th>Kişi</th><th>Mekan</th><th>Tamamladığı</th><th>Zamanında</th><th>Geç</th><th>Geciken</th><th>Zamanında %</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function perfView(u) {
  const owner = ownerIdOf(u);
  const data = performanceData(owner, perfFrom, perfTo).sort((a, b) => b.s.completed - a.s.completed);
  const groups = visibleVenues(u)
    .map((v) => ({ v, items: data.filter((r) => (r.user.venueIds || []).includes(v.id)) }))
    .filter((g) => g.items.length);
  const noV = data.filter((r) => !(r.user.venueIds || []).some((id) => venueById(id)));

  // Ekran: lokasyona göre açılır gruplar
  const screen = (groups.map((g) => `
    <details class="cat" style="margin-bottom:10px">
      <summary><span>📍 ${esc(g.v.name)}</span><span class="cat-count">${g.items.length}</span></summary>
      <div class="cat-body" style="padding:8px">${perfTableHtml(g.items)}</div>
    </details>`).join("")
    + (noV.length ? `<details class="cat" style="margin-bottom:10px"><summary><span>📋 Lokasyonsuz</span><span class="cat-count">${noV.length}</span></summary><div class="cat-body" style="padding:8px">${perfTableHtml(noV)}</div></details>` : ""))
    || `<div class="empty">Henüz kişi yok.</div>`;

  // Yazdırma/PDF: düz (tümü açık) rapor
  const printSections = groups.map((g) => `<h3 style="margin:14px 0 6px">📍 ${esc(g.v.name)}</h3>${perfTableHtml(g.items)}`).join("")
    + (noV.length ? `<h3 style="margin:14px 0 6px">📋 Lokasyonsuz</h3>${perfTableHtml(noV)}` : "");
  const rangeText = (perfFrom || perfTo) ? `${perfFrom || "…"} – ${perfTo || "…"}` : "Tüm zamanlar";

  return rangeFilter("perf", perfFrom, perfTo) + `
    <div class="card no-print">
      <h2>📊 Personel Performansı</h2>
      <p style="color:var(--muted);font-size:13px;margin:-8px 0 14px">Açıklama: Tamamladığı = kişinin bizzat tamamladığı görev sayısı; Zamanında = gününde veya erken yapılan; Geç = sonradan yapılan; Geciken = ekipçe hiç yapılmamış (sorumlu olduğu); % = zamanında oranı.</p>
      <button class="btn-primary" id="perf_pdf">🖨️ PDF olarak indir</button>
    </div>
    <div class="no-print">${screen}</div>
    <div id="perf-print" class="print-only">
      <h2>📊 Personel Performansı — Fixpre</h2>
      <div style="color:#555;margin-bottom:10px">📅 ${rangeText} · ${new Date().toLocaleDateString(currentLocale())}</div>
      ${printSections || `<div>Henüz kişi yok.</div>`}
    </div>`;
}

// Görev kartı butonlarını bağlar (Bugün, Tüm Görevler ve mekan detayında kullanılır)
function wireDelTask() {
  document.querySelectorAll("[data-del-task]").forEach((b) => {
    b.onclick = () => {
      const t = DB.tasks.find((x) => x.id === b.dataset.delTask);
      if (!canEditTask(currentUser(), t)) return;   // yöneticinin görevini şef silemez
      if (!confirm("Bu görev silinsin mi?")) return;
      DB.tasks = DB.tasks.filter((x) => x.id !== b.dataset.delTask);
      saveDB(DB);
      render();
    };
  });
  document.querySelectorAll("[data-edit-task]").forEach((b) => {
    b.onclick = () => {
      const t = DB.tasks.find((x) => x.id === b.dataset.editTask);
      if (!canEditTask(currentUser(), t)) return;   // yöneticinin görevini şef düzenleyemez
      editingTask = b.dataset.editTask; render();
    };
  });
  // Yönetici/şef: tamamlanmış görevi "yapılmadı" say (geri al)
  document.querySelectorAll("[data-mgr-undo]").forEach((b) => {
    b.onclick = () => {
      const t = DB.tasks.find((x) => x.id === b.dataset.mgrUndo);
      if (!t || !canEditTask(currentUser(), t)) return;
      if (!confirm("Bu görev 'yapılmadı' sayılsın mı? Tamamlama geri alınacak.")) return;
      const u = currentUser();
      const key = occKeyToday(t);
      const prev = t.completions[key];
      delete t.completions[key];
      const prevUser = prev && prev.by ? userById(prev.by) : null;
      DB.undoLog.push({
        id: uid(), ownerId: t.ownerId, taskId: t.id, taskCreatedBy: t.createdBy, title: t.title,
        dateKey: key, by: u ? u.id : null, byName: u ? u.name : "Yönetici", at: new Date().toISOString(),
        prevBy: prev ? prev.by : null, prevByName: prevUser ? prevUser.name : null, prevAt: prev ? prev.at : null, seen: false,
      });
      saveDB(DB);
      render();
    };
  });
}

// Görev listesini mekana göre açılır-kapanır kategorilere böler
function venueCategories(u, tasks) {
  if (!tasks.length) return "";
  const sortFn = (a, b) => {
    const ad = doneForKey(a, occKeyToday(a));
    const bd = doneForKey(b, occKeyToday(b));
    if (ad !== bd) return ad ? 1 : -1;       // bekleyenler üstte
    return new Date(b.createdAt) - new Date(a.createdAt);
  };
  const cat = (title, items) => `
    <details class="cat">
      <summary><span>${title}</span><span class="cat-count">${items.length}</span></summary>
      <div class="cat-body">
        ${items.slice().sort(sortFn).map(mgrTaskCard).join("")}
      </div>
    </details>`;
  const venueCats = visibleVenues(u)
    .map((v) => ({ v, items: tasks.filter((t) => t.venueId === v.id) }))
    .filter((g) => g.items.length)
    .map((g) => cat(`📍 ${esc(g.v.name)}`, g.items))
    .join("");
  const noVenue = tasks.filter((t) => !t.venueId || !venueById(t.venueId));
  return venueCats + (noVenue.length ? cat("📋 Mekansız", noVenue) : "");
}

// Kişileri (personel/şef) lokasyona göre açılır gruplara böl. renderItem(p) -> kart HTML'i.
// Birden çok lokasyondaki kişi her lokasyonda görünür; lokasyonsuzlar ayrı grupta.
function venuePeopleGroups(u, people, renderItem, noVenueLabel) {
  if (!people.length) return `<div class="empty">Kişi yok.</div>`;
  const cat = (title, items) => `
    <details class="cat" style="margin-bottom:10px">
      <summary><span>${title}</span><span class="cat-count">${items.length}</span></summary>
      <div class="cat-body" style="padding:10px 12px">${items.map(renderItem).join("")}</div>
    </details>`;
  let html = visibleVenues(u)
    .map((v) => ({ v, items: people.filter((p) => (p.venueIds || []).includes(v.id)) }))
    .filter((g) => g.items.length)
    .map((g) => cat(`📍 ${esc(g.v.name)}`, g.items))
    .join("");
  const noV = people.filter((p) => !(p.venueIds || []).some((id) => venueById(id)));
  if (noV.length) html += cat(noVenueLabel || "📋 Lokasyonsuz", noV);
  return html;
}

/* --- Görevler sekmesi --- */
function mgrTasks(u) {
  const candidates = assignableUsers(u);
  const venues = visibleVenues(u);
  // Tamamlanmış tek seferlik görevler listede gözükmez (DB'de kalır → kayıt/performans korunur)
  const tasks = visibleTasks(u).filter((t) => !isDoneOnce(t)).slice().reverse();

  const staffChecks = candidates.length
    ? candidates.map((s) => `
        <label class="check-pill">
          <input type="checkbox" class="assignee" value="${s.id}" />
          ${roleIcon(s)} ${esc(s.name)}${s.role === "sef" ? " (şef)" : ""}
        </label>`).join("")
    : `<div class="empty">Önce şef veya personel ekleyin.</div>`;

  const venueOpts = `<option value="">Mekan seçin (opsiyonel)</option>` +
    venues.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("");

  const categories = venueCategories(u, tasks);

  return `
    <details class="cat" style="margin-bottom:18px">
      <summary><span>➕ Yeni Görev Oluştur</span></summary>
      <div class="cat-body" style="padding:14px">
      <div class="field">
        <label>Görev başlığı</label>
        <input id="t_title" placeholder="Örn: Salonu hazırla" />
      </div>
      <div class="field">
        <label>Açıklama</label>
        <textarea id="t_desc" placeholder="Detaylar..."></textarea>
      </div>
      <div class="field">
        <label>Mekan</label>
        <select id="t_venue">${venueOpts}</select>
      </div>
      <div class="field">
        <label>Tekrar</label>
        <select id="t_rec">
          <option value="once">Tek seferlik</option>
          <option value="daily">Her gün tekrar etsin</option>
          <option value="weekly">Haftalık — belirli günler</option>
          <option value="monthly">Aylık — belirli tarihler</option>
        </select>
      </div>
      <div class="field" id="rec_once">
        <label>Son tarih (opsiyonel)</label>
        <input id="t_due" type="datetime-local" />
      </div>
      <div class="field" id="rec_weekly" style="display:none">
        <label>Hangi günler tekrar etsin?</label>
        <div class="checks">
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="check-pill"><input type="checkbox" class="wday" value="${d}" />${WD[d]}</label>`).join("")}
        </div>
      </div>
      <div class="field" id="rec_monthly" style="display:none">
        <label>Ayın hangi günleri tekrar etsin?</label>
        <div class="checks day-grid">
          ${Array.from({ length: 31 }, (_, i) => i + 1).map((n) => `<label class="check-pill mini"><input type="checkbox" class="mday" value="${n}" />${n}</label>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>🕐 Başlama saati (opsiyonel) — bu saatten önce tamamlanamaz</label>
        <input id="t_starttime" type="time" />
      </div>
      <div class="field">
        <label>⏰ Son yapılma saati (opsiyonel) — bitmesine 1 saat kala personele uyarı gider</label>
        <input id="t_duetime" type="time" />
      </div>
      <div class="field">
        <label>Atanacak personel (birden fazla seçebilirsiniz)</label>
        <div class="checks">${staffChecks}</div>
      </div>
      <button class="btn-primary" id="t_create">Görevi Oluştur</button>
      <div class="error-msg" id="t_err"></div>
      </div>
    </details>

    <div class="section-title">Görevler (${tasks.length})</div>
    <p style="color:var(--muted);font-size:13px;margin:-8px 0 14px">Görevleri görmek için bir mekana tıklayın.</p>
    ${tasks.length ? categories : `<div class="empty">Henüz görev yok.</div>`}
  `;
}

function mgrTaskCard(t) {
  const venue = t.venueId ? venueById(t.venueId) : null;
  const recurring = t.recurrence && t.recurrence.type !== "once";
  const key = occKeyToday(t);
  const activeToday = occursToday(t);
  const done = doneForKey(t, key);
  const canEdit = canEditTask(currentUser(), t);   // yöneticinin görevine şef dokunamaz

  const assigneeNames = t.assignedUserIds
    .map((id) => { const s = userById(id); return s ? s.name : "Silinmiş"; })
    .join(", ") || "—";

  let rows, readsHtml = "";
  if (recurring && !activeToday) {
    rows = `<div class="empty">Bugün için planlı değil.</div>`;
  } else {
    const c = completionOf(t, key);
    if (c) {
      const who = userById(c.by);
      rows = `<div class="completion-row">
        <span>✓ Tamamlandı</span>
        <span class="ok">${esc(who ? who.name : "?")} tarafından — ${fmtDate(c.at)}</span>
      </div>${c.note ? `<div class="cnote-show">📝 ${esc(c.note)}</div>` : ""}${canEdit ? `
      <div class="status-line"><button class="btn-ghost btn-sm" data-mgr-undo="${t.id}">↩️ Geri al (yapılmadı say)</button></div>` : ""}`;
    } else {
      rows = `<div class="completion-row">
        <span>Atananlardan biri yapacak</span>
        <span class="wait">⏳ Bekliyor</span>
      </div>`;
    }
    // bu günün tamamlaması geri alındıysa kartta göster
    const lu = lastUndoFor(t, key);
    if (lu && (!c || new Date(lu.at) > new Date(c.at))) {
      rows += `<div class="undo-note">↩️ ${esc(lu.byName || "?")} ${fmtDate(lu.at)} tarihinde tamamlamayı geri aldı</div>`;
    }
    // okunma durumu (tıklayınca açılır — yer kaplamasın)
    const readMap = (t.reads && t.reads[key]) || {};
    const readCount = t.assignedUserIds.filter((id) => readMap[id]).length;
    readsHtml = `
      <details class="reads-toggle">
        <summary>👁 Okunma durumu (${readCount}/${t.assignedUserIds.length})</summary>
        ${t.assignedUserIds.map((id) => {
          const who = userById(id);
          const r = readMap[id];
          return `<div class="completion-row">
            <span>${roleIcon(who)} ${esc(who ? who.name : "Silinmiş")}</span>
            ${r ? `<span class="seen">👁 okundu — ${fmtDate(r)}</span>` : `<span class="wait">• henüz görmedi</span>`}
          </div>`;
        }).join("")}
      </details>`;
  }

  return `
    <div class="task ${done ? "done" : ""}">
      <div class="task-head">
        <div class="task-title">${esc(t.title)}</div>
        ${canEdit ? `<div class="item-actions">
          <button class="btn-ghost btn-sm" data-edit-task="${t.id}">⚙️ Ayarlar</button>
          <button class="btn-danger" data-del-task="${t.id}">Sil</button>
        </div>` : ""}
      </div>
      ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ""}
      <div class="task-tags">
        <span class="tag rec">🔁 ${recurrenceLabel(t)}</span>
        ${venue ? `<span class="tag venue">📍 ${esc(venue.name)}</span>` : ""}
        <span class="tag">👥 ${esc(assigneeNames)}</span>
        ${t.startTime ? `<span class="tag starttime">🕐 Başlama: ${t.startTime}</span>` : ""}
        ${t.dueTime ? `<span class="tag duetime">⏰ Son saat: ${t.dueTime}</span>` : ""}
        ${t.dueAt ? `<span class="tag">Son tarih: ${fmtDate(t.dueAt)}</span>` : ""}
        <span class="tag creator">🖊️ Oluşturan: ${esc(creatorText(t))}</span>
        <span class="tag">Oluşturuldu: ${fmtDate(t.createdAt)}</span>
      </div>
      ${editedNote(t)}
      <div class="status-line"><strong>${recurring ? "Bugünkü durum" : "Durum"}:</strong></div>
      ${rows}
      ${readsHtml}
    </div>
  `;
}

function wireMgrTasks(u) {
  // seçili pill görünümü
  document.querySelectorAll(".assignee, .wday, .mday").forEach((cb) => {
    cb.onchange = () => cb.closest(".check-pill").classList.toggle("sel", cb.checked);
  });
  // tekrar tipine göre ilgili alanları göster/gizle
  const recSel = document.getElementById("t_rec");
  if (recSel) {
    const sync = () => {
      const v = recSel.value;
      document.getElementById("rec_once").style.display = v === "once" ? "" : "none";
      document.getElementById("rec_weekly").style.display = v === "weekly" ? "" : "none";
      document.getElementById("rec_monthly").style.display = v === "monthly" ? "" : "none";
    };
    recSel.onchange = sync;
    sync();
  }
  const createBtn = document.getElementById("t_create");
  if (createBtn) createBtn.onclick = () => {
    const title = document.getElementById("t_title").value.trim();
    const desc = document.getElementById("t_desc").value.trim();
    const venueId = document.getElementById("t_venue").value || null;
    const recType = document.getElementById("t_rec").value;
    const dueRaw = recType === "once" ? document.getElementById("t_due").value : "";
    const assignees = Array.from(document.querySelectorAll(".assignee:checked")).map((c) => c.value);
    const err = document.getElementById("t_err");
    if (!title) { err.textContent = "Görev başlığı gerekli."; return; }
    if (!assignees.length) { err.textContent = "En az bir personel seçin."; return; }
    const recurrence = { type: recType };
    if (recType === "weekly") {
      recurrence.days = Array.from(document.querySelectorAll(".wday:checked")).map((c) => +c.value);
      if (!recurrence.days.length) { err.textContent = "Haftalık için en az bir gün seçin."; return; }
    }
    if (recType === "monthly") {
      recurrence.dates = Array.from(document.querySelectorAll(".mday:checked")).map((c) => +c.value);
      if (!recurrence.dates.length) { err.textContent = "Aylık için en az bir tarih seçin."; return; }
    }
    DB.tasks.push({
      id: uid(),
      ownerId: ownerIdOf(u),
      createdBy: u.id,
      title, description: desc,
      venueId,
      recurrence,
      dueAt: dueRaw ? new Date(dueRaw).toISOString() : null,
      startTime: document.getElementById("t_starttime").value || null,   // başlama saati (HH:MM) — öncesinde tamamlanamaz
      dueTime: document.getElementById("t_duetime").value || null,   // günlük son saat (HH:MM)
      assignedUserIds: assignees,
      createdAt: new Date().toISOString(),
      completions: {},
      reads: {},
    });
    saveDB(DB);
    notifyUsers(assignees, "Yeni görev", title, "/");
    render();
  };
  wireDelTask();
}

/* --- Personel sekmesi --- */
function venueCheckHtml(venues, selectedIds, cls) {
  if (!venues.length) return `<div class="empty" style="padding:8px">Mekan yok (opsiyonel).</div>`;
  return venues.map((v) => {
    const on = (selectedIds || []).includes(v.id);
    return `<label class="check-pill ${on ? "sel" : ""}">
      <input type="checkbox" class="${cls}" value="${v.id}" ${on ? "checked" : ""} />
      ${esc(v.name)}
    </label>`;
  }).join("");
}

function staffAddForm(venues) {
  return `
    <details class="cat" style="margin-bottom:18px">
      <summary><span>➕ Yeni Personel Ekle</span></summary>
      <div class="cat-body" style="padding:14px">
        <div class="row">
          <div class="field"><label>Ad Soyad</label><input id="s_name" placeholder="Ahmet Yılmaz" /></div>
          <div class="field"><label>E-posta (giriş için)</label><input id="s_email" placeholder="ahmet@local" /></div>
        </div>
        <div class="field"><label>Şifre (giriş için)</label><input id="s_pw" placeholder="Personele verilecek şifre" /></div>
        <div class="field">
          <label>Görevli olduğu mekanlar</label>
          <div class="checks">${venueCheckHtml(venues, [], "s_venue")}</div>
        </div>
        <button class="btn-primary" id="s_add">Personel Ekle</button>
        <div class="error-msg" id="s_err"></div>
      </div>
    </details>`;
}

function staffEditForm(s, venues) {
  return `
    <div class="card" style="border-color:var(--primary)">
      <h2>⚙️ Personel Düzenle — ${esc(s.name)}</h2>
      <div class="row">
        <div class="field"><label>Ad Soyad</label><input id="e_name" value="${esc(s.name)}" /></div>
        <div class="field"><label>E-posta</label><input id="e_email" value="${esc(s.email)}" /></div>
      </div>
      <div class="field"><label>Yeni Şifre (boş bırakırsanız değişmez)</label><input id="e_pw" type="text" placeholder="••••" /></div>
      <div class="field">
        <label>Görevli olduğu mekanlar</label>
        <div class="checks">${venueCheckHtml(venues, s.venueIds, "e_venue")}</div>
      </div>
      <div class="form-actions">
        <button class="btn-primary" id="e_save">Kaydet</button>
        <button class="btn-ghost" id="e_cancel">İptal</button>
      </div>
      <div class="error-msg" id="e_err"></div>
    </div>`;
}

function mgrStaff(u) {
  const staff = visibleStaff(u);
  const venues = visibleVenues(u);
  const editing = editingStaff ? userById(editingStaff) : null;
  const isEditing = editing && editing.role === "personel" && editing.ownerId === ownerIdOf(u)
    && (u.role !== "sef" || editing.chefId === u.id);

  const formCard = isEditing ? staffEditForm(editing, venues) : staffAddForm(venues);

  const staffItem = (s) => {
    const vNames = (s.venueIds || []).map((id) => { const v = venueById(id); return v ? v.name : null; }).filter(Boolean);
    const chef = s.chefId ? userById(s.chefId) : null;
    const chefInfo = (u.role === "yonetici" && chef) ? ` · 👔 ${esc(chef.name)}` : "";
    return `<div class="list-item">
        <div>
          <div class="title">${esc(s.name)}</div>
          <div class="meta">${esc(s.email)}${vNames.length ? " · 📍 " + vNames.map(esc).join(", ") : ""}${chefInfo}</div>
        </div>
        <div class="item-actions">
          <button class="btn-ghost btn-sm" data-edit-staff="${s.id}">⚙️ Ayarlar</button>
          <button class="btn-danger" data-del-staff="${s.id}">Sil</button>
        </div>
      </div>`;
  };
  return formCard + `
    <div class="section-title">Personel Listesi (${staff.length})</div>
    ${staff.length ? venuePeopleGroups(u, staff, staffItem, "📋 Lokasyonsuz personel") : `<div class="empty">Henüz personel yok.</div>`}
  `;
}

function wireMgrStaff(u) {
  document.querySelectorAll(".s_venue, .e_venue").forEach((cb) => {
    cb.onchange = () => cb.closest(".check-pill").classList.toggle("sel", cb.checked);
  });

  // Yeni personel ekle (hesap sunucuda hash'li oluşturulur)
  const addBtn = document.getElementById("s_add");
  if (addBtn) addBtn.onclick = async () => {
    const name = document.getElementById("s_name").value.trim();
    const email = document.getElementById("s_email").value.trim();
    const pw = document.getElementById("s_pw").value.trim();
    const venueIds = Array.from(document.querySelectorAll(".s_venue:checked")).map((c) => c.value);
    const err = document.getElementById("s_err");
    if (!name || !email || !pw) { err.textContent = "Ad, e-posta ve şifre gerekli."; return; }
    if (pw.length < 4) { err.textContent = "Şifre en az 4 karakter olmalı."; return; }
    if (!orgPlan.unlimited && orgStaff(ownerIdOf(u)).length >= orgPlan.maxStaff) {
      err.textContent = `Demo planı: en fazla ${orgPlan.maxStaff} personel ekleyebilirsiniz. Daha fazlası için Paketler'den ilgi talebi gönderin.`;
      return;
    }
    addBtn.disabled = true; err.textContent = "";
    try {
      const j = await authCall({ action: "createUser", role: "personel", name, email, password: pw });
      DB.users.push({
        id: j.userId, role: "personel", name, email,
        ownerId: ownerIdOf(u), chefId: u.role === "sef" ? u.id : null, venueIds, lang: "en",
      });
      saveDB(DB);
      render();
    } catch (e) {
      addBtn.disabled = false;
      err.textContent = (String(e.message) === "email_taken") ? "Bu e-posta zaten kullanımda."
        : (String(e.message) === "limit_staff") ? `Demo planı: en fazla ${orgPlan.maxStaff} personel ekleyebilirsiniz. Daha fazlası için Paketler'den ilgi talebi gönderin.`
        : "Eklenemedi (bağlantı?).";
    }
  };

  // Personel düzenle - kaydet
  const saveBtn = document.getElementById("e_save");
  if (saveBtn) saveBtn.onclick = async () => {
    const s = userById(editingStaff);
    if (!s) { editingStaff = null; render(); return; }
    const name = document.getElementById("e_name").value.trim();
    const email = document.getElementById("e_email").value.trim();
    const pw = document.getElementById("e_pw").value.trim();
    const venueIds = Array.from(document.querySelectorAll(".e_venue:checked")).map((c) => c.value);
    const err = document.getElementById("e_err");
    if (!name || !email) { err.textContent = "Ad ve e-posta gerekli."; return; }
    if (pw && pw.length < 4) { err.textContent = "Şifre en az 4 karakter olmalı."; return; }
    saveBtn.disabled = true; err.textContent = "";
    try {
      if (email.toLowerCase() !== (s.email || "").toLowerCase()) {
        await authCall({ action: "updateEmail", userId: s.id, email });
      }
      if (pw) { await authCall({ action: "setPassword", userId: s.id, password: pw }); }
      const removedVenues = (s.venueIds || []).filter((v) => !venueIds.includes(v));
      if (removedVenues.length) {
        DB.tasks.forEach((t) => {
          if (t.venueId && removedVenues.includes(t.venueId)) {
            t.assignedUserIds = t.assignedUserIds.filter((a) => a !== s.id);
          }
        });
      }
      s.name = name; s.email = email; s.venueIds = venueIds;
      saveDB(DB);
      editingStaff = null;
      render();
    } catch (e) {
      saveBtn.disabled = false;
      err.textContent = (String(e.message) === "email_taken") ? "Bu e-posta zaten kullanımda." : "Kaydedilemedi (bağlantı?).";
    }
  };
  const cancelBtn = document.getElementById("e_cancel");
  if (cancelBtn) cancelBtn.onclick = () => { editingStaff = null; render(); };

  // Ayarlar düğmesi -> düzenleme moduna geç
  document.querySelectorAll("[data-edit-staff]").forEach((b) => {
    b.onclick = () => { editingStaff = b.dataset.editStaff; render(); };
  });

  // Personel sil
  document.querySelectorAll("[data-del-staff]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Bu personel silinsin mi? (Görev atamalarından da çıkarılır)")) return;
      const id = b.dataset.delStaff;
      try { await authCall({ action: "deleteUser", userId: id }); } catch (e) { /* yine de yereldən çıkar */ }
      DB.users = DB.users.filter((x) => x.id !== id);
      DB.tasks.forEach((t) => { t.assignedUserIds = t.assignedUserIds.filter((a) => a !== id); });
      if (editingStaff === id) editingStaff = null;
      saveDB(DB);
      render();
    };
  });
}

/* --- Mekanlar sekmesi --- */
function mgrVenues(u) {
  // Bir mekan seçiliyse, o mekanın görevlerini göster (kategori görünümü)
  if (selectedVenue) {
    const v = venueById(selectedVenue);
    if (v && visibleVenues(u).some((x) => x.id === v.id)) return venueDetail(u, v);
    selectedVenue = null;
  }

  const isOwner = u.role === "yonetici";
  const venues = visibleVenues(u);
  const addForm = isOwner ? `
    <details class="cat" style="margin-bottom:18px">
      <summary><span>➕ Yeni Lokasyon Ekle</span></summary>
      <div class="cat-body" style="padding:14px">
        <div class="row">
          <div class="field"><label>Lokasyon adı</label><input id="v_name" placeholder="Örn: Merkez Şube" /></div>
          <div class="field"><label>Adres (opsiyonel)</label><input id="v_addr" placeholder="Adres" /></div>
        </div>
        <button class="btn-primary" id="v_add">Lokasyon Ekle</button>
        <div class="error-msg" id="v_err"></div>
      </div>
    </details>` : "";

  return addForm + `
    <div class="section-title">${isOwner ? "Lokasyonlar" : "Lokasyonlarım"} (${venues.length})</div>
    <p style="color:var(--muted);font-size:13px;margin:-8px 0 14px">Görevleri görmek için bir lokasyona tıklayın.</p>
    ${venues.length ? venues.map((v) => {
      const cnt = visibleStaff(u).filter((s) => (s.venueIds || []).includes(v.id)).length;
      const taskCnt = visibleTasks(u).filter((t) => t.venueId === v.id).length;
      return `<div class="list-item venue-item" data-open-venue="${v.id}">
        <div>
          <div class="title">📍 ${esc(v.name)}</div>
          <div class="meta">${v.address ? esc(v.address) + " · " : ""}${cnt} personel · ${taskCnt} görev</div>
        </div>
        <div class="item-actions">
          ${isOwner && clockOn() ? `<button class="btn-ghost btn-sm" data-venue-loc="${v.id}">${v.lat != null ? "📍 Konum ✓" : "📍 Konumu ayarla"}</button>` : ""}
          <span class="meta">Görevleri aç →</span>
          ${isOwner ? `<button class="btn-danger" data-del-venue="${v.id}">Sil</button>` : ""}
        </div>
      </div>`;
    }).join("") : `<div class="empty">${isOwner ? "Henüz lokasyon yok." : "Size atanmış lokasyon yok."}</div>`}
  `;
}

// Tek bir mekanın (kategorinin) görev listesi
function venueDetail(u, v) {
  const tasks = visibleTasks(u)
    .filter((t) => t.venueId === v.id)
    .sort((a, b) => {
      const ad = doneForKey(a, occKeyToday(a));
      const bd = doneForKey(b, occKeyToday(b));
      if (ad !== bd) return ad ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  const staff = visibleStaff(u).filter((s) => (s.venueIds || []).includes(v.id));
  return `
    <button class="btn-ghost btn-sm" id="venue_back">← Mekanlara dön</button>
    <div class="section-title" style="margin-top:14px">📍 ${esc(v.name)}</div>
    ${v.address ? `<div style="color:var(--muted);font-size:14px;margin:-10px 0 16px">${esc(v.address)}</div>` : ""}
    <div class="card">
      <h3>Bu mekandaki personel (${staff.length})</h3>
      <div class="task-tags">
        ${staff.length ? staff.map((s) => `<span class="tag">👤 ${esc(s.name)}</span>`).join("") : `<span class="meta">Atanmış personel yok.</span>`}
      </div>
    </div>
    <div class="section-title">Görevler (${tasks.length})</div>
    ${tasks.length ? tasks.map(mgrTaskCard).join("") : `<div class="empty">Bu mekana ait görev yok.</div>`}
  `;
}

function wireMgrVenues(u) {
  // geri dön (detay görünümü)
  const back = document.getElementById("venue_back");
  if (back) back.onclick = () => { selectedVenue = null; render(); };

  // mekana tıkla -> görevlerini aç
  document.querySelectorAll("[data-open-venue]").forEach((el) => {
    el.onclick = () => { selectedVenue = el.dataset.openVenue; render(); };
  });

  // Lokasyon konumunu ayarla (mesai konum kontrolü için "şu an buradayım")
  document.querySelectorAll("[data-venue-loc]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const v = venueById(b.dataset.venueLoc);
      if (!v) return;
      if (!navigator.geolocation) { tAlert("Cihaz konum (GPS) desteklemiyor."); return; }
      b.textContent = "…";
      navigator.geolocation.getCurrentPosition(
        (pos) => { v.lat = pos.coords.latitude; v.lng = pos.coords.longitude; saveDB(DB); render(); },
        () => { tAlert("Konum alınamadı. Konum iznini verdiğinizden emin olun."); render(); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };
  });

  const addBtn = document.getElementById("v_add");
  if (addBtn) addBtn.onclick = () => {
    const name = document.getElementById("v_name").value.trim();
    const addr = document.getElementById("v_addr").value.trim();
    const err = document.getElementById("v_err");
    if (!name) { err.textContent = "Lokasyon adı gerekli."; return; }
    if (!orgPlan.unlimited && orgVenues(ownerIdOf(u)).length >= orgPlan.maxVenues) {
      err.textContent = `Demo planı: en fazla ${orgPlan.maxVenues} mekan ekleyebilirsiniz. Daha fazlası için Paketler'den ilgi talebi gönderin.`;
      return;
    }
    DB.venues.push({ id: uid(), name, address: addr, ownerId: ownerIdOf(u) });
    saveDB(DB);
    render();
  };
  document.querySelectorAll("[data-del-venue]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation(); // satıra tıklama (mekan açma) tetiklenmesin
      if (!confirm("Bu mekan silinsin mi?")) return;
      const id = b.dataset.delVenue;
      DB.venues = DB.venues.filter((v) => v.id !== id);
      DB.users.forEach((x) => { if (x.venueIds) x.venueIds = x.venueIds.filter((vi) => vi !== id); });
      DB.tasks.forEach((t) => { if (t.venueId === id) t.venueId = null; });
      saveDB(DB);
      render();
    };
  });

  // detay görünümündeki görev silme butonları
  wireDelTask();
}

/* --- Kayıtlar (tamamlanan görevler) sekmesi --- */
function mgrLog(u) {
  const tasks = visibleTasks(u);
  const records = [];
  tasks.forEach((t) => {
    Object.keys(t.completions).forEach((dateKey) => {
      const c = t.completions[dateKey];
      if (!inRange(c.at, logFrom, logTo)) return;
      records.push({
        when: c.at,
        staff: userById(c.by),
        task: t,
        note: c.note || "",
      });
    });
  });
  records.sort((a, b) => new Date(b.when) - new Date(a.when));

  // Lokasyona göre kayıt tablosu (Mekan sütunu yok — başlık zaten lokasyon)
  const recTable = (items) => `
    <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Personel</th><th>Görev</th><th>Not</th><th>Tamamlanma Saati</th></tr></thead>
      <tbody>
        ${items.map((r) => `<tr>
          <td>${esc(r.staff ? r.staff.name : "Silinmiş")}</td>
          <td>${esc(r.task.title)}</td>
          <td>${r.note ? "📝 " + esc(r.note) : "—"}</td>
          <td class="when" style="white-space:nowrap">${fmtDate(r.when)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    </div>`;
  const venues = visibleVenues(u);
  const filtered = !!(logFrom || logTo);   // tarih filtresi varsa hepsini göster, yoksa lokasyon başına 50
  const groupBody = (items) => {
    const shown = filtered ? items : items.slice(0, 50);
    const more = items.length - shown.length;
    return recTable(shown) + (more > 0
      ? `<div class="empty" style="padding:8px">Son 50 kayıt gösteriliyor · daha eskisi için tarih filtreleyin (+${more})</div>`
      : "");
  };
  const groupsHtml = venues.map((v) => {
    const items = records.filter((r) => r.task.venueId === v.id);
    if (!items.length) return "";
    return `<details class="cat" style="margin-bottom:10px"><summary><span>📍 ${esc(v.name)} (${items.length})</span></summary><div class="cat-body" style="padding:10px">${groupBody(items)}</div></details>`;
  }).join("");
  const noV = records.filter((r) => !r.task.venueId || !venueById(r.task.venueId));
  const noVHtml = noV.length
    ? `<details class="cat" style="margin-bottom:10px"><summary><span>📋 Lokasyonsuz (${noV.length})</span></summary><div class="cat-body" style="padding:10px">${groupBody(noV)}</div></details>`
    : "";

  return rangeFilter("log", logFrom, logTo) + `
    <div class="card">
      <h2>Tamamlanan Görev Kayıtları (${records.length})</h2>
      ${records.length ? (groupsHtml + noVHtml) : `<div class="empty">Henüz tamamlanmış görev yok.</div>`}
    </div>
  `;
}

/* --- Mesai Kayıtları (time clock) --- */
function mesaiView(u) {
  const owner = ownerIdOf(u);
  const all = (DB.clock || []).filter((c) => c.ownerId === owner);
  const myV = u.venueIds || [];
  const scoped = (u.role === "yonetici") ? all : all.filter((c) => c.venueId && myV.includes(c.venueId));
  const rows = scoped.filter((c) => inRange(c.inAt, mesaiFrom, mesaiTo)).slice().sort((a, b) => new Date(b.inAt) - new Date(a.inAt));
  const openNow = rows.filter((c) => !c.outAt);

  const rowHtml = (items) => `
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Personel</th><th>Giriş saati</th><th>Çıkış saati</th><th>Süre</th></tr></thead>
      <tbody>${items.map((c) => {
        const who = userById(c.userId);
        const dur = c.outAt ? clockHoursStr(new Date(c.outAt) - new Date(c.inAt)) : "—";
        return `<tr>
          <td>${esc(who ? who.name : "Silinmiş")}</td>
          <td class="when" style="white-space:nowrap">${fmtDate(c.inAt)}</td>
          <td class="when" style="white-space:nowrap">${c.outAt ? fmtDate(c.outAt) : "🟢 Mesaide"}</td>
          <td>${dur}</td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;

  const filtered = !!(mesaiFrom || mesaiTo);
  const groupBody = (items) => {
    const shown = filtered ? items : items.slice(0, 50);
    const more = items.length - shown.length;
    return rowHtml(shown) + (more > 0 ? `<div class="empty" style="padding:8px">Son 50 kayıt gösteriliyor · daha eskisi için tarih filtreleyin (+${more})</div>` : "");
  };
  const venues = visibleVenues(u);
  const groupsHtml = venues.map((v) => {
    const items = rows.filter((c) => c.venueId === v.id);
    if (!items.length) return "";
    return `<details class="cat" style="margin-bottom:10px" open><summary><span>📍 ${esc(v.name)} (${items.length})</span></summary><div class="cat-body" style="padding:10px">${groupBody(items)}</div></details>`;
  }).join("");
  const noV = rows.filter((c) => !c.venueId || !venueById(c.venueId));
  const noVHtml = noV.length ? `<details class="cat" style="margin-bottom:10px"><summary><span>📋 Lokasyonsuz (${noV.length})</span></summary><div class="cat-body" style="padding:10px">${groupBody(noV)}</div></details>` : "";

  const onNowHtml = openNow.length ? `
    <div class="reports-board"><div class="reports-head">🟢 Şu an mesaide (${openNow.length})</div>
    ${openNow.map((c) => { const who = userById(c.userId); const v = c.venueId ? venueById(c.venueId) : null; return `<div class="completion-row"><span>${esc(who ? who.name : "?")}${v ? " · 📍 " + esc(v.name) : ""}</span><span class="ok">${fmtDate(c.inAt)} · ${clockHoursStr(Date.now() - new Date(c.inAt))}</span></div>`; }).join("")}
    </div>` : "";

  return rangeFilter("mesai", mesaiFrom, mesaiTo) + `
    <div class="card">
      <h2>⏱️ Mesai Kayıtları (${rows.length})</h2>
      ${onNowHtml}
      ${rows.length ? (groupsHtml + noVHtml) : `<div class="empty">Bu aralıkta mesai kaydı yok.</div>`}
    </div>`;
}

/* --- Şefler sekmesi (yalnızca yönetici) --- */
function chefAddForm(venues) {
  return `
    <details class="cat" style="margin-bottom:18px">
      <summary><span>➕ Yeni Şef Ekle</span></summary>
      <div class="cat-body" style="padding:14px">
        <p style="color:var(--muted);font-size:13px;margin:0 0 14px">
          Şef, atadığınız mekanlarda kendi personelini ekleyip onlara görev verebilir.
        </p>
        <div class="row">
          <div class="field"><label>Ad Soyad</label><input id="cf_name" placeholder="Mehmet Şef" /></div>
          <div class="field"><label>E-posta (giriş için)</label><input id="cf_email" placeholder="mehmet@local" /></div>
        </div>
        <div class="field"><label>Şifre (giriş için)</label><input id="cf_pw" placeholder="Şefe verilecek şifre" /></div>
        <div class="field">
          <label>Sorumlu olduğu mekanlar</label>
          <div class="checks">${venueCheckHtml(venues, [], "cf_venue")}</div>
        </div>
        <button class="btn-primary" id="cf_add">Şef Ekle</button>
        <div class="error-msg" id="cf_err"></div>
      </div>
    </details>`;
}

function chefEditForm(c, venues) {
  return `
    <div class="card" style="border-color:var(--primary)">
      <h2>⚙️ Şef Düzenle — ${esc(c.name)}</h2>
      <div class="row">
        <div class="field"><label>Ad Soyad</label><input id="ce_name" value="${esc(c.name)}" /></div>
        <div class="field"><label>E-posta</label><input id="ce_email" value="${esc(c.email)}" /></div>
      </div>
      <div class="field"><label>Yeni Şifre (boş bırakırsanız değişmez)</label><input id="ce_pw" type="text" placeholder="••••" /></div>
      <div class="field">
        <label>Sorumlu olduğu mekanlar</label>
        <div class="checks">${venueCheckHtml(venues, c.venueIds, "ce_venue")}</div>
      </div>
      <div class="form-actions">
        <button class="btn-primary" id="ce_save">Kaydet</button>
        <button class="btn-ghost" id="ce_cancel">İptal</button>
      </div>
      <div class="error-msg" id="ce_err"></div>
    </div>`;
}

function mgrChefs(u) {
  const owner = ownerIdOf(u);
  // Bir şef seçiliyse, o şefin detayını göster
  if (selectedChef) {
    const c = userById(selectedChef);
    if (c && c.role === "sef" && c.ownerId === owner) return chefDetail(u, c);
    selectedChef = null;
  }

  const chefs = orgChefs(owner);
  const venues = orgVenues(owner);
  const editing = editingStaff ? userById(editingStaff) : null;
  const isEditing = editing && editing.role === "sef" && editing.ownerId === owner;
  const formCard = isEditing ? chefEditForm(editing, venues) : chefAddForm(venues);

  const chefItem = (c) => {
    const vNames = (c.venueIds || []).map((id) => { const v = venueById(id); return v ? v.name : null; }).filter(Boolean);
    const pc = orgStaff(owner).filter((s) => s.chefId === c.id).length;
    return `<div class="list-item venue-item" data-open-chef="${c.id}">
        <div>
          <div class="title">👔 ${esc(c.name)}</div>
          <div class="meta">${esc(c.email)}${vNames.length ? " · 📍 " + vNames.map(esc).join(", ") : ""} · ${pc} personel</div>
        </div>
        <div class="item-actions">
          <button class="btn-ghost btn-sm" data-edit-chef="${c.id}">⚙️ Ayarlar</button>
          <button class="btn-danger" data-del-chef="${c.id}">Sil</button>
        </div>
      </div>`;
  };
  return formCard + `
    <div class="section-title">Şefler (${chefs.length})</div>
    <p style="color:var(--muted);font-size:13px;margin:-8px 0 14px">Personelini ve görevlerini görmek için bir şefe tıklayın.</p>
    ${chefs.length ? venuePeopleGroups(u, chefs, chefItem, "📋 Lokasyonsuz şef") : `<div class="empty">Henüz şef yok.</div>`}
  `;
}

// Yöneticinin bir şefin kapsamını (personel + görev) gördüğü detay
function chefDetail(u, c) {
  const owner = ownerIdOf(u);
  const staff = orgStaff(owner).filter((s) => s.chefId === c.id);
  const tasks = orgTasks(owner).filter((t) => t.createdBy === c.id).slice().reverse();
  const vNames = (c.venueIds || []).map((id) => { const v = venueById(id); return v ? v.name : null; }).filter(Boolean);
  return `
    <button class="btn-ghost btn-sm" id="chef_back">← Şeflere dön</button>
    <div class="section-title" style="margin-top:14px">👔 ${esc(c.name)}</div>
    <div style="color:var(--muted);font-size:14px;margin:-10px 0 16px">${esc(c.email)}${vNames.length ? " · 📍 " + vNames.map(esc).join(", ") : ""}</div>
    <div class="card">
      <h3>Personeli (${staff.length})</h3>
      <div class="task-tags">
        ${staff.length ? staff.map((s) => `<span class="tag">👤 ${esc(s.name)}</span>`).join("") : `<span class="meta">Personel yok.</span>`}
      </div>
    </div>
    <div class="section-title">Görevleri (${tasks.length})</div>
    ${tasks.length ? tasks.map(mgrTaskCard).join("") : `<div class="empty">Bu şefin oluşturduğu görev yok.</div>`}
  `;
}

function wireMgrChefs(u) {
  const owner = ownerIdOf(u);

  // geri dön (detay görünümü)
  const back = document.getElementById("chef_back");
  if (back) back.onclick = () => { selectedChef = null; render(); };

  // şefe tıkla -> detayını aç
  document.querySelectorAll("[data-open-chef]").forEach((el) => {
    el.onclick = () => { selectedChef = el.dataset.openChef; render(); };
  });

  // mekan seçim pill görünümü
  document.querySelectorAll(".cf_venue, .ce_venue").forEach((cb) => {
    cb.onchange = () => cb.closest(".check-pill").classList.toggle("sel", cb.checked);
  });

  // Yeni şef ekle (hesap sunucuda hash'li oluşturulur)
  const addBtn = document.getElementById("cf_add");
  if (addBtn) addBtn.onclick = async () => {
    const name = document.getElementById("cf_name").value.trim();
    const email = document.getElementById("cf_email").value.trim();
    const pw = document.getElementById("cf_pw").value.trim();
    const venueIds = Array.from(document.querySelectorAll(".cf_venue:checked")).map((el) => el.value);
    const err = document.getElementById("cf_err");
    if (!name || !email || !pw) { err.textContent = "Ad, e-posta ve şifre gerekli."; return; }
    if (pw.length < 4) { err.textContent = "Şifre en az 4 karakter olmalı."; return; }
    if (!orgPlan.unlimited && orgChefs(owner).length >= orgPlan.maxChefs) {
      err.textContent = `Demo planı: en fazla ${orgPlan.maxChefs} şef ekleyebilirsiniz. Daha fazlası için Paketler'den ilgi talebi gönderin.`;
      return;
    }
    addBtn.disabled = true; err.textContent = "";
    try {
      const j = await authCall({ action: "createUser", role: "sef", name, email, password: pw });
      DB.users.push({ id: j.userId, role: "sef", name, email, ownerId: owner, venueIds, lang: "en" });
      saveDB(DB);
      render();
    } catch (e) {
      addBtn.disabled = false;
      err.textContent = (String(e.message) === "email_taken") ? "Bu e-posta zaten kullanımda."
        : (String(e.message) === "limit_chef") ? `Demo planı: en fazla ${orgPlan.maxChefs} şef ekleyebilirsiniz. Daha fazlası için Paketler'den ilgi talebi gönderin.`
        : "Eklenemedi (bağlantı?).";
    }
  };

  // Şef düzenle - kaydet
  const saveBtn = document.getElementById("ce_save");
  if (saveBtn) saveBtn.onclick = async () => {
    const c = userById(editingStaff);
    if (!c) { editingStaff = null; render(); return; }
    const name = document.getElementById("ce_name").value.trim();
    const email = document.getElementById("ce_email").value.trim();
    const pw = document.getElementById("ce_pw").value.trim();
    const venueIds = Array.from(document.querySelectorAll(".ce_venue:checked")).map((el) => el.value);
    const err = document.getElementById("ce_err");
    if (!name || !email) { err.textContent = "Ad ve e-posta gerekli."; return; }
    if (pw && pw.length < 4) { err.textContent = "Şifre en az 4 karakter olmalı."; return; }
    saveBtn.disabled = true; err.textContent = "";
    try {
      if (email.toLowerCase() !== (c.email || "").toLowerCase()) {
        await authCall({ action: "updateEmail", userId: c.id, email });
      }
      if (pw) { await authCall({ action: "setPassword", userId: c.id, password: pw }); }
      c.name = name; c.email = email; c.venueIds = venueIds;
      saveDB(DB);
      editingStaff = null;
      render();
    } catch (e) {
      saveBtn.disabled = false;
      err.textContent = (String(e.message) === "email_taken") ? "Bu e-posta zaten kullanımda." : "Kaydedilemedi (bağlantı?).";
    }
  };
  const cancelBtn = document.getElementById("ce_cancel");
  if (cancelBtn) cancelBtn.onclick = () => { editingStaff = null; render(); };

  // Ayarlar düğmesi -> düzenleme moduna geç
  document.querySelectorAll("[data-edit-chef]").forEach((b) => {
    b.onclick = () => { editingStaff = b.dataset.editChef; render(); };
  });

  // Şef sil (personeli yöneticiye bağlanır, silinmez)
  document.querySelectorAll("[data-del-chef]").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.delChef;
      if (!confirm("Bu şef silinsin mi? (Personeli silinmez, doğrudan yöneticiye bağlanır)")) return;
      try { await authCall({ action: "deleteUser", userId: id }); } catch (e) { /* yine de yereldən çıkar */ }
      DB.users = DB.users.filter((x) => x.id !== id);
      DB.users.forEach((x) => { if (x.chefId === id) x.chefId = null; });
      if (editingStaff === id) editingStaff = null;
      saveDB(DB);
      render();
    };
  });

  // detay görünümündeki görev kartı butonları
  wireDelTask();
}

/* ============================================================
   ŞEF — Bana Atanan Görevler (tamamla + personelle paylaş)
   ============================================================ */
function assignedToMe(u) {
  if (isOff(u.id, todayKey())) {
    return `<div class="card" style="text-align:center">🏖️ Bugün izinlisiniz — bugün için göreviniz yok.</div>`;
  }
  const myTasks = DB.tasks
    .filter((t) => t.assignedUserIds.includes(u.id) && occursToday(t) && taskVenueOk(t, u))
    .sort((a, b) => {
      const ad = !!a.completions[occKeyToday(a)];
      const bd = !!b.completions[occKeyToday(b)];
      if (ad !== bd) return ad ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  markReads(u, myTasks);
  const pending = myTasks.filter((t) => !t.completions[occKeyToday(t)]).length;
  return `
    <div class="section-title">Bana Atanan Görevler (${pending} bekliyor)</div>
    <p style="color:var(--muted);font-size:13px;margin:-8px 0 14px">Görevi kendiniz tamamlayabilir veya gerekirse kendi personelinizle paylaşabilirsiniz.</p>
    ${myTasks.length ? myTasks.map((t) => staffTaskCard(t, u, shareBlock(t, u))).join("") : `<div class="empty">Size atanmış görev yok.</div>`}
  `;
}

// Görev kartı içindeki paylaşım kutusu (şefe özel)
function shareBlock(t, u) {
  if (sharingTask !== t.id) {
    return `<div class="share-row"><button class="btn-ghost btn-sm" data-share="${t.id}">👥 Personelle paylaş</button></div>`;
  }
  const candidates = assignableUsers(u).filter((s) => s.role === "personel" && !t.assignedUserIds.includes(s.id));
  const checks = candidates.length
    ? candidates.map((s) => `<button type="button" class="check-pill share-pick" data-id="${s.id}">${esc(s.name)}</button>`).join("")
    : `<div class="empty" style="padding:8px">Eklenebilecek başka personel yok.</div>`;
  return `
    <div class="share-box">
      <div class="meta" style="margin-bottom:8px">Bu görevi paylaşmak istediğiniz personeli seçin:</div>
      <div class="checks">${checks}</div>
      <div class="form-actions" style="margin-top:10px">
        ${candidates.length ? `<button class="btn-primary btn-sm" data-share-save="${t.id}">Paylaş</button>` : ""}
        <button class="btn-ghost btn-sm" data-share-cancel="1">İptal</button>
      </div>
    </div>`;
}

function wireChefAssigned(u) {
  wireStaffToday(u); // tamamla / geri al
  document.querySelectorAll("[data-share]").forEach((b) => {
    b.onclick = () => { sharingTask = b.dataset.share; render(); };
  });
  document.querySelectorAll("[data-share-cancel]").forEach((b) => {
    b.onclick = () => { sharingTask = null; render(); };
  });
  document.querySelectorAll(".share-pick").forEach((b) => {
    b.onclick = () => b.classList.toggle("sel");   // tek dokunuşta seç/bırak
  });
  document.querySelectorAll("[data-share-save]").forEach((b) => {
    b.onclick = () => {
      const t = DB.tasks.find((x) => x.id === b.dataset.shareSave);
      if (!t) { sharingTask = null; render(); return; }
      const added = [];
      Array.from(document.querySelectorAll(".share-pick.sel")).forEach((el) => {
        const id = el.dataset.id;
        if (!t.assignedUserIds.includes(id)) { t.assignedUserIds.push(id); added.push(id); }
      });
      saveDB(DB);
      notifyUsers(added, "Görev paylaşıldı", t.title, "/");
      sharingTask = null;
      render();
    };
  });
}

/* ============================================================
   BİLDİRİM / TALEP arayüzü
   ============================================================ */
function reportCard(u, r, canResolve) {
  const cat = reportCat(r.category);
  const reporter = userById(r.createdBy);
  const venue = r.venueId ? venueById(r.venueId) : null;
  const isAriza = r.category === "ariza";
  const isReporter = u.id === r.createdBy;
  const resolved = r.status === "cozuldu";
  const notified = r.status === "bildirildi";   // Arıza: teknik ekibe bildirildi
  const solver = r.resolvedBy ? userById(r.resolvedBy) : null;
  const techBy = r.techReportedBy ? userById(r.techReportedBy) : null;

  let badge;
  if (resolved) badge = `<span class="badge badge-done">${isAriza ? "Giderildi" : "Çözüldü"}</span>`;
  else if (notified) badge = `<span class="badge badge-progress">Teknik ekibe bildirildi</span>`;
  else badge = `<span class="badge badge-open">Açık</span>`;

  // Aksiyonlar
  let actions = "";
  if (!resolved) {
    if (isAriza) {
      if (r.status === "acik" && canResolve) {
        actions = `<div class="report-actions"><button class="btn-primary btn-sm" data-techreport="${r.id}">🔧 Teknik ekibe bildirildi</button></div>`;
      } else if (notified && isReporter) {
        actions = `<div class="report-actions"><button class="btn-green btn-sm" data-faultdone="${r.id}">✅ Arıza giderildi</button></div>`;
      } else if (notified) {
        actions = `<div class="report-meta">⏳ Arızayı yazanın "giderildi" onayı bekleniyor.</div>`;
      }
    } else if (canResolve) {
      actions = `<div class="report-actions">
        <input class="rresolve-note" data-note="${r.id}" placeholder="Çözüm notu (opsiyonel)" />
        <button class="btn-green btn-sm" data-resolve="${r.id}">Çözüldü olarak işaretle</button>
      </div>`;
    }
  }

  return `
    <div class="report ${resolved ? "resolved" : ""}">
      <div class="report-head">
        <span class="rcat">${cat.icon} ${cat.label}</span>
        ${badge}
      </div>
      <div class="report-text">${esc(r.text)}</div>
      <div class="report-meta">${roleIcon(reporter)} ${esc(reporter ? reporter.name : "?")} → ${esc(reportTargetLabel(r))}${venue ? " · 📍 " + esc(venue.name) : ""} · ${fmtDate(r.createdAt)}</div>
      ${notified && techBy ? `<div class="report-meta">🔧 ${esc(techBy.name)} <span>teknik ekibe bildirdi</span> · ${fmtDate(r.techReportedAt)}</div>` : ""}
      ${resolved ? `<div class="report-reply">✅ ${esc(r.reply || (isAriza ? "Arıza giderildi" : "Çözüldü"))}<span class="report-meta"> — ${fmtDate(r.resolvedAt)}${solver ? " · " + esc(solver.name) : ""}</span></div>` : ""}
      ${actions}
    </div>`;
}

function reportCreateForm(u) {
  const cats = REPORT_CATS.map((c) => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join("");
  const venues = venuesForUser(u);
  // Lokasyon ZORUNLU: tek lokasyon varsa otomatik seçili; birden çoksa "seçin" ister
  const venueOpts = (venues.length === 1)
    ? venues.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("")
    : `<option value="">Lokasyon seçin</option>` + venues.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("");
  return `
    <div class="card">
      <h2>📨 Talep Gönder</h2>
      <div class="row">
        <div class="field"><label>Tür</label><select id="rep_cat">${cats}</select></div>
        <div class="field"><label>Lokasyon</label><select id="rep_venue">${venueOpts}</select></div>
      </div>
      <div class="field"><label>Açıklama</label><textarea id="rep_text" placeholder="Ör: Mutfaktaki fırın arızalı / 5 kg deterjan lazım..."></textarea></div>
      <button class="btn-primary" id="rep_send">Gönder</button>
      <div class="error-msg" id="rep_err"></div>
    </div>`;
}

function reportsView(u) {
  markReportsSeen(u);
  const byDate = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const inRng = (r) => inRange(r.createdAt, repFrom, repTo);
  const canResolve = u.role === "yonetici" || u.role === "sef";
  const incoming = incomingReports(u).filter(inRng).slice().sort(byDate);
  const incOpen = incoming.filter((r) => r.status !== "cozuldu");   // açık + teknik ekibe bildirildi
  const incDone = incoming.filter((r) => r.status === "cozuldu");
  const mine = (u.role !== "yonetici") ? myReports(u).filter(inRng).slice().sort(byDate) : [];

  return `
    ${u.role !== "yonetici" ? reportCreateForm(u) : ""}
    ${rangeFilter("talep", repFrom, repTo)}
    ${canResolve ? `
      <div class="section-title">Gelen Talepler — Açık (${incOpen.length})</div>
      ${incOpen.length ? incOpen.map((r) => reportCard(u, r, true)).join("") : `<div class="empty">Bu aralıkta bekleyen talep yok.</div>`}
      ${incDone.length ? `<details class="cat" style="margin-top:14px"><summary><span>✅ Çözülen Talepler</span><span class="cat-count">${incDone.length}</span></summary><div class="cat-body" style="padding-top:12px">${incDone.map((r) => reportCard(u, r, false)).join("")}</div></details>` : ""}
    ` : ""}
    ${(u.role !== "yonetici") ? `
      <div class="section-title">Gönderdiğim Talepler (${mine.length})</div>
      ${mine.length ? mine.map((r) => reportCard(u, r, false)).join("") : `<div class="empty">Bu aralıkta talep yok.</div>`}
    ` : ""}
  `;
}

// Panoda gösterilen bekleyen bildirimler kutusu
function reportsPanel(u) {
  const open = incomingReports(u).filter((r) => r.status === "acik")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!open.length) return "";
  return `
    <div class="reports-board">
      <div class="reports-head">📨 Bekleyen Talepler (${open.length})</div>
      ${open.map((r) => reportCard(u, r, true)).join("")}
    </div>`;
}

// Gönderene "bildiriminiz çözüldü" yeşil şeridi
function resolvedBanner(u) {
  const done = myReports(u).filter((r) => r.status === "cozuldu" && !r.seenByReporter);
  const tech = myReports(u).filter((r) => r.status === "bildirildi" && !r.seenByReporter);
  let html = "";
  if (done.length) html += `<div class="notif-banner">✅ ${done.length} talebiniz çözüldü — "Talepler" sekmesinden görebilirsiniz.</div>`;
  if (tech.length) html += `<div class="notif-banner">🔧 ${tech.length} arızanız teknik ekibe bildirildi — giderildiyse "Talepler"den "Arıza giderildi"ye basın.</div>`;
  return html;
}

function wireReports(u) {
  wireRange("talep", (v) => repFrom = v, (v) => repTo = v);
  const sendBtn = document.getElementById("rep_send");
  if (sendBtn) sendBtn.onclick = () => {
    const category = document.getElementById("rep_cat").value;
    const text = document.getElementById("rep_text").value.trim();
    const venueEl = document.getElementById("rep_venue");
    const venueId = venueEl ? venueEl.value : "";
    const err = document.getElementById("rep_err");
    if (!text) { err.textContent = "Lütfen açıklama yazın."; return; }
    if (!venueId) { err.textContent = "Lütfen lokasyon seçin."; return; }   // mekan zorunlu
    // Tüm talepler lokasyona bağlı: aynı lokasyonun şefleri (yazan hariç) + yönetici görür
    const target = "lokasyon", toUserId = null;
    DB.reports.push({
      id: uid(), ownerId: ownerIdOf(u), createdBy: u.id, toUserId, target,
      category, text, venueId, status: "acik",
      createdAt: new Date().toISOString(),
      reply: "", resolvedAt: null, resolvedBy: null, seenByReporter: true,
    });
    saveDB(DB);
    // ilgili kişilere bildirim
    // o lokasyonun şefleri (yazan hariç) + yönetici
    let recips = orgChefs(ownerIdOf(u)).filter((c) => c.id !== u.id && (c.venueIds || []).includes(venueId)).map((c) => c.id);
    recips.push(ownerIdOf(u));
    notifyUsers(recips, "Yeni talep", text, "/");
    render();
  };

  document.querySelectorAll("[data-resolve]").forEach((b) => {
    b.onclick = () => {
      const r = DB.reports.find((x) => x.id === b.dataset.resolve);
      if (!r) return;
      const noteEl = document.querySelector(`.rresolve-note[data-note="${r.id}"]`);
      r.status = "cozuldu";
      r.reply = noteEl ? noteEl.value.trim() : "";
      r.resolvedAt = new Date().toISOString();
      r.resolvedBy = u.id;
      r.seenByReporter = false;     // gönderene bildirilecek
      saveDB(DB);
      notifyUsers([r.createdBy], "Talebiniz çözüldü", r.reply || r.text, "/");
      render();
    };
  });

  // Arıza: şef/yönetici "Teknik ekibe bildirildi" → arızayı yazana bildirim gider
  document.querySelectorAll("[data-techreport]").forEach((b) => {
    b.onclick = () => {
      const r = DB.reports.find((x) => x.id === b.dataset.techreport);
      if (!r) return;
      r.status = "bildirildi";
      r.techReportedBy = u.id;
      r.techReportedAt = new Date().toISOString();
      r.seenByReporter = false;
      saveDB(DB);
      notifyUsers([r.createdBy], "Arızanız teknik ekibe bildirildi 🔧", r.text, "/");
      render();
    };
  });

  // Arıza: arızayı YAZAN "Arıza giderildi" → konu kapanır
  document.querySelectorAll("[data-faultdone]").forEach((b) => {
    b.onclick = () => {
      const r = DB.reports.find((x) => x.id === b.dataset.faultdone);
      if (!r || r.createdBy !== u.id) return;   // sadece arızayı yazan kapatabilir
      r.status = "cozuldu";
      r.reply = "Arıza giderildi";
      r.resolvedAt = new Date().toISOString();
      r.resolvedBy = u.id;
      r.seenByReporter = true;
      saveDB(DB);
      // şef/yönetici de haberdar olsun
      const recips = [r.techReportedBy, ownerIdOf(u)].filter(Boolean);
      notifyUsers(recips, "Arıza giderildi ✅", r.text, "/");
      render();
    };
  });
}

/* ============================================================
   İZİN / MESAİ talepleri
   ============================================================ */
const LEAVE_CATS = [
  { key: "izin", label: "İzin Talebi", icon: "🏖️" },
  { key: "gecikme", label: "Geç Geleceğim", icon: "⏰" },
  { key: "telafi", label: "Telafi Edeceğim (fazla mesai ile)", icon: "🔁" },
  { key: "eksik", label: "Eksik Mesai", icon: "🔴" },
  { key: "fazla", label: "Fazla Mesai", icon: "🟢" },
];
function leaveCat(key) { return LEAVE_CATS.find((c) => c.key === key) || LEAVE_CATS[0]; }
const WORKDAY_HOURS = 8;   // izin günlerini saate çevirmek için (1 gün = 8 saat)

function orgLeaves(o) { return DB.leaves.filter((l) => l.ownerId === o); }
function myLeaves(u) { return orgLeaves(ownerIdOf(u)).filter((l) => l.createdBy === u.id); }

// Onaylanmış taleplerin mesai dengesine etkisi (saat). + alacak, − borç
// İzin & gecikme -> eksik (−), telafi & fazla mesai -> fazla (+)
function leaveBalanceDelta(l) {
  if (l.status !== "onaylandi") return 0;
  const h = (Number(l.hours) || 0) + (Number(l.days) || 0) * WORKDAY_HOURS;
  if (l.category === "fazla" || l.category === "telafi") return h;
  if (l.category === "eksik" || l.category === "gecikme" || l.category === "izin") return -h;
  return 0;
}
function mesaiBalance(userId, owner) {
  return orgLeaves(owner).filter((l) => l.createdBy === userId)
    .reduce((s, l) => s + leaveBalanceDelta(l), 0);
}
function balanceBadge(h) {
  const cls = h > 0 ? "bal-green" : (h < 0 ? "bal-red" : "bal-zero");
  const sign = h > 0 ? "+" : "";
  return `<span class="bal ${cls}">${sign}${h} saat</span>`;
}

function markLeavesSeen(u) {
  let changed = false;
  myLeaves(u).forEach((l) => {
    if (l.status !== "beklemede" && !l.seenByReporter) { l.seenByReporter = true; changed = true; }
  });
  if (changed) saveDB(DB);
}

function leaveBanner(u) {
  const unseen = myLeaves(u).filter((l) => l.status !== "beklemede" && !l.seenByReporter);
  if (!unseen.length) return "";
  return `<div class="notif-banner">📋 ${unseen.length} izin/mesai talebiniz sonuçlandı — "İzin / Mesai" sekmesinden görebilirsiniz.</div>`;
}

function leaveCard(u, l, canDecide) {
  const cat = leaveCat(l.category);
  const who = userById(l.createdBy);
  const pending = l.status === "beklemede";
  const approved = l.status === "onaylandi";
  const amount = l.category === "izin"
    ? `${l.days || 0} gün ${l.hours || 0} saat`
    : `${l.hours || 0} saat`;
  const statusBadge = pending ? `<span class="badge badge-open">Beklemede</span>`
    : approved ? `<span class="badge badge-done">Onaylandı</span>`
    : `<span class="badge badge-rej">Reddedildi</span>`;
  return `
    <div class="report ${approved ? "resolved" : ""} ${(!pending && !approved) ? "rejected" : ""}">
      <div class="report-head">
        <span class="rcat">${cat.icon} ${cat.label}</span>
        ${statusBadge}
      </div>
      <div class="report-text"><strong>${amount}</strong>${l.date ? ` · 📅 ${fmtDay(l.date)}` : ""}${l.note ? ` — ${esc(l.note)}` : ""}</div>
      <div class="report-meta">${roleIcon(who)} ${esc(who ? who.name : "?")} · ${fmtDate(l.createdAt)}</div>
      ${(!pending) ? `<div class="report-reply">${approved ? "✅ Onaylandı" : "❌ Reddedildi"}${l.decisionNote ? ": " + esc(l.decisionNote) : ""}<span class="report-meta"> — ${fmtDate(l.decidedAt)}</span></div>` : ""}
      ${(pending && canDecide) ? `
        <div class="report-actions">
          <input class="ldec-note" data-lnote2="${l.id}" placeholder="Not (opsiyonel)" />
          <button class="btn-green btn-sm" data-leave-ok="${l.id}">Onayla</button>
          <button class="btn-danger btn-sm" data-leave-no="${l.id}">Reddet</button>
        </div>` : ""}
    </div>`;
}

// Kişi detayında tek talep satırı (gün + tür + durum)
function leaveHistLine(l) {
  const cat = leaveCat(l.category);
  const amount = l.category === "izin" ? `${l.days || 0} gün ${l.hours || 0} saat` : `${l.hours || 0} saat`;
  const when = l.date ? fmtDay(l.date) : fmtDate(l.createdAt);
  const st = l.status === "beklemede" ? `<span class="badge badge-open">Beklemede</span>`
    : l.status === "onaylandi" ? `<span class="badge badge-done">Onaylandı</span>`
    : `<span class="badge badge-rej">Reddedildi</span>`;
  return `<div class="pl-line">
    <div><span class="rcat">${cat.icon} ${cat.label}</span> <strong>${amount}</strong>${l.note ? ` — ${esc(l.note)}` : ""}</div>
    <div class="pl-line-meta">📅 ${when} · ${st}</div>
  </div>`;
}

function leaveCreateForm(u) {
  const cats = LEAVE_CATS.map((c) => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join("");
  return `
    <div class="card">
      <h2>📨 İzin / Mesai Talebi</h2>
      <div class="row">
        <div class="field"><label>Tür</label><select id="lv_cat">${cats}</select></div>
        <div class="field" id="lv_days_f"><label>Gün</label><input id="lv_days" type="number" min="0" value="0" /></div>
        <div class="field"><label>Saat</label><input id="lv_hours" type="number" min="0" step="0.5" value="0" /></div>
        <div class="field"><label>Tarih (opsiyonel)</label><input id="lv_date" type="date" /></div>
      </div>
      <div class="field"><label>Açıklama</label><textarea id="lv_note" placeholder="Ör: Doktor randevusu / yarın 2 saat geç geleceğim / cumartesi 3 saat fazla çalıştım..."></textarea></div>
      <button class="btn-primary" id="lv_send">Talep Gönder</button>
      <div class="error-msg" id="lv_err"></div>
    </div>`;
}

function leavesView(u) {
  markLeavesSeen(u);
  const owner = ownerIdOf(u);
  const byDate = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

  if (u.role === "yonetici") {
    const pending = orgLeaves(owner).filter((l) => l.status === "beklemede").sort(byDate);
    const people = [...orgChefs(owner), ...orgStaff(owner)];
    const personLeaveItem = (p) => {
      const hist = orgLeaves(owner).filter((l) => l.createdBy === p.id).sort(byDate);
      const histHtml = hist.length
        ? hist.map((l) => leaveHistLine(l)).join("")
        : `<div class="empty" style="margin:6px 0 2px">Bu kişinin talebi yok.</div>`;
      return `
      <details class="person-leaves">
        <summary>
          <span class="title">${roleIcon(p)} ${esc(p.name)}</span>
          <span class="pl-right">${balanceBadge(mesaiBalance(p.id, owner))}<span class="pl-count">${hist.length}</span></span>
        </summary>
        <div class="pl-body">${histHtml}</div>
      </details>`;
    };
    return `
      <div class="section-title">Bekleyen Talepler (${pending.length})</div>
      ${pending.length ? pending.map((l) => leaveCard(u, l, true)).join("") : `<div class="empty">Bekleyen talep yok. 🎉</div>`}
      <div class="section-title">Mesai Durumu (Eksik / Fazla)</div>
      <p style="color:var(--muted);font-size:13px;margin:-8px 0 12px">🟢 Fazla & Telafi = alacak · 🔴 İzin & Geç gelme & Eksik = borç · (1 gün = ${WORKDAY_HOURS} saat). Lokasyona göre gruplu.</p>
      ${venuePeopleGroups(u, people, personLeaveItem, "📋 Lokasyonsuz")}
    `;
  }

  // personel / şef
  const mine = myLeaves(u).sort(byDate);
  const bal = mesaiBalance(u.id, owner);
  // Şef onay yetkisi varsa: kendi personelinin bekleyen izin/mesai talepleri
  let approveBlock = "";
  if (u.role === "sef" && approvalSetting("leave") === "sef") {
    const pend = orgLeaves(owner).filter((l) => l.status === "beklemede" && canApproveLeave(u, l.createdBy)).sort(byDate);
    approveBlock = `
      <div class="section-title">Onayınızı Bekleyen Talepler (${pend.length})</div>
      ${pend.length ? pend.map((l) => leaveCard(u, l, true)).join("") : `<div class="empty">Bekleyen talep yok. 🎉</div>`}`;
  }
  return `
    ${approveBlock}
    <div class="card balance-card">
      <div class="balance-label">Mesai Durumunuz</div>
      ${balanceBadge(bal)}
      <div class="meta">🟢 Fazla mesai & Telafi = alacak · 🔴 İzin & Geç gelme & Eksik = borç · 1 gün = ${WORKDAY_HOURS} saat</div>
    </div>
    ${leaveCreateForm(u)}
    <div class="section-title">Taleplerim (${mine.length})</div>
    ${mine.length ? mine.map((l) => leaveCard(u, l, false)).join("") : `<div class="empty">Henüz talebiniz yok.</div>`}
  `;
}

function decideLeave(id, status, u) {
  const l = DB.leaves.find((x) => x.id === id);
  if (!l) return;
  const noteEl = document.querySelector(`.ldec-note[data-lnote2="${id}"]`);
  l.status = status;
  l.decisionNote = noteEl ? noteEl.value.trim() : "";
  l.decidedBy = u.id;
  l.decidedAt = new Date().toISOString();
  l.seenByReporter = false;
  saveDB(DB);
  notifyUsers([l.createdBy], "İzin / Mesai talebiniz", status === "onaylandi" ? "Onaylandı ✅" : "Reddedildi ❌", "/");
  render();
}

function wireLeaves(u) {
  const catSel = document.getElementById("lv_cat");
  if (catSel) {
    const sync = () => {
      const daysF = document.getElementById("lv_days_f");
      if (daysF) daysF.style.display = (catSel.value === "izin") ? "" : "none";
    };
    catSel.onchange = sync;
    sync();
  }
  const send = document.getElementById("lv_send");
  if (send) send.onclick = () => {
    const category = document.getElementById("lv_cat").value;
    const note = document.getElementById("lv_note").value.trim();
    const err = document.getElementById("lv_err");
    const days = category === "izin" ? (parseFloat(document.getElementById("lv_days").value) || 0) : 0;
    const hours = parseFloat(document.getElementById("lv_hours").value) || 0;
    const date = document.getElementById("lv_date").value || null;
    if (!days && !hours) { err.textContent = "Gün veya saat girin."; return; }
    DB.leaves.push({
      id: uid(), ownerId: ownerIdOf(u), createdBy: u.id,
      category, days, hours, date, note, status: "beklemede",
      createdAt: new Date().toISOString(),
      decidedBy: null, decidedAt: null, decisionNote: "", seenByReporter: true,
    });
    saveDB(DB);
    const leaveRecips = [ownerIdOf(u)];
    if (approvalSetting("leave") === "sef" && u.chefId) leaveRecips.push(u.chefId);
    notifyUsers(leaveRecips, "Yeni izin/mesai talebi", u.name, "/");
    render();
  };

  document.querySelectorAll("[data-leave-ok]").forEach((b) => {
    b.onclick = () => decideLeave(b.dataset.leaveOk, "onaylandi", u);
  });
  document.querySelectorAll("[data-leave-no]").forEach((b) => {
    b.onclick = () => decideLeave(b.dataset.leaveNo, "reddedildi", u);
  });
}

/* ============================================================
   DUYURULAR (mekana / tüm mekanlara)
   ============================================================ */
// Kullanıcının görebileceği duyurular
function visibleAnnouncements(u) {
  const owner = ownerIdOf(u);
  const all = DB.announcements.filter((a) => a.ownerId === owner);
  if (u.role === "yonetici") return all;
  if (u.role === "sef") {
    return all.filter((a) => a.target === "org" || a.target === "chefs" || a.createdBy === u.id ||
      (a.venueIds || []).some((v) => (u.venueIds || []).includes(v)));
  }
  // personel: org geneli veya kendi mekanına gelen duyurular (şeflere özel duyuruları GÖRMEZ)
  return all.filter((a) => a.target === "org" ||
    (a.venueIds || []).some((v) => (u.venueIds || []).includes(v)));
}

function announcementCompose(u) {
  const venues = visibleVenues(u);
  const isOwner = u.role === "yonetici";
  const allLabel = isOwner ? "Tüm Mekanlar (herkese)" : "Tüm Mekanlarım";
  const opts = `<option value="all">${allLabel}</option>`
    + (isOwner ? `<option value="chefs">👔 Sadece Şefler</option>` : "")
    + venues.map((v) => `<option value="${v.id}">📍 ${esc(v.name)}</option>`).join("");
  return `
    <div class="card">
      <h2>📢 Duyuru Yap</h2>
      <p style="color:var(--muted);font-size:13px;margin:-8px 0 12px">Seçilen mekandaki tüm personele gider — kişi seçmenize gerek yok.</p>
      <div class="field"><label>Hedef mekan</label><select id="an_target">${opts}</select></div>
      <div class="field"><label>Mesaj</label><textarea id="an_text" placeholder="Ör: Yarın saat 09:00'da toplantı var."></textarea></div>
      <button class="btn-primary" id="an_send">Duyuruyu Gönder</button>
      <div class="error-msg" id="an_err"></div>
    </div>`;
}

function announcementCard(u, a) {
  const who = userById(a.createdBy);
  let targetLabel;
  if (a.target === "org") {
    targetLabel = "Tüm Mekanlar";
  } else if (a.target === "chefs") {
    targetLabel = "👔 Şefler";
  } else {
    const names = (a.venueIds || []).map((id) => { const v = venueById(id); return v ? v.name : null; }).filter(Boolean);
    targetLabel = names.length ? "📍 " + names.map(esc).join(", ") : "—";
  }
  const canDelete = u.role === "yonetici" || a.createdBy === u.id;
  return `
    <div class="annc-item">
      <div class="annc-text">${esc(a.text)}</div>
      <div class="annc-meta">
        📢 ${esc(who ? who.name : (a.createdByName || "?"))} · ${targetLabel} · ${fmtDate(a.createdAt)}
        ${canDelete ? `<button class="btn-danger btn-sm" data-del-annc="${a.id}">Sil</button>` : ""}
      </div>
    </div>`;
}

function announcementsBoard(u) {
  const list = visibleAnnouncements(u)
    .slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  if (!list.length) return "";
  return `
    <div class="annc-board">
      <div class="annc-head">📢 Duyurular (${list.length})</div>
      ${list.map((a) => announcementCard(u, a)).join("")}
    </div>`;
}

function wireAnnouncements(u) {
  const send = document.getElementById("an_send");
  if (send) send.onclick = () => {
    const targetVal = document.getElementById("an_target").value;
    const text = document.getElementById("an_text").value.trim();
    const err = document.getElementById("an_err");
    if (!text) { err.textContent = "Lütfen mesaj yazın."; return; }
    let target, venueIds = [];
    if (targetVal === "chefs") {
      target = "chefs";
    } else if (targetVal === "all") {
      if (u.role === "yonetici") { target = "org"; }
      else { target = "venues"; venueIds = (u.venueIds || []).slice(); }
    } else {
      target = "venues"; venueIds = [targetVal];
    }
    DB.announcements.push({
      id: uid(), ownerId: ownerIdOf(u), createdBy: u.id, createdByName: u.name,
      target, venueIds, text, createdAt: new Date().toISOString(),
    });
    saveDB(DB);
    // hedefteki herkese bildirim
    const owner = ownerIdOf(u);
    const everyone = [...orgChefs(owner), ...orgStaff(owner)];
    const recips = (target === "org") ? everyone.map((p) => p.id)
      : (target === "chefs") ? orgChefs(owner).map((p) => p.id)
      : everyone.filter((p) => (p.venueIds || []).some((v) => venueIds.includes(v))).map((p) => p.id);
    notifyUsers(recips.filter((id) => id !== u.id), "📢 Duyuru", text, "/");
    showAnnounce = false;
    render();
  };
  document.querySelectorAll("[data-del-annc]").forEach((b) => {
    b.onclick = () => {
      if (!confirm("Bu duyuru silinsin mi?")) return;
      DB.announcements = DB.announcements.filter((a) => a.id !== b.dataset.delAnnc);
      saveDB(DB);
      render();
    };
  });
}

/* ============================================================
   PERSONEL EKRANI — sadece kendi görevleri
   ============================================================ */
function renderStaff(u) {
  const repNotif = myReports(u).filter((r) => r.status === "cozuldu" && !r.seenByReporter).length;
  const leaveNotif = myLeaves(u).filter((l) => l.status !== "beklemede" && !l.seenByReporter).length;
  const shiftNotif = (DB.shiftReqs || []).filter((r) => (r.withUserId === u.id && r.status === "personel_onay") ||
    (r.requesterId === u.id && (r.status === "onaylandi" || r.status === "reddedildi") && !r.seenByReporter)).length;
  const tabs = [
    ["bugun", "Görevlerim"],
    ["gecmis", "Biten Görevler"],
    ["vardiya", "Vardiya" + (shiftNotif ? ` (${shiftNotif})` : "")],
    ["bildirim", "Talepler" + (repNotif ? ` (${repNotif})` : "")],
    ["izin", "İzin / Mesai" + (leaveNotif ? ` (${leaveNotif})` : "")],
  ];
  let body;
  if (staffTab === "gecmis") body = staffHistory(u);
  else if (staffTab === "bildirim") body = reportsView(u);
  else if (staffTab === "izin") body = leavesView(u);
  else if (staffTab === "vardiya") body = shiftView(u);
  else body = staffToday(u);

  app.innerHTML = topbar(u) + `
    <div class="container">
      <div class="tabs">
        ${tabs.map(([k, l]) => `<button class="tab ${staffTab === k ? "active" : ""}" data-stab="${k}">${l}</button>`).join("")}
      </div>
      ${clockCard(u)}
      ${body}
    </div>
  `;
  wireCommon();
  wireClock(u);
  document.querySelectorAll("[data-stab]").forEach((t) => {
    t.onclick = () => { staffTab = t.dataset.stab; render(); };
  });
  if (staffTab === "gecmis") {
    wireRange("hist", (v) => histFrom = v, (v) => histTo = v);
    return;
  }
  if (staffTab === "bildirim") { wireReports(u); return; }
  if (staffTab === "izin") { wireLeaves(u); return; }
  if (staffTab === "vardiya") { wireShift(u); return; }
  wireStaffToday(u);
}

/* --- Personel: bugünkü görevler --- */
function staffToday(u) {
  // Bugün izinliyse o günün görevleri gösterilmez
  if (isOff(u.id, todayKey())) {
    return `
      ${resolvedBanner(u)}
      ${leaveBanner(u)}
      ${announcementsBoard(u)}
      <div class="card" style="text-align:center">🏖️ Bugün izinlisiniz — bugün için göreviniz yok. İyi dinlenmeler!</div>
    `;
  }
  const myTasks = DB.tasks
    .filter((t) => t.assignedUserIds.includes(u.id) && occursToday(t) && taskVenueOk(t, u))
    .sort((a, b) => {
      const ad = !!a.completions[occKeyToday(a)];
      const bd = !!b.completions[occKeyToday(b)];
      if (ad !== bd) return ad ? 1 : -1; // bekleyenler üstte
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  markReads(u, myTasks);
  const pending = myTasks.filter((t) => !t.completions[occKeyToday(t)]).length;
  const myAssigned = DB.tasks.filter((t) => t.assignedUserIds.includes(u.id) && taskVenueOk(t, u));
  const missed = pastMissedFor(myAssigned, "", "");
  return `
    ${resolvedBanner(u)}
    ${leaveBanner(u)}
    ${announcementsBoard(u)}
    ${missed.length ? overdueBoard(missed, true) : ""}
    <div class="section-title">Görevlerim (${pending} bekliyor)</div>
    ${myTasks.length ? myTasks.map((t) => staffTaskCard(t, u)).join("") : `<div class="empty">Size atanmış görev yok.</div>`}
  `;
}

/* --- Personel: tarih aralığında biten görevler --- */
function staffHistory(u) {
  const recs = [];
  DB.tasks.filter((t) => t.assignedUserIds.includes(u.id)).forEach((t) => {
    Object.keys(t.completions).forEach((dk) => {
      const c = t.completions[dk];
      if (!inRange(c.at, histFrom, histTo)) return;
      recs.push({ when: c.at, by: userById(c.by), task: t, note: c.note || "" });
    });
  });
  recs.sort((a, b) => new Date(b.when) - new Date(a.when));

  return rangeFilter("hist", histFrom, histTo) + `
    <div class="card">
      <h2>Biten Görevler (${recs.length})</h2>
      ${recs.length ? `
        <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Görev</th><th>Mekan</th><th>Tamamlayan</th><th>Not</th><th>Tarih</th></tr></thead>
          <tbody>
            ${recs.map((r) => {
              const v = r.task.venueId ? venueById(r.task.venueId) : null;
              return `<tr>
                <td>${esc(r.task.title)}</td>
                <td>${v ? esc(v.name) : "—"}</td>
                <td>${esc(r.by ? r.by.name : "Silinmiş")}${r.by && r.by.id === u.id ? " (siz)" : ""}</td>
                <td>${r.note ? "📝 " + esc(r.note) : "—"}</td>
                <td class="when" style="white-space:nowrap">${fmtDate(r.when)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        </div>
      ` : `<div class="empty">Seçilen aralıkta biten görev yok.</div>`}
    </div>
  `;
}

/* --- Personel bugünkü görev butonları --- */
function wireStaffToday(u) {
  document.querySelectorAll("[data-complete]").forEach((b) => {
    b.onclick = () => {
      const t = DB.tasks.find((x) => x.id === b.dataset.complete);
      if (!t) return;
      if (!startReached(t)) {
        const msg = "Başlama saatinden önce görev tamamlanamaz.";
        alert(typeof translateString === "function" ? translateString(msg, activeLang()) : msg);
        return;
      }
      const key = occKeyToday(t);
      const noteEl = document.querySelector(`.cnote[data-cnote="${t.id}"]`);
      const note = noteEl ? noteEl.value.trim() : "";
      t.completions[key] = { by: u.id, at: new Date().toISOString(), note };
      saveDB(DB);
      render();
    };
  });
  document.querySelectorAll("[data-undo]").forEach((b) => {
    b.onclick = () => {
      const t = DB.tasks.find((x) => x.id === b.dataset.undo);
      if (!t) return;
      const key = occKeyToday(t);
      const prev = t.completions[key];
      delete t.completions[key];
      // Geri alma kaydını yönetici/şefe iletmek için tut
      const prevUser = prev && prev.by ? userById(prev.by) : null;
      DB.undoLog.push({
        id: uid(),
        ownerId: t.ownerId,
        taskId: t.id,
        taskCreatedBy: t.createdBy,
        title: t.title,
        dateKey: key,
        by: u.id,
        byName: u.name,
        at: new Date().toISOString(),
        prevBy: prev ? prev.by : null,
        prevByName: prevUser ? prevUser.name : null,
        prevAt: prev ? prev.at : null,
        seen: false,
      });
      saveDB(DB);
      render();
    };
  });
  // Geciken görevi geç de olsa tamamla (geçmiş gün için kayıt)
  document.querySelectorAll("[data-late]").forEach((b) => {
    b.onclick = () => {
      const [tid, dk] = b.dataset.late.split("|");
      const t = DB.tasks.find((x) => x.id === tid);
      if (!t) return;
      const noteEl = document.querySelector(`.lnote[data-lnote="${b.dataset.late}"]`);
      const note = noteEl ? noteEl.value.trim() : "";
      t.completions[dk] = { by: u.id, at: new Date().toISOString(), note };
      saveDB(DB);
      render();
    };
  });
}

function staffTaskCard(t, u, extra = "") {
  const venue = t.venueId ? venueById(t.venueId) : null;
  const key = occKeyToday(t);
  const c = completionOf(t, key);
  const done = !!c;
  const byMe = done && c.by === u.id;
  const whoName = done ? (userById(c.by) ? userById(c.by).name : "?") : "";
  const others = t.assignedUserIds.filter((id) => id !== u.id);

  let statusTag;
  if (!done) statusTag = `<span class="tag"><span class="dot amber"></span>Bekliyor</span>`;
  else if (byMe) statusTag = `<span class="tag"><span class="dot green"></span>Tamamladınız</span>`;
  else statusTag = `<span class="tag"><span class="dot green"></span>${esc(whoName)} tamamladı</span>`;

  const noteLine = (done && c.note) ? `<div class="cnote-show">📝 ${esc(c.note)}</div>` : "";
  let footer;
  if (!done) {
    footer = startReached(t) ? `
      <div class="complete-row">
        <input class="cnote" data-cnote="${t.id}" placeholder="Not eklemek isterseniz (opsiyonel)..." />
        <button class="btn-green" data-complete="${t.id}">Görevi Tamamla</button>
      </div>` : `<div class="status-line not-started">🕐 Başlama saati ${t.startTime} — bu saatten önce tamamlanamaz.</div>`;
  } else if (byMe) {
    footer = `<div class="status-line">✓ ${fmtDate(c.at)} tarihinde siz tamamladınız.
      <button class="btn-ghost btn-sm" style="margin-left:8px" data-undo="${t.id}">Geri al</button></div>${noteLine}`;
  } else {
    footer = `<div class="status-line">✓ ${esc(whoName)} tarafından ${fmtDate(c.at)} tarihinde tamamlandı.
      <button class="btn-ghost btn-sm" style="margin-left:8px" data-undo="${t.id}">Geri al</button></div>${noteLine}`;
  }

  return `
    <div class="task ${done ? "done" : ""}">
      <div class="task-head">
        <div class="task-title">${esc(t.title)}</div>
        ${statusTag}
      </div>
      ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ""}
      <div class="task-tags">
        <span class="tag rec">🔁 ${recurrenceLabel(t)}</span>
        ${venue ? `<span class="tag venue">📍 ${esc(venue.name)}</span>` : ""}
        ${t.startTime ? `<span class="tag starttime">🕐 Başlama: ${t.startTime}</span>` : ""}
        ${t.dueTime ? `<span class="tag duetime">⏰ Son saat: ${t.dueTime}</span>` : ""}
        ${t.dueAt ? `<span class="tag">Son tarih: ${fmtDate(t.dueAt)}</span>` : ""}
        <span class="tag creator">🖊️ Oluşturan: ${esc(creatorText(t))}</span>
        ${others.length ? `<span class="tag">+${others.length} kişi daha atanmış</span>` : ""}
      </div>
      ${editedNote(t)}
      ${footer}
      ${extra}
    </div>
  `;
}

/* ============================================================
   BULUT SENKRON (Neon üzerinden) — yalnızca sunucuda (https) aktif
   Yerelde (file://) localStorage modunda çalışır.
   ============================================================ */
const CLOUD_KEY = "fixpre2026";   // /api/push için (Vercel FIXPRE_KEY ile aynı)
// cloudEnabled / lastAppliedAt / pushTimer / pushing yukarıda (loadDB öncesi) tanımlandı

async function dataGet() {
  const r = await fetch("/api/data", { headers: { "Authorization": "Bearer " + authToken() } });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("get " + r.status);
  return r.json();
}
// Hafif sürüm kontrolü: sadece {updatedAt, plan} döner (büyük veri blob'u inmez)
async function dataCheck() {
  const r = await fetch("/api/data?v=1", { headers: { "Authorization": "Bearer " + authToken() } });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("check " + r.status);
  return r.json();
}
async function dataPut(data) {
  const r = await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + authToken() },
    body: JSON.stringify({ data, baseUpdatedAt: lastAppliedAt }),   // sürüm kilidi için temel sürüm
  });
  if (r.status === 401) throw new Error("401");
  if (r.status === 409) {                       // çakışma: bulutta daha yeni veri var
    const j = await r.json().catch(() => ({}));
    const err = new Error("conflict"); err.conflict = true; err.data = j.data; err.updatedAt = j.updatedAt;
    throw err;
  }
  if (!r.ok) throw new Error("put " + r.status);
  return r.json();
}

// Değişiklikleri (kısa gecikmeyle) organizasyonun satırına yaz
function cloudPush(db) {
  if (!cloudEnabled || !cloudReady || !authToken()) return;   // ilk bulut verisi gelmeden push yok
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushing = true;
    try {
      const res = await dataPut(DB);   // ANLIK güncel veriyi gönder (eski snapshot değil)
      lastAppliedAt = res.updatedAt;
    } catch (e) {
      if (e && e.conflict) {
        // Bulutta daha yeni veri var -> ESKİYLE YAZMA. Bulutu benimse (veri kaybını önler).
        if (e.data) { const _sy = window.scrollY; DB = migrate(e.data); saveLocal(DB); lastAppliedAt = e.updatedAt; render(); requestAnimationFrame(() => window.scrollTo(0, _sy)); }
      }
      /* diğer hatalar: sessiz; localStorage yedeği var */
    }
    finally { pushing = false; }
  }, 700);
}

async function cloudBootstrap() {
  cloudEnabled = true;
  render();         // önbellekteki (en son) veriyle ekranı HEMEN göster — beklemesin
  if (authToken()) {
    try {
      const res = await dataGet();
      if (res && res.plan) orgPlan = res.plan;
      if (res && res.data) {
        const _sy = window.scrollY;
        DB = migrate(res.data); saveLocal(DB); lastAppliedAt = res.updatedAt;
        render();   // taze veri gelince arka planda yenile
        requestAnimationFrame(() => window.scrollTo(0, _sy));   // girişte üste atmasın
      }
      cloudReady = true;   // bulut başarıyla okundu -> push güvenli
    } catch (e) {
      if (String(e.message) === "401") { // token geçersiz/süresi dolmuş -> çıkış
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(UID_KEY); DB = emptyDB();
        cloudReady = true; render();
      }
      // ağ hatası: cloudReady FALSE kalır; poll başarılı olunca açılır (eski veriyi yazma riski yok)
    }
  } else {
    cloudReady = true;   // giriş yok, kaybedilecek bulut verisi yok
  }
  startPolling();
}

// Başkalarının değişikliklerini periyodik çek (düzenleme sırasında dokunma)
let pollStarted = false;
// Tek seferlik kontrol — başkalarının değişikliğini çek (düzenleme/arka plan sırasında dokunma)
async function pollOnce() {
  if (!authToken() || pushing || showProfile || showAnnounce || editingTask || editingStaff || sharingTask) return;
  if (document.hidden) return;   // sekme arka plandaysa istek atma (maliyet/pil tasarrufu)
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  try {
    const chk = await dataCheck();   // HAFİF: sadece sürüm + plan (veri blob'u inmez)
    cloudReady = true;   // başarılı bulut okuması -> push artık güvenli (açılışta ağ koptuysa kurtarır)
    if (chk && chk.plan) orgPlan = chk.plan;
    if (chk && chk.updatedAt && chk.updatedAt !== lastAppliedAt) {
      // Yalnızca veri değiştiyse tam blob'u indir
      const res = await dataGet();
      if (res && res.plan) orgPlan = res.plan;
      if (res && res.data) {
        const _sy = window.scrollY;        // arka plan güncellemesi: kullanıcının kaydırma yerini koru
        DB = migrate(res.data);
        saveLocal(DB);
        lastAppliedAt = res.updatedAt;
        render();
        requestAnimationFrame(() => window.scrollTo(0, _sy));   // üste atmasın
      }
    }
  } catch (e) { /* sessiz */ }
}

function startPolling() {
  if (pollStarted) return;          // birden fazla kez kurulmasın
  pollStarted = true;
  setInterval(pollOnce, 25000);     // 25 sn — poll artık HAFİF (sürüm kontrolü) olduğu için sık ve ucuz
  // Sekmeye geri dönünce anında tazele
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollOnce(); });
}

/* ---------------- Push bildirimleri ---------------- */
const VAPID_PUBLIC = "BJ-IwLxYsUxi3FBjcdKbsTfRo-XkBRHE3kck5-lNIDAz_2hs085MnLWff2RHriSjmfouHdLnC_AzYPyqx8ZId4o";
let pushChecked = false;

function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// İzin verildiyse (veya force ile) push aboneliğini oluştur ve sunucuya kaydet
async function ensurePushSubscribed(u, force) {
  if (!cloudEnabled || !u) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    if (force) alert(t("Bu cihaz/tarayıcı bildirimleri desteklemiyor. (iPhone'da: önce uygulamayı ana ekrana ekleyin.)"));
    return;
  }
  if (Notification.permission === "denied") {
    if (force) alert(t("Bildirim izni reddedilmiş. Tarayıcı ayarlarından fixpre.com için izin vermelisiniz."));
    return;
  }
  if (Notification.permission !== "granted") {
    if (!force) return;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fixpre-key": CLOUD_KEY },
      body: JSON.stringify({ type: "subscribe", userId: u.id, sub }),
    });
    if (force) alert(t("Bildirimler açıldı! ✅"));
  } catch (e) { if (force) alert(t("Bildirim kurulamadı:") + " " + (e && e.message)); }
}

// Belirli kullanıcılara push gönder (tetikleyici olaylarda çağrılır)
function notifyUsers(userIds, title, body, url) {
  if (!cloudEnabled || !userIds || !userIds.length) return;
  const ids = userIds.filter(Boolean);
  if (!ids.length) return;
  fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-fixpre-key": CLOUD_KEY },
    body: JSON.stringify({ type: "notify", toUserIds: ids, title, body: body || "", url: url || "/" }),
  }).catch(() => {});
}

/* ---------------- Başlat ---------------- */
if (location.protocol === "file:") {
  render();          // yerel dosya: localStorage modu
} else {
  cloudBootstrap();  // sunucu (https): Neon ile senkron
}
