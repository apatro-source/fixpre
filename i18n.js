/* ============================================================
   Fixpre — çeviri katmanı (TR temel; EN, DE, RU, ES, IT)
   Render sonrası DOM metinleri seçilen dile çevrilir.
   ============================================================ */

const LANGS = [
  ["tr", "Türkçe"],
  ["en", "English"],
  ["de", "Deutsch"],
  ["ru", "Русский"],
  ["es", "Español"],
  ["it", "Italiano"],
];
const LANG_IDX = { en: 1, de: 2, ru: 3, es: 4, it: 5 };
const LOCALES = { tr: "tr-TR", en: "en-US", de: "de-DE", ru: "ru-RU", es: "es-ES", it: "it-IT" };

// Her satır: [tr, en, de, ru, es, it]
const I18N_ROWS = [
  // --- Giriş ---
  ["Personel görev yönetimi — giriş yapın", "Staff task management — sign in", "Personal-Aufgabenverwaltung — anmelden", "Управление задачами персонала — войдите", "Gestión de tareas del personal — inicie sesión", "Gestione attività del personale — accedi"],
  ["Giriş Yap", "Sign In", "Anmelden", "Войти", "Iniciar sesión", "Accedi"],
  ["E-posta veya şifre hatalı.", "Wrong email or password.", "E-Mail oder Passwort falsch.", "Неверный e-mail или пароль.", "Correo o contraseña incorrectos.", "E-mail o password errati."],
  ["İlk giriş için yönetici hesabı:", "Manager account for first login:", "Manager-Konto für erste Anmeldung:", "Учётная запись администратора для первого входа:", "Cuenta de administrador para el primer acceso:", "Account amministratore per il primo accesso:"],
  ["E-posta", "Email", "E-Mail", "E-mail", "Correo", "E-mail"],
  ["Şifre", "Password", "Passwort", "Пароль", "Contraseña", "Password"],
  ["Kayıt Ol", "Register", "Registrieren", "Регистрация", "Registrarse", "Registrati"],
  ["Personel görev yönetimi", "Staff task management", "Personal-Aufgabenverwaltung", "Управление задачами персонала", "Gestión de tareas del personal", "Gestione attività del personale"],
  ["Şifre (tekrar)", "Password (repeat)", "Passwort (wiederholen)", "Пароль (повтор)", "Contraseña (repetir)", "Password (ripeti)"],
  ["Adınız Soyadınız", "Your full name", "Ihr Name", "Ваше имя", "Su nombre completo", "Il tuo nome"],
  ["ornek@firma.com", "example@company.com", "beispiel@firma.com", "пример@компания.com", "ejemplo@empresa.com", "esempio@azienda.com"],
  ["Yönetici olarak kayıt olun. Şeflerinizi ve personelinizi giriş yaptıktan sonra siz eklersiniz.", "Register as a manager. You add your chefs and staff after signing in.", "Registrieren Sie sich als Manager. Chefs und Personal fügen Sie nach der Anmeldung hinzu.", "Зарегистрируйтесь как менеджер. Шефов и персонал добавите после входа.", "Regístrese como gerente. Añadirá jefes y personal tras iniciar sesión.", "Registrati come manager. Aggiungerai capi e personale dopo l'accesso."],
  ["Lütfen tüm alanları doldurun.", "Please fill in all fields.", "Bitte alle Felder ausfüllen.", "Заполните все поля.", "Rellene todos los campos.", "Compila tutti i campi."],
  ["Şifre en az 4 karakter olmalı.", "Password must be at least 4 characters.", "Passwort muss mind. 4 Zeichen haben.", "Пароль не менее 4 символов.", "La contraseña debe tener al menos 4 caracteres.", "La password deve avere almeno 4 caratteri."],
  ["Bu e-posta zaten kayıtlı.", "This email is already registered.", "Diese E-Mail ist bereits registriert.", "Этот e-mail уже зарегистрирован.", "Este correo ya está registrado.", "Questa e-mail è già registrata."],
  ["Giriş yapılamadı. Bağlantını kontrol et.", "Login failed. Check your connection.", "Anmeldung fehlgeschlagen. Verbindung prüfen.", "Не удалось войти. Проверьте подключение.", "No se pudo iniciar sesión. Revise su conexión.", "Accesso non riuscito. Controlla la connessione."],
  ["Kayıt yapılamadı. Bağlantını kontrol et.", "Registration failed. Check your connection.", "Registrierung fehlgeschlagen. Verbindung prüfen.", "Не удалось зарегистрироваться. Проверьте подключение.", "No se pudo registrar. Revise su conexión.", "Registrazione non riuscita. Controlla la connessione."],

  // --- Tanıtım (landing) sayfası ---
  ["İşletmeniz için personel görev, vardiya ve izin yönetimi", "Staff task, shift and leave management for your business", "Aufgaben-, Schicht- und Urlaubsverwaltung für Ihr Unternehmen", "Управление задачами, сменами и отпусками для вашего бизнеса", "Gestión de tareas, turnos y permisos del personal para su negocio", "Gestione di attività, turni e permessi del personale per la tua azienda"],
  ["Fixpre; kafe, restoran, market ve tüm işletmeler için görev atama, haftalık vardiya planı ve izin/mesai takibini tek uygulamada toplar. Telefondan kullanın, ücretsiz başlayın.", "Fixpre brings task assignment, weekly shift planning and leave/hours tracking into one app for cafes, restaurants, shops and any business. Use it from your phone, start free.", "Fixpre vereint Aufgabenverteilung, Wochenschichtplanung und Urlaubs-/Stundenerfassung in einer App für Cafés, Restaurants, Läden und jedes Unternehmen. Per Handy nutzen, kostenlos starten.", "Fixpre объединяет назначение задач, недельное планирование смен и учёт отпусков/часов в одном приложении для кафе, ресторанов, магазинов и любого бизнеса. Используйте с телефона, начните бесплатно.", "Fixpre reúne la asignación de tareas, la planificación semanal de turnos y el control de permisos/horas en una sola app para cafés, restaurantes, tiendas y cualquier negocio. Úsela desde el móvil, empiece gratis.", "Fixpre riunisce assegnazione attività, pianificazione settimanale dei turni e controllo permessi/ore in un'unica app per bar, ristoranti, negozi e qualsiasi azienda. Usala dal telefono, inizia gratis."],
  ["Ücretsiz Başla", "Start Free", "Kostenlos starten", "Начать бесплатно", "Empezar gratis", "Inizia gratis"],
  ["Görev Yönetimi", "Task Management", "Aufgabenverwaltung", "Управление задачами", "Gestión de tareas", "Gestione attività"],
  ["Personele görev atayın, tekrarlayan görevler kurun, tamamlanmayı anlık takip edin.", "Assign tasks to staff, set recurring tasks, track completion in real time.", "Weisen Sie Aufgaben zu, richten Sie wiederkehrende Aufgaben ein, verfolgen Sie die Erledigung in Echtzeit.", "Назначайте задачи, создавайте повторяющиеся задачи, отслеживайте выполнение в реальном времени.", "Asigne tareas, cree tareas recurrentes y siga su finalización en tiempo real.", "Assegna attività, imposta attività ricorrenti, monitora il completamento in tempo reale."],
  ["Haftalık Vardiya", "Weekly Shifts", "Wochenschichten", "Недельные смены", "Turnos semanales", "Turni settimanali"],
  ["Vardiya planı oluşturun (A/B/C saatleri), vardiya ve izin değişikliği taleplerini yönetin.", "Create a shift plan (A/B/C hours), manage shift and leave change requests.", "Erstellen Sie einen Schichtplan (A/B/C-Zeiten), verwalten Sie Schicht- und Urlaubsänderungsanträge.", "Создайте план смен (часы A/B/C), управляйте запросами на смену и отпуск.", "Cree un plan de turnos (horas A/B/C), gestione solicitudes de cambio de turno y permiso.", "Crea un piano turni (orari A/B/C), gestisci le richieste di cambio turno e permesso."],
  ["İzin ve Mesai Takibi", "Leave & Hours Tracking", "Urlaubs- und Stundenerfassung", "Учёт отпусков и часов", "Control de permisos y horas", "Controllo permessi e ore"],
  ["İzin, fazla ve eksik mesai takibi; talepler onaya gider, bakiye otomatik hesaplanır.", "Track leave, overtime and undertime; requests go for approval, balance is calculated automatically.", "Erfassen Sie Urlaub, Über- und Unterstunden; Anträge gehen zur Genehmigung, Saldo wird automatisch berechnet.", "Учёт отпусков, переработок и недоработок; запросы идут на одобрение, баланс считается автоматически.", "Controle permisos, horas extra y de menos; las solicitudes van a aprobación y el saldo se calcula solo.", "Monitora permessi, straordinari e ore in meno; le richieste vanno in approvazione, il saldo è automatico."],
  ["Talepler ve Duyurular", "Requests & Announcements", "Anfragen & Ankündigungen", "Запросы и объявления", "Solicitudes y anuncios", "Richieste e annunci"],
  ["Arıza, eksik ve istek bildirimleri; tüm lokasyonlara tek tıkla duyuru.", "Fault, shortage and request reports; one-click announcements to all locations.", "Störungs-, Mangel- und Wunschmeldungen; Ankündigungen an alle Standorte mit einem Klick.", "Сообщения о неисправностях, нехватке и пожеланиях; объявления во все локации одним кликом.", "Avisos de averías, faltantes y peticiones; anuncios a todas las ubicaciones con un clic.", "Segnalazioni di guasti, mancanze e richieste; annunci a tutte le sedi con un clic."],
  ["Yönetici, Şef, Personel", "Manager, Chef, Staff", "Manager, Chef, Personal", "Менеджер, шеф, персонал", "Gerente, jefe, personal", "Manager, capo, personale"],
  ["Roller ve lokasyon bazlı yetki; onay yetkisini siz belirleyin.", "Roles and location-based permissions; you decide who approves.", "Rollen und standortbasierte Berechtigungen; Sie entscheiden, wer genehmigt.", "Роли и права по локациям; вы решаете, кто одобряет.", "Roles y permisos por ubicación; usted decide quién aprueba.", "Ruoli e permessi per sede; decidi tu chi approva."],
  ["6 Dil ve Mobil", "6 Languages & Mobile", "6 Sprachen & Mobil", "6 языков и мобильность", "6 idiomas y móvil", "6 lingue e mobile"],
  ["Türkçe, İngilizce, Almanca, Rusça, İspanyolca, İtalyanca. Telefona kurulabilir (PWA).", "Turkish, English, German, Russian, Spanish, Italian. Installable on your phone (PWA).", "Türkisch, Englisch, Deutsch, Russisch, Spanisch, Italienisch. Auf dem Handy installierbar (PWA).", "Турецкий, английский, немецкий, русский, испанский, итальянский. Устанавливается на телефон (PWA).", "Turco, inglés, alemán, ruso, español, italiano. Instalable en el móvil (PWA).", "Turco, inglese, tedesco, russo, spagnolo, italiano. Installabile sul telefono (PWA)."],
  ["© Fixpre · fixpre.com — personel görev, vardiya ve izin yönetim uygulaması", "© Fixpre · fixpre.com — staff task, shift and leave management app", "© Fixpre · fixpre.com — App für Aufgaben-, Schicht- und Urlaubsverwaltung", "© Fixpre · fixpre.com — приложение для управления задачами, сменами и отпусками", "© Fixpre · fixpre.com — app de gestión de tareas, turnos y permisos", "© Fixpre · fixpre.com — app per gestione attività, turni e permessi"],
  ["Kendi hiyerarşik düzeninizi kurun", "Set up your own hierarchy", "Bauen Sie Ihre eigene Hierarchie auf", "Создайте свою иерархию", "Cree su propia jerarquía", "Crea la tua gerarchia"],
  ["Yönetici en üstte; şefler lokasyonları ve ekipleri yönetir; personel kendi görev ve vardiyasını görür. Onay ve görüntüleme yetkilerini tamamen siz belirlersiniz.", "Manager at the top; chefs manage locations and teams; staff see their own tasks and shifts. You fully decide the approval and viewing permissions.", "Manager an der Spitze; Chefs verwalten Standorte und Teams; Personal sieht eigene Aufgaben und Schichten. Genehmigungs- und Anzeigerechte bestimmen Sie.", "Менеджер наверху; шефы управляют локациями и командами; персонал видит свои задачи и смены. Права одобрения и просмотра задаёте вы.", "El gerente arriba; los jefes gestionan ubicaciones y equipos; el personal ve sus tareas y turnos. Usted decide los permisos de aprobación y visualización.", "Manager al vertice; i capi gestiscono sedi e team; il personale vede le proprie attività e turni. I permessi di approvazione e visualizzazione li decidi tu."],
  ["Lokasyonları, şefleri ve personeli ekler; paketleri, onay yetkilerini ve tüm işletmeyi tek yerden yönetir.", "Adds locations, chefs and staff; manages plans, approval rights and the whole business from one place.", "Fügt Standorte, Chefs und Personal hinzu; verwaltet Pakete, Rechte und das ganze Unternehmen zentral.", "Добавляет локации, шефов и персонал; управляет тарифами, правами и всем бизнесом из одного места.", "Añade ubicaciones, jefes y personal; gestiona planes, permisos y todo el negocio desde un solo lugar.", "Aggiunge sedi, capi e personale; gestisce piani, permessi e tutta l'azienda da un unico posto."],
  ["Kendi lokasyonundaki ekibi ve görevleri yönetir; izin ve vardiya taleplerini (yetki verilirse) onaylar.", "Manages the team and tasks at their location; approves leave and shift requests (if granted).", "Verwaltet Team und Aufgaben am eigenen Standort; genehmigt Urlaubs- und Schichtanträge (falls erlaubt).", "Управляет командой и задачами своей локации; одобряет запросы на отпуск и смены (если разрешено).", "Gestiona el equipo y las tareas de su ubicación; aprueba solicitudes de permiso y turno (si se le permite).", "Gestisce team e attività della propria sede; approva richieste di permesso e turno (se autorizzato)."],
  ["Görevlerini ve haftalık vardiyasını görür; izin, mesai ve vardiya değişikliği talebi gönderir.", "Sees their tasks and weekly shift; sends leave, hours and shift change requests.", "Sieht eigene Aufgaben und Wochenschicht; sendet Urlaubs-, Stunden- und Schichtwechselanträge.", "Видит свои задачи и недельную смену; отправляет запросы на отпуск, часы и смену.", "Ve sus tareas y su turno semanal; envía solicitudes de permiso, horas y cambio de turno.", "Vede le proprie attività e il turno settimanale; invia richieste di permesso, ore e cambio turno."],
  ["Her işletme için uygun", "Suitable for every business", "Für jedes Unternehmen geeignet", "Подходит для любого бизнеса", "Apto para cualquier negocio", "Adatto a ogni attività"],
  ["Tek şube ya da çok şubeli zincir — Fixpre işletmenizle birlikte büyür.", "Single branch or multi-branch chain — Fixpre grows with your business.", "Einzelfiliale oder Filialkette — Fixpre wächst mit Ihrem Unternehmen.", "Один филиал или сеть — Fixpre растёт вместе с вашим бизнесом.", "Una sucursal o una cadena — Fixpre crece con su negocio.", "Singola sede o catena — Fixpre cresce con la tua attività."],
  ["Restoran", "Restaurant", "Restaurant", "Ресторан", "Restaurante", "Ristorante"],
  ["Kafe", "Café", "Café", "Кафе", "Cafetería", "Caffè"],
  ["Market", "Market", "Markt", "Магазин", "Supermercado", "Market"],
  ["Otel", "Hotel", "Hotel", "Отель", "Hotel", "Hotel"],
  ["Mağaza", "Store", "Geschäft", "Магазин", "Tienda", "Negozio"],
  ["Kuaför & Berber", "Hair & Barber", "Friseur & Barbier", "Парикмахерская", "Peluquería y barbería", "Parrucchiere e barbiere"],
  ["Fırın & Pastane", "Bakery & Patisserie", "Bäckerei & Konditorei", "Пекарня и кондитерская", "Panadería y pastelería", "Panetteria e pasticceria"],
  ["Bar & Cafe", "Bar & Café", "Bar & Café", "Бар и кафе", "Bar y café", "Bar e caffè"],
  ["Eczane", "Pharmacy", "Apotheke", "Аптека", "Farmacia", "Farmacia"],
  ["Spor Salonu", "Gym", "Fitnessstudio", "Спортзал", "Gimnasio", "Palestra"],
  ["Şube Zinciri", "Chain Stores", "Filialkette", "Сеть филиалов", "Cadena de sucursales", "Catena di filiali"],
  ["Üretim & Atölye", "Production & Workshop", "Produktion & Werkstatt", "Производство и мастерская", "Producción y taller", "Produzione e officina"],
  ["Personel takip ve vardiya programı", "Staff tracking and shift scheduling software", "Personalverfolgung und Schichtplanung", "Учёт персонала и планирование смен", "Control de personal y planificación de turnos", "Controllo personale e pianificazione turni"],
  ["Fixpre, işletmeler için online personel takip programı, vardiya planlama programı ve izin takip uygulamasıdır. Personele görev atama, haftalık vardiya çizelgesi oluşturma, vardiya değişikliği ve takası, izin/mesai takibi, talep ve duyuru yönetimini tek yerde sunar. Restoran personel yönetimi, kafe ve market vardiya programı arıyorsanız Excel'e gerek kalmadan ücretsiz başlayın.", "Fixpre is an online staff tracking, shift scheduling and leave management app for businesses. It offers task assignment, weekly shift charts, shift change and swap, leave/hours tracking, requests and announcements in one place. If you need restaurant staff management or a café and shop shift program, start free without spreadsheets.", "Fixpre ist eine Online-App für Personalverfolgung, Schichtplanung und Urlaubsverwaltung für Unternehmen. Aufgabenzuweisung, Wochenschichtpläne, Schichtwechsel und -tausch, Urlaubs-/Stundenerfassung, Anfragen und Ankündigungen an einem Ort. Ohne Excel kostenlos starten.", "Fixpre — это онлайн-приложение для учёта персонала, планирования смен и отпусков для бизнеса. Назначение задач, недельные графики смен, замена и обмен сменами, учёт отпусков/часов, запросы и объявления в одном месте. Начните бесплатно без Excel.", "Fixpre es una app online de control de personal, planificación de turnos y gestión de permisos para negocios. Ofrece asignación de tareas, cuadrantes semanales, cambio e intercambio de turnos, control de permisos/horas, solicitudes y anuncios en un solo lugar. Empiece gratis sin Excel.", "Fixpre è un'app online per controllo personale, pianificazione turni e gestione permessi per le aziende. Offre assegnazione attività, planning settimanale dei turni, cambio e scambio turni, controllo permessi/ore, richieste e annunci in un unico posto. Inizia gratis senza Excel."],
  ["Hemen Ücretsiz Başla", "Start Free Now", "Jetzt kostenlos starten", "Начать бесплатно сейчас", "Empezar gratis ahora", "Inizia gratis ora"],

  // --- Üst bar / roller ---
  ["Çıkış", "Log out", "Abmelden", "Выход", "Salir", "Esci"],
  ["Profil", "Profile", "Profil", "Профиль", "Perfil", "Profilo"],
  ["Yönetici", "Manager", "Manager", "Менеджер", "Gerente", "Manager"],

  // --- Sekmeler ---
  ["Pano", "Dashboard", "Übersicht", "Панель", "Panel", "Pannello"],
  ["Tüm Görevler", "All Tasks", "Alle Aufgaben", "Все задачи", "Todas las tareas", "Tutte le attività"],
  ["Bana Atanan", "Assigned to Me", "Mir zugewiesen", "Назначено мне", "Asignado a mí", "Assegnate a me"],
  ["Biten Görevler", "Completed Tasks", "Erledigte Aufgaben", "Завершённые задачи", "Tareas completadas", "Attività completate"],
  ["Görevlerim", "My Tasks", "Meine Aufgaben", "Мои задачи", "Mis tareas", "Le mie attività"],
  ["Mekanlarım", "My Venues", "Meine Standorte", "Мои объекты", "Mis lugares", "Le mie sedi"],
  ["Personelim", "My Staff", "Mein Personal", "Мой персонал", "Mi personal", "Il mio personale"],
  ["İzin / Mesai", "Leave / Hours", "Urlaub / Stunden", "Отпуск / Часы", "Permiso / Horas", "Permessi / Ore"],
  ["Kayıtlar", "Records", "Aufzeichnungen", "Записи", "Registros", "Registri"],
  ["Ekip", "Team", "Team", "Команда", "Equipo", "Team"],
  ["Daha Fazla", "More", "Mehr", "Ещё", "Más", "Altro"],
  ["Lokasyonlarım", "My Locations", "Meine Standorte", "Мои локации", "Mis ubicaciones", "Le mie sedi"],
  ["Lokasyonlar", "Locations", "Standorte", "Локации", "Ubicaciones", "Sedi"],
  ["Lokasyon", "Location", "Standort", "Локация", "Ubicación", "Sede"],
  ["Yeni Lokasyon Ekle", "Add New Location", "Neuen Standort hinzufügen", "Добавить локацию", "Añadir ubicación", "Aggiungi sede"],
  ["Lokasyon adı", "Location name", "Standortname", "Название локации", "Nombre de ubicación", "Nome sede"],
  ["Lokasyon Ekle", "Add Location", "Standort hinzufügen", "Добавить локацию", "Añadir ubicación", "Aggiungi sede"],
  ["Görevleri görmek için bir lokasyona tıklayın.", "Click a location to see its tasks.", "Klicken Sie auf einen Standort, um Aufgaben zu sehen.", "Нажмите локацию, чтобы увидеть задачи.", "Haga clic en una ubicación para ver las tareas.", "Clicca una sede per vedere le attività."],
  ["Henüz lokasyon yok.", "No locations yet.", "Noch keine Standorte.", "Локаций пока нет.", "Aún no hay ubicaciones.", "Ancora nessuna sede."],
  ["Size atanmış lokasyon yok.", "No locations assigned to you.", "Ihnen sind keine Standorte zugewiesen.", "Вам не назначены локации.", "No tiene ubicaciones asignadas.", "Nessuna sede assegnata."],
  ["Lokasyon adı gerekli.", "Location name required.", "Standortname erforderlich.", "Требуется название локации.", "Se requiere el nombre de la ubicación.", "Nome sede obbligatorio."],

  // --- Vardiya ---
  ["Haftalık Vardiya", "Weekly Shifts", "Wochenschichten", "Недельные смены", "Turnos semanales", "Turni settimanali"],
  ["Vardiya", "Shifts", "Schichten", "Смены", "Turnos", "Turni"],
  ["Önceki", "Previous", "Zurück", "Назад", "Anterior", "Precedente"],
  ["Sonraki", "Next", "Weiter", "Вперёд", "Siguiente", "Successivo"],
  ["Bu hafta", "This week", "Diese Woche", "Эта неделя", "Esta semana", "Questa settimana"],
  ["Çalışıyor", "Working", "Arbeitet", "Работает", "Trabaja", "Al lavoro"],
  ["İzinli", "Off", "Frei", "Выходной", "Libre", "Riposo"],
  ["Hücreye tıklayıp değiştirin", "Click a cell to change", "Zelle anklicken zum Ändern", "Нажмите ячейку для изменения", "Haga clic en una celda para cambiar", "Clicca una cella per cambiare"],
  ["Bekleyen Değişiklik Talepleri (", "Pending Change Requests (", "Offene Änderungsanträge (", "Ожидающие запросы на изменение (", "Solicitudes de cambio pendientes (", "Richieste di modifica in sospeso ("],
  ["Değişiklik / İzin Talebi", "Change / Leave Request", "Änderung / Urlaub", "Запрос изменения / отгула", "Solicitud de cambio / permiso", "Richiesta modifica / permesso"],
  ["İzin günü istiyorum", "I want a day off", "Ich möchte einen freien Tag", "Хочу выходной", "Quiero un día libre", "Voglio un giorno libero"],
  ["Vardiya değişikliği (takas)", "Shift change (swap)", "Schichttausch", "Обмен сменами", "Cambio de turno (intercambio)", "Cambio turno (scambio)"],
  ["Kiminle", "With whom", "Mit wem", "С кем", "Con quién", "Con chi"],
  ["Onun yerine geleceğiniz gün", "Day you'll cover for them", "Tag, an dem Sie einspringen", "День, когда вы замените", "Día que le cubrirá", "Giorno in cui lo sostituisci"],
  ["Talebi Yöneticiye Gönder", "Send Request to Manager", "Antrag an Manager senden", "Отправить запрос менеджеру", "Enviar solicitud al gerente", "Invia richiesta al manager"],
  ["🔄 Vardiya değişikliği", "🔄 Shift change", "🔄 Schichttausch", "🔄 Обмен сменами", "🔄 Cambio de turno", "🔄 Cambio turno"],
  ["🏖️ İzin günü", "🏖️ Day off", "🏖️ Freier Tag", "🏖️ Выходной", "🏖️ Día libre", "🏖️ Giorno libero"],
  ["🏖️ Bugün izinlisiniz — bugün için göreviniz yok. İyi dinlenmeler!", "🏖️ You're off today — no tasks for today. Enjoy your rest!", "🏖️ Sie haben heute frei — keine Aufgaben. Gute Erholung!", "🏖️ Сегодня у вас выходной — задач нет. Хорошего отдыха!", "🏖️ Hoy libra — no hay tareas. ¡Buen descanso!", "🏖️ Oggi sei in riposo — nessuna attività. Buon riposo!"],
  ["🏖️ Bugün izinlisiniz — bugün için göreviniz yok.", "🏖️ You're off today — no tasks for today.", "🏖️ Sie haben heute frei — keine Aufgaben.", "🏖️ Сегодня у вас выходной — задач нет.", "🏖️ Hoy libra — no hay tareas.", "🏖️ Oggi sei in riposo — nessuna attività."],
  ["Tarih seçin.", "Select a date.", "Datum wählen.", "Выберите дату.", "Seleccione una fecha.", "Seleziona una data."],
  ["İstediğiniz izin günü", "Desired day off", "Gewünschter freier Tag", "Желаемый выходной", "Día libre deseado", "Giorno libero desiderato"],
  ["Eski izin gününüz — çalışmaya dönecek (opsiyonel)", "Your old day off — back to working (optional)", "Ihr alter freier Tag — wird Arbeitstag (optional)", "Старый выходной — станет рабочим (необяз.)", "Su día libre anterior — pasa a trabajar (opcional)", "Vecchio giorno libero — torna lavorativo (opzionale)"],
  [" · eski izin: ", " · old off: ", " · alter frei: ", " · старый выходной: ", " · libre anterior: ", " · vecchio riposo: "],
  [" → çalışıyor", " → working", " → arbeitet", " → работает", " → trabaja", " → al lavoro"],
  ["Kiminle takas", "Swap with", "Tauschen mit", "Обмен с", "Intercambiar con", "Scambia con"],
  ["Takas için kişi seçin.", "Select a person to swap with.", "Person zum Tauschen wählen.", "Выберите человека для обмена.", "Seleccione una persona para intercambiar.", "Seleziona una persona per lo scambio."],
  ["Personel onayı bekliyor", "Awaiting colleague approval", "Wartet auf Kollegen-Zustimmung", "Ожидает согласия коллеги", "Esperando aprobación del compañero", "In attesa dell'approvazione del collega"],
  ["Yönetici onayı bekliyor", "Awaiting manager approval", "Wartet auf Manager-Freigabe", "Ожидает одобрения менеджера", "Esperando aprobación del gerente", "In attesa dell'approvazione del manager"],
  ["📥 Size Gelen Takas Talepleri (", "📥 Swap Requests for You (", "📥 Tauschanfragen an Sie (", "📥 Запросы на обмен вам (", "📥 Solicitudes de intercambio para usted (", "📥 Richieste di scambio per te ("],
  ["Takası Onayla", "Approve Swap", "Tausch genehmigen", "Одобрить обмен", "Aprobar intercambio", "Approva scambio"],
  ["Takas edilen personel reddetti", "The colleague declined the swap", "Kollege hat den Tausch abgelehnt", "Коллега отклонил обмен", "El compañero rechazó el intercambio", "Il collega ha rifiutato lo scambio"],
  ["⚙️ Vardiya Tanımları (", "⚙️ Shift Definitions (", "⚙️ Schichtdefinitionen (", "⚙️ Определения смен (", "⚙️ Definiciones de turno (", "⚙️ Definizioni turni ("],
  ["Etiket", "Label", "Bezeichnung", "Метка", "Etiqueta", "Etichetta"],
  ["Bitiş", "End", "Ende", "Конец", "Fin", "Fine"],
  ["Vardiya Ekle", "Add Shift", "Schicht hinzufügen", "Добавить смену", "Añadir turno", "Aggiungi turno"],
  ["Henüz vardiya yok. Örn: A 08:00–17:00, B 13:30–22:00.", "No shifts yet. e.g. A 08:00–17:00, B 13:30–22:00.", "Noch keine Schichten. z.B. A 08:00–17:00, B 13:30–22:00.", "Смен пока нет. напр. A 08:00–17:00, B 13:30–22:00.", "Aún no hay turnos. p.ej. A 08:00–17:00, B 13:30–22:00.", "Ancora nessun turno. es. A 08:00–17:00, B 13:30–22:00."],
  ["Etiket girin (ör. A).", "Enter a label (e.g. A).", "Bezeichnung eingeben (z.B. A).", "Введите метку (напр. A).", "Ingrese una etiqueta (p.ej. A).", "Inserisci un'etichetta (es. A)."],
  ["Başlangıç ve bitiş saati girin.", "Enter start and end time.", "Start- und Endzeit eingeben.", "Введите время начала и конца.", "Ingrese hora de inicio y fin.", "Inserisci ora di inizio e fine."],
  ["Hücreye tıkla: ", "Click cell: ", "Zelle klicken: ", "Нажмите ячейку: ", "Clic en celda: ", "Clicca cella: "],
  ["Vardiya değişikliği (yöneticiye)", "Shift change (to manager)", "Schichtänderung (an Manager)", "Смена графика (менеджеру)", "Cambio de turno (al gerente)", "Cambio turno (al manager)"],
  ["Vardiya takası (arkadaşla)", "Shift swap (with colleague)", "Schichttausch (mit Kollegen)", "Обмен сменами (с коллегой)", "Intercambio de turno (con compañero)", "Scambio turno (con collega)"],
  ["İzin günü takası (arkadaşla)", "Day-off swap (with colleague)", "Tausch freier Tag (mit Kollegen)", "Обмен выходными (с коллегой)", "Intercambio de día libre (con compañero)", "Scambio giorno libero (con collega)"],
  ["Yeni vardiyanız", "Your new shift", "Ihre neue Schicht", "Ваша новая смена", "Su nuevo turno", "Il tuo nuovo turno"],
  ["Talebi Gönder", "Send Request", "Antrag senden", "Отправить запрос", "Enviar solicitud", "Invia richiesta"],
  ["🕐 Vardiya değişikliği", "🕐 Shift change", "🕐 Schichtänderung", "🕐 Смена графика", "🕐 Cambio de turno", "🕐 Cambio turno"],
  ["🔁 Vardiya takası", "🔁 Shift swap", "🔁 Schichttausch", "🔁 Обмен сменами", "🔁 Intercambio de turno", "🔁 Scambio turno"],
  ["🔄 İzin günü takası", "🔄 Day-off swap", "🔄 Tausch freier Tag", "🔄 Обмен выходными", "🔄 Intercambio de día libre", "🔄 Scambio giorno libero"],
  ["Yeni vardiya seçin (yönetici önce vardiya tanımlamalı).", "Select a new shift (manager must define shifts first).", "Neue Schicht wählen (Manager muss zuerst Schichten anlegen).", "Выберите новую смену (менеджер должен сначала создать смены).", "Seleccione un turno nuevo (el gerente debe definir turnos primero).", "Seleziona un nuovo turno (il manager deve prima definire i turni)."],
  ["Takas talebi önce seçtiğiniz kişiye, o onaylayınca yöneticiye gider.", "The swap request goes to the chosen person first; once they approve, it goes to the manager.", "Die Tauschanfrage geht zuerst an die gewählte Person; nach deren Zustimmung an den Manager.", "Запрос на обмен сначала идёт выбранному человеку; после его согласия — менеджеру.", "La solicitud de intercambio va primero a la persona elegida; tras su aprobación, al gerente.", "La richiesta di scambio va prima alla persona scelta; dopo la sua approvazione, al manager."],
  ["Takas: İstediğiniz izin günü seçtiğiniz kişiye çalışma günü olur; Eski izin gününüz ona izinli gün olur. Önce o kişi, sonra yönetici onaylar.", "Swap: your desired day off becomes a working day for the chosen person; your old day off becomes their day off. They approve first, then the manager.", "Tausch: Ihr gewünschter freier Tag wird für die gewählte Person ein Arbeitstag; Ihr alter freier Tag wird ihr freier Tag. Erst sie, dann der Manager genehmigt.", "Обмен: ваш желаемый выходной становится рабочим днём для выбранного человека; ваш старый выходной становится его выходным. Сначала он, потом менеджер.", "Intercambio: su día libre deseado pasa a ser día laboral para la persona elegida; su día libre anterior pasa a ser el día libre de ella. Aprueba primero ella, luego el gerente.", "Scambio: il tuo giorno libero desiderato diventa lavorativo per la persona scelta; il tuo vecchio giorno libero diventa il suo giorno libero. Approva prima lei, poi il manager."],
  ["Talepler", "Requests", "Anfragen", "Запросы", "Solicitudes", "Richieste"],
  ["Açık Talep", "Open Requests", "Offene Anfragen", "Открытые запросы", "Solicitudes abiertas", "Richieste aperte"],
  ["📨 Talep Gönder", "📨 Send Request", "📨 Anfrage senden", "📨 Отправить запрос", "📨 Enviar solicitud", "📨 Invia richiesta"],
  ["Gelen Talepler — Açık (", "Incoming Requests — Open (", "Eingehende Anfragen — Offen (", "Входящие запросы — Открытые (", "Solicitudes entrantes — Abiertas (", "Richieste in arrivo — Aperte ("],
  ["Çözülen Talepler", "Resolved Requests", "Gelöste Anfragen", "Решённые запросы", "Solicitudes resueltas", "Richieste risolte"],
  ["Gönderdiğim Talepler (", "My Requests (", "Meine Anfragen (", "Мои запросы (", "Mis solicitudes (", "Le mie richieste ("],
  ["Bu aralıkta bekleyen talep yok.", "No pending requests in this range.", "Keine offenen Anfragen in diesem Zeitraum.", "Нет ожидающих запросов в этом диапазоне.", "No hay solicitudes pendientes en este rango.", "Nessuna richiesta in sospeso in questo intervallo."],
  ["Bu aralıkta talep yok.", "No requests in this range.", "Keine Anfragen in diesem Zeitraum.", "Нет запросов в этом диапазоне.", "No hay solicitudes en este rango.", "Nessuna richiesta in questo intervallo."],
  // Demo/limit uyarıları (parça parça; araya sayı ve e-posta girer)
  ["Demo planı: en fazla ", "Demo plan: up to ", "Demo-Plan: bis zu ", "Демо-план: до ", "Plan demo: hasta ", "Piano demo: fino a "],
  [" personel ekleyebilirsiniz. Daha fazlası için ", " staff. For more, contact ", " Mitarbeiter. Für mehr kontaktieren Sie ", " сотрудников. Для большего напишите ", " empleados. Para más, contacte ", " dipendenti. Per altro, contatta "],
  [" mekan ekleyebilirsiniz. Daha fazlası için ", " venues. For more, contact ", " Standorte. Für mehr kontaktieren Sie ", " объектов. Для большего напишите ", " lugares. Para más, contacte ", " sedi. Per altro, contatta "],
  [" şef ekleyebilirsiniz. Daha fazlası için ", " chefs. For more, contact ", " Chefs. Für mehr kontaktieren Sie ", " шефов. Для большего напишите ", " jefes. Para más, contacte ", " capi. Per altro, contatta "],
  [" ile iletişime geçin.", ".", ".", ".", ".", "."],
  ["Bildirimler", "Reports", "Meldungen", "Сообщения", "Avisos", "Segnalazioni"],
  ["Bildirim", "Reports", "Meldungen", "Сообщения", "Avisos", "Segnalazioni"],

  // --- Pano ---
  ["Bugün Aktif", "Active Today", "Heute aktiv", "Активно сегодня", "Activas hoy", "Attive oggi"],
  ["Bugün Biten", "Done Today", "Heute erledigt", "Сделано сегодня", "Hechas hoy", "Fatte oggi"],
  ["Geciken", "Overdue", "Überfällig", "Просрочено", "Atrasadas", "In ritardo"],
  ["Açık Bildirim", "Open Reports", "Offene Meldungen", "Открытые сообщения", "Avisos abiertos", "Segnalazioni aperte"],
  ["Toplam Görev", "Total Tasks", "Aufgaben gesamt", "Всего задач", "Tareas totales", "Attività totali"],
  ["Bugün bekleyen görev yok.", "No pending tasks today.", "Heute keine offenen Aufgaben.", "На сегодня нет задач.", "No hay tareas pendientes hoy.", "Nessuna attività in sospeso oggi."],
  ["Bugün henüz tamamlanan görev yok.", "No tasks completed today yet.", "Heute noch keine Aufgaben erledigt.", "Сегодня пока ничего не выполнено.", "Aún no hay tareas completadas hoy.", "Ancora nessuna attività completata oggi."],
  ["Geciken görevleri tarihe göre filtrele", "Filter overdue tasks by date", "Überfällige Aufgaben nach Datum filtern", "Фильтр просроченных задач по дате", "Filtrar tareas atrasadas por fecha", "Filtra attività in ritardo per data"],
  ["Geciken Görevler (", "Overdue Tasks (", "Überfällige Aufgaben (", "Просроченные задачи (", "Tareas atrasadas (", "Attività in ritardo ("],
  ["Geciken görev yok.", "No overdue tasks.", "Keine überfälligen Aufgaben.", "Нет просроченных задач.", "Sin tareas atrasadas.", "Nessuna attività in ritardo."],
  ["Şimdi tamamla", "Complete now", "Jetzt erledigen", "Выполнить сейчас", "Completar ahora", "Completa ora"],

  // --- Görev oluşturma ---
  ["Yeni Görev Oluştur", "Create New Task", "Neue Aufgabe erstellen", "Создать задачу", "Crear tarea nueva", "Crea nuova attività"],
  ["Görev başlığı gerekli.", "Task title is required.", "Aufgabentitel ist erforderlich.", "Требуется название задачи.", "Se requiere el título.", "Titolo richiesto."],
  ["Görev başlığı", "Task title", "Aufgabentitel", "Название задачи", "Título de la tarea", "Titolo attività"],
  ["Açıklama", "Description", "Beschreibung", "Описание", "Descripción", "Descrizione"],
  ["Tekrar", "Repeat", "Wiederholung", "Повтор", "Repetir", "Ripeti"],
  ["Tek seferlik", "One-time", "Einmalig", "Разовая", "Una vez", "Una tantum"],
  ["Her gün tekrar etsin", "Repeat every day", "Täglich wiederholen", "Повторять ежедневно", "Repetir cada día", "Ripeti ogni giorno"],
  ["Haftalık — belirli günler", "Weekly — selected days", "Wöchentlich — bestimmte Tage", "Еженедельно — выбранные дни", "Semanal — días elegidos", "Settimanale — giorni scelti"],
  ["Aylık — belirli tarihler", "Monthly — selected dates", "Monatlich — bestimmte Tage", "Ежемесячно — выбранные даты", "Mensual — fechas elegidas", "Mensile — date scelte"],
  ["Son tarih (opsiyonel)", "Due date (optional)", "Fälligkeitsdatum (optional)", "Срок (необязательно)", "Fecha límite (opcional)", "Scadenza (facoltativa)"],
  ["Hangi günler tekrar etsin?", "Which days to repeat?", "An welchen Tagen wiederholen?", "В какие дни повторять?", "¿Qué días repetir?", "In quali giorni ripetere?"],
  ["Ayın hangi günleri tekrar etsin?", "Which days of the month?", "An welchen Monatstagen?", "В какие числа месяца?", "¿Qué días del mes?", "Quali giorni del mese?"],
  ["Atanacak personel (birden fazla seçebilirsiniz)", "Assignees (you can select several)", "Zugewiesene (mehrere möglich)", "Исполнители (можно несколько)", "Asignados (puede elegir varios)", "Assegnatari (più di uno)"],
  ["Görevi Oluştur", "Create Task", "Aufgabe erstellen", "Создать задачу", "Crear tarea", "Crea attività"],
  ["En az bir personel seçin.", "Select at least one person.", "Mindestens eine Person wählen.", "Выберите хотя бы одного человека.", "Seleccione al menos una persona.", "Seleziona almeno una persona."],
  ["Görevleri görmek için bir mekana tıklayın.", "Click a venue to see its tasks.", "Klicken Sie auf einen Standort, um die Aufgaben zu sehen.", "Нажмите на объект, чтобы увидеть задачи.", "Haga clic en un lugar para ver sus tareas.", "Clicca su una sede per vedere le attività."],
  ["Henüz görev yok.", "No tasks yet.", "Noch keine Aufgaben.", "Пока нет задач.", "Aún no hay tareas.", "Ancora nessuna attività."],

  // --- Görev kartı / durum ---
  ["⚙️ Ayarlar", "⚙️ Settings", "⚙️ Einstellungen", "⚙️ Настройки", "⚙️ Ajustes", "⚙️ Impostazioni"],
  ["Bu görev silinsin mi?", "Delete this task?", "Diese Aufgabe löschen?", "Удалить эту задачу?", "¿Eliminar esta tarea?", "Eliminare questa attività?"],
  ["Görevi Tamamla", "Complete Task", "Aufgabe erledigen", "Выполнить задачу", "Completar tarea", "Completa attività"],
  ["Atananlardan biri yapacak", "One of the assignees will do it", "Eine zugewiesene Person erledigt es", "Сделает один из исполнителей", "Lo hará uno de los asignados", "Lo farà uno degli assegnatari"],
  ["Bugünkü durum", "Today's status", "Heutiger Status", "Статус на сегодня", "Estado de hoy", "Stato di oggi"],
  ["Okunma durumu", "Read status", "Lesestatus", "Статус прочтения", "Estado de lectura", "Stato di lettura"],
  ["henüz görmedi", "not seen yet", "noch nicht gesehen", "ещё не видел", "aún no visto", "non ancora visto"],
  ["okundu —", "read —", "gelesen —", "прочитано —", "leído —", "letto —"],
  ["Tamamladınız", "You completed it", "Von Ihnen erledigt", "Вы выполнили", "Lo completó", "Completata da te"],
  ["Bekliyor", "Pending", "Ausstehend", "Ожидает", "Pendiente", "In attesa"],
  ["Tamamlandı", "Completed", "Erledigt", "Выполнено", "Completada", "Completata"],
  ["Geri al", "Undo", "Rückgängig", "Отменить", "Deshacer", "Annulla"],
  ["kişi daha atanmış", "more people assigned", "weitere Personen zugewiesen", "ещё человек назначено", "personas más asignadas", "altre persone assegnate"],
  ["Oluşturuldu:", "Created:", "Erstellt:", "Создано:", "Creada:", "Creata:"],
  ["Son tarih:", "Due:", "Fällig:", "Срок:", "Límite:", "Scadenza:"],
  ["Bugün için planlı değil.", "Not scheduled for today.", "Heute nicht geplant.", "На сегодня не запланировано.", "No programada para hoy.", "Non prevista per oggi."],
  ["tamamlamayı geri aldı", "undid the completion", "hat die Erledigung rückgängig gemacht", "отменил выполнение", "deshizo la finalización", "ha annullato il completamento"],
  ["Her gün tekrar eder", "Repeats daily", "Täglich", "Ежедневно", "Cada día", "Ogni giorno"],
  ["Haftalık:", "Weekly:", "Wöchentlich:", "Еженедельно:", "Semanal:", "Settimanale:"],
  ["Aylık: ayın", "Monthly: days", "Monatlich: Tage", "Ежемесячно: числа", "Mensual: días", "Mensile: giorni"],

  // --- Paylaşım (şef) ---
  ["Bana Atanan Görevler (", "Tasks Assigned to Me (", "Mir zugewiesene Aufgaben (", "Назначенные мне задачи (", "Tareas asignadas a mí (", "Attività assegnate a me ("],
  ["Görevi kendiniz tamamlayabilir veya gerekirse kendi personelinizle paylaşabilirsiniz.", "You can complete it yourself or share it with your staff if needed.", "Sie können sie selbst erledigen oder bei Bedarf mit Ihrem Personal teilen.", "Вы можете выполнить сами или при необходимости поделиться со своим персоналом.", "Puede completarla usted mismo o compartirla con su personal si es necesario.", "Puoi completarla tu o condividerla con il tuo personale se serve."],
  ["👥 Personelle paylaş", "👥 Share with staff", "👥 Mit Personal teilen", "👥 Поделиться с персоналом", "👥 Compartir con el personal", "👥 Condividi col personale"],
  ["Bu görevi paylaşmak istediğiniz personeli seçin:", "Select staff to share this task with:", "Personal zum Teilen auswählen:", "Выберите персонал для общего доступа:", "Seleccione el personal para compartir:", "Seleziona il personale con cui condividere:"],
  ["Paylaş", "Share", "Teilen", "Поделиться", "Compartir", "Condividi"],
  ["Eklenebilecek başka personel yok.", "No other staff to add.", "Kein weiteres Personal verfügbar.", "Больше некого добавить.", "No hay más personal para añadir.", "Nessun altro personale da aggiungere."],
  ["Önce şef veya personel ekleyin.", "Add a chef or staff first.", "Fügen Sie zuerst Chef oder Personal hinzu.", "Сначала добавьте шефа или персонал.", "Primero añada un jefe o personal.", "Aggiungi prima un capo o personale."],
  ["Size atanmış görev yok.", "No tasks assigned to you.", "Ihnen sind keine Aufgaben zugewiesen.", "Вам не назначены задачи.", "No tiene tareas asignadas.", "Nessuna attività assegnata a te."],

  // --- Mekanlar ---
  ["Yeni Mekan Ekle", "Add New Venue", "Neuen Standort hinzufügen", "Добавить объект", "Añadir lugar", "Aggiungi sede"],
  ["Mekan adı gerekli.", "Venue name is required.", "Standortname erforderlich.", "Требуется название объекта.", "Se requiere el nombre del lugar.", "Nome sede richiesto."],
  ["Mekan adı", "Venue name", "Standortname", "Название объекта", "Nombre del lugar", "Nome sede"],
  ["Adres (opsiyonel)", "Address (optional)", "Adresse (optional)", "Адрес (необязательно)", "Dirección (opcional)", "Indirizzo (facoltativo)"],
  ["Mekan Ekle", "Add Venue", "Standort hinzufügen", "Добавить объект", "Añadir lugar", "Aggiungi sede"],
  ["Görevleri aç →", "Open tasks →", "Aufgaben öffnen →", "Открыть задачи →", "Abrir tareas →", "Apri attività →"],
  ["Henüz mekan yok.", "No venues yet.", "Noch keine Standorte.", "Пока нет объектов.", "Aún no hay lugares.", "Ancora nessuna sede."],
  ["Size atanmış mekan yok.", "No venues assigned to you.", "Ihnen sind keine Standorte zugewiesen.", "Вам не назначены объекты.", "No tiene lugares asignados.", "Nessuna sede assegnata."],
  ["Bu mekandaki personel (", "Staff at this venue (", "Personal an diesem Standort (", "Персонал на объекте (", "Personal en este lugar (", "Personale in questa sede ("],
  ["Atanmış personel yok.", "No assigned staff.", "Kein Personal zugewiesen.", "Нет назначенного персонала.", "Sin personal asignado.", "Nessun personale assegnato."],
  ["← Mekanlara dön", "← Back to venues", "← Zurück zu Standorten", "← Назад к объектам", "← Volver a lugares", "← Torna alle sedi"],
  ["Bu mekana ait görev yok.", "No tasks for this venue.", "Keine Aufgaben für diesen Standort.", "Нет задач для объекта.", "Sin tareas para este lugar.", "Nessuna attività per questa sede."],
  ["Bu mekan silinsin mi?", "Delete this venue?", "Diesen Standort löschen?", "Удалить объект?", "¿Eliminar este lugar?", "Eliminare questa sede?"],
  ["Mekan seçin (opsiyonel)", "Select venue (optional)", "Standort wählen (optional)", "Выберите объект (необязательно)", "Seleccionar lugar (opcional)", "Seleziona sede (facoltativa)"],
  ["Mekan (opsiyonel)", "Venue (optional)", "Standort (optional)", "Объект (необязательно)", "Lugar (opcional)", "Sede (facoltativa)"],
  ["Mekansız", "No venue", "Ohne Standort", "Без объекта", "Sin lugar", "Senza sede"],
  ["Mekanlar (", "Venues (", "Standorte (", "Объекты (", "Lugares (", "Sedi ("],
  ["Mekanlar", "Venues", "Standorte", "Объекты", "Lugares", "Sedi"],
  ["Mekan", "Venue", "Standort", "Объект", "Lugar", "Sede"],

  // --- Personel yönetimi ---
  ["Yeni Personel Ekle", "Add New Staff", "Neues Personal hinzufügen", "Добавить персонал", "Añadir personal", "Aggiungi personale"],
  ["Ad Soyad", "Full Name", "Voller Name", "ФИО", "Nombre completo", "Nome e cognome"],
  ["E-posta (giriş için)", "Email (for login)", "E-Mail (für Login)", "E-mail (для входа)", "Correo (para acceso)", "E-mail (per accesso)"],
  ["Şifre (giriş için)", "Password (for login)", "Passwort (für Login)", "Пароль (для входа)", "Contraseña (para acceso)", "Password (per accesso)"],
  ["Personele verilecek şifre", "Password to give the staff", "Passwort für das Personal", "Пароль для сотрудника", "Contraseña para el personal", "Password per il personale"],
  ["Görevli olduğu mekanlar", "Assigned venues", "Zugewiesene Standorte", "Назначенные объекты", "Lugares asignados", "Sedi assegnate"],
  ["Personel Ekle", "Add Staff", "Personal hinzufügen", "Добавить персонал", "Añadir personal", "Aggiungi personale"],
  ["Personel Listesi (", "Staff List (", "Personalliste (", "Список персонала (", "Lista de personal (", "Elenco personale ("],
  ["Ad, e-posta ve şifre gerekli.", "Name, email and password required.", "Name, E-Mail und Passwort erforderlich.", "Нужны имя, e-mail и пароль.", "Se requieren nombre, correo y contraseña.", "Servono nome, e-mail e password."],
  ["Bu e-posta zaten kullanımda.", "This email is already in use.", "Diese E-Mail wird bereits verwendet.", "Этот e-mail уже используется.", "Este correo ya está en uso.", "Questa e-mail è già in uso."],
  ["Henüz personel yok.", "No staff yet.", "Noch kein Personal.", "Пока нет персонала.", "Aún no hay personal.", "Ancora nessun personale."],
  ["⚙️ Personel Düzenle — ", "⚙️ Edit Staff — ", "⚙️ Personal bearbeiten — ", "⚙️ Изменить сотрудника — ", "⚙️ Editar personal — ", "⚙️ Modifica personale — "],
  ["Bu personel silinsin mi? (Görev atamalarından da çıkarılır)", "Delete this staff? (Also removed from task assignments)", "Personal löschen? (Auch aus Zuweisungen entfernt)", "Удалить сотрудника? (Также из назначений)", "¿Eliminar al personal? (También de las asignaciones)", "Eliminare il personale? (Anche dalle assegnazioni)"],
  ["şifre:", "password:", "Passwort:", "пароль:", "contraseña:", "password:"],

  // --- Şefler ---
  ["Yeni Şef Ekle", "Add New Chef", "Neuen Chef hinzufügen", "Добавить шефа", "Añadir jefe", "Aggiungi capo"],
  ["Şefe verilecek şifre", "Password for the chef", "Passwort für den Chef", "Пароль для шефа", "Contraseña para el jefe", "Password per il capo"],
  ["Sorumlu olduğu mekanlar", "Responsible venues", "Verantwortliche Standorte", "Ответственные объекты", "Lugares responsables", "Sedi di competenza"],
  ["Şef Ekle", "Add Chef", "Chef hinzufügen", "Добавить шефа", "Añadir jefe", "Aggiungi capo"],
  ["Personelini ve görevlerini görmek için bir şefe tıklayın.", "Click a chef to see their staff and tasks.", "Klicken Sie auf einen Chef, um Personal und Aufgaben zu sehen.", "Нажмите на шефа, чтобы увидеть персонал и задачи.", "Haga clic en un jefe para ver su personal y tareas.", "Clicca su un capo per vedere personale e attività."],
  ["Henüz şef yok.", "No chefs yet.", "Noch keine Chefs.", "Пока нет шефов.", "Aún no hay jefes.", "Ancora nessun capo."],
  ["⚙️ Şef Düzenle — ", "⚙️ Edit Chef — ", "⚙️ Chef bearbeiten — ", "⚙️ Изменить шефа — ", "⚙️ Editar jefe — ", "⚙️ Modifica capo — "],
  ["← Şeflere dön", "← Back to chefs", "← Zurück zu Chefs", "← Назад к шефам", "← Volver a jefes", "← Torna ai capi"],
  ["Personeli (", "Staff (", "Personal (", "Персонал (", "Personal (", "Personale ("],
  ["Görevleri (", "Tasks (", "Aufgaben (", "Задачи (", "Tareas (", "Attività ("],
  ["Bu şefin oluşturduğu görev yok.", "No tasks created by this chef.", "Keine vom Chef erstellten Aufgaben.", "Шеф не создавал задач.", "Sin tareas creadas por este jefe.", "Nessuna attività creata da questo capo."],
  ["Bu şef silinsin mi? (Personeli silinmez, doğrudan yöneticiye bağlanır)", "Delete this chef? (Their staff stay, moved under the manager)", "Chef löschen? (Personal bleibt, geht zum Manager)", "Удалить шефа? (Персонал останется, перейдёт к менеджеру)", "¿Eliminar al jefe? (Su personal pasa al gerente)", "Eliminare il capo? (Il personale passa al manager)"],
  ["Şefler (", "Chefs (", "Chefs (", "Шефы (", "Jefes (", "Capi ("],
  ["Şefim (", "My Chef (", "Mein Chef (", "Мой шеф (", "Mi jefe (", "Il mio capo ("],
  ["Şefler", "Chefs", "Chefs", "Шефы", "Jefes", "Capi"],
  ["Şef", "Chef", "Chef", "Шеф", "Jefe", "Capo"],

  // --- Personel (kelime, en sonda) ---
  ["Personelim", "My Staff", "Mein Personal", "Мой персонал", "Mi personal", "Il mio personale"],
  ["Personelle paylaş", "Share with staff", "Mit Personal teilen", "Поделиться с персоналом", "Compartir con personal", "Condividi col personale"],
  ["Personel", "Staff", "Personal", "Персонал", "Personal", "Personale"],

  // --- Bildirim / Talep ---
  ["📨 Bildirim / Talep Gönder", "📨 Send Report / Request", "📨 Meldung / Anfrage senden", "📨 Отправить сообщение / запрос", "📨 Enviar aviso / solicitud", "📨 Invia segnalazione / richiesta"],
  ["Tür", "Type", "Art", "Тип", "Tipo", "Tipo"],
  ["Kime?", "To whom?", "An wen?", "Кому?", "¿A quién?", "A chi?"],
  ["Tüm Şefler (vardiyadaki görsün)", "All Chefs (on-shift sees it)", "Alle Chefs (Schicht sieht es)", "Все шефы (видит дежурный)", "Todos los jefes (lo ve el de turno)", "Tutti i capi (lo vede chi è in turno)"],
  ["Lütfen açıklama yazın.", "Please write a description.", "Bitte Beschreibung eingeben.", "Введите описание.", "Escriba una descripción.", "Scrivi una descrizione."],
  ["Gelen Bildirimler — Açık (", "Incoming Reports — Open (", "Eingehende Meldungen — Offen (", "Входящие — Открытые (", "Avisos entrantes — Abiertos (", "In arrivo — Aperte ("],
  ["Bekleyen bildirim yok.", "No pending reports.", "Keine offenen Meldungen.", "Нет ожидающих сообщений.", "No hay avisos pendientes.", "Nessuna segnalazione in sospeso."],
  ["Çözülen Bildirimler", "Resolved Reports", "Gelöste Meldungen", "Решённые сообщения", "Avisos resueltos", "Segnalazioni risolte"],
  ["Gönderdiğim Bildirimler (", "My Reports (", "Meine Meldungen (", "Мои сообщения (", "Mis avisos (", "Le mie segnalazioni ("],
  ["Bekleyen Bildirimler (", "Pending Reports (", "Offene Meldungen (", "Ожидающие сообщения (", "Avisos pendientes (", "Segnalazioni in sospeso ("],
  ["Çözüldü olarak işaretle", "Mark as resolved", "Als gelöst markieren", "Отметить решённым", "Marcar como resuelto", "Segna come risolto"],
  ["Çözüm notu (opsiyonel)", "Resolution note (optional)", "Lösungsnotiz (optional)", "Примечание (необязательно)", "Nota de resolución (opcional)", "Nota di risoluzione (facoltativa)"],
  ["Çözüldü", "Resolved", "Gelöst", "Решено", "Resuelto", "Risolto"],
  ["Açık", "Open", "Offen", "Открыто", "Abierto", "Aperto"],
  ["Arıza", "Fault", "Störung", "Поломка", "Avería", "Guasto"],
  ["Eksik / İhtiyaç", "Missing / Need", "Fehlt / Bedarf", "Нехватка / Нужда", "Falta / Necesidad", "Mancanza / Bisogno"],
  ["Talep", "Request", "Anfrage", "Запрос", "Solicitud", "Richiesta"],
  ["Öneri", "Suggestion", "Vorschlag", "Предложение", "Sugerencia", "Suggerimento"],
  ["Diğer", "Other", "Sonstiges", "Другое", "Otro", "Altro"],

  // --- İzin / Mesai ---
  ["📨 İzin / Mesai Talebi", "📨 Leave / Hours Request", "📨 Urlaub / Stunden anfragen", "📨 Запрос отпуска / часов", "📨 Solicitud de permiso / horas", "📨 Richiesta permesso / ore"],
  ["İleri Tarihli İzin Talebi", "Future-dated Leave Request", "Urlaubsantrag (Datum)", "Заявка на отпуск (на дату)", "Solicitud de permiso (fecha futura)", "Richiesta ferie (data futura)"],
  ["İzin Hakkınız", "Your Leave", "Ihr Urlaub", "Ваш отпуск", "Su permiso", "Le tue ferie"],
  ["🟠 Ücretsiz İzin Yaz", "🟠 Record Unpaid Leave", "🟠 Unbezahlten Urlaub erfassen", "🟠 Записать отпуск без содержания", "🟠 Registrar permiso sin sueldo", "🟠 Registra permesso non retribuito"],
  ["Ücretsiz İzin Kaydet", "Save Unpaid Leave", "Unbezahlten Urlaub speichern", "Сохранить отпуск без содержания", "Guardar permiso sin sueldo", "Salva permesso non retribuito"],
  ["Ücretsiz İzin", "Unpaid Leave", "Unbezahlter Urlaub", "Отпуск без содержания", "Permiso sin sueldo", "Permesso non retribuito"],
  ["Yıllık İzin Hakkınız", "Your Annual Leave", "Ihr Jahresurlaub", "Ваш ежегодный отпуск", "Sus vacaciones anuales", "Le tue ferie annuali"],
  ["Yıllık izin hakkı (gün)", "Annual leave (days)", "Jahresurlaub (Tage)", "Ежегодный отпуск (дни)", "Vacaciones anuales (días)", "Ferie annuali (giorni)"],
  ["Başlangıç ve bitiş tarihi seçin.", "Select start and end dates.", "Start- und Enddatum wählen.", "Выберите даты начала и конца.", "Seleccione fechas de inicio y fin.", "Seleziona date di inizio e fine."],
  ["Bitiş tarihi başlangıçtan önce olamaz.", "End date can't be before start.", "Enddatum darf nicht vor Start liegen.", "Дата конца не может быть раньше начала.", "La fecha de fin no puede ser anterior al inicio.", "La fine non può precedere l'inizio."],
  [" gün · Kalan günlerinizi tarih aralığı seçerek kullanabilirsiniz.", " days · Use your remaining days by selecting a date range.", " Tage · Resttage über einen Zeitraum nutzen.", " дн. · Используйте оставшиеся дни, выбрав период.", " días · Use sus días restantes eligiendo un rango.", " giorni · Usa i giorni rimanenti scegliendo un intervallo."],
  ["Kullanılan: ", "Used: ", "Verbraucht: ", "Использовано: ", "Usado: ", "Usato: "],
  ["🗓️ İzin: kalan ", "🗓️ Leave: remaining ", "🗓️ Urlaub: Rest ", "🗓️ Отпуск: остаток ", "🗓️ Permiso: resta ", "🗓️ Ferie: restano "],
  [" gün (kullanılan ", " days (used ", " Tage (verbraucht ", " дн. (использовано ", " días (usado ", " giorni (usato "],
  ["İzin Talebi", "Leave Request", "Urlaubsantrag", "Запрос отпуска", "Solicitud de permiso", "Richiesta di permesso"],
  ["Geç Geleceğim", "I'll be late", "Ich komme später", "Опоздаю", "Llegaré tarde", "Arriverò in ritardo"],
  ["Telafi Edeceğim (fazla mesai ile)", "I'll compensate (with overtime)", "Ich gleiche aus (mit Überstunden)", "Отработаю (сверхурочно)", "Compensaré (con horas extra)", "Recupererò (con straordinari)"],
  ["Eksik Mesai", "Undertime", "Minusstunden", "Недоработка", "Horas de menos", "Ore in meno"],
  ["Fazla Mesai", "Overtime", "Überstunden", "Сверхурочные", "Horas extra", "Straordinari"],
  ["Gün", "Days", "Tage", "Дни", "Días", "Giorni"],
  ["Tarih (opsiyonel)", "Date (optional)", "Datum (optional)", "Дата (необязательно)", "Fecha (opcional)", "Data (facoltativa)"],
  ["Talep Gönder", "Send Request", "Anfrage senden", "Отправить запрос", "Enviar solicitud", "Invia richiesta"],
  ["Gün veya saat girin.", "Enter days or hours.", "Tage oder Stunden eingeben.", "Укажите дни или часы.", "Ingrese días u horas.", "Inserisci giorni o ore."],
  ["Bekleyen Talepler (", "Pending Requests (", "Offene Anfragen (", "Ожидающие запросы (", "Solicitudes pendientes (", "Richieste in sospeso ("],
  ["Bekleyen talep yok.", "No pending requests.", "Keine offenen Anfragen.", "Нет ожидающих запросов.", "No hay solicitudes pendientes.", "Nessuna richiesta in sospeso."],
  ["Mesai Durumu (Eksik / Fazla)", "Hours Balance (Under / Over)", "Stundensaldo (Minus / Plus)", "Баланс часов (недо / сверх)", "Balance de horas (menos / extra)", "Saldo ore (meno / extra)"],
  ["Geçmiş Talepler", "Past Requests", "Frühere Anfragen", "Прошлые запросы", "Solicitudes pasadas", "Richieste passate"],
  ["Taleplerim (", "My Requests (", "Meine Anfragen (", "Мои запросы (", "Mis solicitudes (", "Le mie richieste ("],
  ["Henüz talebiniz yok.", "You have no requests yet.", "Noch keine Anfragen.", "У вас пока нет запросов.", "Aún no tiene solicitudes.", "Ancora nessuna richiesta."],
  ["Mesai Durumunuz", "Your Hours Balance", "Ihr Stundensaldo", "Ваш баланс часов", "Su balance de horas", "Il tuo saldo ore"],
  ["Onayla", "Approve", "Genehmigen", "Одобрить", "Aprobar", "Approva"],
  ["Reddet", "Reject", "Ablehnen", "Отклонить", "Rechazar", "Rifiuta"],
  ["Onaylandı", "Approved", "Genehmigt", "Одобрено", "Aprobado", "Approvata"],
  ["Reddedildi", "Rejected", "Abgelehnt", "Отклонено", "Rechazado", "Rifiutata"],
  ["Beklemede", "Pending", "Ausstehend", "Ожидает", "Pendiente", "In attesa"],
  ["Not (opsiyonel)", "Note (optional)", "Notiz (optional)", "Заметка (необязательно)", "Nota (opcional)", "Nota (facoltativa)"],
  ["Fazla mesai & Telafi = alacak", "Overtime & Compensation = credit", "Überstunden & Ausgleich = Guthaben", "Сверхурочные и Отработка = плюс", "Horas extra y Compensación = a favor", "Straordinari e Recupero = credito"],
  ["Fazla & Telafi = alacak", "Overtime & Compensation = credit", "Überstunden & Ausgleich = Guthaben", "Сверхурочные и Отработка = плюс", "Horas extra y Compensación = a favor", "Straordinari e Recupero = credito"],
  ["İzin & Geç gelme & Eksik = borç", "Leave & Lateness & Undertime = debt", "Urlaub & Verspätung & Minusstunden = Schuld", "Отпуск и Опоздание и Недоработка = минус", "Permiso y Retraso y Horas de menos = deuda", "Permesso e Ritardo e Ore in meno = debito"],
  ["Sadece onaylanan talepler sayılır.", "Only approved requests are counted.", "Nur genehmigte Anfragen zählen.", "Учитываются только одобренные запросы.", "Solo se cuentan las solicitudes aprobadas.", "Vengono conteggiate solo le richieste approvate."],

  // --- Kayıtlar / tablolar ---
  ["Tarih aralığı", "Date range", "Datumsbereich", "Диапазон дат", "Rango de fechas", "Intervallo date"],
  ["Başlangıç", "Start", "Start", "Начало", "Inicio", "Inizio"],
  ["Bitiş", "End", "Ende", "Конец", "Fin", "Fine"],
  ["Filtrele", "Filter", "Filtern", "Фильтр", "Filtrar", "Filtra"],
  ["Temizle", "Clear", "Löschen", "Очистить", "Limpiar", "Pulisci"],
  ["Tamamlanan Görev Kayıtları (", "Completed Task Records (", "Erledigte Aufgaben-Aufzeichnungen (", "Записи выполненных задач (", "Registros de tareas completadas (", "Registri attività completate ("],
  ["Tamamlanma Saati", "Completion Time", "Erledigungszeit", "Время выполнения", "Hora de finalización", "Ora di completamento"],
  ["Tamamlayan", "Completed by", "Erledigt von", "Кем выполнено", "Completado por", "Completato da"],
  ["📊 Personel Performansı", "📊 Staff Performance", "📊 Personalleistung", "📊 Производительность персонала", "📊 Rendimiento del personal", "📊 Prestazioni del personale"],
  ["Açıklama: Tamamladığı = kişinin bizzat tamamladığı görev sayısı; Zamanında = gününde veya erken yapılan; Geç = sonradan yapılan; Geciken = ekipçe hiç yapılmamış (sorumlu olduğu); % = zamanında oranı.", "Note: Completed = tasks the person did themselves; On time = same day or early; Late = done afterwards; Overdue = not done by anyone on the team (assigned); % = on-time rate.", "Hinweis: Erledigt = vom Mitarbeiter selbst erledigte Aufgaben; Pünktlich = am Tag oder früher; Spät = nachträglich; Überfällig = vom Team gar nicht erledigt (zugewiesen); % = Pünktlichkeitsrate.", "Примечание: Выполнил = задачи, выполненные самим; Вовремя = в тот же день или раньше; Поздно = позже; Просрочено = не сделано всей командой (назначенные); % = доля вовремя.", "Nota: Completó = tareas hechas por la propia persona; A tiempo = el mismo día o antes; Tarde = después; Atrasado = nadie del equipo lo hizo (asignado); % = tasa a tiempo.", "Nota: Completate = attività svolte dalla persona; In orario = stesso giorno o prima; In ritardo = fatte dopo; In ritardo (team) = non fatte da nessuno (assegnate); % = percentuale puntuale."],
  ["Performans", "Performance", "Leistung", "Производительность", "Rendimiento", "Prestazioni"],

  // --- Paketler (müşteriye görünür) ---
  ["Paketler", "Plans", "Pakete", "Тарифы", "Planes", "Piani"],
  ["Deneme", "Trial", "Test", "Пробный", "Prueba", "Prova"],
  ["Profesyonel", "Professional", "Professionell", "Профи", "Profesional", "Professionale"],
  ["Kurumsal", "Enterprise", "Unternehmen", "Корпоративный", "Empresa", "Aziendale"],
  ["Sınırsız", "Unlimited", "Unbegrenzt", "Безлимит", "Ilimitado", "Illimitato"],
  ["Mevcut Paketiniz", "Your Current Plan", "Ihr aktuelles Paket", "Ваш текущий тариф", "Su plan actual", "Il tuo piano attuale"],
  ["/ay", "/mo", "/Mon.", "/мес", "/mes", "/mese"],
  ["Tüm özellikler her pakette vardır; fark kapasitededir. Yıllık ödemede 2 ay bedava.", "All features are in every plan; only capacity differs. Pay yearly, get 2 months free.", "Alle Funktionen in jedem Paket; nur die Kapazität unterscheidet sich. Jährlich zahlen, 2 Monate gratis.", "Все функции есть в каждом тарифе; различается только ёмкость. Оплата за год — 2 месяца бесплатно.", "Todas las funciones en cada plan; solo cambia la capacidad. Pago anual, 2 meses gratis.", "Tutte le funzioni in ogni piano; cambia solo la capacità. Pagamento annuale, 2 mesi gratis."],
  ["Paket yükseltmek için ", "To upgrade your plan, contact ", "Zum Upgrade kontaktieren Sie ", "Для апгрейда напишите ", "Para mejorar su plan, contacte ", "Per l'upgrade contatta "],
  ["⚠️ Paket süreniz doldu — Demo sürümdesiniz. Devam için ", "⚠️ Your plan has expired — you're on the Demo version. To continue, contact ", "⚠️ Ihr Paket ist abgelaufen — Demo-Version aktiv. Zum Fortfahren kontaktieren Sie ", "⚠️ Срок пакета истёк — у вас демо-версия. Для продолжения напишите ", "⚠️ Su plan ha caducado — está en la versión Demo. Para continuar, contacte ", "⚠️ Il tuo piano è scaduto — sei nella versione Demo. Per continuare contatta "],
  ["Süre (gün) — 0 veya boş = süresiz", "Duration (days) — 0 or empty = unlimited", "Dauer (Tage) — 0 oder leer = unbegrenzt", "Срок (дни) — 0 или пусто = бессрочно", "Duración (días) — 0 o vacío = ilimitado", "Durata (giorni) — 0 o vuoto = illimitato"],
  ["✅ Onay Yetkileri — talepleri kim onaylasın?", "✅ Approval rights — who approves requests?", "✅ Genehmigungsrechte — wer genehmigt Anträge?", "✅ Права одобрения — кто одобряет запросы?", "✅ Permisos de aprobación — ¿quién aprueba?", "✅ Diritti di approvazione — chi approva le richieste?"],
  ["İzin / Mesai talepleri", "Leave / Hours requests", "Urlaub / Stunden-Anträge", "Запросы отпуска / часов", "Solicitudes de permiso / horas", "Richieste permessi / ore"],
  ["Vardiya / değişiklik talepleri", "Shift / change requests", "Schicht- / Änderungsanträge", "Запросы смен / изменений", "Solicitudes de turno / cambio", "Richieste turno / modifica"],
  ["Sadece yönetici onaylar", "Only the manager approves", "Nur der Manager genehmigt", "Одобряет только менеджер", "Solo el gerente aprueba", "Solo il manager approva"],
  ["Şefler de (kendi personeli)", "Chefs too (their own staff)", "Auch Chefs (eigenes Personal)", "Также шефы (свой персонал)", "También los jefes (su personal)", "Anche i capi (proprio personale)"],
  ["Onayınızı Bekleyen Talepler (", "Requests Awaiting Your Approval (", "Auf Ihre Freigabe wartende Anträge (", "Запросы, ожидающие вашего одобрения (", "Solicitudes que esperan su aprobación (", "Richieste in attesa della tua approvazione ("],
  ["⏳ Paketinizin bitmesine ", "⏳ ", "⏳ ", "⏳ ", "⏳ ", "⏳ "],
  [" gün kaldı. Devam için iletişime geçin.", " days left on your plan. Contact us to continue.", " Tage bis zum Ablauf Ihres Pakets. Kontaktieren Sie uns.", " дн. до конца пакета. Свяжитесь с нами.", " días para que acabe su plan. Contáctenos.", " giorni alla scadenza del piano. Contattaci."],
  [" gün kaldı.", " days left on your plan.", " Tage bis zum Ablauf Ihres Pakets.", " дн. до конца пакета.", " días para que acabe su plan.", " giorni alla scadenza del piano."],
  ["Tamamladığı", "Completed", "Erledigt", "Выполнил", "Completó", "Completate"],
  ["Zamanında", "On time", "Pünktlich", "Вовремя", "A tiempo", "In orario"],
  ["Geç", "Late", "Spät", "Поздно", "Tarde", "In ritardo"],
  ["Kişi", "Person", "Person", "Человек", "Persona", "Persona"],
  ["Henüz tamamlanmış görev yok.", "No completed tasks yet.", "Noch keine erledigten Aufgaben.", "Пока нет выполненных задач.", "Aún no hay tareas completadas.", "Ancora nessuna attività completata."],
  ["Biten Görevler (", "Completed Tasks (", "Erledigte Aufgaben (", "Завершённые задачи (", "Tareas completadas (", "Attività completate ("],
  ["Seçilen aralıkta biten görev yok.", "No completed tasks in the selected range.", "Keine erledigten Aufgaben im gewählten Zeitraum.", "Нет выполненных задач в диапазоне.", "Sin tareas completadas en el rango.", "Nessuna attività completata nell'intervallo."],
  ["Görev", "Task", "Aufgabe", "Задача", "Tarea", "Attività"],
  ["Tarih", "Date", "Datum", "Дата", "Fecha", "Data"],
  ["Not", "Note", "Notiz", "Заметка", "Nota", "Nota"],

  // --- Genel kelimeler ---
  ["Görevler (", "Tasks (", "Aufgaben (", "Задачи (", "Tareas (", "Attività ("],
  ["Görevler", "Tasks", "Aufgaben", "Задачи", "Tareas", "Attività"],
  ["Durum", "Status", "Status", "Статус", "Estado", "Stato"],
  ["Kaydet", "Save", "Speichern", "Сохранить", "Guardar", "Salva"],
  ["İptal", "Cancel", "Abbrechen", "Отмена", "Cancelar", "Annulla"],
  ["Sil", "Delete", "Löschen", "Удалить", "Eliminar", "Elimina"],
  [" gün ", " day ", " Tg ", " дн ", " días ", " gg "],
  ["saat", "h", "Std", "ч", "h", "ore"],
  ["tamamladı", "completed it", "erledigt", "выполнил", "lo completó", "completata"],
  ["tarafından", "by", "von", "—", "por", "da"],
  ["Bekleyen", "Pending", "Offen", "Ожидающие", "Pendientes", "In attesa"],
  ["Görevlerini görmek için bir mekana tıklayın.", "Click a venue to see its tasks.", "Klicken Sie auf einen Standort, um die Aufgaben zu sehen.", "Нажмите на объект, чтобы увидеть задачи.", "Haga clic en un lugar para ver sus tareas.", "Clicca su una sede per vedere le attività."],
  ["Şef, atadığınız mekanlarda kendi personelini ekleyip onlara görev verebilir.", "The chef can add their own staff at assigned venues and assign them tasks.", "Der Chef kann an zugewiesenen Standorten eigenes Personal hinzufügen und ihm Aufgaben zuweisen.", "Шеф может добавлять свой персонал на назначенных объектах и давать им задачи.", "El jefe puede añadir su propio personal en los lugares asignados y asignarles tareas.", "Il capo può aggiungere il proprio personale nelle sedi assegnate e assegnare attività."],
  // sayaç metinlerindeki küçük harfli kelimeler (ör. "3 personel · 6 görev", "2 bekliyor")
  ["personel", "staff", "Mitarbeiter", "сотр.", "personal", "personale"],
  ["görev", "tasks", "Aufgaben", "задач", "tareas", "attività"],
  ["bekliyor", "waiting", "ausstehend", "ожидает", "pendiente", "in attesa"],
  ["gün", "day", "Tg", "дн", "día", "g"],

  // --- Kutucuk (placeholder) yazıları ---
  ["Not eklemek isterseniz (opsiyonel)...", "Add a note if you wish (optional)...", "Notiz hinzufügen (optional)...", "Добавьте заметку (необязательно)...", "Añada una nota (opcional)...", "Aggiungi una nota (facoltativo)..."],
  ["Ör: Mutfaktaki fırın arızalı / 5 kg deterjan lazım...", "e.g. The kitchen oven is broken / need 5 kg detergent...", "z.B. Der Küchenofen ist defekt / 5 kg Reiniger nötig...", "напр. Сломалась духовка / нужно 5 кг моющего...", "p.ej. El horno está averiado / faltan 5 kg de detergente...", "es. Il forno è guasto / servono 5 kg di detersivo..."],
  ["Ör: Doktor randevusu / yarın 2 saat geç geleceğim / cumartesi 3 saat fazla çalıştım...", "e.g. Doctor appointment / I'll be 2h late tomorrow / worked 3h extra on Saturday...", "z.B. Arzttermin / morgen 2 Std später / Samstag 3 Std mehr gearbeitet...", "напр. Приём у врача / завтра опоздаю на 2 ч / в субботу +3 ч...", "p.ej. Cita médica / mañana llego 2h tarde / trabajé 3h extra el sábado...", "es. Visita medica / domani 2h di ritardo / sabato 3h in più..."],
  ["Örn: Salonu hazırla", "e.g. Prepare the hall", "z.B. Saal vorbereiten", "напр. Подготовить зал", "p.ej. Preparar el salón", "es. Prepara la sala"],
  ["Detaylar...", "Details...", "Details...", "Подробности...", "Detalles...", "Dettagli..."],
  ["Örn: Merkez Şube", "e.g. Main Branch", "z.B. Hauptfiliale", "напр. Главный филиал", "p.ej. Sucursal central", "es. Sede centrale"],
  ["Adres", "Address", "Adresse", "Адрес", "Dirección", "Indirizzo"],
  ["Ahmet Yılmaz", "John Smith", "Max Mustermann", "Иван Иванов", "Juan Pérez", "Mario Rossi"],
  ["ahmet@local", "staff@example.com", "personal@beispiel.de", "сотрудник@пример.com", "personal@ejemplo.com", "staff@esempio.com"],
  ["mehmet@local", "chef@example.com", "chef@beispiel.de", "шеф@пример.com", "jefe@ejemplo.com", "capo@esempio.com"],
  ["kullanici@eposta.com", "user@email.com", "benutzer@email.de", "пользователь@почта.com", "usuario@correo.com", "utente@email.com"],
  ["Ör: Doktor randevum var, o gün izinli olmak istiyorum", "e.g. I have a doctor's appointment, I'd like that day off", "z.B. Ich habe einen Arzttermin, ich möchte den Tag frei", "напр. У меня приём у врача, хочу выходной в этот день", "p.ej. Tengo cita médica, quiero ese día libre", "es. Ho una visita medica, vorrei quel giorno libero"],
  ["Mehmet Şef", "Chef Mike", "Chef Max", "Шеф Иван", "Jefe Juan", "Capo Mario"],
  ["Not (ops.)", "Note (opt.)", "Notiz (opt.)", "Заметка", "Nota (opc.)", "Nota (facolt.)"],

  // --- Duyurular ---
  ["📢 Duyuru Yap", "📢 Make Announcement", "📢 Ankündigung machen", "📢 Сделать объявление", "📢 Hacer anuncio", "📢 Fai un annuncio"],
  ["Seçilen mekandaki tüm personele gider — kişi seçmenize gerek yok.", "Goes to all staff at the selected venue — no need to pick people.", "Geht an das gesamte Personal des gewählten Standorts — keine Auswahl nötig.", "Отправляется всему персоналу выбранного объекта — выбирать не нужно.", "Va a todo el personal del lugar seleccionado — no hace falta elegir personas.", "Va a tutto il personale della sede selezionata — non serve scegliere le persone."],
  ["Hedef mekan", "Target venue", "Zielstandort", "Целевой объект", "Lugar destino", "Sede destinazione"],
  ["Tüm Mekanlar (herkese)", "All Venues (everyone)", "Alle Standorte (alle)", "Все объекты (всем)", "Todos los lugares (todos)", "Tutte le sedi (tutti)"],
  ["Tüm Mekanlarım", "All My Venues", "Alle meine Standorte", "Все мои объекты", "Todos mis lugares", "Tutte le mie sedi"],
  ["Tüm Mekanlar", "All Venues", "Alle Standorte", "Все объекты", "Todos los lugares", "Tutte le sedi"],
  ["Mesaj", "Message", "Nachricht", "Сообщение", "Mensaje", "Messaggio"],
  ["Ör: Yarın saat 09:00'da toplantı var.", "e.g. There's a meeting tomorrow at 09:00.", "z.B. Morgen um 09:00 Uhr ist eine Besprechung.", "напр. Завтра в 09:00 совещание.", "p.ej. Mañana hay reunión a las 09:00.", "es. Domani riunione alle 09:00."],
  ["Duyuruyu Gönder", "Send Announcement", "Ankündigung senden", "Отправить объявление", "Enviar anuncio", "Invia annuncio"],
  ["Lütfen mesaj yazın.", "Please write a message.", "Bitte Nachricht eingeben.", "Введите сообщение.", "Escriba un mensaje.", "Scrivi un messaggio."],
  ["Duyurular (", "Announcements (", "Ankündigungen (", "Объявления (", "Anuncios (", "Annunci ("],
  ["Bu duyuru silinsin mi?", "Delete this announcement?", "Diese Ankündigung löschen?", "Удалить это объявление?", "¿Eliminar este anuncio?", "Eliminare questo annuncio?"],

  // --- Profil ---
  ["⚙️ Profil", "⚙️ Profile", "⚙️ Profil", "⚙️ Профиль", "⚙️ Perfil", "⚙️ Profilo"],
  ["Yeni Şifre (boş bırakırsanız değişmez)", "New password (leave blank to keep)", "Neues Passwort (leer = unverändert)", "Новый пароль (пусто = без изменений)", "Nueva contraseña (vacío = sin cambio)", "Nuova password (vuoto = invariata)"],
  ["Yeni Şifre (tekrar)", "New password (repeat)", "Neues Passwort (wiederholen)", "Новый пароль (повтор)", "Nueva contraseña (repetir)", "Nuova password (ripeti)"],
  ["Ad gerekli.", "Name is required.", "Name erforderlich.", "Требуется имя.", "Se requiere el nombre.", "Nome richiesto."],
  ["Şifreler uyuşmuyor.", "Passwords don't match.", "Passwörter stimmen nicht überein.", "Пароли не совпадают.", "Las contraseñas no coinciden.", "Le password non corrispondono."],
];

