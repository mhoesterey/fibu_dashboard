# QS/API-Machbarkeitsanalyse laufende FiBu

Stand: 30.06.2026

## Kurzfazit

Die aktuelle QS-Konzeption ist fachlich zu breit fuer die aktuell angebundene API. Die App geht implizit davon aus, dass aus Klardaten/DATEVconnect bereits Belegzugang, Zahlungsdaten-Connectoren, Importprotokolle, interne Freigaben, Rueckfragen und Sonderthemen ableitbar sind. Das ist in der aktuellen Implementierung nicht der Fall.

Aktuell direkt genutzt werden nur:

- Accounting clients
- Master-data clients mit Aktivstatus
- Fiscal years in der Einzelmandatspruefung
- Accounting sequences in der Einzelmandatspruefung

Damit koennen belastbar nur Grundgesamtheit, aktiver FiBu-Bezug, Rechnungswesenbestand, Zeitraum und teilweise Festschreibung/Buchungsstand beurteilt werden. Alle anderen QS-Punkte werden derzeit ueberwiegend als `not_checkable` erzeugt. Das ist korrekt vorsichtig, wirkt im Dashboard aber wie "Unsinn", weil die Heatmap und die Handlungsliste dadurch von nicht belegbaren QS-Punkten dominiert werden.

## Verfuegbare Daten laut API-/Connector-Pruefung

### Direkt verfuegbar und bereits angebunden

- `datevconnect/accounting/v1/clients`: Accounting-Mandate mit `name`, `number`, `id`.
- `datevconnect/master-data/v1/clients`: Stammdaten inkl. `status`, `number`, Organisations-/Niederlassungsfeldern.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years`: Wirtschaftsjahr, Kontenlaengen, UStVA-Kennzeichen, Steuerungsfelder.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years/{fiscalYearId}/accounting-sequences-processed`: Buchungssequenzen mit Zeitraum, Festschreibungsstatus und Datum.

### Laut Klardaten-Connector zusaetzlich moeglich, aber noch nicht in der App umgesetzt

- Account postings: Buchungssaetze inkl. Konto, Gegenkonto, Betrag, Datum, Buchungstext, Belegfeld, Steuersatz.
- Accounts receivable/payable: OPOS-Debitoren/Kreditoren inkl. Faelligkeit, Offenbetrag, Mahn-/Zinssperren, Zahlungsart.
- Accounting sums and balances: Summen- und Saldenwerte je Konto.
- General ledger accounts und utilized accounts: Sachkonten/Kontenrahmeninformationen.
- Accounting statistics: Monatsstatistiken, z.B. Journal-/Prima-Nota-Zaehler.
- Posting proposal rules: Regeln fuer Eingangs-/Ausgangsrechnungen/Kasse.
- Cost systems, cost centers, cost sequences: Kostenrechnung, wenn genutzt.
- Document Management: Dokumente, Dokumentdateien, Dokumentstatus, Eigenschaften, Strukturelemente.
- Order Management: Auftraege, Auftragsstatusdaten, Suborder-/Billing-Status, Monatswerte, Kostenpositionen, Mitarbeitenden-/Kapazitaetsdaten.

## Aktuelle QS-Punkte und API-Faehigkeit

