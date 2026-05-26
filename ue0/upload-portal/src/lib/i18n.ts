// UE0-i18n — Vanilla-TS Pendant zur UE1-i18n.
// DE + TR vollständig übersetzt; IT/RU/FR sichtbar im Picker, fallen auf
// DE zurück und triggern den „Übersetzung in Vorbereitung"-Banner.
//
// Helper:
//   t(key)                – einfacher Lookup mit DE-Fallback
//   tx(key, vars)         – Template mit {name}-Substitution
//   setSprache(s)         – speichert + setzt html.lang + dispatcht 'ue0:sprache'-Event
//   getSprache()          – aktueller Wert
//   istUebersetzt(s)      – true für DE/TR
//   hinweisUnfertig(s)    – Banner-Text in der gewählten Sprache
//   applyDomI18n(root)    – ersetzt textContent aller [data-i18n] im Subtree

export type Sprache = "de" | "tr" | "it" | "ru" | "fr";

const VOLLSTAENDIG: ReadonlySet<Sprache> = new Set<Sprache>(["de", "tr"]);

export const SPRACHEN: ReadonlyArray<{
  code: Sprache;
  label: string;
  endonym: string;
  fertig: boolean;
}> = [
  { code: "de", label: "DE", endonym: "Deutsch", fertig: true },
  { code: "tr", label: "TR", endonym: "Türkçe", fertig: true },
  { code: "it", label: "IT", endonym: "Italiano", fertig: false },
  { code: "ru", label: "RU", endonym: "Русский", fertig: false },
  { code: "fr", label: "FR", endonym: "Français", fertig: false },
];

export function istUebersetzt(s: Sprache): boolean {
  return VOLLSTAENDIG.has(s);
}

function htmlLangFor(s: Sprache): string {
  return istUebersetzt(s) ? s : "de";
}

const HINWEIS_UNFERTIG: Record<Sprache, string> = {
  de: "",
  tr: "",
  it: "Traduzione in preparazione — al momento la pagina è in tedesco.",
  ru: "Перевод готовится — страница пока на немецком языке.",
  fr: "Traduction en préparation — la page est actuellement en allemand.",
};
export function hinweisUnfertig(s: Sprache): string {
  return HINWEIS_UNFERTIG[s] ?? "";
}

const STORAGE_KEY = "ue0.sprache";

