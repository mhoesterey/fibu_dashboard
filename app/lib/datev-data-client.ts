import { clients } from "./mock-data";
import type { Client } from "./types";

export interface DatevDataClient {
  readonly source: "mock" | "klardaten";
  listClients(params?: { top?: number; skip?: number }): Promise<Client[]>;
  getClient(mandatsnummer: string): Promise<Client | null>;
}

export class MockDatevDataClient implements DatevDataClient {
  readonly source = "mock" as const;

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
  readonly source = "klardaten" as const;

  private readonly baseUrl: string;
  private readonly accessToken: string | undefined;
  private readonly clientInstanceId: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor() {
    this.baseUrl =
      process.env.KLARDATEN_API_BASE_URL ?? "https://api.klardaten.com";
    this.accessToken = process.env.KLARDATEN_ACCESS_TOKEN;
    this.clientInstanceId = process.env.KLARDATEN_CLIENT_INSTANCE_ID;
    this.timeoutMs = toPositiveInt(process.env.HTTP_TIMEOUT_MS, 30000);
    this.maxAttempts = toPositiveInt(process.env.HTTP_RETRY_MAX_ATTEMPTS, 3);
    this.retryBaseDelayMs = toPositiveInt(
      process.env.HTTP_RETRY_BASE_DELAY_MS,
      500,
    );
  }

  async listClients(params: { top?: number; skip?: number } = {}) {
    if (!this.accessToken || !this.clientInstanceId) {
      throw new Error("Klardaten Gateway ist nicht konfiguriert.");
    }

    const url = new URL("/datevconnect/master-data/v1/clients", this.baseUrl);
    url.searchParams.set("top", String(params.top ?? 50));
    if (params.skip) url.searchParams.set("skip", String(params.skip));

    const payload = await this.requestJson(url);
    return normalizeClientList(payload);
  }

  async getClient(mandatsnummer: string) {
    const list = await listAllClients(this, { pageSize: 100, maxClients: 1000 });
    return list.find((client) => client.mandatsnummer === mandatsnummer) ?? null;
  }

  private async requestJson(url: URL) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.accessToken}`,
            "x-client-instance-id": this.clientInstanceId ?? "",
          },
          signal: controller.signal,
        });

        if (response.ok) return (await response.json()) as unknown;

        const retryable = [408, 429, 500, 502, 503, 504].includes(
          response.status,
        );
        const message = mapGatewayError(response.status);
        if (!retryable || attempt === this.maxAttempts) {
          throw new Error(message);
        }
        lastError = new Error(message);
      } catch (error) {
        lastError =
          error instanceof Error
            ? new Error(mapNetworkError(error))
            : new Error("Klardaten Gateway ist nicht erreichbar.");
        if (attempt === this.maxAttempts) break;
      } finally {
        clearTimeout(timeout);
      }

      await wait(this.retryBaseDelayMs * attempt);
    }

    throw lastError ?? new Error("Klardaten Gateway ist nicht erreichbar.");
  }
}

export function getDatevDataClient(): DatevDataClient {
  if (isKlardatenConfigured()) {
    return new KlardatenGatewayClient();
  }
  return new MockDatevDataClient();
}

export function isKlardatenConfigured() {
  return Boolean(
    process.env.KLARDATEN_ACCESS_TOKEN &&
      process.env.KLARDATEN_CLIENT_INSTANCE_ID,
  );
}

export async function listAllClients(
  client: DatevDataClient,
  options: { pageSize?: number; maxClients?: number } = {},
) {
  const pageSize = options.pageSize ?? 100;
  const maxClients = options.maxClients ?? 1000;
  const allClients: Client[] = [];

  for (let skip = 0; skip < maxClients; skip += pageSize) {
    const page = await client.listClients({ top: pageSize, skip });
    allClients.push(...page);

    if (page.length < pageSize) break;
  }

  return allClients.slice(0, maxClients);
}

function normalizeClientList(payload: unknown): Client[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { value?: unknown }).value)
      ? ((payload as { value: unknown[] }).value)
      : Array.isArray((payload as { data?: unknown }).data)
        ? ((payload as { data: unknown[] }).data)
        : Array.isArray((payload as { items?: unknown }).items)
          ? ((payload as { items: unknown[] }).items)
      : [];

  return rows.map((row, index) => {
    const record = row as Record<string, unknown>;
    const rawId =
      record.id ??
      record.client_id ??
      record.clientId ??
      record.client_guid ??
      record.guid;
    const mandatsnummer = String(
      record.number ??
        record.client_number ??
        record.clientNumber ??
        record.client_no ??
        record.clientNo ??
        record.mandantennummer ??
        record.mandatsnummer ??
        rawId ??
        `api-${index}`,
    );
    const name = String(
      record.name ??
        record.display_name ??
        record.displayName ??
        record.client_name ??
        record.clientName ??
        record.company_name ??
        record.companyName ??
        "Unbenanntes Mandat",
    );

    return {
      id: String(rawId ?? mandatsnummer),
      mandatsnummer,
      mandantenname: name,
      zeitraum: currentPeriodLabel(),
      verantwortlicherMitarbeiter: String(
        record.accountant ??
          record.responsible_employee ??
          record.responsibleEmployee ??
          record.employee ??
          "nicht aus API geliefert",
      ),
      datenstand: new Date().toISOString(),
      qsRegelversion: "QS-FiBu-2026.06",
      authorizedUsers: [],
    };
  });
}

function currentPeriodLabel() {
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mapGatewayError(status: number) {
  if (status === 400) return "Klardaten Gateway: Anfrage ist ungültig.";
  if (status === 401) return "Klardaten Gateway: Token ist ungültig oder abgelaufen.";
  if (status === 403) {
    return "Klardaten Gateway: Zugriff, Lizenz oder Instanz ist nicht freigegeben.";
  }
  if (status === 404) return "Klardaten Gateway: Endpunkt oder Mandat nicht gefunden.";
  if (status === 429) return "Klardaten Gateway: Rate Limit erreicht.";
  if (status >= 500) return `Klardaten Gateway: Serverfehler ${status}.`;
  return `Klardaten Gateway Fehler ${status}.`;
}

function mapNetworkError(error: Error) {
  if (error.name === "AbortError") {
    return "Klardaten Gateway: Anfrage hat das Zeitlimit überschritten.";
  }
  return error.message || "Klardaten Gateway ist nicht erreichbar.";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
