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
