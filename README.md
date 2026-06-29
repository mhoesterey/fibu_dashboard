# HSP QS Cockpit laufende FiBu

Interne Sites-Web-App zur Qualitätssicherung der laufenden Finanzbuchhaltung.
Die App ist für ChatGPT Enterprise Sites vorbereitet, nutzt Workspace-Auth und
wird zunächst nur als gespeicherte Version zur Prüfung bereitgestellt.

## Umfang

- Cockpit-Startseite mit Refresh-Prozess, KPI-Kacheln, Mandatsanalyse,
  QS-Heatmap und Top-Handlungsbedarf.
- Mandatsdetailseite unter `/mandat/{mandatsnummer}` mit Stammdaten,
  Management Summary, Score-Modul, vollständiger QS-Matrix,
  Handlungsempfehlungen und Markdown-/Druckexport.
- Datenmodell für `clients`, `qs_checks`, `qs_results`, `refresh_runs` und
  `audit_log`.
- Simulierte Mock-Datenquelle mit vorbereitetem Klardaten-Gateway-Adapter.
- D1-Bindung `DB` für Audit-Log und Refresh-Läufe.

## Sicherheit

- Produktive Seiten lesen die Workspace-Identität aus den von Sites
  weitergeleiteten ChatGPT-Headern.
- `APP_OWNER_EMAILS` und `APP_ADMIN_EMAILS` können als kommaseparierte
  Allowlist gesetzt werden.
- In der lokalen Entwicklung wird ein Demo-Admin verwendet.
- Klardaten-API-Werte gehören ausschließlich in sichere Runtime-Secrets oder
  lokale `.env`-Dateien. Sie werden nicht committed.
- Detailaufrufe und Mandatsvalidierungen werden best-effort in `audit_log`
  protokolliert.

## Klardaten / DATEV-Integration

Initial läuft die App mit Mock-Daten. Für den nächsten Schritt ist der
Klardaten DATEVconnect Gateway-Pfad vorbereitet:

- Basis-URL: `https://api.klardaten.com`
- Auth: Bearer Token
- Instanz-Header: `x-client-instance-id`
- erster lesender Smoke-Test: Mandantenliste

Vor produktiver API-Nutzung muss die konkrete OpenAPI-Spezifikation validiert
und ein typisierter Client generiert oder finalisiert werden. Schreibende
DATEV-Operationen sind nicht implementiert.

## Lokale Entwicklung

```bash
npm install
npm run dev
npm run build
```

Falls in der Codex-Laufzeit kein `npm` verfügbar ist, kann die Installation mit
dem bereitgestellten Paketmanager der Umgebung ausgeführt werden, ohne
API-Secrets in das Repository zu schreiben.

## Sites

`.openai/hosting.json` deklariert die D1-Bindung:

```json
{
  "d1": "DB",
  "r2": null
}
```

Die App soll erst nach Build- und Funktionsprüfung als Sites-Version gespeichert
werden. Ein Production Deployment erfolgt erst nach expliziter Freigabe.
