# QS/API-Konzeption laufende FiBu

Stand: 30.06.2026

## Kurzfazit

Die aktive QS-Konzeption wurde auf API-belegbare Punkte reduziert. Nicht durch die aktuell angebundene Klardaten-/DATEVconnect-API belegbare QS-Punkte sind nicht mehr Teil der aktiven Matrix, nicht mehr Teil des Scores und nicht mehr Teil der Heatmap.

Die App wertet nur Mandate aus, die gleichzeitig:

- in der Accounting-API vorkommen,
- in den Master-data-Clients als aktiv erkennbar sind,
- eindeutig ueber die Mandatsnummer zugeordnet werden koennen.

Inaktive Mandate, Mandate ohne FiBu-Accounting-Bezug und nicht eindeutig zuordenbare Mandate werden ausgeschlossen.

## Aktiv angebundene Datenquellen

- `datevconnect/accounting/v1/clients`: FiBu-Accounting-Mandate mit Nummer, Name und Accounting-Client-ID.
- `datevconnect/master-data/v1/clients`: Stammdaten inkl. Aktivstatus.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years`: Wirtschaftsjahr und steuerliche Steuerungsfelder.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years/{fiscalYearId}/accounting-sequences-processed`: letzter verarbeiteter Buchungsbestand und Festschreibungsstatus.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years/{fiscalYearId}/account-postings`: Buchungssatz-Stichprobe mit Belegfeld, Buchungstext, Konto, Gegenkonto und Steuerindikatoren.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years/{fiscalYearId}/accounts-receivable`: OPOS-Debitoren-Stichprobe.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years/{fiscalYearId}/accounts-payable`: OPOS-Kreditoren-Stichprobe.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years/{fiscalYearId}/accounting-sums-and-balances`: Summen- und Salden-Stichprobe.
- `datevconnect/accounting/v1/clients/{clientId}/fiscal-years/{fiscalYearId}/accounting-statistics`: Monats-/Buchungsstatistiken.

## Aktiver API-QS-Katalog

| QS-ID | Kategorie | Titel | API-Evidenz | Statuslogik |
| --- | --- | --- | --- | --- |
| API-001 | API-Grundgesamtheit und Stammdaten | Mandat ist aktives FiBu-Accounting-Mandat | Accounting-Client plus aktiver Master-data-Status | Erfuellt, wenn Mandat in der aktiven FiBu-Grundgesamtheit enthalten ist |
| API-010 | Rechnungswesenbestand und Periodenstand | Rechnungswesen-Wirtschaftsjahr ist abrufbar | Fiscal-year-Endpunkt | Erfuellt bei abrufbarem Wirtschaftsjahr |
| API-011 | Rechnungswesenbestand und Periodenstand | Wirtschaftsjahr enthaelt steuerliche Steuerungsfelder | Beginn/Ende des Wirtschaftsjahres | Warnung bei fehlendem Beginn oder Ende |
| API-020 | Buchungsbestand und Festschreibung | Letzter Buchungsbestand ist ermittelbar | Accounting sequences processed | Erfuellt bei letzter Sequenz, Warnung ohne Sequenz |
| API-021 | Buchungsbestand und Festschreibung | Letzte Buchungssequenz ist festgeschrieben | `is_committed`, `date_committed` | P0-Warnung, wenn letzte Sequenz nicht festgeschrieben ist; nicht pruefbar ohne Sequenz |
| API-030 | Buchungssatzqualitaet | Buchungssaetze sind auswertbar | Account-postings-Stichprobe | Erfuellt bei auswertbaren Buchungen, Warnung ohne Stichprobe |
| API-031 | Buchungssatzqualitaet | Buchungssaetze enthalten Belegfeld und Buchungstext | Fehlende Belegfelder und Buchungstexte | Warnung bei einzelnen Luecken, kritisch bei hoher Lueckenquote |
| API-032 | Buchungssatzqualitaet | Buchungssaetze enthalten Konto und Gegenkonto | Konto-/Gegenkonto-Felder | Warnung bei fehlender Kontierung in der Stichprobe |
| API-040 | OPOS und offene Posten | OPOS-Daten sind auswertbar | Debitoren- und Kreditorenposten | Erfuellt, wenn mindestens ein OPOS-Endpunkt auswertbar ist |
| API-041 | OPOS und offene Posten | Ueberfaellige offene Posten sind begrenzt | Faelligkeiten und offene Posten | Warnung bei Ueberfaelligkeit, kritisch bei hoher Anzahl oder sehr alten Posten |
| API-050 | Summen, Salden und Konten | Summen- und Saldenwerte sind auswertbar | Susa-Stichprobe | Erfuellt bei auswertbaren Summen-/Saldenwerten |
| API-051 | Summen, Salden und Konten | Sachkonten mit Bewegungen sind erkennbar | Konten mit Saldo oder Jahresbewegung | Warnung, wenn keine Bewegung erkennbar ist |
| API-060 | Umsatzsteuer-Indikatoren | Steuerindikatoren in Buchungen sind auswertbar | Steuersatz-/Steuerfeld in Buchungen | Warnung, wenn in der Buchungsstichprobe keine Steuerindikatoren vorhanden sind |
| API-070 | Datenabdeckung Accounting | Accounting-Statistiken sind verfuegbar | Accounting statistics | Erfuellt bei abrufbarer Statistikstichprobe |

