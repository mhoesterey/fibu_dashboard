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

type ApiResultInput = {
  checkId: string;
  status: QsStatus;
  severity: Severity;
  finding: string;
  evidence: string;
  recommendation: string;
  ownerRole: string;
  calculatedAt: string;
  dueDate?: string | null;
};

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
  const storedResults = getResultsForClientId(client.id);
  const apiResults =
    storedResults.length === 0 && client.accountingProfile
      ? getApiDerivedResults(client)
      : [];

  return [...qsChecks]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((check) => {
      const result =
        storedResults.find((entry) => entry.checkId === check.id) ??
        apiResults.find((entry) => entry.checkId === check.id) ??
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
  const allRows = sourceClients.flatMap((client) => getMatrixForClient(client));
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
    apiFindings: allRows.filter((row) =>
      ["warning", "critical", "not_checkable"].includes(row.result.status),
    ).length,
    notCheckablePoints: allRows.filter(
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
          critical > 0 ? "red" : warning + notCheckable > 0 ? "amber" : "green",
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
  const notApplicable = matrix.filter(
    (row) => row.result.status === "not_applicable",
  );

  const base = `Fuer Mandat ${client.mandatsnummer} liegt der API-basierte QS-Score bei ${score.score} von 100 Punkten.`;
  if (critical.length > 0) {
    const first = critical[0];
    return `${base} Der Mandatsstatus ist rot, weil ein kritischer API-Befund vorliegt. Belegt ist aktuell: ${first.title} - ${first.result.evidence}.`;
  }
  if (warnings.length > 0 || notCheckable.length > 0) {
    return `${base} Es gibt ${warnings.length} auffaellige und ${notCheckable.length} nicht pruefbare API-QS-Punkte. ${notApplicable.length} Detailpruefungen sind im Gesamtbestand ausgeblendet oder fuer dieses Mandat nicht anwendbar.`;
  }
  return `${base} Alle aktuell anwendbaren API-QS-Punkte sind erfuellt. Nicht per API belegbare Alt-QS-Punkte sind nicht mehr Teil der Wertung.`;
}

export function createSimulatedRefreshRun(triggeredBy: string): RefreshRun {
  return {
    id: `refresh-${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "success",
    triggeredBy,
    log: [
      "Workspace-Identitaet geprueft",
      "Mock-Datenquelle geladen",
      "API-faehige QS-Regeln neu berechnet",
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
    "Workspace-Identitaet geprueft",
    `${sourceLabel} geladen (${input.checkedClients} Mandate)`,
    ...(input.logDetails ?? []),
    "Nur API-faehige QS-Regeln berechnet",
    "Nicht per API belegbare Alt-QS-Punkte aus der Wertung entfernt",
    "KPI-Kacheln, Heatmap und Handlungsbedarf aktualisiert",
  ];
  const failedLog = [
    "Workspace-Identitaet geprueft",
    `${sourceLabel} konnte nicht vollstaendig geladen werden`,
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
  return {
    id: `${client.id}-${checkId}-missing`,
    clientId: client.id,
    checkId,
    status: "not_checkable",
    severity,
    finding: "Fuer diesen API-QS-Punkt liegt keine berechenbare Evidenz vor.",
    evidence: client.accountingProfile?.dataQualityNote ?? "Keine API-Evidenz.",
    recommendation: "API-Abruf, Berechtigung oder Regelmapping pruefen.",
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
    getActiveAccountingResult(client, profile, calculatedAt),
    getFiscalYearResult(client, profile, calculatedAt),
    getFiscalYearFieldsResult(client, profile, calculatedAt),
    getBookingSequenceAvailableResult(client, profile, calculatedAt),
    getBookingSequenceCommittedResult(client, profile, calculatedAt),
    getPostingAvailabilityResult(client, profile, calculatedAt),
    getPostingTextResult(client, profile, calculatedAt),
    getPostingAccountResult(client, profile, calculatedAt),
    getOpenItemsAvailabilityResult(client, profile, calculatedAt),
    getOverdueOpenItemsResult(client, profile, calculatedAt),
    getSumsAndBalancesAvailabilityResult(client, profile, calculatedAt),
    getAccountsWithMovementResult(client, profile, calculatedAt),
    getTaxIndicatorResult(client, profile, calculatedAt),
    getAccountingStatisticsResult(client, profile, calculatedAt),
  ];
}

function apiResult(
  client: Client,
  profile: AccountingProfile,
  input: ApiResultInput,
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

function getActiveAccountingResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  return apiResult(client, profile, {
    checkId: "API-001",
    status: "fulfilled",
    severity: "P0",
    finding: "Mandat ist in der aktiven Accounting-Grundgesamtheit enthalten.",
    evidence: "Accounting-Client vorhanden und Stammdatenstatus aktiv.",
    recommendation: "Keine Aktion erforderlich.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getFiscalYearResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  if (!profile.latestFiscalYear) {
    return apiResult(client, profile, dashboardOnly("API-010", "P0", calculatedAt));
  }
  return apiResult(client, profile, {
    checkId: "API-010",
    status: "fulfilled",
    severity: "P0",
    finding: "Rechnungswesen-Wirtschaftsjahr ist abrufbar.",
    evidence: getFiscalYearEvidence(profile),
    recommendation: "Keine Aktion erforderlich.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getFiscalYearFieldsResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const fiscalYear = profile.latestFiscalYear;
  if (!fiscalYear) {
    return apiResult(client, profile, dashboardOnly("API-011", "P2", calculatedAt));
  }
  const complete = Boolean(fiscalYear.begin && fiscalYear.end);
  return apiResult(client, profile, {
    checkId: "API-011",
    status: complete ? "fulfilled" : "warning",
    severity: "P2",
    finding: complete
      ? "Beginn und Ende des Wirtschaftsjahres sind vorhanden."
      : "Beginn oder Ende des Wirtschaftsjahres fehlen.",
    evidence: getFiscalYearEvidence(profile),
    recommendation: complete
      ? "Keine Aktion erforderlich."
      : "Wirtschaftsjahr-Stammdaten im Rechnungswesen pruefen.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getBookingSequenceAvailableResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  if (!profile.latestFiscalYear) {
    return apiResult(client, profile, dashboardOnly("API-020", "P1", calculatedAt));
  }
  const sequence = profile.latestSequence;
  return apiResult(client, profile, {
    checkId: "API-020",
    status: sequence ? "fulfilled" : "warning",
    severity: "P1",
    finding: sequence
      ? "Letzter Buchungsbestand ist ueber verarbeitete Sequenz ermittelt."
      : "Zum Wirtschaftsjahr wurde keine verarbeitete Buchungssequenz gefunden.",
    evidence: sequence ? getSequenceEvidence(profile) : getFiscalYearEvidence(profile),
    recommendation: sequence
      ? "Keine Aktion erforderlich."
      : "Buchungsstand oder Schnittstellenberechtigung pruefen.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getBookingSequenceCommittedResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  if (!profile.latestFiscalYear) {
    return apiResult(client, profile, dashboardOnly("API-021", "P0", calculatedAt));
  }
  const sequence = profile.latestSequence;
  if (!sequence) {
    return apiResult(client, profile, {
      checkId: "API-021",
      status: "not_checkable",
      severity: "P0",
      finding: "Festschreibung ist ohne Buchungssequenz nicht pruefbar.",
      evidence: getFiscalYearEvidence(profile),
      recommendation: "Buchungssequenz nachladen oder Berechtigung pruefen.",
      ownerRole: "Teamleitung FiBu",
      calculatedAt,
    });
  }
  return apiResult(client, profile, {
    checkId: "API-021",
    status: sequence.isCommitted === true ? "fulfilled" : "warning",
    severity: "P0",
    finding:
      sequence.isCommitted === true
        ? "Letzte Sequenz ist als festgeschrieben markiert."
        : "Letzte Sequenz ist nicht als festgeschrieben markiert.",
    evidence: getSequenceEvidence(profile),
    recommendation:
      sequence.isCommitted === true
        ? "Keine Aktion erforderlich."
        : "Festschreibung fachlich pruefen.",
    ownerRole: "Teamleitung FiBu",
    calculatedAt,
  });
}

function getPostingAvailabilityResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.postingSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-030", "P1", calculatedAt));
  return apiResult(client, profile, {
    checkId: "API-030",
    status: summary.sourceAvailable && summary.sampleSize > 0 ? "fulfilled" : "warning",
    severity: "P1",
    finding:
      summary.sourceAvailable && summary.sampleSize > 0
        ? "Buchungssaetze sind aus der API auswertbar."
        : "Buchungssatz-Endpunkt liefert keine auswertbare Stichprobe.",
    evidence: `Stichprobe ${summary.sampleSize} Buchungen, letzter Buchungstag ${summary.latestPostingDate ?? "nicht geliefert"}.`,
    recommendation:
      summary.sourceAvailable && summary.sampleSize > 0
        ? "Keine Aktion erforderlich."
        : "Buchungssatzabruf oder Rechnungswesenbestand pruefen.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getPostingTextResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.postingSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-031", "P1", calculatedAt));
  if (!summary.sourceAvailable || summary.sampleSize === 0) {
    return apiResult(client, profile, notCheckable("API-031", "P1", "Keine Buchungssatz-Stichprobe vorhanden.", calculatedAt));
  }
  const issueCount =
    summary.missingDocumentFieldCount + summary.missingPostingTextCount;
  const issueRate = issueCount / (summary.sampleSize * 2);
  const status: QsStatus =
    issueRate > 0.25 ? "critical" : issueCount > 0 ? "warning" : "fulfilled";
  return apiResult(client, profile, {
    checkId: "API-031",
    status,
    severity: "P1",
    finding:
      issueCount > 0
        ? "Buchungen mit fehlendem Belegfeld oder Buchungstext gefunden."
        : "Belegfeld und Buchungstext sind in der Stichprobe gefuellt.",
    evidence: `${summary.missingDocumentFieldCount} fehlende Belegfelder, ${summary.missingPostingTextCount} fehlende Buchungstexte bei ${summary.sampleSize} Buchungen.`,
    recommendation:
      issueCount > 0
        ? "Buchungstexte und Belegfelder im Rechnungswesen nacharbeiten."
        : "Keine Aktion erforderlich.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getPostingAccountResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.postingSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-032", "P1", calculatedAt));
  if (!summary.sourceAvailable || summary.sampleSize === 0) {
    return apiResult(client, profile, notCheckable("API-032", "P1", "Keine Buchungssatz-Stichprobe vorhanden.", calculatedAt));
  }
  const issueCount = summary.missingAccountCount + summary.missingContraAccountCount;
  return apiResult(client, profile, {
    checkId: "API-032",
    status: issueCount > 0 ? "warning" : "fulfilled",
    severity: "P1",
    finding:
      issueCount > 0
        ? "Buchungen mit fehlendem Konto oder Gegenkonto gefunden."
        : "Konto und Gegenkonto sind in der Stichprobe gefuellt.",
    evidence: `${summary.missingAccountCount} fehlende Konten, ${summary.missingContraAccountCount} fehlende Gegenkonten, ${summary.uniqueAccountCount} unterschiedliche Konten.`,
    recommendation:
      issueCount > 0
        ? "Kontierung in der Buchungssatz-Stichprobe pruefen."
        : "Keine Aktion erforderlich.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getOpenItemsAvailabilityResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.openItemsSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-040", "P1", calculatedAt));
  const available = summary.receivableSourceAvailable || summary.payableSourceAvailable;
  return apiResult(client, profile, {
    checkId: "API-040",
    status: available ? "fulfilled" : "not_checkable",
    severity: "P1",
    finding: available
      ? "OPOS-Debitoren/Kreditoren sind API-seitig auswertbar."
      : "OPOS-Endpunkte konnten nicht auswertbar geladen werden.",
    evidence: `${summary.receivableSampleSize} Debitorenposten, ${summary.payableSampleSize} Kreditorenposten in der Stichprobe.`,
    recommendation: available
      ? "Keine Aktion erforderlich."
      : "OPOS-Berechtigung oder Rechnungswesenbestand pruefen.",
    ownerRole: "FiBu-Team / OPOS",
    calculatedAt,
  });
}

function getOverdueOpenItemsResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.openItemsSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-041", "P1", calculatedAt));
  const status: QsStatus =
    summary.maxOverdueDays > 90 || summary.overdueItemsCount > 10
      ? "critical"
      : summary.overdueItemsCount > 0
        ? "warning"
        : "fulfilled";
  return apiResult(client, profile, {
    checkId: "API-041",
    status,
    severity: "P1",
    finding:
      summary.overdueItemsCount > 0
        ? "Ueberfaellige offene Posten sind vorhanden."
        : "Keine ueberfaelligen offenen Posten in der Stichprobe.",
    evidence: `${summary.openItemsCount} offene Posten, ${summary.overdueItemsCount} ueberfaellig, maximale Ueberfaelligkeit ${summary.maxOverdueDays} Tage.`,
    recommendation:
      summary.overdueItemsCount > 0
        ? "OPOS-Klaerung mit Sachbearbeitung/Mandant anstossen."
        : "Keine Aktion erforderlich.",
    ownerRole: "FiBu-Team / OPOS",
    calculatedAt,
  });
}

function getSumsAndBalancesAvailabilityResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.sumsAndBalancesSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-050", "P1", calculatedAt));
  return apiResult(client, profile, {
    checkId: "API-050",
    status: summary.sourceAvailable && summary.sampleSize > 0 ? "fulfilled" : "not_checkable",
    severity: "P1",
    finding:
      summary.sourceAvailable && summary.sampleSize > 0
        ? "Summen- und Saldenwerte sind auswertbar."
        : "Summen- und Saldenwerte konnten nicht geladen werden.",
    evidence: `${summary.sampleSize} Konten in der SuSa-Stichprobe.`,
    recommendation:
      summary.sourceAvailable && summary.sampleSize > 0
        ? "Keine Aktion erforderlich."
        : "SuSa-Abruf oder Berechtigung pruefen.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getAccountsWithMovementResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.sumsAndBalancesSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-051", "P2", calculatedAt));
  return apiResult(client, profile, {
    checkId: "API-051",
    status: summary.accountsWithAnnualMovementCount > 0 ? "fulfilled" : "warning",
    severity: "P2",
    finding:
      summary.accountsWithAnnualMovementCount > 0
        ? "Sachkonten mit Jahresbewegung sind erkennbar."
        : "Keine Sachkonten mit Jahresbewegung in der Stichprobe.",
    evidence: `${summary.accountsWithBalanceCount} Konten mit Saldo, ${summary.accountsWithAnnualMovementCount} Konten mit Jahresbewegung.`,
    recommendation:
      summary.accountsWithAnnualMovementCount > 0
        ? "Keine Aktion erforderlich."
        : "Zeitraum oder SuSa-Datenbestand pruefen.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function getTaxIndicatorResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.postingSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-060", "P1", calculatedAt));
  if (!summary.sourceAvailable || summary.sampleSize === 0) {
    return apiResult(client, profile, notCheckable("API-060", "P1", "Keine Buchungssatz-Stichprobe vorhanden.", calculatedAt));
  }
  const allTaxMissing = summary.missingTaxRateCount >= summary.sampleSize;
  return apiResult(client, profile, {
    checkId: "API-060",
    status: allTaxMissing ? "warning" : "fulfilled",
    severity: "P1",
    finding: allTaxMissing
      ? "Steuersatz-/USt-Indikatoren fehlen in der Buchungssatz-Stichprobe."
      : "Steuersatz-/USt-Indikatoren sind in Buchungen auswertbar.",
    evidence: `${summary.missingTaxRateCount} von ${summary.sampleSize} Buchungen ohne tax_rate.`,
    recommendation: allTaxMissing
      ? "USt-Auswertbarkeit und Konten-/Steuerschluessel-Mapping pruefen."
      : "Keine Aktion erforderlich.",
    ownerRole: "Steuerfachliche Pruefung",
    calculatedAt,
  });
}

function getAccountingStatisticsResult(
  client: Client,
  profile: AccountingProfile,
  calculatedAt: string,
) {
  const summary = profile.accountingStatisticsSummary;
  if (!summary) return apiResult(client, profile, detailOnly("API-070", "P2", calculatedAt));
  return apiResult(client, profile, {
    checkId: "API-070",
    status: summary.sourceAvailable && summary.sampleSize > 0 ? "fulfilled" : "warning",
    severity: "P2",
    finding:
      summary.sourceAvailable && summary.sampleSize > 0
        ? "Accounting-Statistiken sind abrufbar."
        : "Accounting-Statistiken liefern keine auswertbare Stichprobe.",
    evidence: `Monate ${summary.sampleSize}, letzter Monat ${summary.latestMonth ?? "nicht geliefert"}, Journal ${summary.journalCount ?? "n/a"}, Prima Nota ${summary.primaNotaCount ?? "n/a"}.`,
    recommendation:
      summary.sourceAvailable && summary.sampleSize > 0
        ? "Keine Aktion erforderlich."
        : "Statistik-Endpunkt oder Periodenbestand pruefen.",
    ownerRole: "FiBu-Team",
    calculatedAt,
  });
}

function detailOnly(
  checkId: string,
  severity: Severity,
  calculatedAt: string,
): ApiResultInput {
  return {
    checkId,
    status: "not_applicable",
    severity,
    finding: "Diese API-Detailregel wird nur in der Einzelmandatsauswertung berechnet.",
    evidence: "Im Gesamtbestand werden keine tiefen Buchungs-/OPOS-/SuSa-Abrufe fuer alle Mandate ausgefuehrt.",
    recommendation: "Einzelmandat oeffnen, um die Detailregel zu berechnen.",
    ownerRole: "System / Datenintegration",
    calculatedAt,
  };
}

function dashboardOnly(
  checkId: string,
  severity: Severity,
  calculatedAt: string,
): ApiResultInput {
  return {
    checkId,
    status: "not_applicable",
    severity,
    finding: "Diese API-Regel wird erst beim Oeffnen des Einzelmandats verbindlich geprueft.",
    evidence: "Das Dashboard nutzt nur die aktive Accounting-Grundgesamtheit.",
    recommendation: "Einzelmandat oeffnen, um Wirtschaftsjahr und Buchungsbestand zu pruefen.",
    ownerRole: "System / Datenintegration",
    calculatedAt,
  };
}

function notCheckable(
  checkId: string,
  severity: Severity,
  finding: string,
  calculatedAt: string,
): ApiResultInput {
  return {
    checkId,
    status: "not_checkable",
    severity,
    finding,
    evidence: "API-Evidenz fehlt in der geladenen Detailstichprobe.",
    recommendation: "API-Abruf, Berechtigung oder Periodenbestand pruefen.",
    ownerRole: "System / Datenintegration",
    calculatedAt,
  };
}

function getFiscalYearEvidence(profile: AccountingProfile) {
  const fiscalYear = profile.latestFiscalYear;
  if (!fiscalYear) return profile.dataQualityNote;
  return `Wirtschaftsjahr ${fiscalYear.begin ?? "ohne Beginn"} bis ${
    fiscalYear.end ?? "ohne Ende"
  }, gesperrt: ${fiscalYear.isLocked === true ? "ja" : "nein/unklar"}.`;
}

function getSequenceEvidence(profile: AccountingProfile) {
  const sequence = profile.latestSequence;
  if (!sequence) return profile.dataQualityNote;
  return `Buchungssequenz ${sequence.dateFrom ?? "ohne Start"} bis ${
    sequence.dateTo ?? "ohne Ende"
  }, Festschreibung: ${sequence.isCommitted === true ? "ja" : "nein/unklar"}.`;
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
