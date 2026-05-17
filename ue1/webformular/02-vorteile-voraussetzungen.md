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

## Was diese Stufe nicht löst

- **Keine Persistenz** — Daten verschwinden beim Tab-Schließen
- **Keine Eingangsbestätigung** beim Antragsteller
- **Kein Status-Tracking** („Wo ist mein Antrag?")
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

### Organisatorisch
- Niemand im Amt muss seinen Prozess ändern — Output bleibt ein PDF
- Webform muss von der zuständigen Stelle als „inoffizielles Hilfsmittel" akzeptiert sein
- Pflege der Felder bei jeder PDF-Änderung — manueller Sync nötig
- **Pflege der Übersetzungen** — bei jeder Änderung des Originals müssen alle Sprachen nachgezogen werden

### Rechtlich
- Da keine Daten gespeichert werden, **keine DSGVO-Pflichten** im engeren Sinn
- Hinweis im Formular nötig, dass die Daten lokal bleiben (Demo-Banner)
- Bei späteren Stufen (Submit ans Amt) greift die volle DSGVO-Mechanik
- Bei mehrsprachigen amtlichen Texten: Verbindlichkeitsfrage klären (in DE bleibt der deutsche Wortlaut maßgeblich)