const I18N_SORTED = I18N_ROWS.slice().sort((a, b) => b[0].length - a[0].length);

// Harf mi? (Türkçe dahil) — kelime sınırı kontrolü için
const TR_LETTER = /[A-Za-zÀ-ÿğüşöçıİĞÜŞÖÇ]/;
function isTrLetter(ch) { return ch !== undefined && ch !== "" && TR_LETTER.test(ch); }

// Çeviri: yalnızca tam kelime/ifadeleri değiştirir.
// Anahtar bir harfle başlıyor/bitiyorsa, komşu karakter harf ise eşleşmeyi atlar.
// Böylece "Görevler" anahtarı "Görevlerini" kelimesini bozmaz.
function translateString(s, lang) {
  const idx = LANG_IDX[lang];
  if (!idx) return s;
  let out = s;
  for (const row of I18N_SORTED) {
    const key = row[0];
    if (out.indexOf(key) === -1) continue;
    const rep = row[idx];
    const keyStartsLetter = isTrLetter(key[0]);
    const keyEndsLetter = isTrLetter(key[key.length - 1]);
    let res = "";
    let i = 0;
    while (i < out.length) {
      if (out.startsWith(key, i)) {
        const leftOk = !keyStartsLetter || !isTrLetter(out[i - 1]);
        const rightOk = !keyEndsLetter || !isTrLetter(out[i + key.length]);
        if (leftOk && rightOk) { res += rep; i += key.length; continue; }
      }
      res += out[i];
      i++;
    }
    out = res;
  }
  return out;
}

function translateNode(root, lang) {
  if (!root || LANG_IDX[lang] === undefined) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    if (n.nodeValue && n.nodeValue.trim()) n.nodeValue = translateString(n.nodeValue, lang);
  });
  root.querySelectorAll("[placeholder]").forEach((el) => {
    if (el.placeholder) el.placeholder = translateString(el.placeholder, lang);
  });
}
