import { clients, qsChecks, qsResults } from "./mock-data";
import type {
  ActionItem,
  AccountingProfile,
  Client,
  ClientScore,
  DashboardMetrics,
  HeatmapCell,
  QsMatrixRow,
  QsResult,
  QsStatus,
  RefreshRun,
  Severity,
  TrafficLight,
} from "./types";

const severityWeight: Record<Severity, number> = {
  P0: 5,
  P1: 3,
  P2: 2,
  P3: 1,
};

const statusLabel: Record<QsStatus, string> = {
  fulfilled: "erfüllt",
  warning: "auffällig",
  critical: "kritisch",
  not_checkable: "nicht prüfbar",
  not_applicable: "entfällt",
};

export function getStatusLabel(status: QsStatus) {
  return statusLabel[status];
}

export function getClientByNumber(
  mandatsnummer: string,
  sourceClients: Client[] = clients,
) {
  return sourceClients.find((client) => client.mandatsnummer === mandatsnummer);
}

export function getResultsForClientId(clientId: string) {
  return qsResults.filter((result) => result.clientId === clientId);
}

export function getMatrixForClient(client: Client): QsMatrixRow[] {
  const results = getResultsForClientId(client.id);
  const apiDerivedResults =
    results.length === 0 && client.accountingProfile
      ? getApiDerivedResults(client)
      : [];

  return [...qsChecks]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((check) => {
      const result =
        results.find((entry) => entry.checkId === check.id) ??
        apiDerivedResults.find((entry) => entry.checkId === check.id) ??
        missingResult(client, check.id, check.defaultSeverity);
      return { ...check, result };
    });
}

export function calculateClientScore(client: Client): ClientScore {
  const matrix = getMatrixForClient(client);
  const applicable = matrix.filter(
    (row) => row.result.status !== "not_applicable",
  );
  const totalWeight = applicable.reduce(
    (sum, row) => sum + severityWeight[row.result.severity],
    0,
  );
  const fulfilledWeight = applicable
    .filter((row) => row.result.status === "fulfilled")
    .reduce((sum, row) => sum + severityWeight[row.result.severity], 0);

  const fulfilledCount = matrix.filter(
    (row) => row.result.status === "fulfilled",
  ).length;
  const warningCount = matrix.filter(
    (row) => row.result.status === "warning",
  ).length;
  const criticalCount = matrix.filter(
    (row) => row.result.status === "critical",
  ).length;
  const notCheckableCount = matrix.filter(
    (row) => row.result.status === "not_checkable",
  ).length;
  const notApplicableCount = matrix.filter(
    (row) => row.result.status === "not_applicable",
  ).length;
  const hasCriticalP0 = matrix.some(
    (row) => row.result.status === "critical" && row.result.severity === "P0",
  );
  const score =
    totalWeight > 0 ? Math.round((fulfilledWeight / totalWeight) * 100) : 0;

  return {
    score,
    trafficLight: getTrafficLight(score, hasCriticalP0, criticalCount),
    fulfilledCount,
    warningCount,
    criticalCount,
    notCheckableCount,
    notApplicableCount,
    applicableCount: applicable.length,
    totalCount: matrix.length,
  };
}

export function getDashboardMetrics(
  sourceClients: Client[] = clients,
): DashboardMetrics {
  const scores = sourceClients.map(calculateClientScore);
  const allResults = sourceClients.flatMap((client) => getMatrixForClient(client));
  const averageScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, score) => sum + score.score, 0) / scores.length,
        )
      : 0;

  return {
    checkedClients: sourceClients.length,
    averageScore,
    criticalClients: scores.filter((score) => score.trafficLight === "red").length,
    openQuestions: allResults.filter((row) =>
      ["warning", "critical", "not_checkable"].includes(row.result.status),
    ).length,
    notCheckablePoints: allResults.filter(
      (row) => row.result.status === "not_checkable",
    ).length,
    lastDataStatus: getLatestDataStatus(sourceClients),
  };
}

