// Mini-i18n — DE vollständig, TR Pflichtfeld-Labels + FB-Wahl.
// Bewusst kein react-i18next: ein Schlüssel-Lookup reicht.

export type Sprache = "de" | "tr";

const STORAGE_KEY = "ue1.sprache";

const dict: Record<Sprache, Record<string, string>> = {
  de: {
    "app.titel": "Förderantrag Altenhilfeplan",
    "app.subtitel": "Beratungsstelle für Senioren · Stadt Würzburg",
    "app.demohinweis": "Lehr-Demo der THWS — kein offizielles Angebot der Stadt Würzburg.",
    "nav.sprache": "Sprache",

    "wahl.titel": "Welcher Förderbereich passt zu Ihrem Antrag?",
    "wahl.lead": "Wählen Sie einen der vier Förderbereiche. Sie können später noch wechseln.",
    "wahl.unsicher": "Sie sind sich unsicher? Mini-Wizard starten",
    "wahl.wizard.frage1": "Ist Ihr Angebot bereits etabliert oder neu im Aufbau?",
    "wahl.wizard.neu": "Neu im Aufbau",
    "wahl.wizard.etabliert": "Bereits etabliert (läuft seit längerem)",
    "wahl.wizard.frage2": "Geht es überwiegend um ehrenamtliches Engagement (Besuchsdienst, Helferkreis)?",
    "wahl.wizard.ja": "Ja",
    "wahl.wizard.nein": "Nein, etwas anderes",
    "wahl.wizard.vorschlag": "Empfehlung",
    "wahl.wizard.zumantrag": "Diesen Förderbereich wählen",

    "phase.1.titel": "Angaben zum Antragsteller",
    "phase.2.titel": "Förderbereich-spezifische Angaben",
    "phase.3.titel": "Anlagen hochladen & Antrag absenden",

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

    "fb1.titel": "Aufbau eines neuen Angebots",
    "fb1.projekt_titel": "Projekttitel",
    "fb1.laufzeit": "Laufzeit",
    "fb1.stadtteil": "Stadtteil",
    "fb1.personalkosten": "Personalkosten (EUR)",
    "fb1.sachkosten": "Sachkosten (EUR)",
    "fb1.drittmittel": "Drittmittel (optional)",
    "fb1.drittmittel.add": "+ Drittmittel hinzufügen",

    "fb2.titel": "Bürgerschaftliches Engagement",
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
    "fb2.helfer.stunden_jahr": "Stunden/Jahr",
    "fb2.helfer.entfernen": "Entfernen",

    "fb3.titel": "Bewährte Strukturen — Variante wählen",
    "fb3.variante.A": "Mehrgenerationenhaus",
    "fb3.variante.B": "Begegnungszentrum / Bildungsträger",
    "fb3.variante.C": "Seniorenkreis / Seniorentreffen",
    "fb3.variante.D": "Quartiersmanagement",
    "fb3.A.anmerkung": "Anmerkung (optional)",
    "fb3.B.veranstaltungen": "Anzahl Veranstaltungen",
    "fb3.B.teilnehmer_senioren": "Teilnehmer Senior:innen",
    "fb3.B.teilnehmer_generationen": "Teilnehmer generationenübergreifend",
    "fb3.B.stadtbewohner_anteil": "Anteil Würzburger:innen (0–1)",
    "fb3.B.quartierstreffen": "An Quartierstreffen teilgenommen?",
    "fb3.C.treffen_schwelle": "Anzahl Treffen pro Jahr",
    "fb3.C.teilnehmer_durchschnitt": "Durchschnittliche Teilnehmer pro Treffen",
    "fb3.C.quartier_anzahl": "Quartierstreffen (Anzahl)",
    "fb3.D.hauptamt_name": "Hauptamtliche Person — Name",
    "fb3.D.hauptamt_stunden_woche": "Stunden pro Woche",
    "fb3.D.hauptamt_stunden_monat": "Stunden pro Monat (optional)",

    "fb4.titel": "Schwerpunkt-Vorhaben",
    "fb4.vorhaben_titel": "Vorhaben — Titel",
    "fb4.kurzbeschreibung": "Kurzbeschreibung (max. 1000 Zeichen)",
    "fb4.geplante_massnahmen": "Geplante Maßnahmen",
    "fb4.beantragte_summe": "Beantragte Summe (EUR)",
    "fb4.laufzeit": "Laufzeit",

    "anlagen.titel": "Anlagen",
    "anlagen.pflicht": "Pflicht",
    "anlagen.optional": "optional",
    "anlagen.datei_waehlen": "Datei wählen oder hier ablegen",
    "anlagen.entfernen": "Entfernen",

    "btn.weiter": "Weiter",
    "btn.zurueck": "Zurück",
    "btn.senden": "Antrag absenden",
    "btn.start": "Antrag starten",

    "uebersicht.titel": "Übersicht vor dem Absenden",
    "uebersicht.antragsteller": "Antragsteller",
    "uebersicht.foerderbereich": "Förderbereich",
    "uebersicht.fb_angaben": "Förderbereich-Angaben",
    "uebersicht.anlagen": "Anlagen",

    "fehler.pflicht": "Dieses Feld ist erforderlich.",
    "fehler.email": "Bitte gültige E-Mail-Adresse angeben.",
    "fehler.plz": "Bitte 5-stellige PLZ eingeben.",
    "fehler.iban": "IBAN scheint ungültig.",
    "fehler.zu_lang": "Eingabe zu lang.",
    "fehler.negativ": "Wert darf nicht negativ sein.",
    "fehler.submit": "Das Absenden ist fehlgeschlagen. Bitte später erneut versuchen.",
    "fehler.anlage_pflicht": "Bitte alle Pflicht-Anlagen hochladen.",

    "danke.titel": "Vielen Dank — Ihr Antrag ist eingegangen.",
    "danke.nummer_label": "Ihre Antragsnummer:",
    "danke.hinweis": "Sie erhalten in den kommenden Tagen eine Eingangsbestätigung per E-Mail. Bei Rückfragen geben Sie bitte diese Antragsnummer an.",
    "danke.zurueck": "Zur Startseite",
  },
  tr: {
    "app.titel": "Yaşlı Yardım Planı — Başvuru",
    "app.subtitel": "Würzburg Yaşlı Danışma Merkezi",
    "app.demohinweis": "THWS Eğitim demosu — Würzburg Şehri'nin resmi teklifi değildir.",
    "nav.sprache": "Dil",

    "wahl.titel": "Hangi destek alanı sizin için uygun?",
    "wahl.lead": "Dört destek alanından birini seçin. Daha sonra değiştirebilirsiniz.",
    "wahl.unsicher": "Emin değil misiniz? Mini sihirbazı başlatın",
    "wahl.wizard.frage1": "Teklifiniz yerleşik mi yoksa yeni mi?",
    "wahl.wizard.neu": "Yeni",
    "wahl.wizard.etabliert": "Yerleşik",
    "wahl.wizard.frage2": "Çoğunlukla gönüllü çalışma mı (ziyaret hizmeti, yardımcı grubu)?",
    "wahl.wizard.ja": "Evet",
    "wahl.wizard.nein": "Hayır, başka bir şey",
    "wahl.wizard.vorschlag": "Öneri",
    "wahl.wizard.zumantrag": "Bu alanı seç",

    "antragsteller.einrichtung": "Kurum / Taşıyıcı kuruluş",
    "antragsteller.ansprechpartner": "İletişim kişisi",
    "antragsteller.email": "E-posta",
    "antragsteller.plz": "Posta kodu",
    "antragsteller.iban": "IBAN",

    "btn.weiter": "Devam",
    "btn.zurueck": "Geri",
    "btn.senden": "Başvuruyu gönder",
    "btn.start": "Başvuruyu başlat",

    "danke.titel": "Teşekkürler — başvurunuz alındı.",
    "danke.nummer_label": "Başvuru numaranız:",
  },
};

let aktuelle: Sprache = "de";

try {
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "de" || saved === "tr") aktuelle = saved;
  }
} catch {
  // Privacy-Mode oder kaputtes Storage-Stub
}

export function getSprache(): Sprache {
  return aktuelle;
}

export function setSprache(s: Sprache): void {
  aktuelle = s;
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
      localStorage.setItem(STORAGE_KEY, s);
    }
  } catch { /* noop */ }
  if (typeof document !== "undefined") document.documentElement.lang = s;
}

export function t(key: string, lang?: Sprache): string {
  const l = lang ?? aktuelle;
  return dict[l]?.[key] ?? dict.de[key] ?? key;
}
