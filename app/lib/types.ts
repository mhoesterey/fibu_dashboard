export const qsStatuses = [
  "fulfilled",
  "warning",
  "critical",
  "not_checkable",
  "not_applicable",
] as const;

export type QsStatus = (typeof qsStatuses)[number];

export type Severity = "P0" | "P1" | "P2" | "P3";

export type TrafficLight = "green" | "amber" | "red";

export type UserRole = "owner" | "admin" | "restricted";

export type WorkspaceUser = {
  displayName: string;
  email: string;
  role: UserRole;
};

export type Client = {
  id: string;
  mandatsnummer: string;
  mandantenname: string;
  zeitraum: string;
  verantwortlicherMitarbeiter: string;
  datenstand: string;
  qsRegelversion: string;
  authorizedUsers: string[];
  accountingProfile?: AccountingProfile;
};

export type AccountingProfile = {
  source: "klardaten-accounting";
  accountingClientId: string;
  masterDataClientId: string;
  isActive: true;
  latestFiscalYear?: {
    id: string;
    begin: string | null;
    end: string | null;
    isLocked: boolean | null;
  };
  latestSequence?: {
    id: string;
    dateFrom: string | null;
    dateTo: string | null;
    dateCommitted: string | null;
    isCommitted: boolean | null;
    description: string | null;
  };
  bookingDataStatus: "sequence" | "fiscal_year";
  dataQualityNote: string;
  postingSummary?: PostingSummary;
  openItemsSummary?: OpenItemsSummary;
  sumsAndBalancesSummary?: SumsAndBalancesSummary;
  accountingStatisticsSummary?: AccountingStatisticsSummary;
};

export type PostingSummary = {
  sourceAvailable: boolean;
  sampleSize: number;
  latestPostingDate: string | null;
  missingDocumentFieldCount: number;
  missingPostingTextCount: number;
  missingAccountCount: number;
  missingContraAccountCount: number;
  missingTaxRateCount: number;
  uniqueAccountCount: number;
};

export type OpenItemsSummary = {
  receivableSourceAvailable: boolean;
  payableSourceAvailable: boolean;
  receivableSampleSize: number;
  payableSampleSize: number;
  openItemsCount: number;
  overdueItemsCount: number;
  blockedItemsCount: number;
  maxOverdueDays: number;
};

export type SumsAndBalancesSummary = {
  sourceAvailable: boolean;
  sampleSize: number;
  accountsWithBalanceCount: number;
  accountsWithAnnualMovementCount: number;
};

export type AccountingStatisticsSummary = {
  sourceAvailable: boolean;
  sampleSize: number;
  latestMonth: string | null;
  journalCount: number | null;
  primaNotaCount: number | null;
};

export type DataLoadSummary = {
  sourceLabel: string;
  totalAccountingClients: number;
  totalMasterDataClients: number;
  activeAccountingClients: number;
  clientsWithFiscalYears: number;
  clientsWithBookingSequences: number;
  bookingSequenceMode: "detail_only" | "dashboard";
  excludedInactiveOrUnmatched: number;
  excludedWithoutFiscalYear: number;
};

export type QsCheck = {
  id: string;
  category: string;
  title: string;
  defaultSeverity: Severity;
  active: boolean;
  sortOrder: number;
};

export type QsResult = {
  id: string;
  clientId: string;
  checkId: string;
  status: QsStatus;
  severity: Severity;
  finding: string;
  evidence: string;
  recommendation: string;
  ownerRole: string;
  dueDate: string | null;
  calculatedAt: string;
};

export type QsMatrixRow = QsCheck & {
  result: QsResult;
};

export type ClientScore = {
  score: number;
  trafficLight: TrafficLight;
  fulfilledCount: number;
  warningCount: number;
  criticalCount: number;
  notCheckableCount: number;
  notApplicableCount: number;
  applicableCount: number;
  totalCount: number;
};

export type DashboardMetrics = {
  checkedClients: number;
  averageScore: number;
  criticalClients: number;
  apiFindings: number;
  notCheckablePoints: number;
  lastDataStatus: string;
};

export type HeatmapCell = {
  category: string;
  fulfilled: number;
  warning: number;
  critical: number;
  notCheckable: number;
  notApplicable: number;
  riskLevel: TrafficLight;
  score: number;
};

export type ActionItem = {
  clientNumber: string;
  clientName: string;
  category: string;
  title: string;
  severity: Severity;
  status: QsStatus;
  finding: string;
  recommendation: string;
  ownerRole: string;
  dueDate: string | null;
};

export type RefreshRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "failed";
  triggeredBy: string;
  log: string[];
  errorMessage?: string;
};
