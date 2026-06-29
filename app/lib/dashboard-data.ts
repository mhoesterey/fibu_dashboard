import {
  getDatevDataClient,
  isKlardatenConfigured,
  listAllClients,
} from "./datev-data-client";
import {
  getDashboardMetrics,
  getHeatmap,
  getTopActionItems,
} from "./scoring";
import type { Client } from "./types";

export type DashboardData = {
  clients: Client[];
  source: "mock" | "klardaten";
  sourceLabel: string;
  metrics: ReturnType<typeof getDashboardMetrics>;
  heatmap: ReturnType<typeof getHeatmap>;
  topActionItems: ReturnType<typeof getTopActionItems>;
};

export async function loadDashboardData(): Promise<DashboardData> {
  const client = getDatevDataClient();
  const clients = await listAllClients(client, { pageSize: 100, maxClients: 1000 });
  const source = client.source;

  return {
    clients,
    source,
    sourceLabel: getSourceLabel(source),
    metrics: getDashboardMetrics(clients),
    heatmap: getHeatmap(clients),
    topActionItems: getTopActionItems(8, clients),
  };
}

export async function loadClientByMandatsnummer(mandatsnummer: string) {
  const client = getDatevDataClient();
  const dataClient = await client.getClient(mandatsnummer);

  return {
    client: dataClient,
    source: client.source,
    sourceLabel: getSourceLabel(client.source),
  };
}

export function getConfiguredDataSourceLabel() {
  return isKlardatenConfigured()
    ? "Klardaten Gateway"
    : "Mock-Datenquelle (Klardaten nicht konfiguriert)";
}

function getSourceLabel(source: "mock" | "klardaten") {
  return source === "klardaten" ? "Klardaten Gateway" : "Mock-Datenquelle";
}