export function getHeatmap(sourceClients: Client[] = clients): HeatmapCell[] {
  return qsChecks
    .map((check) => check.category)
    .filter((category, index, categories) => categories.indexOf(category) === index)
    .map((category) => {
      const rows = sourceClients.flatMap((client) =>
        getMatrixForClient(client).filter((row) => row.category === category),
      );
      const fulfilled = countStatus(rows.map((row) => row.result), "fulfilled");
      const warning = countStatus(rows.map((row) => row.result), "warning");
      const critical = countStatus(rows.map((row) => row.result), "critical");
      const notCheckable = countStatus(
        rows.map((row) => row.result),
        "not_checkable",
      );
      const notApplicable = countStatus(
        rows.map((row) => row.result),
        "not_applicable",
      );
      const applicable = rows.length - notApplicable;
      const score = applicable > 0 ? Math.round((fulfilled / applicable) * 100) : 100;

      return {
        category,
        fulfilled,
        warning,
        critical,
        notCheckable,
        notApplicable,
        score,
        riskLevel:
          critical > 0 ? "red" : warning + notCheckable > 1 ? "amber" : "green",
      };
    });
}

export function getTopActionItems(
  limit = 8,
  sourceClients: Client[] = clients,
): ActionItem[] {
  const priority = {
    critical: 0,
    warning: 1,
    not_checkable: 2,
    fulfilled: 3,
    not_applicable: 4,
  };
  const severityPriority: Record<Severity, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };

  return sourceClients
    .flatMap((client) =>
      getMatrixForClient(client)
        .filter((row) =>
          ["critical", "warning", "not_checkable"].includes(row.result.status),
        )
        .map<ActionItem>((row) => ({
          clientNumber: client.mandatsnummer,
          clientName: client.mandantenname,
          category: row.category,
          title: row.title,
          severity: row.result.severity,
          status: row.result.status,
          finding: row.result.finding,
          recommendation: row.result.recommendation,
          ownerRole: row.result.ownerRole,
          dueDate: row.result.dueDate,
        })),
    )
    .sort((left, right) => {
      const statusDelta = priority[left.status] - priority[right.status];
      if (statusDelta !== 0) return statusDelta;
      const severityDelta =
        severityPriority[left.severity] - severityPriority[right.severity];
      if (severityDelta !== 0) return severityDelta;
      return (left.dueDate ?? "9999-12-31").localeCompare(
        right.dueDate ?? "9999-12-31",
      );
    })
    .slice(0, limit);
}

export function getLatestDataStatus(sourceClients: Client[] = clients) {
  return (
    sourceClients
      .map((client) => client.datenstand)
      .sort((left, right) => right.localeCompare(left))[0] ??
    "keine Daten geladen"
  );
}

export function buildManagementSummary(client: Client) {
  const score = calculateClientScore(client);
  const matrix = getMatrixForClient(client);
  const critical = matrix.filter((row) => row.result.status === "critical");
  const warnings = matrix.filter((row) => row.result.status === "warning");
  const notCheckable = matrix.filter(
    (row) => row.result.status === "not_checkable",
  );

  const base = `Für Mandat ${client.mandatsnummer} liegt der QS-Score bei ${score.score} von 100 Punkten.`;
  if (critical.length > 0) {
    const first = critical[0];
    return `${base} Der Mandatsstatus ist rot, weil mindestens ein kritischer Befund vorliegt. Belegt ist aktuell: ${first.title} - ${first.result.evidence}. ${
      notCheckable.length > 0
        ? `${notCheckable.length} QS-Punkt(e) sind nicht prüfbar und werden nicht als erfüllt gezählt.`
        : ""
    }`;
  }
  if (warnings.length > 0 || notCheckable.length > 0) {
    return `${base} Es bestehen keine kritischen P0-Befunde, aber ${warnings.length} auffällige und ${notCheckable.length} nicht prüfbare QS-Punkte. Fehlende Evidenz ist als nicht prüfbar gekennzeichnet.`;
  }
  return `${base} Alle anwendbaren QS-Punkte sind erfüllt oder nachvollziehbar als entfällt dokumentiert.`;
}

