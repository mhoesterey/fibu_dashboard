import { clients, qsChecks, qsResults } from "./mock-data";
import type {
  ActionItem,
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

export function getClientByNumber(mandatsnummer: string) {
  return clients.find((client) => client.mandatsnummer === mandatsnummer);
}

export function getResultsForClient(clientId: string) {
  return qsResults.filter((result) => result.clientId === clientId);
}

export function getMatrixForClient(client: Client): QsMatrixRow[] {
  const results = getResultsForClient(client.id);

  return [...qsChecks]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((check) => {
      const result =
        results.find((entry) => entry.checkId === check.id) ??
        missingResult(client.id, check.id, check.defaultSeverity);
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
  const score = totalWeight > 0 ? Math.round((fulfilledWeight / totalWeight) * 100) : 0;

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

export function getDashboardMetrics(): DashboardMetrics {
  const scores = clients.map(calculateClientScore);
  const allResults = clients.flatMap((client) => getMatrixForClient(client));
  const averageScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, score) => sum + score.score, 0) / scores.length,
        )
      : 0;

  return {
    checkedClients: clients.length,
    averageScore,
    criticalClients: scores.filter((score) => score.trafficLight === "red").length,
    openQuestions: allResults.filter((row) =>
      ["warning", "critical", "not_checkable"].includes(row.result.status),
    ).length,
    notCheckablePoints: allResults.filter(
      (row) => row.result.status === "not_checkable",
    ).length,
    lastDataStatus: getLatestDataStatus(),
  };
}

export function getHeatmap(): HeatmapCell[] {
  return qsChecks
    .map((check) => check.category)
    .filter((category, index, categories) => categories.indexOf(category) === index)
    .map((category) => {
      const rows = clients.flatMap((client) =>
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

export function getTopActionItems(limit = 8): ActionItem[] {
  const priority = { critical: 0, warning: 1, not_checkable: 2, fulfilled: 3, not_applicable: 4 };
  const severityPriority: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

  return clients
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

export function getLatestDataStatus() {
  return clients
    .map((client) => client.datenstand)
    .sort((left, right) => right.localeCompare(left))[0];
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
    return `${base} Der Mandatsstatus ist rot, weil mindestens ein kritischer Befund vorliegt. Belegt ist aktuell: ${first.title} - ${first.result.evidence}. ${notCheckable.length > 0 ? `${notCheckable.length} QS-Punkt(e) sind nicht prüfbar und werden nicht als erfüllt gezählt.` : ""}`;
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

function missingResult(
  clientId: string,
  checkId: string,
  severity: Severity,
): QsResult {
  return {
    id: `${clientId}-${checkId}-missing`,
    clientId,
    checkId,
    status: "not_checkable",
    severity,
    finding: "Für diesen QS-Punkt liegt kein Ergebnis vor.",
    evidence: "Keine Evidenz in der aktuellen Datenquelle.",
    recommendation: "Datenquelle prüfen und QS-Ergebnis nachberechnen.",
    ownerRole: "System / Datenintegration",
    dueDate: null,
    calculatedAt: new Date().toISOString(),
  };
}

function getTrafficLight(
  score: number,
  hasCriticalP0: boolean,
  criticalCount: number,
): TrafficLight {
  if (hasCriticalP0 || criticalCount > 1 || score < 65) return "red";
  if (criticalCount > 0 || score < 85) return "amber";
  return "green";
}

function countStatus(results: QsResult[], status: QsStatus) {
  return results.filter((result) => result.status === status).length;
}