const dict: Partial<Record<Sprache, Record<string, string>>> = {
  de: {
    // App / Header / Footer
    "app.titel": "Altenhilfeplan — Formularcenter (Demo)",
    "nav.barrierefreiheit": "Barrierefreiheit",
    "nav.suche": "Suche",
    "nav.menu": "☰ Menü",
    "nav.sprache": "Sprache",
    "breadcrumb.start": "Startseite",
    "breadcrumb.rathaus": "Rathaus",
    "breadcrumb.formularcenter": "Formularcenter",

    "footer.demo_banner_strong": "⚠ Demo-Webseite für Lehrzwecke (THWS).",
    "footer.demo_banner_text":
      "Dies ist kein offizielles Angebot der Stadt Würzburg. Optik und Texte orientieren sich am Original, der Upload-Workflow ist eine eigene KI-Demonstration. Hochgeladene Dokumente werden ausschließlich zur Demonstration verarbeitet und nach Vorlesungsende gelöscht — bitte keine echten personenbezogenen Daten verwenden.",
    "footer.link.notfall": "› Notfall",
    "footer.link.datenschutz": "› Datenschutz",
    "footer.link.impressum": "› Impressum",
    "footer.link.kontakt": "› Kontakt",
    "footer.link.newsletter": "› Newsletter",
    "footer.link.barrierefreiheit": "› Barrierefreiheit",
    "footer.link.gebaerden": "› Gebärdensprache",
    "footer.link.leichte": "› Leichte Sprache",
    "footer.stadt": "Stadt Würzburg",
    "footer.tourist": "Tourist Information & Ticket Service",
    "footer.tourist_addr": "im Falkenhaus am Markt",
    "footer.agb": "Allgemeine Geschäftsbedingungen",
    "footer.bottom":
      "© 2026 Stadt Würzburg. Alle Rechte vorbehalten. · Demo-Klon der Lehrveranstaltung THWS · Quelle:",

    "addr.titel": "Adresse",
    "addr.org": "Seniorenarbeit in der Stadt Würzburg",
    "addr.tel_label": "Telefon",
    "addr.fax_label": "Fax",
    "addr.email_label": "E-Mail",
    "addr.email_link": "Kontakt aufnehmen",

    // FB-Wahl (Einstieg)
    "wahl.eyebrow": "PDF-Upload-Portal",
    "wahl.titel": "Altenhilfeplan — Antrag einreichen",
    "wahl.lead":
      "Die Stadt Würzburg fördert Altenhilfe-Träger in vier Förderbereichen. Wählen Sie unten den passenden Bereich — oder lassen Sie ein vorhandenes Antrags-PDF von der KI automatisch zuordnen.",
    "cross.titel": "Kein PDF zur Hand?",
    "cross.lead": "Sie können den Antrag auch direkt online ausfüllen —",
    "cross.linktext": "antrag.butscher.cloud ›",

    "wege.headline": "Es gibt zwei Wege ans Ziel",
    "wege.a.badge": "Weg A",
    "wege.a.titel": "PDF hochladen — KI macht den Rest",
    "wege.a.desc":
      "Sie haben ein ausgefülltes Antrags-PDF (auch handschriftlich)? Die KI liest es aus und befüllt das Webformular vor — Sie müssen nur noch prüfen und absenden.",
    "wege.a.step1": "PDF hochladen",
    "wege.a.step2": "KI liest aus + Webformular wird vorausgefüllt",
    "wege.a.step3": "Prüfen und absenden",
    "wege.a.cta": "Smart-Upload starten",
    "wege.b.badge": "Weg B",
    "wege.b.titel": "Förderbereich selbst wählen",
    "wege.b.desc":
      "Sie kennen Ihren Förderbereich? Wählen Sie ihn unten direkt aus und laden Sie das ausgefüllte PDF in den passenden Slot — keine KI-Klassifikation nötig.",
    "wege.b.step1": "Förderbereich (FB I–IV) wählen",
    "wege.b.step2": "PDF + ggf. Anlage hochladen",
    "wege.b.step3": "Prüfen und absenden",
    "wege.b.hint": "Wählen Sie unten einen der vier Förderbereiche aus.",

    "trenner.wegb": "Weg B — Förderbereich wählen",

    "fb.cta.starten": "Antrag für FB {fb} starten",
    "fb.aria_label": "Förderbereich {fb}: {label}",
    "fb_beschreibung.I":
      "Anschubfinanzierung, wenn Sie ein neues Angebot oder eine neue Engagementgruppe aufbauen — z.B. ein Nachbarschaftscafé oder einen neuen Besuchsdienst.",
    "fb_beschreibung.II":
      "Pauschale Förderung für bestehendes ehrenamtliches Engagement — Helferkreise, Besuchsdienste, Nachbarschaftshilfen. Helferliste erforderlich.",
    "fb_beschreibung.III":
      "Laufende Förderung etablierter Strukturen — Mehrgenerationenhaus, Begegnungszentrum, Seniorenkreis oder Quartiersmanagement. Vier Varianten zur Auswahl.",
    "fb_beschreibung.IV":
      "Individuelles Vorhaben, das nicht in die Förderbereiche I–III passt — Strukturförderung, Schwerpunktinitiative oder Pilotprojekt. Strukturierter Antrag mit Leitfragen.",

    // FB-Upload
    "fbup.back": "‹ Zurück zur Förderbereich-Wahl",
    "fbup.heading": "FB {fb} — {label}",
    "fbup.slot.hauptantrag": "Hauptantrag",
    "fbup.slot.hauptantrag_pdf": "Antrag AHP {fb} (PDF zum Download)",
    "fbup.slot.hauptantrag_hint": "Nur PDF, max. 10 MB",
    "fbup.badge.pflicht": "Pflicht",
    "fbup.badge.optional": "Optional",
    "fbup.err_title": "Fehler beim Hochladen",
    "fbup.submit": "Antrag absenden",
    "fbup.submit_lauft": "Wird hochgeladen …",
    "anlage.projektskizze": "Projektskizze",
    "anlage.helferliste": "Helferliste",
    "anlage.foerderbestaetigung_bund": "Förderbestätigung Bundesprogramm",
    "anlage.programm_flyer": "Programm / Flyer",
    "anlage.stundenzettel": "Stundenzettel",
    "anlage.sonstige": "Beliebige Anlagen",

    "variantenwahl.titel": "Welche Variante trifft auf Ihre Einrichtung zu?",
    "variantenwahl.lead":
      "FB III ist in vier Varianten unterteilt. Bitte wählen Sie die, die Ihre Einrichtung beschreibt — die nachfolgende Anlage richtet sich danach.",
    "variantenwahl.label": "Variante {id}",
    "variantenwahl.grenze": "Förderhöchstgrenze {eur}",

    // Smart-Upload
    "smart.back": "‹ Zurück zur Förderbereich-Wahl",
    "smart.titel": "🤖 Smart-Upload",
    "smart.lead":
      "Laden Sie ein oder mehrere ausgefüllte Antrags-PDFs hoch. Die KI erkennt pro Datei den Förderbereich und (bei FB III) die Variante. Sie können den Vorschlag vor dem Absenden noch korrigieren.",
    "smart.dropzone.titel": "PDFs hochladen",
    "smart.dropzone.hint":
      "Mehrere PDFs gleichzeitig möglich. Pro Datei erkennt die KI Förderbereich + Variante.",
    "smart.submit": "Alle einreichen",
    "smart.submit_lauft": "Wird hochgeladen …",
    "smart.entfernen": "Entfernen",
    "smart.hinweis": "Hinweis",
    "smart.wird_klassifiziert": "Wird klassifiziert …",
    "smart.klass_fail": "Klassifikation fehlgeschlagen",
    "smart.klass_unknown": "Unbekannter Fehler",
    "smart.klass_manual_hint": "Bitte wählen Sie den Förderbereich manuell:",
    "smart.fb_keine_erkennung": "— (keine sichere Erkennung)",
    "smart.fb_label": "FB {fb} — {label}",
    "smart.fb_label_long": "FB {fb} — {label}",
    "smart.variant_label": " · Variante {v} ({label})",
    "smart.konfidenz": "Konfidenz {pct} — {grund}",
    "smart.unsicher": "⚠ Unsichere Erkennung: {label}",
    "smart.erkannt": "✓ Erkannt: {label}",
    "smart.foerderbereich_select": "Förderbereich:",
    "smart.variante_select": "Variante:",
    "smart.bitte_waehlen": "— bitte wählen —",
    "smart.eingereicht": "✓ Eingereicht (ID {id}…)",
    "smart.min_eine_datei":
      "Bitte mindestens eine Datei mit gewähltem Förderbereich vorbereiten.",
    "smart.queue_done": "{ok} von {total} Anträgen eingereicht. Klicken Sie auf eine eingereichte Datei für den Status (siehe unten).",
    "smart.status_link": "Status zu „{file}\" ansehen ›",

    // Status-Page
    "status.back": "‹ Neuen Antrag einreichen",
    "status.titel": "Eingangsbestätigung",
    "status.lead":
      "Ihr Antrag wird verarbeitet. Diese Seite aktualisiert sich automatisch, sobald die Bearbeitung abgeschlossen ist.",
    "status.tracking_id": "Tracking-ID:",
    "status.wartend.titel": "Antrag wird verarbeitet …",
    "status.wartend.detail":
      "Die KI liest gerade die Felder aus Ihrem PDF. Das dauert typischerweise 10–30 Sekunden. Diese Seite aktualisiert sich automatisch.",
    "status.ok.title": "✓ OCR abgeschlossen",
    "status.ok.title_fb": "✓ OCR abgeschlossen — FB {fb}",
    "status.ok.lead":
      "Ihr PDF wurde maschinell ausgelesen. Sie werden gleich zur Prüfung und Bestätigung weitergeleitet — bitte kontrollieren Sie dort die erkannten Werte und senden Sie den Antrag final ab.",
    "status.ok.manual":
      "Falls die Weiterleitung nicht automatisch erfolgt: Hier klicken, um zur Bestätigung zu wechseln.",
    "status.fail.title": "Verarbeitung fehlgeschlagen",
    "status.fail.kontakt": "Bitte kontaktieren Sie die Sachbearbeitung unter",
    "status.config_fail": "Konfigurationsfehler: ANON_KEY fehlt beim Build.",
    "status.timeout":
      "Zeitüberschreitung — die Verarbeitung dauert ungewöhnlich lange. Bitte später noch einmal die Seite neu laden oder den Support kontaktieren.",
    "status.not_found": "Keine Einreichung mit ID {id} gefunden.",
    "status.unknown_err": "Unbekannter Fehler bei der Verarbeitung.",
    "status.retry": "Neuen Antrag hochladen",
  },

  tr: {
    "app.titel": "Yaşlı Yardım Planı — Form merkezi (Demo)",
    "nav.barrierefreiheit": "Erişilebilirlik",
    "nav.suche": "Arama",
    "nav.menu": "☰ Menü",
    "nav.sprache": "Dil",
    "breadcrumb.start": "Ana sayfa",
    "breadcrumb.rathaus": "Belediye",
    "breadcrumb.formularcenter": "Form merkezi",

    "footer.demo_banner_strong": "⚠ THWS eğitim demosu için web sitesi.",
    "footer.demo_banner_text":
      "Bu Würzburg Şehri'nin resmi teklifi değildir. Görsel ve metinler orijinaline benzer, yükleme akışı kendi KI demonstrasyonumuzdur. Yüklenen belgeler yalnızca demonstrasyon amacıyla işlenir ve ders sonunda silinir — lütfen gerçek kişisel veri kullanmayın.",
    "footer.link.notfall": "› Acil",
    "footer.link.datenschutz": "› Veri koruma",
    "footer.link.impressum": "› Künye",
    "footer.link.kontakt": "› İletişim",
    "footer.link.newsletter": "› Bülten",
    "footer.link.barrierefreiheit": "› Erişilebilirlik",
    "footer.link.gebaerden": "› İşaret dili",
    "footer.link.leichte": "› Kolay dil",
    "footer.stadt": "Würzburg Şehri",
    "footer.tourist": "Turizm Bilgisi ve Bilet Servisi",
    "footer.tourist_addr": "Falkenhaus, Markt'ta",
    "footer.agb": "Genel İşlem Koşulları",
    "footer.bottom":
      "© 2026 Würzburg Şehri. Tüm hakları saklıdır. · THWS dersinin demo kopyası · Kaynak:",

    "addr.titel": "Adres",
    "addr.org": "Würzburg Şehri'nde Yaşlı Çalışması",
    "addr.tel_label": "Telefon",
    "addr.fax_label": "Faks",
    "addr.email_label": "E-posta",
    "addr.email_link": "İletişime geç",

    "wahl.eyebrow": "PDF Yükleme Portalı",
    "wahl.titel": "Yaşlı Yardım Planı — Başvuru gönder",
    "wahl.lead":
      "Würzburg Şehri, yaşlı yardımı taşıyıcılarını dört destek alanında destekler. Aşağıdan uygun alanı seçin — veya mevcut bir başvuru PDF'sini KI'ya otomatik atatın.",
    "cross.titel": "PDF elinizde yok mu?",
    "cross.lead": "Başvuruyu doğrudan çevrimiçi de doldurabilirsiniz —",
    "cross.linktext": "antrag.butscher.cloud ›",

    "wege.headline": "Hedefe iki yol var",
    "wege.a.badge": "Yol A",
    "wege.a.titel": "PDF yükleyin — KI gerisini halleder",
    "wege.a.desc":
      "Doldurulmuş bir başvuru PDF'niz mi var (el yazısı da olabilir)? KI bunu okur ve web formunu önceden doldurur — yalnızca kontrol edip göndermeniz gerekir.",
    "wege.a.step1": "PDF yükleyin",
    "wege.a.step2": "KI okur + web formu önceden doldurulur",
    "wege.a.step3": "Kontrol et ve gönder",
    "wege.a.cta": "Akıllı yüklemeyi başlat",
    "wege.b.badge": "Yol B",
    "wege.b.titel": "Destek alanını kendiniz seçin",
    "wege.b.desc":
      "Destek alanınızı biliyor musunuz? Aşağıdan doğrudan seçin ve doldurulmuş PDF'yi uygun alana yükleyin — KI sınıflandırması gerekmez.",
    "wege.b.step1": "Destek alanını (FB I–IV) seçin",
    "wege.b.step2": "PDF + gerekirse ek yükleyin",
    "wege.b.step3": "Kontrol et ve gönder",
    "wege.b.hint": "Aşağıdan dört destek alanından birini seçin.",

    "trenner.wegb": "Yol B — Destek alanını seçin",

    "fb.cta.starten": "FB {fb} için başvuruyu başlat",
    "fb.aria_label": "Destek alanı {fb}: {label}",
    "fb_beschreibung.I":
      "Yeni bir teklif veya yeni bir gönüllü grup kuruyorsanız başlangıç finansmanı — örn. bir komşuluk kafesi veya yeni bir ziyaret hizmeti.",
    "fb_beschreibung.II":
      "Mevcut gönüllü çalışma için götürü destek — yardımcı grupları, ziyaret hizmetleri, komşuluk yardımları. Yardımcı listesi gereklidir.",
    "fb_beschreibung.III":
      "Yerleşik yapılar için sürekli destek — kuşaklararası ev, buluşma merkezi, yaşlı çevresi veya mahalle yönetimi. Dört varyant seçilebilir.",
    "fb_beschreibung.IV":
      "FB I–III'e uymayan bireysel projeler — yapısal destek, odak girişimi veya pilot proje. Yönlendirici sorularla yapılandırılmış başvuru.",

    "fbup.back": "‹ Destek alanı seçimine geri dön",
    "fbup.heading": "FB {fb} — {label}",
    "fbup.slot.hauptantrag": "Ana başvuru",
    "fbup.slot.hauptantrag_pdf": "AHP {fb} başvurusu (PDF indir)",
    "fbup.slot.hauptantrag_hint": "Yalnızca PDF, en fazla 10 MB",
    "fbup.badge.pflicht": "Zorunlu",
    "fbup.badge.optional": "İsteğe bağlı",
    "fbup.err_title": "Yükleme hatası",
    "fbup.submit": "Başvuruyu gönder",
    "fbup.submit_lauft": "Yükleniyor …",
    "anlage.projektskizze": "Proje taslağı",
    "anlage.helferliste": "Yardımcı listesi",
    "anlage.foerderbestaetigung_bund": "Federal program destek onayı",
    "anlage.programm_flyer": "Program / Broşür",
    "anlage.stundenzettel": "Saat çizelgesi",
    "anlage.sonstige": "Diğer ekler",

    "variantenwahl.titel": "Hangi varyant kurumunuza uyar?",
    "variantenwahl.lead":
      "FB III dört varyanta ayrılmıştır. Lütfen kurumunuzu tanımlayanı seçin — sonraki ek bu seçime göre belirlenir.",
    "variantenwahl.label": "Varyant {id}",
    "variantenwahl.grenze": "Azami destek tutarı {eur}",

    "smart.back": "‹ Destek alanı seçimine geri dön",
    "smart.titel": "🤖 Akıllı yükleme",
    "smart.lead":
      "Bir veya daha fazla doldurulmuş başvuru PDF'sini yükleyin. KI her dosya için destek alanını ve (FB III'te) varyantı tanır. Göndermeden önce öneriyi düzeltebilirsiniz.",
    "smart.dropzone.titel": "PDF yükle",
    "smart.dropzone.hint":
      "Aynı anda birden fazla PDF mümkündür. Dosya başına KI destek alanını + varyantı tanır.",
    "smart.submit": "Hepsini gönder",
    "smart.submit_lauft": "Yükleniyor …",
    "smart.entfernen": "Kaldır",
    "smart.hinweis": "Bilgi",
    "smart.wird_klassifiziert": "Sınıflandırılıyor …",
    "smart.klass_fail": "Sınıflandırma başarısız",
    "smart.klass_unknown": "Bilinmeyen hata",
    "smart.klass_manual_hint": "Lütfen destek alanını manuel olarak seçin:",
    "smart.fb_keine_erkennung": "— (güvenli tanıma yok)",
    "smart.fb_label": "FB {fb} — {label}",
    "smart.fb_label_long": "FB {fb} — {label}",
    "smart.variant_label": " · Varyant {v} ({label})",
    "smart.konfidenz": "Güven {pct} — {grund}",
    "smart.unsicher": "⚠ Belirsiz tanıma: {label}",
    "smart.erkannt": "✓ Tanındı: {label}",
    "smart.foerderbereich_select": "Destek alanı:",
    "smart.variante_select": "Varyant:",
    "smart.bitte_waehlen": "— lütfen seçin —",
    "smart.eingereicht": "✓ Gönderildi (ID {id}…)",
    "smart.min_eine_datei":
      "Lütfen seçilmiş destek alanına sahip en az bir dosya hazırlayın.",
    "smart.queue_done": "{total} başvurudan {ok} tanesi gönderildi. Durum için aşağıdaki gönderilmiş dosyaya tıklayın.",
    "smart.status_link": "„{file}\" için durumu göster ›",

    "status.back": "‹ Yeni başvuru gönder",
    "status.titel": "Alındı onayı",
    "status.lead":
      "Başvurunuz işleniyor. Bu sayfa işlem tamamlandığında otomatik olarak güncellenir.",
    "status.tracking_id": "İzleme kimliği:",
    "status.wartend.titel": "Başvuru işleniyor …",
    "status.wartend.detail":
      "KI şu anda PDF'nizdeki alanları okuyor. Bu genellikle 10–30 saniye sürer. Bu sayfa otomatik olarak güncellenir.",
    "status.ok.title": "✓ OCR tamamlandı",
    "status.ok.title_fb": "✓ OCR tamamlandı — FB {fb}",
    "status.ok.lead":
      "PDF'niz makine tarafından okundu. Birazdan kontrol ve onay için yönlendirileceksiniz — lütfen orada tanınan değerleri kontrol edip başvuruyu nihai olarak gönderin.",
    "status.ok.manual":
      "Yönlendirme otomatik olarak gerçekleşmezse: Onaya geçmek için buraya tıklayın.",
    "status.fail.title": "İşlem başarısız",
    "status.fail.kontakt": "Lütfen ofisle iletişime geçin:",
    "status.config_fail": "Yapılandırma hatası: ANON_KEY derlemede eksik.",
    "status.timeout":
      "Zaman aşımı — işlem alışılmadık şekilde uzun sürüyor. Lütfen sayfayı daha sonra yeniden yükleyin veya destek ekibine başvurun.",
    "status.not_found": "{id} kimlikli başvuru bulunamadı.",
    "status.unknown_err": "İşlem sırasında bilinmeyen hata.",
    "status.retry": "Yeni başvuru yükle",
  },
};

