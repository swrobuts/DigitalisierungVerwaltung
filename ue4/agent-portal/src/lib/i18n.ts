// Mini-i18n für UE4 — analog UE0/UE1. DE + TR vollständig, IT/RU/FR im
// Picker sichtbar aber Fallback auf DE mit „Übersetzung in Vorbereitung"-
// Banner (ehrliche Spiegelung des Rollout-Standes — Übersetzungs-Stack
// für Verwaltungssprache ist nicht trivial).
//
// Die UI-Sprache steuert NUR die Chrome (Header/Footer/Placeholder/
// Onboarding/Starter-Chips). Die eigentliche Konversation mit dem
// Agenten läuft in der Sprache, in der die Bürgerin schreibt — der
// LLM antwortet automatisch in der Eingabesprache. Wir teilen dem
// Backend zusätzlich die gewählte UI-Sprache mit, damit der Agent
// einen vernünftigen Default hat, falls die Bürgerin nur „Hallo"
// schreibt und der Sprach-Hint nicht reicht.

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

const STORAGE_KEY = "ue4.sprache";

const dict: Partial<Record<Sprache, Record<string, string>>> = {
  de: {
    // Header
    "header.kommune": "Stadt Würzburg",
    "header.titel": "CIVA",
    "header.subtitel": "Digitaler Ansprechpartner der Stadtverwaltung",

    // Hero (Empty-State)
    "hero.greeting": "Hallo, ich bin CIVA.",
    "hero.subtitle": "Wie kann ich Ihnen helfen?",
    "hero.placeholder": "Schildern Sie kurz Ihr Anliegen …",
    "hero.send": "Senden",
    "hero.attach": "Beleg anhängen",
    "hero.attach.hint": "PDF, Bild oder Excel · max. 10 MB pro Datei",
    "hero.examples": "Beispiele",

    // Default-Eingabe (Chat-Verlauf-Modus)
    "input.placeholder": "Ihre Nachricht …",
    "input.helper": "Enter zum Senden · Shift+Enter = neue Zeile",

    // Starter-Chips
    "starter.begegnung": "Begegnungszentrum aufbauen",
    "starter.ehrenamt": "Ehrenamt fördern",
    "starter.quartier": "Quartiersarbeit",
    "starter.seniorenkreis": "Seniorenkreis",
    "starter.begegnung.prompt":
      "Wir möchten ein Begegnungszentrum für ältere Menschen aufbauen — wie kann uns die Stadt dabei unterstützen?",
    "starter.ehrenamt.prompt":
      "Unser Verein engagiert sich ehrenamtlich für Senioren — gibt es eine Pauschale, die wir beantragen können?",
    "starter.quartier.prompt":
      "Wir planen ein Quartiersmanagement in unserem Stadtteil — welche Fördermöglichkeiten gibt es?",
    "starter.seniorenkreis.prompt":
      "Wir betreiben einen wöchentlichen Seniorenkreis — können wir dafür Förderung beantragen?",

    // Meta-Bar unter dem Hero-Input
    "meta.session": "Sitzung",
    "meta.reset": "Neues Gespräch",
    "meta.reset.confirm": "Aktuelles Gespräch wirklich verwerfen?",
    "meta.language": "Sprache",

    // Sidebar — Onboarding (Empty-State)
    "side.howitworks": "So funktioniert CIVA",
    "side.step1.title": "Anliegen schildern",
    "side.step1.text":
      "Erzählen Sie in Ihren Worten, was Sie brauchen oder vorhaben.",
    "side.step2.title": "Passenden Weg finden",
    "side.step2.text":
      "CIVA klärt, welches städtische Angebot für Ihr Anliegen zuständig ist und fragt nur die wirklich nötigen Angaben ab.",
    "side.step3.title": "Vorgang übernehmen",
    "side.step3.text":
      "Am Ende leitet CIVA Ihre Angaben ans zuständige Online-Formular weiter — Sie prüfen und reichen ein.",
    "side.tip": "Tipp:",
    "side.tip.text":
      "Sie können Belege direkt im Chat anhängen — CIVA erkennt typische Antragsanlagen automatisch.",

    // Sidebar — Datenmodus
    "side.area": "Förderbereich",
    "side.applicant": "Antragsteller",
    "side.applicant.fields": "{n} von {total} Pflichtfeldern",
    "side.applicant.more": "{n} Felder offen",
    "side.submitted": "Antrag eingereicht",
    "side.submitted.text":
      "Die Sachbearbeitung meldet sich innerhalb von ca. 4 Wochen.",
    "side.disclaimer.title": "Reifegrad-Hinweis",
    "side.disclaimer.text":
      "Dieser Assistent zitiert keine § und nennt keine Förderhöhen. Beides steht im rechtssicheren Bescheid der Sachbearbeitung.",

    // Thinking
    "think.label": "CIVA denkt nach",
    "think.early": "CIVA verarbeitet Ihre Eingabe …",
    "think.mid": "Validiere Ihre Angaben mit den Förderregeln …",
    "think.late": "Letzter Schliff — bin gleich fertig.",

    // Footer
    "footer.imprint": "Impressum",
    "footer.privacy": "Datenschutz",
    "footer.accessibility": "Barrierefreiheit",
    "footer.ai_disclaimer":
      "KI-Transparenz (EU AI Act Art. 50): Sie sprechen mit einem KI-System (Anthropic Claude Sonnet 4.5).",
    "footer.why_civa": `Warum „CIVA"?`,
    "footer.why_civa.text": `CIVA leitet sich vom lateinischen civitas (Bürgerschaft, Gemeinwesen) ab. Bewusst ein Kunstname, kein menschlicher Vorname — denn ein Name wie „Anna" suggerierte, hier antworte ein Mensch. Tatsächlich antwortet ein KI-System; diese Transparenz fordert EU AI Act Art. 50.`,
  },
  tr: {
    // Header
    "header.kommune": "Würzburg Şehri",
    "header.titel": "CIVA",
    "header.subtitel": "Belediyenizin dijital iletişim noktası",

    // Hero
    "hero.greeting": "Merhaba, ben CIVA.",
    "hero.subtitle": "Size nasıl yardımcı olabilirim?",
    "hero.placeholder": "Lütfen talebinizi kısaca anlatın …",
    "hero.send": "Gönder",
    "hero.attach": "Belge ekle",
    "hero.attach.hint": "PDF, görsel veya Excel · dosya başına en fazla 10 MB",
    "hero.examples": "Örnekler",

    // Default
    "input.placeholder": "Mesajınız …",
    "input.helper":
      "Göndermek için Enter · Shift+Enter = yeni satır",

    // Starter
    "starter.begegnung": "Buluşma merkezi kurmak",
    "starter.ehrenamt": "Gönüllülüğü desteklemek",
    "starter.quartier": "Mahalle çalışması",
    "starter.seniorenkreis": "Yaşlılar grubu",
    "starter.begegnung.prompt":
      "Yaşlılar için bir buluşma merkezi kurmak istiyoruz — şehir bize nasıl destek olabilir?",
    "starter.ehrenamt.prompt":
      "Derneğimiz yaşlılar için gönüllü çalışıyor — başvurabileceğimiz bir götürü destek var mı?",
    "starter.quartier.prompt":
      "Mahallemizde bir mahalle yönetimi planlıyoruz — hangi destek olanakları var?",
    "starter.seniorenkreis.prompt":
      "Haftalık bir yaşlılar grubu yürütüyoruz — bunun için destek başvurusu yapabilir miyiz?",

    // Meta-Bar
    "meta.session": "Oturum",
    "meta.reset": "Yeni konuşma",
    "meta.reset.confirm": "Mevcut konuşma gerçekten silinsin mi?",
    "meta.language": "Dil",

    // Sidebar Onboarding
    "side.howitworks": "CIVA nasıl çalışır",
    "side.step1.title": "Talebinizi anlatın",
    "side.step1.text":
      "İhtiyacınızı veya planınızı kendi sözlerinizle anlatın.",
    "side.step2.title": "Doğru yolu bulun",
    "side.step2.text":
      "CIVA hangi belediye hizmetinin sizin için yetkili olduğunu belirler ve yalnızca gerçekten gerekli olan bilgileri sorar.",
    "side.step3.title": "İşlemi devralın",
    "side.step3.text":
      "Sonunda CIVA bilgilerinizi yetkili çevrim içi forma aktarır — siz kontrol edip gönderirsiniz.",
    "side.tip": "İpucu:",
    "side.tip.text":
      "Belgeleri doğrudan sohbete ekleyebilirsiniz — CIVA tipik başvuru eklerini otomatik tanır.",

    // Datenmodus
    "side.area": "Destek alanı",
    "side.applicant": "Başvuru sahibi",
    "side.applicant.fields": "{total} zorunlu alandan {n} adet",
    "side.applicant.more": "{n} alan eksik",
    "side.submitted": "Başvuru gönderildi",
    "side.submitted.text":
      "İlgili birim yaklaşık 4 hafta içinde sizinle iletişime geçer.",
    "side.disclaimer.title": "Olgunluk düzeyi notu",
    "side.disclaimer.text":
      "Bu asistan paragraf alıntılamaz ve destek tutarlarını söylemez. Her ikisi de yetkili biriminizin yasal olarak bağlayıcı kararında yer alır.",

    // Thinking
    "think.label": "CIVA düşünüyor",
    "think.early": "CIVA girdinizi işliyor …",
    "think.mid": "Bilgilerinizi destek kurallarıyla doğruluyorum …",
    "think.late": "Son rötuşlar — neredeyse bitti.",

    // Footer
    "footer.imprint": "Künye",
    "footer.privacy": "Veri koruma",
    "footer.accessibility": "Erişilebilirlik",
    "footer.ai_disclaimer":
      "Yapay zeka şeffaflığı (AB AI Yasası Madde 50): Bir yapay zeka sistemiyle konuşuyorsunuz (Anthropic Claude Sonnet 4.5).",
    "footer.why_civa": `Neden „CIVA"?`,
    "footer.why_civa.text": `CIVA, Latince civitas (vatandaşlık, topluluk) kelimesinden türetilmiştir. Bilinçli olarak insan adı değil bir sanat adı — çünkü „Anna" gibi bir isim burada bir insanın yanıt verdiği izlenimini yaratırdı. Aslında bir yapay zeka sistemi yanıt veriyor; bu şeffaflığı AB AI Yasası Madde 50 zorunlu kılmaktadır.`,
  },
};

const VALID = new Set<Sprache>(SPRACHEN.map((s) => s.code));

function initial(): Sprache {
  try {
    const ls =
      typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (ls && VALID.has(ls as Sprache)) return ls as Sprache;
  } catch {
    // ignore
  }
  return "de";
}

let aktuelle: Sprache = initial();

if (typeof document !== "undefined") {
  document.documentElement.lang = htmlLangFor(aktuelle);
}

export function getSprache(): Sprache {
  return aktuelle;
}

export const SPRACHE_CHANGED_EVENT = "ue4:sprache-changed";

export function setSprache(s: Sprache): void {
  if (!VALID.has(s)) return;
  if (s === aktuelle) return;
  aktuelle = s;
  try {
    if (typeof localStorage !== "undefined") {
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