export function createSimulatedRefreshRun(triggeredBy: string): RefreshRun {
  return {
    id: `refresh-${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "success",
    triggeredBy,
    log: [
      "Workspace-Identität geprüft",
      "Mock-Datenquelle geladen",
      "QS-Regeln QS-FiBu-2026.06 neu berechnet",
      "KPI-Kacheln, Heatmap und Handlungsbedarf aktualisiert",
    ],
  };
}

export function createRefreshRun(
  triggeredBy: string,
  input: {
    source: "mock" | "klardaten";
    checkedClients: number;
    status?: "success" | "failed";
    errorMessage?: string;
    sourceLabel?: string;
    logDetails?: string[];
  },
): RefreshRun {
  const sourceLabel =
    input.sourceLabel ??
    (input.source === "klardaten"
      ? "Klardaten Accounting Gateway (aktive FiBu)"
      : "Mock-Datenquelle");
  const status = input.status ?? "success";
  const successLog = [
    "Workspace-Identität geprüft",
    `${sourceLabel} geladen (${input.checkedClients} Mandate)`,
    ...(input.logDetails ?? []),
    "QS-Regeln QS-FiBu-2026.06 neu berechnet",
    "KPI-Kacheln, Heatmap und Handlungsbedarf aktualisiert",
  ];
  const failedLog = [
    "Workspace-Identität geprüft",
    `${sourceLabel} konnte nicht vollständig geladen werden`,
    input.errorMessage ?? "Unbekannter Fehler im QS-Regellauf",
  ];

  return {
    id: `refresh-${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status,
    triggeredBy,
    errorMessage: input.errorMessage,
    log: status === "success" ? successLog : failedLog,
  };
}

function missingResult(
  client: Client,
  checkId: string,
  severity: Severity,
): QsResult {
  const hasApiProfile = Boolean(client.accountingProfile);

  return {
    id: `${client.id}-${checkId}-missing`,
    clientId: client.id,
    checkId,
    status: "not_checkable",
    severity,
    finding: hasApiProfile
      ? "Dieser QS-Punkt kann aus den aktuell angebundenen Accounting-Daten nicht sicher beurteilt werden."
      : "Für diesen QS-Punkt liegt kein Ergebnis vor.",
    evidence: hasApiProfile
      ? (client.accountingProfile?.dataQualityNote ??
        "Keine belegbare QS-Evidenz aus der aktuellen API.")
      : "Keine Evidenz in der aktuellen Datenquelle.",
    recommendation: hasApiProfile
      ? "QS-Evidenz aus Fachprüfung, Import oder erweitertem API-Endpunkt ergänzen."
      : "Datenquelle prüfen und QS-Ergebnis nachberechnen.",
    ownerRole: "System / Datenintegration",
    dueDate: null,
    calculatedAt: new Date().toISOString(),
  };
}

function getApiDerivedResults(client: Client): QsResult[] {
  const profile = client.accountingProfile;
  if (!profile) return [];

  const calculatedAt = new Date().toISOString();
  return [
    apiResult(client, profile, {
      checkId: "QS-001",
      status: "fulfilled",
      severity: "P2",
      finding: "Mandat ist als aktive laufende FiBu qualifiziert.",
      evidence:
        "Accounting-Client vorhanden, Stammdatenstatus aktiv und Wirtschaftsjahr abrufbar.",
      recommendation: "Keine Aktion erforderlich.",
      ownerRole: "FiBu-Team",
      calculatedAt,
    }),
    apiResult(client, profile, {
      checkId: "QS-020",
      status: profile.latestFiscalYear ? "fulfilled" : "not_checkable",
      severity: "P2",
      finding: profile.latestFiscalYear
        ? "Ein Rechnungswesen-Wirtschaftsjahr ist abrufbar."
        : "Kein Rechnungswesen-Wirtschaftsjahr abrufbar.",
      evidence: getFiscalYearEvidence(profile),
      recommendation: profile.latestFiscalYear
        ? "Keine Aktion erforderlich."
        : "Rechnungswesenbestand in der Datenquelle prüfen.",
      ownerRole: "FiBu-Team",
      calculatedAt,
    }),
    apiResult(client, profile, getSequenceResult(profile, calculatedAt)),
    apiResult(client, profile, getProcessingStatusResult(profile, calculatedAt)),
  ];
}

function apiResult(
  client: Client,
  profile: AccountingProfile,
  input: {
    checkId: string;
    status: QsStatus;
    severity: Severity;
    finding: string;
    evidence: string;
    recommendation: string;
    ownerRole: string;
    calculatedAt: string;
    dueDate?: string | null;
  },
): QsResult {
  return {
    id: `${client.id}-${input.checkId}-api`,
    clientId: client.id,
    checkId: input.checkId,
    status: input.status,
    severity: input.severity,
    finding: input.finding,
    evidence: input.evidence || profile.dataQualityNote,
    recommendation: input.recommendation,
    ownerRole: input.ownerRole,
    dueDate: input.dueDate ?? null,
    calculatedAt: input.calculatedAt,
  };
}

function getSequenceResult(
  profile: AccountingProfile,
  calculatedAt: string,
): Parameters<typeof apiResult>[2] {
  const sequence = profile.latestSequence;
  if (!sequence) {
    return {
      checkId: "QS-100",
      status: "not_checkable",
      severity: "P0",
      finding:
        "Keine verarbeitete Buchungssequenz in den geprüften Wirtschaftsjahren abrufbar.",
      evidence: profile.dataQualityNote,
      recommendation:
        "Buchungsbestand oder Schnittstellenberechtigung prüfen, bevor die Periode fachlich bewertet wird.",
      ownerRole: "Teamleitung",
      calculatedAt,
    };
  }

  const isCommitted = sequence.isCommitted === true;
  return {
    checkId: "QS-100",
    status: isCommitted ? "fulfilled" : "warning",
    severity: "P0",
    finding: isCommitted
      ? "Letzte Buchungssequenz ist als festgeschrieben gekennzeichnet."
      : "Letzte Buchungssequenz ist nicht als festgeschrieben gekennzeichnet.",
    evidence: getSequenceEvidence(profile),
    recommendation: isCommitted
      ? "Keine Aktion erforderlich."
      : "Festschreibungsstatus im Rechnungswesen prüfen und fachlich freigeben.",
    ownerRole: "Teamleitung",
    calculatedAt,
  };
}

function getProcessingStatusResult(
  profile: AccountingProfile,
  calculatedAt: string,
): Parameters<typeof apiResult>[2] {
  const sequence = profile.latestSequence;
  if (!sequence?.dateTo) {
    return {
      checkId: "QS-110",
      status: "not_checkable",
      severity: "P2",
      finding: "Bearbeitungsstand kann ohne Buchungssequenzdatum nicht bewertet werden.",
      evidence: profile.dataQualityNote,
      recommendation: "Letzten Buchungsstand aus der Datenquelle klären.",
      ownerRole: "Auftragssteuerung",
      calculatedAt,
    };
  }

  const ageDays = getAgeInDays(sequence.dateTo);
  const isCurrent = ageDays <= 45;
  return {
    checkId: "QS-110",
    status: isCurrent ? "fulfilled" : "warning",
    severity: "P2",
    finding: isCurrent
      ? "Der letzte Buchungsstand liegt innerhalb des erwarteten Prüffensters."
      : "Der letzte Buchungsstand liegt mehr als 45 Tage zurück.",
    evidence: getSequenceEvidence(profile),
    recommendation: isCurrent
      ? "Keine Aktion erforderlich."
      : "Aktualität der laufenden FiBu mit Sachbearbeitung klären.",
    ownerRole: "Auftragssteuerung",
    calculatedAt,
  };
}

function getFiscalYearEvidence(profile: AccountingProfile) {
  const fiscalYear = profile.latestFiscalYear;
  if (!fiscalYear) return profile.dataQualityNote;
  return `Wirtschaftsjahr ${fiscalYear.begin ?? "ohne Beginn"} bis ${
    fiscalYear.end ?? "ohne Ende"
  }.`;
}

function getSequenceEvidence(profile: AccountingProfile) {
  const sequence = profile.latestSequence;
  if (!sequence) return profile.dataQualityNote;
  return `Buchungssequenz ${sequence.dateFrom ?? "ohne Start"} bis ${
    sequence.dateTo ?? "ohne Ende"
  }, Festschreibung: ${sequence.isCommitted === true ? "ja" : "nein/unklar"}.`;
}

function getAgeInDays(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function getTrafficLight(
  score: number,
  hasCriticalP0: boolean,
  criticalCount: number,
): TrafficLight {
  if (hasCriticalP0 || criticalCount > 1) return "red";
  if (criticalCount > 0 || score < 85) return "amber";
  return "green";
}

function countStatus(results: QsResult[], status: QsStatus) {
  return results.filter((result) => result.status === status).length;
}