| QS-ID | Kategorie | Titel | Aktuelle API-Faehigkeit | Bewertung |
| --- | --- | --- | --- | --- |
| QS-001 | Mandanten-/Stammdaten und Besonderheiten | Mandantenstammdaten sind aktuell | Master-data liefert aktive Stammdaten und Accounting-Abgleich. Aktualitaet einzelner Felder nur eingeschraenkt pruefbar. | Teilweise automatisierbar |
| QS-002 | Mandanten-/Stammdaten und Besonderheiten | Besonderheiten sind dokumentiert | Kein eindeutiges Besonderheiten-/Notizfeld in aktueller Implementierung. Evtl. ueber Client categories/groups oder Order/DMS, aber nicht belegt. | Nicht belastbar |
| QS-010 | Beleg- und Datenzugang | Belegzugang ist vollstaendig | Accounting-API zeigt Buchungen/Belegfeld, aber keine erwartete Belegliste oder Upload-Vollstaendigkeit. DMS koennte Dokumente liefern, ist nicht angebunden und braucht Mandats-/Periodenmapping. | Derzeit nicht belastbar, spaeter mit DMS/Belegquelle moeglich |
| QS-011 | Beleg- und Datenzugang | Datenzugaenge sind erreichbar | Keine Connector-Statusdaten fuer Bank, PayPal, Amazon, Kreditkarten in der aktuellen API-Pruefung. | Nicht moeglich ohne externe Connector-Logs |
| QS-020 | Vorbereitung und Datenuebernahme | Vormonatswerte wurden uebernommen | Fiscal years, accounting sequences und ggf. Susa koennen periodische Anschlusspruefungen ermoeglichen. Aktuell nur Wirtschaftsjahr/Buchungsbestand belegt. | Teilweise automatisierbar |
| QS-021 | Vorbereitung und Datenuebernahme | Importprotokolle sind plausibel | Keine Importprotokolle in der aktuellen Implementierung. Accounting statistics koennen Mengenindikatoren liefern, aber keine Importfehler. | Nicht belastbar |
| QS-030 | Buchungsqualitaet | Buchungstexte und Kontierung sind plausibel | Account postings liefern Konto, Gegenkonto, Text, Betrag, Datum, Steuersatz. Plausibilitaet braucht Regelwerk/Kontenmapping. | Automatisierbar nach Regelmodell |
| QS-031 | Buchungsqualitaet | Ungewoehnliche Buchungsbetraege sind geprueft | Account postings ermoeglichen Ausreisserpruefung. "Geprueft" als Freigabe ist ohne Workflowquelle nicht belegbar. | Auffaelligkeit automatisierbar, Pruefung nicht |
| QS-040 | OPOS, Verrechnung und unklare Posten | OPOS-Salden sind abgestimmt | AR/AP liefern offene Posten, Faelligkeiten, Offenbetraege, Sperren. Abstimmung braucht Schwellenwerte und ggf. Susa-Abgleich. | Gut automatisierbar |
| QS-041 | OPOS, Verrechnung und unklare Posten | Verrechnungskonten sind bereinigt | Susa/Sachkonten und Buchungen koennen definierte Verrechnungskonten pruefen. Benoetigt Kanzlei-Kontenliste. | Automatisierbar nach Kontenmapping |
| QS-050 | Umsatzsteuer / ZM / OSS | Umsatzsteuer-Voranmeldung ist plausibel | Buchungen, Steuersaetze und Susa koennen USt-Plausibilitaet unterstuetzen. Keine direkte UStVA-Abgabe-/Elster-Evidenz gefunden. | Teilweise automatisierbar |
| QS-051 | Umsatzsteuer / ZM / OSS | ZM/OSS-Relevanz ist bewertet | Ohne Leistungs-/Laender-/USt-ID-Logik und Abgabestatus nur indirekt ueber Konten/Buchungstexte. | Derzeit schwach, braucht Regelwerk/Zusatzdaten |
| QS-060 | Anlagenbuchfuehrung | Anlagenzugaenge sind geprueft | Im Accounting-Connector sichtbar sind Stocktaking/Inventory-Daten, aber keine klare Anlagenbuchfuehrung/Festwertanlage. Anlagenzugang evtl. ueber Konten/Buchungen erkennbar. | Nur indirekt pruefbar |
| QS-070 | Zahlungsdaten / Bank / PayPal / Amazon / Kreditkarten | Bank- und Zahlungsdaten sind vollstaendig | Buchungen koennen Luecken/Aktualitaet indirekt zeigen; echte Schnittstellen-/Bankabruf-Vollstaendigkeit nicht. | Derzeit nicht belastbar |
| QS-080 | Sonderthemen wie Kasse, Par. 37b, Bewirtung, Pkw, KSK | Sonderthemen sind gekennzeichnet | Erkennung ueber Konten, Buchungstexte, Belegfelder oder DMS-Metadaten moeglich; Kennzeichnung/Freigabe nicht ohne Zusatzdaten. | Teilweise nach Konten-/DMS-Regelwerk |
| QS-090 | Kontrollarbeiten / Freigabe | Vier-Augen-Freigabe ist dokumentiert | Keine Freigabe-/Review-Daten in Accounting. Order Management koennte Statusdaten liefern, muss aber fachlich gemappt werden. | Nicht belastbar ohne Workflow-/Order-Daten |
| QS-100 | Periodenabschluss / Festschreibung / Auswertung | Periode ist festschreibungsbereit | Accounting sequences liefern `is_committed`, `date_committed`, Zeitraum. Festschreibungsbereitschaft braucht zusaetzliche Blockerregeln. | Teilweise gut automatisierbar |
| QS-110 | Auftragspflege / Bearbeitungsstand | Bearbeitungsstand im Auftrag ist aktuell | Order Management bietet Auftragsstatusdaten und Monatswerte, ist aber nicht angebunden. Accounting-Sequenzdatum ist nur ein schwacher Proxy. | Mit Order Management moeglich, aktuell nur Proxy |

## Was konzeptionell falsch gelaufen ist

