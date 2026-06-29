import {
  getDatevDataClient,
  getKlardatenSourceLabel,
  isKlardatenConfigured,
  listAllClients,
} from "./datev-data-client";
import {
  getDashboardMetrics,
  getHeatmap,
  getTopActionItems,
} from "./scoring";
import type { Client, DataLoadSummary } from "./types";

export type DashboardData = {
  clients: Client[];
  source: "mock" | "klardaten";
  sourceLabel: string;
  metrics: ReturnType<typeof getDashboardMetrics>;
  heatmap: ReturnType<typeof getHeatmap>;
  topActionItems: ReturnType<typeof getTopActionItems>;
  loadSummary: DataLoadSummary | null;
  refreshLogDetails: string[];
};

export async function loadDashboardData(): Promise<DashboardData> {
  const client = getDatevDataClient();
  const clients = await listAllClients(client, { pageSize: 100, maxClients: 1000 });
  const source = client.source;
  const loadSummary = client.getLoadSummary();

  return {
    clients,
    source,
    sourceLabel: loadSummary?.sourceLabel ?? getSourceLabel(source),
    metrics: getDashboardMetrics(clients),
    heatmap: getHeatmap(clients),
    topActionItems: getTopActionItems(8, clients),
    loadSummary,
    refreshLogDetails: getRefreshLogDetails(loadSummary),
  };
}

export async function loadClientByMandatsnummer(mandatsnummer: string) {
  const client = getDatevDataClient();
  const dataClient = await client.getClient(mandatsnummer);

  return {
    client: dataClient,
    source: client.source,
    sourceLabel: client.getLoadSummary()?.sourceLabel ?? getSourceLabel(client.source),
  };
}

export function getConfiguredDataSourceLabel() {
  return isKlardatenConfigured()
    ? getKlardatenSourceLabel()
    : "Mock-Datenquelle (Klardaten nicht konfiguriert)";
}

function getSourceLabel(source: "mock" | "klardaten") {
  return source === "klardaten" ? getKlardatenSourceLabel() : "Mock-Datenquelle";
}

function getRefreshLogDetails(summary: DataLoadSummary | null) {
  if (!summary || summary.sourceLabel === "Mock-Datenquelle") return [];

  const sequenceLog =
    summary.bookingSequenceMode === "dashboard"
      ? `${summary.clientsWithBookingSequences} Mandate am letzten Buchungsbestand aus Sequenzen verankert`
      : "Buchungssequenzen werden gezielt in der Einzelmandatsauswertung vertieft geprüft";
  const fiscalYearLog =
    summary.bookingSequenceMode === "dashboard"
      ? `${summary.excludedWithoutFiscalYear} Mandate ohne abrufbares Rechnungswesen-Wirtschaftsjahr ausgeschlossen`
      : "Abrufbares Rechnungswesen-Wirtschaftsjahr wird je Einzelmandat verbindlich geprüft";

  return [
    `${summary.totalAccountingClients} Accounting-Mandate aus Klardaten gelesen`,
    `${summary.activeAccountingClients} Mandate sind aktive FiBu-Kandidaten nach Stammdatenabgleich`,
    `${summary.excludedInactiveOrUnmatched} inaktive oder nicht eindeutig aktive Mandate ausgeschlossen`,
    fiscalYearLog,
    sequenceLog,
  ];
}
