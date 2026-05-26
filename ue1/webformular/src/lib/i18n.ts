// Mini-i18n — DE + TR vollständig übersetzt (alle UI-Strings, alle
// Sections, alle FB-Felder I/II/III/IV).
//
// IT/RU/FR sind als Demo-Optionen im Picker sichtbar, aber bewusst leer:
// alle Lookups fallen auf DE zurück. Ein Banner unter dem Header weist
// den Bürger darauf hin („Übersetzung in Vorbereitung — Anzeige auf
// Deutsch"). Das spiegelt ehrlich wider, wo so ein Verwaltungsformular
// im Produktiv-Roll-out steht: geplant ja, fertig erst zwei Sprachen.
//
// Bewusst kein react-i18next: ein Schlüssel-Lookup + Fallback + ein
// kleiner Template-Helper (`tx`) für Variablen-Substitution reichen.

export type Sprache = "de" | "tr" | "it" | "ru" | "fr";

/** Sprachen, für die wir tatsächlich Übersetzungen pflegen. */
const VOLLSTAENDIG: ReadonlySet<Sprache> = new Set<Sprache>(["de", "tr"]);

/** Anzeige-Reihenfolge im Picker + Beschriftung + Endonym (Eigenname). */
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

/**
 * HTML-`lang`-Attribut: wenn die Übersetzung noch nicht vorliegt, geben
 * wir den DE-Code zurück — sonst lügen wir Screenreader an, die dann
 * französische Aussprache auf deutschen Text anwenden.
 */
function htmlLangFor(s: Sprache): string {
  return istUebersetzt(s) ? s : "de";
}

/** „Übersetzung in Vorbereitung"-Hinweis je gewählter Sprache. */
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

const STORAGE_KEY = "ue1.sprache";

