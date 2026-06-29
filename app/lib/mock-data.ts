import type { Client, QsCheck, QsResult, QsStatus, Severity } from "./types";

export const qsCategories = [
  "API-Grundgesamtheit und Stammdaten",
  "Rechnungswesenbestand und Periodenstand",
  "Buchungsbestand und Festschreibung",
  "Buchungssatzqualitaet",
  "OPOS und offene Posten",
  "Summen, Salden und Konten",
  "Umsatzsteuer-Indikatoren",
  "Datenabdeckung Accounting",
];

export const clients: Client[] = [
  {
    id: "client-10001",
    mandatsnummer: "10001",
    mandantenname: "Muster GmbH",
    zeitraum: "Mai 2026",
    verantwortlicherMitarbeiter: "S. Neumann",
    datenstand: "2026-06-29 - festgeschriebene Buchungssequenz",
    qsRegelversion: "QS-FiBu-API-2026.06",
    authorizedUsers: ["owner@hsp.local", "admin@hsp.local"],
  },
  {
    id: "client-10024",
    mandatsnummer: "10024",
    mandantenname: "Bergmann Handel KG",
    zeitraum: "Mai 2026",
    verantwortlicherMitarbeiter: "M. Ayhan",
    datenstand: "2026-06-27 - verarbeitete Buchungssequenz",
    qsRegelversion: "QS-FiBu-API-2026.06",
    authorizedUsers: ["owner@hsp.local"],
  },
  {
    id: "client-10117",
    mandatsnummer: "10117",
    mandantenname: "Praxis am Markt PartG",
    zeitraum: "Mai 2026",
    verantwortlicherMitarbeiter: "L. Weber",
    datenstand: "2026-06-28 - festgeschriebene Buchungssequenz",
    qsRegelversion: "QS-FiBu-API-2026.06",
    authorizedUsers: ["owner@hsp.local", "restricted@hsp.local"],
  },
  {
    id: "client-10208",
    mandatsnummer: "10208",
    mandantenname: "Koch Immobilien GmbH & Co. KG",
    zeitraum: "Mai 2026",
    verantwortlicherMitarbeiter: "A. Krueger",
    datenstand: "2026-06-29 - Wirtschaftsjahr vorhanden",
    qsRegelversion: "QS-FiBu-API-2026.06",
    authorizedUsers: ["owner@hsp.local"],
  },
];

export const qsChecks: QsCheck[] = [
  check("API-001", qsCategories[0], "Mandat ist aktives FiBu-Accounting-Mandat", "P0", 10),
  check("API-010", qsCategories[1], "Rechnungswesen-Wirtschaftsjahr ist abrufbar", "P0", 20),
  check("API-011", qsCategories[1], "Wirtschaftsjahr enthaelt steuerliche Steuerungsfelder", "P2", 30),
  check("API-020", qsCategories[2], "Letzter Buchungsbestand ist ermittelbar", "P1", 40),
  check("API-021", qsCategories[2], "Letzte Buchungssequenz ist festgeschrieben", "P0", 50),
  check("API-030", qsCategories[3], "Buchungssaetze sind auswertbar", "P1", 60),
  check("API-031", qsCategories[3], "Buchungssaetze enthalten Belegfeld und Buchungstext", "P1", 70),
  check("API-032", qsCategories[3], "Buchungssaetze enthalten Konto und Gegenkonto", "P1", 80),
  check("API-040", qsCategories[4], "OPOS-Daten sind auswertbar", "P1", 90),
  check("API-041", qsCategories[4], "Ueberfaellige offene Posten sind begrenzt", "P1", 100),
  check("API-050", qsCategories[5], "Summen- und Saldenwerte sind auswertbar", "P1", 110),
  check("API-051", qsCategories[5], "Sachkonten mit Bewegungen sind erkennbar", "P2", 120),
  check("API-060", qsCategories[6], "Steuerindikatoren in Buchungen sind auswertbar", "P1", 130),
  check("API-070", qsCategories[7], "Accounting-Statistiken sind verfuegbar", "P2", 140),
];

type MockOverride = Partial<
  Pick<QsResult, "status" | "finding" | "evidence" | "recommendation" | "dueDate">
>;