const VALID: ReadonlySet<Sprache> = new Set(SPRACHEN.map((s) => s.code));

let aktuelle: Sprache = "de";

try {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY) as Sprache | null;
    if (saved && VALID.has(saved)) aktuelle = saved;
  }
} catch {
  /* noop */
}

export function getSprache(): Sprache {
  return aktuelle;
}

/** Custom-Event-Name, den die App auf `document` lauschen kann. */
export const SPRACHE_CHANGED_EVENT = "ue0:sprache-changed";

export function setSprache(s: Sprache): void {
  if (!VALID.has(s)) return;
  aktuelle = s;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, s);
  } catch {
    /* noop */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = htmlLangFor(s);
    document.dispatchEvent(new CustomEvent(SPRACHE_CHANGED_EVENT, { detail: s }));
  }
}

export function t(key: string, lang?: Sprache): string {
  const l = lang ?? aktuelle;
  return dict[l]?.[key] ?? dict.de?.[key] ?? key;
}

export function tx(
  key: string,
  vars: Record<string, string | number>,
  lang?: Sprache,
): string {
  let s = t(key, lang);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/**
 * Wendet i18n auf alle Elemente im Subtree mit `data-i18n="key"` an —
 * setzt textContent. Optional `data-i18n-attr-X="key"` setzt das Attribut X.
 * Wird beim Sprachwechsel automatisch im Layout-Listener neu aufgerufen.
 */
export function applyDomI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key) el.title = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute("aria-label", t(key));
  });
}