const dict: Partial<Record<Sprache, Record<string, string>>> = {
  de: {
    // App
    "app.titel": "Förderantrag Altenhilfeplan",
    "app.subtitel": "Beratungsstelle für Senioren · Stadt Würzburg",
    "app.demohinweis": "Lehr-Demo der THWS — kein offizielles Angebot der Stadt Würzburg.",
    "app.demofooter": "Modul „Innovationsmanagement\" · BBA · 2026 ·",
    "app.quellcode": "Quellcode auf GitHub",
    "nav.sprache": "Sprache",
    "nav.breadcrumb_home": "Startseite",

    // Hero (FBWahl) und Cross-Link
    "hero.eyebrow": "Webformular",
    "hero.titel": "Antrag direkt online ausfüllen",
    "hero.beschreibung":
      "Sie füllen den Förderantrag Schritt für Schritt im Browser aus — ohne ausgedrucktes PDF. Die Eingaben werden direkt geprüft, Pflichtfelder sind gekennzeichnet.",
    "hero.pille.gefuehrt": "Schritt für Schritt geführt",
    "hero.pille.live": "Live-Prüfung der Eingaben",
    "hero.pille.sprachen": "Deutsch · Türkçe",
    "hero.pille.speicher": "Zwischenspeicherung im Browser",
    "cross.titel": "Antrag schon als PDF ausgefüllt?",
    "cross.lead": "Reichen Sie ihn direkt im PDF-Upload-Portal ein —",
    "cross.linktext": "upload.butscher.cloud ›",
    "phasen.preview.label": "So läuft Ihr Antrag ab",
    "phasen.preview.1": "Angaben zum Antragsteller",
    "phasen.preview.2": "Förderbereich-Details",
    "phasen.preview.3": "Anlagen & Absenden",

    // Wahl-Page
    "wahl.titel": "Welcher Förderbereich passt zu Ihrem Antrag?",
    "wahl.lead": "Wählen Sie einen der vier Förderbereiche. Sie können später noch wechseln.",
    "wahl.unsicher": "Sie sind sich unsicher? Mini-Wizard starten",
    "wahl.wizard.frage1": "Ist Ihr Angebot bereits etabliert oder neu im Aufbau?",
    "wahl.wizard.neu": "Neu im Aufbau",
    "wahl.wizard.etabliert": "Bereits etabliert (läuft seit längerem)",
    "wahl.wizard.frage2":
      "Geht es überwiegend um ehrenamtliches Engagement (Besuchsdienst, Helferkreis)?",
    "wahl.wizard.ja": "Ja",
    "wahl.wizard.nein": "Nein, etwas anderes",
    "wahl.wizard.vorschlag": "Empfehlung",
    "wahl.wizard.zumantrag": "Diesen Förderbereich wählen",
    "fb.cta.starten": "Antrag für FB {fb} starten",

    // FB-Beschreibungen (auf der Wahl-Karte)
    "fb_beschreibung.I":
      "Anschubfinanzierung, wenn Sie ein neues Angebot oder eine neue Engagementgruppe aufbauen — z.B. ein Nachbarschaftscafé oder einen neuen Besuchsdienst.",
    "fb_beschreibung.II":
      "Pauschale Förderung für bestehendes ehrenamtliches Engagement — Helferkreise, Besuchsdienste, Nachbarschaftshilfen. Helferliste erforderlich.",
    "fb_beschreibung.III":
      "Laufende Förderung etablierter Strukturen — Mehrgenerationenhaus, Begegnungszentrum, Seniorenkreis oder Quartiersmanagement. Vier Varianten zur Auswahl.",
    "fb_beschreibung.IV":
      "Individuelles Vorhaben, das nicht in die Förderbereiche I–III passt — Strukturförderung, Schwerpunktinitiative oder Pilotprojekt.",

    // Phase-Titel
    "phase.1.titel": "Angaben zum Antragsteller",
    "phase.2.titel": "Förderbereich-spezifische Angaben",
    "phase.3.titel": "Anlagen hochladen & Antrag absenden",
    "phase.1.lead":
      "Förderbereich {fb} — Pflichtfelder sind mit * markiert. Eingaben werden direkt geprüft.",
    "phase.3.lead":
      "Letzter Schritt: ggf. erforderliche Anlagen hochladen, Übersicht prüfen und Antrag absenden.",

    // Sections (Phase 1)
    "section.traeger": "Träger",
    "section.traeger.desc": "Dachverband, Einrichtung, Ansprechperson",
    "section.anschrift": "Anschrift",
    "section.anschrift.desc": "Straße, PLZ, Ort",
    "section.kontakt": "Kontakt",
    "section.kontakt.desc": "Telefon, E-Mail, Homepage",
    "section.bank": "Bankverbindung",
    "section.bank.desc": "Für die Auszahlung der Fördermittel",

    // Sections (FB-I)
    "section.fb1.projekt": "Projekt",
    "section.fb1.projekt.desc": "Titel, Laufzeit, Stadtteil",
    "section.fb1.kosten": "Kosten",
    "section.fb1.kosten.desc": "Personal- und Sachkosten in Euro",
    "section.fb1.dritt.desc": "Optional — Förderzusagen von Bund, Land, Dritten",

    // Sections (FB-II)
    "section.fb2.eck": "Eckdaten",
    "section.fb2.eck.desc": "Bezeichnung, Helferzahl und -stunden im Vorjahr",
    "section.fb2.helfer.desc": "Optional pro Person — Excel-Upload erfolgt in Phase 3",

    // Sections (FB-III)
    "section.fb3.variante": "Variante wählen",
    "section.fb3.zusatz": "Zusatzfelder · Variante {var} — {label}",
    "section.fb3.zusatz.warten": "Bitte oben eine Variante (A, B, C oder D) auswählen",
    "section.fb3.zusatz.desc": "Pflichtfelder je nach gewählter Variante",
    "section.fb3.zusatz.hint":
      "Sobald Sie oben eine Variante wählen, erscheinen hier die passenden Felder.",
    "section.fb3.zusatz.titel_warten": "Zusatzfelder erscheinen nach Varianten-Wahl",

    // Sections (FB-IV — formloser Antrag, siehe PDF-Audit 2026-05-26)
    "section.fb4.hinweis": "Hinweis zum Antrag",
    "section.fb4.hinweis.desc": "FB IV ist ein formloser Antrag — kein offizielles PDF-Formular",
    "section.fb4.upload": "Formloser Antrag (PDF)",
    "section.fb4.upload.desc": "Laden Sie Ihren selbst verfassten Antrag als PDF hoch",
    "section.fb4.klassifikation": "Klassifikations-Hilfe (optional)",
    "section.fb4.klassifikation.desc": "Optional: Titel + Kurzbeschreibung helfen der KI beim Vorsortieren",

    // Sections (Phase 3)
    "section.phase3.anlagen.desc.keine": "Für diesen Förderbereich keine Anlagen erforderlich",
    "section.phase3.anlagen.desc.pflicht": "{ok} von {total} Pflicht-Anlagen hochgeladen",
    "section.phase3.anlagen.desc.optional": "Anlagen sind optional",
    "section.phase3.anlagen.empty": "Für diesen Förderbereich sind keine Anlagen vorgesehen.",
    "section.phase3.uebersicht.desc": "Zusammenfassung Ihrer Eingaben vor dem Absenden",

    // Section-Status-Badges
    "status.bittepruefen": "Bitte prüfen",
    "status.fehler": "{n} Fehler",
    "status.inbearbeitung": "in Bearbeitung",
    "status.optional": "optional",
    "status.optionalhier": "optional hier",
    "status.hinweis": "Hinweis",
    "status.vollstaendig": "vollständig",
    "status.keineerf": "keine erforderlich",
    "status.wartetvariante": "wartet auf Variante",
    "status.vorabsenden": "vor Absenden prüfen",
    "status.posten": "{n} Posten",
    "status.fertig": "fertig",

    // Antragsteller-Felder
    "antragsteller.dachverband": "Dachverband",
    "antragsteller.einrichtung": "Einrichtung / Trägerorganisation",
    "antragsteller.ansprechpartner": "Ansprechpartner:in",
    "antragsteller.strasse": "Straße",
    "antragsteller.hausnummer": "Hausnummer",
    "antragsteller.plz": "PLZ",
    "antragsteller.ort": "Ort",
    "antragsteller.telefon": "Telefon",
    "antragsteller.email": "E-Mail",
    "antragsteller.homepage": "Homepage (optional)",
    "antragsteller.bankname": "Bankname",
    "antragsteller.iban": "IBAN",
    "antragsteller.bic": "BIC",
    "antragsteller.haushaltsjahr": "Haushaltsjahr",

    // FB I
    "fb1.titel": "Aufbau eines neuen Angebots",
    "fb1.lead":
      "Förderbereich I — Anschubfinanzierung für neue Angebote oder Engagementgruppen.",
    "fb1.projekt_titel": "Projekttitel",
    "fb1.laufzeit": "Laufzeit",
    "fb1.stadtteil": "Stadtteil",
    "fb1.personalkosten": "Personalkosten (EUR)",
    "fb1.sachkosten": "Sachkosten (EUR)",
    "fb1.drittmittel": "Drittmittel (optional)",
    "fb1.drittmittel.add": "+ Drittmittel hinzufügen",
    "fb1.drittmittel.geber": "Geber",
    "fb1.drittmittel.betrag": "Betrag €",
    "fb1.drittmittel.remove": "Posten {n} entfernen",

    // FB II
    "fb2.titel": "Bürgerschaftliches Engagement",
    "fb2.lead":
      "Förderbereich II — Pauschale Förderung für bestehendes ehrenamtliches Engagement. Eine Helferliste ist in Phase 3 als Anlage erforderlich.",
    "fb2.ehrenamt_titel": "Bezeichnung des Ehrenamts",
    "fb2.helfer_vorjahr": "Anzahl Helfer:innen im Vorjahr",
    "fb2.helferstunden_vorjahr": "Gesamt-Helferstunden Vorjahr",
    "fb2.kontakt_senioren": "Direkter Kontakt zu Senior:innen",
    "fb2.helferliste": "Helfer-Liste",
    "fb2.helfer.add": "+ Helfer:in hinzufügen",
    "fb2.helfer.name": "Name",
    "fb2.helfer.vorname": "Vorname",
    "fb2.helfer.einsatz": "Einsatzbereich",
    "fb2.helfer.eintritt": "Eintritt",
    "fb2.helfer.austritt": "Austritt",
    "fb2.helfer.stunden_monat": "Stunden/Monat",
    "fb2.helfer.stunden_jahr": "Stunden/Jahr",
    "fb2.helfer.entfernen": "Entfernen",

    // FB III
    "fb3.titel": "Bewährte Strukturen — Variante wählen",
    "fb3.lead":
      "Wählen Sie zunächst die Variante Ihrer Einrichtung. Die Pflichtfelder ändern sich je nach Auswahl — Sie sehen nur die Felder, die zu Ihrer Variante gehören.",
    "fb3.variante.A": "Mehrgenerationenhaus",
    "fb3.variante.B": "Begegnungszentrum / Bildungsträger",
    "fb3.variante.C": "Seniorenkreis / Seniorentreffen",
    "fb3.variante.D": "Quartiersmanagement",
    "fb3.variante.fehlt": "Bitte Variante wählen.",
    "fb3.foerderhoechstgrenze": "Förderhöchstgrenze {eur}",
    "fb3.A.anmerkung": "Anmerkung (optional)",
    "fb3.A.hinweis":
      "Bitte laden Sie in Phase 3 die aktuelle Förderbestätigung des Bundesprogramms hoch.",
    "fb3.B.veranstaltungen": "Anzahl Veranstaltungen",
    "fb3.B.teilnehmer_senioren": "Teilnehmer Senior:innen",
    "fb3.B.teilnehmer_generationen": "Teilnehmer generationenübergreifend",
    "fb3.B.stadtbewohner_anteil": "Anteil Würzburger:innen (0–1)",
    "fb3.B.stadtbewohner_anteil_fehler": "Bitte Wert zwischen 0 und 1 angeben.",
    "fb3.B.quartierstreffen": "An Quartierstreffen teilgenommen?",
    "fb3.B.quartiere": "Quartiere",
    "fb3.B.quartier_person": "Quartiers-Ansprechperson",
    "fb3.C.treffen_schwelle": "Treffen-Schwelle des Vorjahres",
    "fb3.C.treffen_bittewahl": "— bitte wählen —",
    "fb3.C.treffen_gt10": "Über 10 Treffen des Vorjahres",
    "fb3.C.treffen_gt20": "Über 20 Treffen des Vorjahres",
    "fb3.C.treffen_gt40": "Über 40 Treffen des Vorjahres",
    "fb3.C.teilnehmer_durchschnitt": "Teilnehmer:innen durchschnittlich pro Treffen",
    "fb3.C.quartier_anzahl": "An Quartierstreffen teilgenommen (Anzahl)",
    "fb3.C.quartier_kooperation": "In welchem Quartier sind Sie Kooperationspartner:in?",
    "fb3.C.quartier_person_name": "Name der Person, die an den Quartierstreffen teilgenommen hat",
    "fb3.D.hauptamt_name": "Hauptamtliche Person — Name",
    "fb3.D.hauptamt_stunden_woche": "Stunden pro Woche",
    "fb3.D.hauptamt_stunden_monat": "Stunden pro Monat (optional)",

    // FB IV — formloser Antrag (PDF-Upload Pflicht, Freitexte optional)
    "fb4.titel": "Schwerpunktförderung (formloser Antrag)",
    "fb4.lead":
      "Förderbereich IV ist ein formloser Antrag. Bitte laden Sie Ihren eigenen Antrag als PDF hoch.",
    "fb4.hinweis.body":
      "Förderbereich IV — Schwerpunktförderung ist ein formloser Antrag. Es gibt kein offizielles Antragsformular der Stadt Würzburg. Bitte laden Sie Ihren eigenen formlosen Antrag als PDF hoch.",
    "fb4.hinweis.link": "Informationen der Stadt Würzburg zum Antragswesen",
    "fb4.upload.label": "Formloser Antrag als PDF",
    "fb4.upload.hint": "Erlaubt: PDF · max. 10 MB",
    "fb4.upload.dateiname": "Datei",
    "fb4.upload.groesse": "{n} KB",
    "fb4.optional.titel": "Klassifikations-Hilfe (optional)",
    "fb4.optional.kurz":
      "Diese Angaben helfen der KI nur beim Vorsortieren — Sie müssen sie nicht ausfüllen.",
    "fb4.optional.label_titel": "Vorhaben-Titel (optional)",
    "fb4.optional.label_kurz": "Kurzbeschreibung (optional, max. 1000 Zeichen)",
    "fb4.kurz_rest": "{n} Zeichen verbleibend",

    // Anlagen
    "anlagen.titel": "Anlagen",
    "anlagen.pflicht": "Pflicht",
    "anlagen.optional": "optional",
    "anlagen.datei_waehlen": "Datei wählen oder hier ablegen",
    "anlagen.entfernen": "Entfernen",

    // Buttons
    "btn.weiter": "Weiter",
    "btn.zurueck": "Zurück",
    "btn.senden": "Antrag absenden",
    "btn.senden_lauft": "Wird gesendet…",
    "btn.start": "Antrag starten",

    // Übersicht
    "uebersicht.titel": "Übersicht vor dem Absenden",
    "uebersicht.antragsteller": "Antragsteller",
    "uebersicht.foerderbereich": "Förderbereich",
    "uebersicht.fb_angaben": "Förderbereich-Angaben",
    "uebersicht.anlagen": "Anlagen",
    "uebersicht.keine": "—",

    // Fehler
    "fehler.pflicht": "Dieses Feld ist erforderlich.",
    "fehler.email": "Bitte gültige E-Mail-Adresse angeben.",
    "fehler.plz": "Bitte 5-stellige PLZ eingeben.",
    "fehler.iban": "IBAN scheint ungültig.",
    "fehler.zu_lang": "Eingabe zu lang.",
    "fehler.negativ": "Wert darf nicht negativ sein.",
    "fehler.submit": "Das Absenden ist fehlgeschlagen. Bitte später erneut versuchen.",
    "fehler.anlage_pflicht": "Bitte alle Pflicht-Anlagen hochladen.",
    "fehler.fb4.dokument_pflicht": "Bitte laden Sie den formlosen Antrag als PDF hoch.",
    "fehler.fb4.dokument_typ": "Bitte eine PDF-Datei hochladen.",
    "fehler.fb4.dokument_zu_gross": "Datei zu groß (max. 10 MB).",

    // Danke
    "danke.titel": "Vielen Dank — Ihr Antrag ist eingegangen.",
    "danke.nummer_label": "Ihre Antragsnummer:",
    "danke.hinweis":
      "Sie erhalten in den kommenden Tagen eine Eingangsbestätigung per E-Mail. Bei Rückfragen geben Sie bitte diese Antragsnummer an.",
    "danke.zurueck": "Zur Startseite",
  },

  tr: {
    "app.titel": "Yaşlı Yardım Planı Başvurusu",
    "app.subtitel": "Würzburg Yaşlılar Danışma Merkezi",
    "app.demohinweis": "THWS eğitim demosu — Würzburg Şehri'nin resmi teklifi değildir.",
    "app.demofooter": "„İnovasyon Yönetimi\" Modülü · BBA · 2026 ·",
    "app.quellcode": "GitHub'daki kaynak kodu",
    "nav.sprache": "Dil",
    "nav.breadcrumb_home": "Ana sayfa",

    "hero.eyebrow": "Web formu",
    "hero.titel": "Başvuruyu doğrudan çevrimiçi doldurun",
    "hero.beschreibung":
      "Destek başvurusunu adım adım tarayıcıda doldurursunuz — yazdırılmış PDF'ye gerek yok. Girişler doğrudan kontrol edilir, zorunlu alanlar işaretlidir.",
    "hero.pille.gefuehrt": "Adım adım yönlendirilir",
    "hero.pille.live": "Girişlerin anlık kontrolü",
    "hero.pille.sprachen": "Almanca · Türkçe",
    "hero.pille.speicher": "Tarayıcıda otomatik ara kayıt",
    "cross.titel": "Başvuruyu PDF olarak doldurdunuz mu?",
    "cross.lead": "Doğrudan PDF Yükleme Portalı'na yükleyin —",
    "cross.linktext": "upload.butscher.cloud ›",
    "phasen.preview.label": "Başvurunuz nasıl ilerler",
    "phasen.preview.1": "Başvuru sahibi bilgileri",
    "phasen.preview.2": "Destek alanı detayları",
    "phasen.preview.3": "Ekler ve gönderme",

    "wahl.titel": "Hangi destek alanı sizin için uygun?",
    "wahl.lead": "Dört destek alanından birini seçin. Daha sonra değiştirebilirsiniz.",
    "wahl.unsicher": "Emin değil misiniz? Mini sihirbazı başlatın",
    "wahl.wizard.frage1": "Teklifiniz yerleşik mi yoksa yeni mi?",
    "wahl.wizard.neu": "Yeni — kuruluş aşamasında",
    "wahl.wizard.etabliert": "Yerleşik — bir süredir devam ediyor",
    "wahl.wizard.frage2": "Çoğunlukla gönüllü çalışma mı (ziyaret hizmeti, yardımcı grubu)?",
    "wahl.wizard.ja": "Evet",
    "wahl.wizard.nein": "Hayır, başka bir şey",
    "wahl.wizard.vorschlag": "Öneri",
    "wahl.wizard.zumantrag": "Bu alanı seç",
    "fb.cta.starten": "FB {fb} için başvuruyu başlat",

    "fb_beschreibung.I":
      "Yeni bir teklif veya yeni bir gönüllü grup kuruyorsanız başlangıç finansmanı — örn. bir komşuluk kafesi veya yeni bir ziyaret hizmeti.",
    "fb_beschreibung.II":
      "Mevcut gönüllü çalışma için götürü destek — yardımcı grupları, ziyaret hizmetleri, komşuluk yardımları. Yardımcı listesi gereklidir.",
    "fb_beschreibung.III":
      "Yerleşik yapılar için sürekli destek — kuşaklararası ev, buluşma merkezi, yaşlı çevresi veya mahalle yönetimi. Dört varyant seçilebilir.",
    "fb_beschreibung.IV":
      "FB I–III'e uymayan bireysel projeler — yapısal destek, odak girişimi veya pilot proje.",

    "phase.1.titel": "Başvuru sahibi bilgileri",
    "phase.2.titel": "Destek alanına özel bilgiler",
    "phase.3.titel": "Ekleri yükle ve gönder",
    "phase.1.lead":
      "Destek alanı {fb} — Zorunlu alanlar * ile işaretlidir. Girişler doğrudan kontrol edilir.",
    "phase.3.lead":
      "Son adım: gerekli ekleri yükleyin, özeti kontrol edin ve başvuruyu gönderin.",

    "section.traeger": "Taşıyıcı kuruluş",
    "section.traeger.desc": "Üst kuruluş, kurum, iletişim kişisi",
    "section.anschrift": "Adres",
    "section.anschrift.desc": "Sokak, posta kodu, şehir",
    "section.kontakt": "İletişim",
    "section.kontakt.desc": "Telefon, e-posta, internet sitesi",
    "section.bank": "Banka bilgileri",
    "section.bank.desc": "Destek ödemeleri için",

    "section.fb1.projekt": "Proje",
    "section.fb1.projekt.desc": "Başlık, süre, semt",
    "section.fb1.kosten": "Maliyetler",
    "section.fb1.kosten.desc": "Personel ve malzeme maliyetleri (Euro)",
    "section.fb1.dritt.desc": "İsteğe bağlı — Federal, eyalet veya üçüncü taraf destekleri",

    "section.fb2.eck": "Temel bilgiler",
    "section.fb2.eck.desc": "Adlandırma, geçen yıl yardımcı sayısı ve saatleri",
    "section.fb2.helfer.desc": "Kişi başına isteğe bağlı — Excel yükleme 3. aşamada yapılır",

    "section.fb3.variante": "Varyantı seçin",
    "section.fb3.zusatz": "Ek alanlar · Varyant {var} — {label}",
    "section.fb3.zusatz.warten": "Lütfen yukarıdan bir varyant (A, B, C veya D) seçin",
    "section.fb3.zusatz.desc": "Seçilen varyanta göre zorunlu alanlar",
    "section.fb3.zusatz.hint":
      "Yukarıdan bir varyant seçtiğinizde uygun alanlar burada görünecektir.",
    "section.fb3.zusatz.titel_warten": "Ek alanlar varyant seçildikten sonra görünür",

    "section.fb4.hinweis": "Başvuru bilgisi",
    "section.fb4.hinweis.desc": "FB IV serbest bir başvurudur — resmi PDF formu yoktur",
    "section.fb4.upload": "Serbest başvuru (PDF)",
    "section.fb4.upload.desc": "Kendi yazdığınız başvuruyu PDF olarak yükleyin",
    "section.fb4.klassifikation": "Sınıflandırma yardımı (isteğe bağlı)",
    "section.fb4.klassifikation.desc": "İsteğe bağlı: Başlık + kısa açıklama yapay zekânın ön sıralama yapmasına yardımcı olur",

    "section.phase3.anlagen.desc.keine": "Bu destek alanı için ek gerekmez",
    "section.phase3.anlagen.desc.pflicht": "{total} zorunlu ekten {ok} yüklendi",
    "section.phase3.anlagen.desc.optional": "Ekler isteğe bağlıdır",
    "section.phase3.anlagen.empty": "Bu destek alanı için ek öngörülmemiştir.",
    "section.phase3.uebersicht.desc": "Göndermeden önce girişlerinizin özeti",

    "status.bittepruefen": "Lütfen kontrol edin",
    "status.fehler": "{n} hata",
    "status.inbearbeitung": "işleniyor",
    "status.optional": "isteğe bağlı",
    "status.optionalhier": "burada isteğe bağlı",
    "status.hinweis": "Bilgi",
    "status.vollstaendig": "tamamlandı",
    "status.keineerf": "gerekli değil",
    "status.wartetvariante": "varyant seçimini bekliyor",
    "status.vorabsenden": "göndermeden önce kontrol edin",
    "status.posten": "{n} kalem",
    "status.fertig": "tamam",

    "antragsteller.dachverband": "Üst kuruluş (varsa)",
    "antragsteller.einrichtung": "Kurum / Taşıyıcı kuruluş",
    "antragsteller.ansprechpartner": "İletişim kişisi",
    "antragsteller.strasse": "Sokak",
    "antragsteller.hausnummer": "Bina no.",
    "antragsteller.plz": "Posta kodu",
    "antragsteller.ort": "Şehir",
    "antragsteller.telefon": "Telefon",
    "antragsteller.email": "E-posta",
    "antragsteller.homepage": "İnternet sitesi (isteğe bağlı)",
    "antragsteller.bankname": "Banka adı",
    "antragsteller.iban": "IBAN",
    "antragsteller.bic": "BIC",
    "antragsteller.haushaltsjahr": "Bütçe yılı",

    "fb1.titel": "Yeni bir teklifin kurulması",
    "fb1.lead":
      "Destek alanı I — Yeni teklifler veya gönüllü gruplar için başlangıç finansmanı.",
    "fb1.projekt_titel": "Proje başlığı",
    "fb1.laufzeit": "Süre",
    "fb1.stadtteil": "Semt",
    "fb1.personalkosten": "Personel maliyetleri (EUR)",
    "fb1.sachkosten": "Malzeme maliyetleri (EUR)",
    "fb1.drittmittel": "Üçüncü taraf fonları (isteğe bağlı)",
    "fb1.drittmittel.add": "+ Üçüncü taraf fonu ekle",
    "fb1.drittmittel.geber": "Veren kurum",
    "fb1.drittmittel.betrag": "Tutar €",
    "fb1.drittmittel.remove": "{n}. kalemi kaldır",

    "fb2.titel": "Vatandaşların gönüllü katılımı",
    "fb2.lead":
      "Destek alanı II — Mevcut gönüllü çalışma için götürü destek. Yardımcı listesi 3. aşamada ek olarak gereklidir.",
    "fb2.ehrenamt_titel": "Gönüllü çalışmanın adı",
    "fb2.helfer_vorjahr": "Geçen yıl yardımcı sayısı",
    "fb2.helferstunden_vorjahr": "Geçen yıl toplam yardımcı saati",
    "fb2.kontakt_senioren": "Yaşlılarla doğrudan temas",
    "fb2.helferliste": "Yardımcı listesi",
    "fb2.helfer.add": "+ Yardımcı ekle",
    "fb2.helfer.name": "Soyadı",
    "fb2.helfer.vorname": "Adı",
    "fb2.helfer.einsatz": "Görev alanı",
    "fb2.helfer.eintritt": "Başlangıç",
    "fb2.helfer.austritt": "Ayrılma",
    "fb2.helfer.stunden_monat": "Saat/ay",
    "fb2.helfer.stunden_jahr": "Saat/yıl",
    "fb2.helfer.entfernen": "Kaldır",

    "fb3.titel": "Yerleşik yapılar — varyant seçin",
    "fb3.lead":
      "Önce kurumunuzun varyantını seçin. Zorunlu alanlar seçime göre değişir — yalnızca varyantınıza ait alanları görürsünüz.",
    "fb3.variante.A": "Kuşaklararası ev",
    "fb3.variante.B": "Buluşma merkezi / Eğitim kuruluşu",
    "fb3.variante.C": "Yaşlı çevresi / Yaşlı buluşması",
    "fb3.variante.D": "Mahalle yönetimi",
    "fb3.variante.fehlt": "Lütfen bir varyant seçin.",
    "fb3.foerderhoechstgrenze": "Azami destek tutarı {eur}",
    "fb3.A.anmerkung": "Açıklama (isteğe bağlı)",
    "fb3.A.hinweis":
      "Lütfen 3. aşamada Federal program için güncel destek onayını yükleyin.",
    "fb3.B.veranstaltungen": "Etkinlik sayısı",
    "fb3.B.teilnehmer_senioren": "Katılımcı yaşlı sayısı",
    "fb3.B.teilnehmer_generationen": "Kuşaklararası katılımcılar",
    "fb3.B.stadtbewohner_anteil": "Würzburglu oranı (0–1)",
    "fb3.B.stadtbewohner_anteil_fehler": "Lütfen 0 ile 1 arasında bir değer girin.",
    "fb3.B.quartierstreffen": "Mahalle buluşmalarına katıldınız mı?",
    "fb3.B.quartiere": "Mahalleler",
    "fb3.B.quartier_person": "Mahalle iletişim kişisi",
    "fb3.C.treffen_schwelle": "Geçen yıl buluşma eşiği",
    "fb3.C.treffen_bittewahl": "— lütfen seçin —",
    "fb3.C.treffen_gt10": "Geçen yıl 10'dan fazla buluşma",
    "fb3.C.treffen_gt20": "Geçen yıl 20'den fazla buluşma",
    "fb3.C.treffen_gt40": "Geçen yıl 40'tan fazla buluşma",
    "fb3.C.teilnehmer_durchschnitt": "Buluşma başına ortalama katılımcı",
    "fb3.C.quartier_anzahl": "Mahalle buluşmalarına katılım (sayı)",
    "fb3.C.quartier_kooperation": "Hangi mahallede iş birliği ortağısınız?",
    "fb3.C.quartier_person_name": "Mahalle buluşmasına katılan kişinin adı",
    "fb3.D.hauptamt_name": "Tam zamanlı kişi — adı",
    "fb3.D.hauptamt_stunden_woche": "Haftalık saat",
    "fb3.D.hauptamt_stunden_monat": "Aylık saat (isteğe bağlı)",

    "fb4.titel": "Özel destek (serbest başvuru)",
    "fb4.lead":
      "Destek alanı IV serbest bir başvurudur. Lütfen kendi başvurunuzu PDF olarak yükleyin.",
    "fb4.hinweis.body":
      "Destek alanı IV — Özel destek serbest bir başvurudur. Würzburg Şehri için resmi bir başvuru formu yoktur. Lütfen kendi serbest başvurunuzu PDF olarak yükleyin.",
    "fb4.hinweis.link": "Würzburg Şehri başvuru süreci hakkında bilgi",
    "fb4.upload.label": "Serbest başvuru (PDF)",
    "fb4.upload.hint": "İzin verilen: PDF · en fazla 10 MB",
    "fb4.upload.dateiname": "Dosya",
    "fb4.upload.groesse": "{n} KB",
    "fb4.optional.titel": "Sınıflandırma yardımı (isteğe bağlı)",
    "fb4.optional.kurz":
      "Bu bilgiler yalnızca yapay zekânın ön sıralama yapmasına yardımcı olur — doldurmak zorunda değilsiniz.",
    "fb4.optional.label_titel": "Proje başlığı (isteğe bağlı)",
    "fb4.optional.label_kurz": "Kısa açıklama (isteğe bağlı, en fazla 1000 karakter)",
    "fb4.kurz_rest": "{n} karakter kaldı",

    "anlagen.titel": "Ekler",
    "anlagen.pflicht": "Zorunlu",
    "anlagen.optional": "isteğe bağlı",
    "anlagen.datei_waehlen": "Dosya seçin veya buraya bırakın",
    "anlagen.entfernen": "Kaldır",

    "btn.weiter": "Devam",
    "btn.zurueck": "Geri",
    "btn.senden": "Başvuruyu gönder",
    "btn.senden_lauft": "Gönderiliyor…",
    "btn.start": "Başvuruyu başlat",

    "uebersicht.titel": "Göndermeden önce özet",
    "uebersicht.antragsteller": "Başvuru sahibi",
    "uebersicht.foerderbereich": "Destek alanı",
    "uebersicht.fb_angaben": "Destek alanı bilgileri",
    "uebersicht.anlagen": "Ekler",
    "uebersicht.keine": "—",

    "fehler.pflicht": "Bu alan zorunludur.",
    "fehler.email": "Lütfen geçerli bir e-posta adresi girin.",
    "fehler.plz": "Lütfen 5 haneli posta kodu girin.",
    "fehler.iban": "IBAN geçersiz görünüyor.",
    "fehler.zu_lang": "Giriş çok uzun.",
    "fehler.negativ": "Değer negatif olamaz.",
    "fehler.submit": "Gönderim başarısız oldu. Lütfen daha sonra tekrar deneyin.",
    "fehler.anlage_pflicht": "Lütfen tüm zorunlu ekleri yükleyin.",
    "fehler.fb4.dokument_pflicht": "Lütfen serbest başvuruyu PDF olarak yükleyin.",
    "fehler.fb4.dokument_typ": "Lütfen bir PDF dosyası yükleyin.",
    "fehler.fb4.dokument_zu_gross": "Dosya çok büyük (en fazla 10 MB).",

    "danke.titel": "Teşekkürler — başvurunuz alındı.",
    "danke.nummer_label": "Başvuru numaranız:",
    "danke.hinweis":
      "Önümüzdeki günlerde e-posta ile bir alındı onayı alacaksınız. Geri bildirimlerde lütfen bu numarayı belirtin.",
    "danke.zurueck": "Ana sayfaya dön",
  },
};

