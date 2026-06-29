import { clients } from "./mock-data";
import type { Client } from "./types";

export interface DatevDataClient {
  listClients(params?: { top?: number; skip?: number }): Promise<Client[]>;
  getClient(mandatsnummer: string): Promise<Client | null>;
}

export class MockDatevDataClient implements DatevDataClient {
  async listClients(params: { top?: number; skip?: number } = {}) {
    const skip = params.skip ?? 0;
    const top = params.top ?? clients.length;
    return clients.slice(skip, skip + top);
  }

  async getClient(mandatsnummer: string) {
    return clients.find((client) => client.mandatsnummer === mandatsnummer) ?? null;
  }
}

export class KlardatenGatewayClient implements DatevDataClient {
  private readonly baseUrl: string;
  private readonly accessToken: string | undefined;
  private readonly clientInstanceId: string | undefined;

  constructor() {
    this.baseUrl =
      process.env.KLARDATEN_API_BASE_URL ?? "https://api.klardaten.com";
    this.accessToken = process.env.KLARDATEN_ACCESS_TOKEN;
    this.clientInstanceId = process.env.KLARDATEN_CLIENT_INSTANCE_ID;
  }

  async listClients(params: { top?: number; skip?: number } = {}) {
    if (!this.accessToken || !this.clientInstanceId) {
      throw new Error("Klardaten Gateway ist nicht konfiguriert.");
    }

    const url = new URL("/datevconnect/master-data/v1/clients", this.baseUrl);
    url.searchParams.set("top", String(params.top ?? 50));
    if (params.skip) url.searchParams.set("skip", String(params.skip));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        "x-client-instance-id": this.clientInstanceId,
      },
    });

    if (!response.ok) {
      throw new Error(`Klardaten Gateway Fehler ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return normalizeClientList(payload);
  }

  async getClient(mandatsnummer: string) {
    const list = await this.listClients({ top: 200 });
    return list.find((client) => client.mandatsnummer === mandatsnummer) ?? null;
  }
}

export function getDatevDataClient(): DatevDataClient {
  if (process.env.KLARDATEN_ACCESS_TOKEN && process.env.KLARDATEN_CLIENT_INSTANCE_ID) {
    return new KlardatenGatewayClient();
  }
  return new MockDatevDataClient();
}

function normalizeClientList(payload: unknown): Client[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { value?: unknown }).value)
      ? ((payload as { value: unknown[] }).value)
      : [];

  return rows.map((row, index) => {
    const record = row as Record<string, unknown>;
    const mandatsnummer = String(
      record.number ?? record.client_number ?? record.clientNumber ?? `api-${index}`,
    );

    return {
      id: String(record.id ?? mandatsnummer),
      mandatsnummer,
      mandantenname: String(record.name ?? record.client_name ?? "Unbenanntes Mandat"),
      zeitraum: "nicht geladen",
      verantwortlicherMitarbeiter: "nicht geladen",
      datenstand: new Date().toISOString(),
      qsRegelversion: "QS-FiBu-2026.06",
      authorizedUsers: [],
    };
  });
}
