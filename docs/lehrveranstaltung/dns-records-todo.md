# DNS-Records — Multi-FB-Subdomains anlegen

**Vor der VL morgen früh** im DNS-Provider (vermutlich Cloudflare oder Hetzner-DNS) anlegen:

## Neue A-Records → 72.61.83.18

| Subdomain | Zweck | Aktuell |
|---|---|---|
| `upload.butscher.cloud` | UE0 — PDF-Upload-Portal | fehlt |
| `antrag.butscher.cloud` | UE1 — Webformular | fehlt |
| `sachbearbeiter.butscher.cloud` | UE2 — Bearbeiter-Inbox | fehlt |
| `ki.butscher.cloud` | UE3 — KI-Sachbearbeitung | fehlt |
| `agent.butscher.cloud` | UE4 — Agent-Portal | fehlt |

## Bestehende A-Records (bleiben, Backward-Compat)

| Subdomain | Zweck |
|---|---|
| `amt.butscher.cloud` | UE2 (alter Name) |
| `amt-ki.butscher.cloud` | UE3 (alter Name) |
| `pruefung.butscher.cloud` | Backend |
| `supabase.butscher.cloud` | Supabase Studio + Kong |
| `n8n.butscher.cloud` | n8n-Workflows |

## DNS-Eintrag-Format (Cloudflare)

```
Type: A
Name: upload (bzw. antrag/sachbearbeiter/ki/agent)
Content: 72.61.83.18
TTL: Auto
Proxy: DNS only (grauer Wolken-Icon, NICHT orange)
```

**Wichtig:** Proxy-Status auf „DNS only" stellen — Traefik braucht direkten Zugang für Let's Encrypt-Challenge-Validierung (sonst gibt es kein TLS-Zertifikat).

## Verifikation nach DNS-Setup

```bash
for sub in upload antrag sachbearbeiter ki agent; do
  echo -n "$sub.butscher.cloud: "
  dig +short $sub.butscher.cloud
done
```

Alle sollten `72.61.83.18` zurückgeben.

Nach DNS-Setup (kann 1-5 Min dauern) automatisch:
- Traefik erkennt den neuen Host (Container-Labels sind schon gesetzt)
- Let's Encrypt-Cert wird beim ersten HTTPS-Aufruf automatisch ausgestellt
- Pre-Flight-Smoketest aus `pre-flight-checklist.md` läuft durch

## Falls DNS nicht möglich vor VL

Fallback: alle Frontends sind auch via GH Pages erreichbar
(`https://swrobuts.github.io/DigitalisierungVerwaltung/ueX/...`),
UE2 läuft auf `amt.butscher.cloud`, UE3 auf `amt-ki.butscher.cloud`.
Die README listet beide Varianten.
