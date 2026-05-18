# Kong CORS für submit-antrag-Function

## Status

**Im Standard-Supabase-Self-Host-Setup bereits korrekt konfiguriert** — Kong hat ein globales CORS-Plugin auf der `functions-v1`-Route, das Preflight-Requests (`OPTIONS`) selbst beantwortet und für eigentliche `POST`-Requests die Origin-Header durchreicht.

## Verifikation

```bash
curl -ksi -X OPTIONS https://verwaltung.butscher.cloud/functions/v1/submit-antrag \
  -H "Origin: http://localhost:5173" -m 10
```

Erwartete Response-Header:
```
HTTP/2 204
access-control-allow-headers: authorization, x-client-info, apikey, content-type
access-control-allow-methods: POST, OPTIONS
access-control-allow-origin: *
via: kong/2.8.1
```

Der `*`-Origin im Preflight kommt vom Kong-Plugin (Wildcard-Default). Beim echten `POST` setzt die Edge Function selbst einen konkreten `Access-Control-Allow-Origin`-Header — dieser ist auf die Allowlist (`ALLOWED_ORIGINS` in `functions/submit-antrag/index.ts`) eingeschränkt.

## Wenn die Function eine spezifischere CORS-Policy braucht

In der Edge Function selbst die `ALLOWED_ORIGINS`-Liste anpassen — Code ist in `supabase/functions/submit-antrag/index.ts`.

## Wenn Kong präemptiv CORS schärfer kontrollieren soll

Im DB-less-Mode (`kong.yml`) den globalen Plugin-Block überschreiben:

```yaml
plugins:
  - name: cors
    route: functions-v1-all
    config:
      origins:
        - https://swrobuts.github.io
        - http://localhost:5173
        - http://localhost:4173
      methods: [POST, OPTIONS]
      headers: [authorization, x-client-info, apikey, content-type]
      credentials: false
      max_age: 3600
```

Reload via:
```bash
docker restart supabase-kong
```