1. Die QS-Punkte wurden als fachliches Wunschbild entworfen, nicht als datenquellengebundene Regeln.
2. Die Kategorien mischen unterschiedliche Datenwelten: Rechnungswesenbestand, Belegmanagement, Zahlungsconnectoren, interne Kanzleiprozesse, Freigaben und steuerfachliche Einzelfallbeurteilungen.
3. Die aktuelle Implementierung nutzt nur einen kleinen Teil der Klardaten-Moeglichkeiten, zeigt aber schon die volle QS-Matrix. Dadurch wirken 14 von 18 QS-Punkten wie echte Analyse, obwohl sie nur `not_checkable` sind.
4. Der Score ist fuer echte API-Daten derzeit kein Qualitaetswert, sondern eher ein Datenabdeckungswert. Solange keine QS-Ergebnisse oder Regeln fuer Buchungen/OPOS/Susa/DMS/Order implementiert sind, darf der Score nicht als Kanzleiqualitaet interpretiert werden.
5. Die Heatmap sollte aktuell nicht alle Kategorien gleichberechtigt anzeigen. Sie sollte zwischen "regelbasiert berechnet", "nur Datenabdeckung", "nicht angebunden" und "manuell erforderlich" unterscheiden.

## Empfohlene neue Struktur

### Phase 1: Belastbare Basis aus vorhandener Accounting-/Master-Data-API

- Grundgesamtheit: aktive Accounting-Mandate.
- Rechnungswesenbestand: Wirtschaftsjahr vorhanden.
- Letzter Buchungsstand: letzte verarbeitete Buchungssequenz.
- Festschreibung: `is_committed` und `date_committed`.
- Buchungsaktivitaet: Accounting statistics / Anzahl Buchungen.
- Buchungsqualitaet: fehlende Belegfelder, leere/generische Buchungstexte, auffaellige Betraege.
- OPOS: offene Posten, Faelligkeiten, Ueberfaelligkeit, Mahn-/Zinssperren.
- Verrechnungskonten: definierte Kanzlei-Kontenliste gegen Susa/Buchungen.

### Phase 2: Erweiterung um Document Management

- Belegmenge je Mandat/Periode.
- Dokumentstatus.
- Metadaten/Property Templates.
- Beleg-/Buchungsabgleich, falls ein stabiler Mandats- und Periodenbezug vorhanden ist.

### Phase 3: Erweiterung um Order Management

- Auftrag vorhanden.
- Auftragstyp laufende FiBu.
- Bearbeitungsstatus und Statusdaten.
- Verantwortliche Mitarbeitende.
- Freigabe-/Billing-Status, falls fachlich als QS-Freigabe geeignet.

### Phase 4: Nicht ueber Klardaten Accounting allein loesbar

- Bank-/PayPal-/Amazon-/Kreditkarten-Connector-Erreichbarkeit.
- Exakte Upload-Vollstaendigkeit in Unternehmen online ohne Belegquelle.
- Vier-Augen-Freigabe ohne Workflowstatus.
- Steuerfachliche Bewertung von Par. 37b, Bewirtung, Pkw, KSK ohne Konto-/Beleg-/Freitextregelwerk und manuelle Review-Evidenz.

## Empfohlene Sofortanpassung der App

- QS-Matrix in "API-berechenbar", "Zusatzquelle erforderlich", "manuell zu pruefen" gruppieren.
- Nicht angebundene QS-Punkte nicht im Score zaehlen; separat als Datenabdeckung/Konfigurationsluecke anzeigen.
- Heatmap vorerst nur fuer Kategorien anzeigen, in denen mindestens eine echte Regel berechnet wird.
- Top Handlungsbedarf nur aus echten `critical`/`warning` Ergebnissen, nicht aus massenhaftem `not_checkable`.
- Pro QS-Punkt ein Feld `evidenceSource` einfuehren: `accounting`, `master_data`, `dms`, `order_management`, `external_connector`, `manual`.
- Pro QS-Punkt ein Feld `automationLevel` einfuehren: `available_now`, `available_after_mapping`, `needs_additional_api`, `manual_only`.

## Quellen

- Klardaten DATEVconnect Connector, Accounting: `src/services/datevConnectClient.ts`
- Klardaten DATEVconnect Connector, Accounting Node Config: `nodes/Accounting/Accounting.config.ts`
- Klardaten DATEVconnect Connector, Document Management: `src/services/documentManagementClient.ts`
- Klardaten DATEVconnect Connector, Order Management: `src/services/orderManagementClient.ts`
- Lokale API-Feldprobe gegen Klardaten Gateway am 30.06.2026 ohne Ausgabe von Mandatsdaten oder Zugangsdaten.