const mockOverrides: Record<string, Record<string, MockOverride>> = {
  "10024": {
    "API-021": {
      status: "warning",
      finding: "Letzte Buchungssequenz ist verarbeitet, aber nicht festgeschrieben.",
      evidence: "Mock-Sequenz is_committed=false.",
      recommendation: "Festschreibung im Rechnungswesen pruefen.",
      dueDate: "2026-07-03",
    },
    "API-031": {
      status: "warning",
      finding: "Mehrere Buchungen enthalten kein belastbares Belegfeld oder keinen Buchungstext.",
      evidence: "Mock-Stichprobe: 9 von 80 Buchungen auffaellig.",
      recommendation: "Buchungstexte und Belegfelder nacharbeiten.",
      dueDate: "2026-07-04",
    },
    "API-041": {
      status: "warning",
      finding: "Ueberfaellige OPOS-Posten liegen ueber der internen Schwelle.",
      evidence: "Mock-OPOS: 7 offene Posten ueber 30 Tage.",
      recommendation: "OPOS-Liste klaeren und Faelligkeiten abstimmen.",
      dueDate: "2026-07-05",
    },
  },
  "10208": {
    "API-020": {
      status: "not_checkable",
      finding: "Kein verarbeiteter Buchungsbestand in der Stichprobe vorhanden.",
      evidence: "Mock-Daten liefern nur Wirtschaftsjahr, keine Sequenz.",
      recommendation: "Buchungssequenz oder Schnittstellenberechtigung pruefen.",
      dueDate: "2026-07-05",
    },
    "API-021": {
      status: "not_checkable",
      finding: "Festschreibung kann ohne Buchungssequenz nicht beurteilt werden.",
      evidence: "Mock-Daten liefern keinen Sequenzstatus.",
      recommendation: "Sequenzdaten nachladen.",
      dueDate: "2026-07-05",
    },
  },
};

export const qsResults: QsResult[] = clients.flatMap((client) =>
  qsChecks.map((check) => {
    const override = mockOverrides[client.mandatsnummer]?.[check.id];
    return result(client, check, override);
  }),
);

function check(
  id: string,
  category: string,
  title: string,
  defaultSeverity: Severity,
  sortOrder: number,
): QsCheck {
  return { id, category, title, defaultSeverity, active: true, sortOrder };
}

function result(
  client: Client,
  check: QsCheck,
  override: MockOverride | undefined,
): QsResult {
  return {
    id: `${client.id}-${check.id}`,
    clientId: client.id,
    checkId: check.id,
    status: override?.status ?? defaultStatus(),
    severity: check.defaultSeverity,
    finding: override?.finding ?? defaultFinding(check.id),
    evidence: override?.evidence ?? defaultEvidence(check.id),
    recommendation: override?.recommendation ?? "Keine Aktion erforderlich.",
    ownerRole: defaultOwnerRole(check.id),
    dueDate: override?.dueDate ?? null,
    calculatedAt: "2026-06-29T19:45:00.000Z",
  };
}

function defaultStatus(): QsStatus {
  return "fulfilled";
}

function defaultFinding(checkId: string) {
  if (checkId.startsWith("API-03")) return "Buchungssatz-Stichprobe ist API-seitig auswertbar.";
  if (checkId.startsWith("API-04")) return "OPOS-Stichprobe ist API-seitig auswertbar.";
  if (checkId.startsWith("API-05")) return "Summen, Salden und Sachkonten sind API-seitig auswertbar.";
  return "API-Evidenz liegt vor.";
}

function defaultEvidence(checkId: string) {
  if (checkId === "API-001") return "Accounting-Client vorhanden und Stammdatenstatus aktiv.";
  if (checkId === "API-010") return "Wirtschaftsjahr aus DATEVconnect Accounting abrufbar.";
  if (checkId === "API-021") return "Letzte Buchungssequenz ist als festgeschrieben markiert.";
  return "Mock-Evidenz aus API-faehigem QS-Katalog.";
}

function defaultOwnerRole(checkId: string) {
  if (checkId.startsWith("API-04")) return "FiBu-Team / OPOS";
  if (checkId.startsWith("API-06")) return "Steuerfachliche Pruefung";
  if (checkId.startsWith("API-02")) return "Teamleitung FiBu";
  return "FiBu-Team";
}