const VALID: ReadonlySet<Sprache> = new Set(SPRACHEN.map((s) => s.code));

let aktuelle: Sprache = "de";

try {
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
    const saved = localStorage.getItem(STORAGE_KEY) as Sprache | null;
    if (saved && VALID.has(saved)) aktuelle = saved;
  }
} catch {
  // Privacy-Mode oder kaputtes Storage-Stub
}

export function getSprache(): Sprache {
  return aktuelle;
}

/** Event-Name, den React-Root abonniert, um den gesamten Baum bei
 *  Sprachwechsel neu zu mounten (`key={sprache}` Trick). Pure t()/tx()
 *  Reads triggern sonst kein Re-Render der Children. */
export const SPRACHE_CHANGED_EVENT = "ue1:sprache-changed";

export function setSprache(s: Sprache): void {
  if (!VALID.has(s)) return;
  if (s === aktuelle) return;
  aktuelle = s;
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
      localStorage.setItem(STORAGE_KEY, s);
    }
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

/**
 * Template-Variante von `t`: ersetzt `{name}`-Platzhalter im übersetzten
 * String durch Werte. Damit lassen sich Sätze mit Variablen sauber
 * übersetzen, ohne im Code DE/TR-Wortreihenfolge nachzubilden:
 *   tx("phase.1.lead", { fb: "I" })
 *   DE → „Förderbereich I — Pflichtfelder sind mit * markiert. …"
 *   TR → „Destek alanı I — Zorunlu alanlar * ile işaretlidir. …"
 */
export function tx(key: string, vars: Record<string, string | number>, lang?: Sprache): string {
  let s = t(key, lang);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
