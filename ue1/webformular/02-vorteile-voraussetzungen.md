# 02 — Vorteile, Grenzen, Voraussetzungen

## Was diese Stufe gewinnt

| Aspekt | PDF heute | Webformular UE1 |
|--------|-----------|------------------|
| Erfassungsfehler | hoch (Handschrift, Scan) | niedrig (digitale Eingabe) |
| Pflichtfeld-Vergessen | häufig | wird sofort markiert |
| IBAN-Fehler | erst bei Banküberweisung sichtbar | sofort durch Mod-97-Check |
| Anlagen vergessen | typisch | Webform meckert vor Submit |
| Sprachbarriere | nur deutsch | DE + IT + TR + ES (Integrations-Aspekt) |
| Barrierearmut | schwer (Scan-PDFs oft nicht screenreader-tauglich) | mit ARIA umsetzbar |
| Wiedererkennung | nur PDF-Briefkopf | optisch an der CI der Stadt Würzburg orientiert |

## Was diese Stufe nicht löst

- **Keine Eingangsbestätigung per Mail** (UE2)
- **Kein Status-Tracking** („Wo ist mein Antrag?" — UE2)
- **Keine Sachbearbeiter-Sicht** (UE2)
- **Kein medienbruchfreier Eingang ins Amt** — am Ende erfasst immer noch jemand das PDF im Amt
- **Keine semantische Prüfung** gegen die Förderrichtlinie (UE3)
- **Keine Auskunftsfähigkeit** zur Rechtsgrundlage (UE4)
- **Keine automatisierte Bearbeitung** im Amt (UE5)
- **Übersetzungen sind Demo-Qualität** — in Produktion müssten Fachübersetzer ran, gerade bei juristischen Termini

## Voraussetzungen für diese Stufe

### Technisch
- Webhosting (statische Datei reicht — GitHub Pages, S3, Nginx)
- Keine Datenbank, keine Serverlogik
- Aktueller Browser (Chrome / Firefox / Safari / Edge)
- Eine Supabase-Instanz mit dem Schema `apl2` und dem Storage-Bucket `antragsbelege` (siehe
  [supabase/README.md](../../supabase/README.md))
- Eine deployte Edge Function `submit-antrag` (Deno)
- Bei externer Erreichbarkeit der Supabase: Traefik/Reverse-Proxy mit PathPrefix-Filter, damit
  nur die submit-antrag-Function erreichbar ist (Schutz aller anderen Schemas in der Instanz)
- Für die GH-Pages-Demo: GitHub-Secrets `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

### Organisatorisch
- Niemand im Amt muss seinen Prozess ändern — Output bleibt ein PDF
- Webform muss von der zuständigen Stelle als „inoffizielles Hilfsmittel" akzeptiert sein
- Pflege der Felder bei jeder PDF-Änderung — manueller Sync nötig
- **Pflege der Übersetzungen** — bei jeder Änderung des Originals müssen alle Sprachen nachgezogen werden

### Rechtlich
- Da keine Daten gespeichert werden, **keine DSGVO-Pflichten** im engeren Sinn für die Formulareingaben
- **DSGVO ab jetzt voll relevant**: personenbezogene Daten werden gespeichert (Name, Anschrift,
  E-Mail, IP). In Produktion: AVV mit Hosting-Provider, Löschkonzept (z.B. 5 Jahre nach Bescheid),
  Verarbeitungsverzeichnis, Datenschutzhinweis im Formular
- Anon-Key ist im Frontend-Bundle sichtbar — Sicherheit kommt ausschließlich aus RLS + Edge-
  Function-Validation. Direktzugriff auf `apl2.antraege` für anon ist per RLS verboten.
- Bei externer Exposure der Supabase-Instanz: alle anderen Schemas müssen ebenfalls RLS haben,
  sonst öffnet der anon-Key Türen in fremde Daten
- **Schrems II / Google Fonts:** Das Demo bindet Spectral + Inter über `fonts.googleapis.com` ein. Jeder Seitenaufruf erzeugt einen Request an Google in den USA — in einer offiziellen Verwaltungs-Anwendung ist das nach BayLfD und mehreren OLG-Urteilen unzulässig. In Produktion müssten die Fonts **self-hosted** sein.
- Hinweis im Formular nötig, dass die Daten lokal bleiben (Demo-Banner)
- Bei späteren Stufen (Submit ans Amt) greift die volle DSGVO-Mechanik
- Bei mehrsprachigen amtlichen Texten: Verbindlichkeitsfrage klären (in DE bleibt der deutsche Wortlaut maßgeblich)

### CI-rechtlich (Stadt Würzburg)
- Das Demo nutzt **nicht** das offizielle Stadtlogo / Signet (proprietär, dessen Nutzung erfordert Genehmigung der Pressestelle `pressestelle@stadt.wuerzburg.de`)
- Stattdessen: **historisches Stadtwappen** als SVG aus Wikimedia Commons (gemeinfrei) + Wortmarke „Stadt Würzburg"
- **Echte CI-Farben aus wuerzburg.de gemessen** (2026-05-17, aus `/index.css`):
  - Würzburg-Rot `#AD0E36` (in `#menucontainer .topmenulink.parent`)
  - Akzent-Orange `#FF680E` (in `.arrow:hover` für Slider-Pfeile)
- **Schrift Open Sans** — wie die Stadt selbst (selfhosted via `cdn.regiogate.net/font-packages/open-sans_all`); in unserer Demo via Google Fonts (Schrems-II-Hinweis siehe oben)
- Header-Layout angelehnt an die echte Stadt-Website: schmaler roter Akzent-Streifen oben, weißer Header mit Wappen + Wortmarke + Sprachumschalter (kein großes farbiges Banner)
- Der Disclaimer im Formular und im Footer macht klar: **kein offizielles Angebot der Stadt Würzburg**