## Entfernte QS-Punkte

Die folgenden Punkte bleiben fachlich moeglich, sind aber aktuell nicht API-belegt und deshalb aus der aktiven App-Konzeption entfernt:

- Belegzugang ist vollstaendig: Ohne DMS-/Beleglistenabgleich gibt es keine belastbare Vollstaendigkeitspruefung.
- Datenzugaenge Bank, PayPal, Amazon, Kreditkarten sind erreichbar: Connector-Statusdaten liegen in der aktuellen API-Auswertung nicht vor.
- Importprotokolle sind plausibel: Importprotokolle oder Fehlerlisten sind nicht angebunden.
- Vormonatswerte wurden vollstaendig uebernommen: Dafuer fehlt aktuell ein expliziter Perioden-/Vormonatsabgleich mit Regelmapping.
- Umsatzsteuer-Voranmeldung, ZM und OSS sind abgegeben oder fachlich abschliessend plausibel: Buchungsdaten liefern Indikatoren, aber keine Abgabe-/Elster-Evidenz.
- Anlagenbuchfuehrung ist fachlich geprueft: Ohne Anlagenbestand oder festes Kontenmapping nur indirekt erkennbar.
- Sonderthemen wie Kasse, Par. 37b, Bewirtung, Pkw, KSK sind gekennzeichnet: Ohne Konto-/Beleg-/Freitextregelwerk und Review-Evidenz nicht belastbar.
- Vier-Augen-Freigabe ist dokumentiert: Accounting liefert keine internen Review- oder Freigabedaten.
- Auftragspflege und Bearbeitungsstand sind aktuell: Order Management ist nicht Teil des aktiven Regelkatalogs.

## Scoring-Logik

- Gesamtscore 0 bis 100.
- Kritische P0-Befunde setzen den Mandatsstatus immer auf rot.
- `not_checkable` wird nie als erfuellt gezaehlt.
- `not_applicable` wird aus der Score-Basis herausgenommen.
- Dashboard-Ansichten laden die aktive FiBu-Grundgesamtheit. Ein testweiser Vollabruf von Wirtschaftsjahren und Buchungssequenzen fuer alle Mandate ist fuer den synchronen Refresh zu teuer und laeuft in HTTP-Timeouts.
- Die Einzelmandatsseite vertieft die API-Auswertung mit Wirtschaftsjahr, letzter Buchungssequenz, Buchungen, OPOS, Summen/Salden und Accounting-Statistiken.
- Wirtschafts-/Buchungs-/OPOS-/SuSa-/Statistikregeln werden im Gesamtbestand als nicht anwendbar behandelt und erst im Einzelmandat berechnet.

## Konsequenz fuer die Oberflaeche

- KPI, Matrix, Heatmap und Top-Handlungsbedarf zeigen nur aktive API-QS-Regeln.
- Nicht API-belegte Alt-QS-Punkte erscheinen nicht mehr als offene Punkte.
- Die Handlungsliste entsteht nur aus echten `critical`, `warning` oder `not_checkable` API-Ergebnissen.
- Mandatsdetailseiten zeigen vollstaendig alle aktiven API-QS-Punkte, auch wenn ein Punkt erfuellt, nicht pruefbar oder fuer den Datenstand nicht anwendbar ist.

## Naechste sinnvolle Erweiterungen

1. Kanzlei-Kontenmapping fuer Verrechnungskonten, Sonderkonten und USt-Plausibilitaeten definieren.
2. DMS-/Belegquelle anbinden, wenn Belegvollstaendigkeit wirklich bewertet werden soll.
3. Order Management anbinden, wenn Bearbeitungsstand, Verantwortung oder Review-Freigaben in die QS gehoeren.
4. Schwellenwerte fuer OPOS, fehlende Belegfelder und Buchungstextqualitaet fachlich mit der Kanzleileitung abstimmen.
