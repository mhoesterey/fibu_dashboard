import { clients } from "./mock-data";
import type {
  AccountingProfile,
  AccountingStatisticsSummary,
  Client,
  DataLoadSummary,
  OpenItemsSummary,
  PostingSummary,
  SumsAndBalancesSummary,
} from "./types";

type RawRecord = Record<string, unknown>;

const MASTER_DATA_CLIENTS_PATH = "/datevconnect/master-data/v1/clients";
const ACCOUNTING_CLIENTS_PATH = "/datevconnect/accounting/v1/clients";
const QS_RULE_VERSION = "QS-FiBu-2026.06";

export interface DatevDataClient {
  readonly source: "mock" | "klardaten";
  listClients(params?: { top?: number; skip?: number }): Promise<Client[]>;
  listFibuClients(options?: {
    maxClients?: number;
    includeBookingSequences?: boolean;
    requireFiscalYear?: boolean;
  }): Promise<Client[]>;
  getClient(mandatsnummer: string): Promise<Client | null>;
  getLoadSummary(): DataLoadSummary | null;
}

export class MockDatevDataClient implements DatevDataClient {
  readonly source = "mock" as const;

  async listClients(params: { top?: number; skip?: number } = {}) {
    const skip = params.skip ?? 0;
    const top = params.top ?? clients.length;
    return clients.slice(skip, skip + top);
  }

  async listFibuClients(
    options: {
      maxClients?: number;
      includeBookingSequences?: boolean;
      requireFiscalYear?: boolean;
    } = {},
  ) {
    return clients.slice(0, options.maxClients ?? clients.length);
  }

  async getClient(mandatsnummer: string) {
    return clients.find((client) => client.mandatsnummer === mandatsnummer) ?? null;
  }

  getLoadSummary(): DataLoadSummary {
    return {
      sourceLabel: "Mock-Datenquelle",
      totalAccountingClients: clients.length,
      totalMasterDataClients: clients.length,
      activeAccountingClients: clients.length,
      clientsWithFiscalYears: clients.length,
      clientsWithBookingSequences: clients.length,
      bookingSequenceMode: "dashboard",
      excludedInactiveOrUnmatched: 0,
      excludedWithoutFiscalYear: 0,
    };
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
  private readonly maxAccountingClients: number;
  private readonly sequenceLookbackYears: number;
  private readonly concurrency: number;
  private cachedClients: Client[] | null = null;
  private cachedAt = 0;
  private lastSummary: DataLoadSummary | null = null;

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
    this.maxAccountingClients = toPositiveInt(
      process.env.KLARDATEN_MAX_ACCOUNTING_CLIENTS,
      1000,
    );
    this.sequenceLookbackYears = toPositiveInt(
      process.env.KLARDATEN_SEQUENCE_LOOKBACK_YEARS,
      4,
    );
    this.concurrency = toPositiveInt(process.env.KLARDATEN_FETCH_CONCURRENCY, 10);
  }

  async listClients(params: { top?: number; skip?: number } = {}) {
    const skip = params.skip ?? 0;
    const top = params.top ?? this.maxAccountingClients;
    const fibuClients = await this.listFibuClients({
      maxClients: this.maxAccountingClients,
      includeBookingSequences: false,
    });
    return fibuClients.slice(skip, skip + top);
  }

  async listFibuClients(
    options: {
      maxClients?: number;
      includeBookingSequences?: boolean;
      requireFiscalYear?: boolean;
    } = {},
  ) {
    this.assertConfigured();

    const maxClients = options.maxClients ?? this.maxAccountingClients;
    const includeBookingSequences = options.includeBookingSequences ?? false;
    const requireFiscalYear = options.requireFiscalYear ?? includeBookingSequences;
    const cacheTtlMs = toPositiveInt(process.env.KLARDATEN_CACHE_TTL_MS, 300000);
    if (
      !includeBookingSequences &&
      this.cachedClients &&
      Date.now() - this.cachedAt < cacheTtlMs
    ) {
      return this.cachedClients.slice(0, maxClients);
    }

    const [accountingRows, masterRows] = await Promise.all([
      this.listRowsPaged(ACCOUNTING_CLIENTS_PATH, {
        pageSize: 1000,
        maxRows: maxClients,
      }),
      this.listRowsPaged(MASTER_DATA_CLIENTS_PATH, {
        pageSize: 1000,
        maxRows: Math.max(1500, maxClients),
      }),
    ]);

    const masterIndex = createMasterIndex(masterRows);
    const activeAccountingRows = accountingRows
      .map((accounting) => ({
        accounting,
        master: findMatchingMasterRecord(accounting, masterIndex),
      }))
      .filter(({ master }) => isActiveMasterRecord(master));

    const enriched = await mapWithConcurrency(
      activeAccountingRows,
      this.concurrency,
      ({ accounting, master }) =>
        this.toBookableClient(accounting, master, {
          includeBookingSequences,
          requireFiscalYear,
        }),
    );
    const filteredClients = enriched.filter(isPresent);

    this.lastSummary = {
      sourceLabel: getKlardatenSourceLabel(),
      totalAccountingClients: accountingRows.length,
      totalMasterDataClients: masterRows.length,
      activeAccountingClients: activeAccountingRows.length,
      clientsWithFiscalYears: filteredClients.filter(
        (client) => Boolean(client.accountingProfile?.latestFiscalYear),
      ).length,
      clientsWithBookingSequences: filteredClients.filter(
        (client) => client.accountingProfile?.bookingDataStatus === "sequence",
      ).length,
      bookingSequenceMode: includeBookingSequences ? "dashboard" : "detail_only",
      excludedInactiveOrUnmatched:
        accountingRows.length - activeAccountingRows.length,
      excludedWithoutFiscalYear: requireFiscalYear
        ? activeAccountingRows.length - filteredClients.length
        : 0,
    };

    if (!includeBookingSequences) {
      this.cachedClients = filteredClients;
      this.cachedAt = Date.now();
    }
    return filteredClients;
  }

  async getClient(mandatsnummer: string) {
    const list = await this.listFibuClients({
      maxClients: this.maxAccountingClients,
      includeBookingSequences: false,
    });
    const normalizedInput = normalizeLookupValue(mandatsnummer);
    const client =
      list.find(
        (entry) =>
          entry.mandatsnummer === mandatsnummer ||
          normalizeLookupValue(entry.mandatsnummer) === normalizedInput,
      ) ?? null;

    return client ? this.enrichClientWithBookingSequence(client) : null;
  }

  getLoadSummary() {
    return this.lastSummary;
  }

  private async toBookableClient(
    accountingRecord: RawRecord,
    masterRecord: RawRecord | null,
    options: { includeBookingSequences: boolean; requireFiscalYear: boolean },
  ): Promise<Client | null> {
    if (!masterRecord) return null;

    const accountingClientId = stringValue(accountingRecord.id);
    const masterDataClientId = stringValue(masterRecord.id);
    if (!accountingClientId || !masterDataClientId) return null;

    let sortedFiscalYears: RawRecord[] = [];
    let selectedFiscalYear: RawRecord | null = null;
    let latestSequence: RawRecord | null = null;

    if (options.requireFiscalYear || options.includeBookingSequences) {
      let fiscalYears: RawRecord[];
      try {
        fiscalYears = await this.requestRows(
          `${ACCOUNTING_CLIENTS_PATH}/${encodeURIComponent(
            accountingClientId,
          )}/fiscal-years`,
          { top: options.includeBookingSequences ? 20 : 1 },
        );
      } catch {
        return null;
      }

      if (fiscalYears.length === 0) return null;
      sortedFiscalYears = [...fiscalYears].sort(compareFiscalYearsDesc);
      selectedFiscalYear = sortedFiscalYears[0];
    }

    if (options.includeBookingSequences && selectedFiscalYear) {
      const sequenceLookup = await this.findLatestBookingSequence(
        accountingClientId,
        sortedFiscalYears,
      );
      if (sequenceLookup) {
        selectedFiscalYear = sequenceLookup.fiscalYear;
        latestSequence = sequenceLookup.sequence;
      }
    }

    const mandatsnummer =
      stringValue(masterRecord.number) ?? stringValue(accountingRecord.number);
    if (!mandatsnummer) return null;

    const profile = buildAccountingProfile({
      accountingClientId,
      masterDataClientId,
      selectedFiscalYear,
      latestSequence,
    });

    return {
      id: accountingClientId,
      mandatsnummer,
      mandantenname:
        stringValue(accountingRecord.name) ??
        stringValue(masterRecord.name) ??
        "Unbenanntes FiBu-Mandat",
      zeitraum: getAccountingPeriodLabel(profile),
      verantwortlicherMitarbeiter:
        stringValue(masterRecord.accountant) ??
        stringValue(masterRecord.responsible_employee) ??
        stringValue(masterRecord.responsibleEmployee) ??
        stringValue(masterRecord.employee) ??
        "nicht aus API geliefert",
      datenstand: getAccountingDataStatus(profile),
      qsRegelversion: QS_RULE_VERSION,
      authorizedUsers: [],
      accountingProfile: profile,
    };
  }

  private async enrichClientWithBookingSequence(client: Client) {
    const profile = client.accountingProfile;
    if (!profile) return client;

    const fiscalYears = await this.requestRowsOrEmpty(
      `${ACCOUNTING_CLIENTS_PATH}/${encodeURIComponent(
        profile.accountingClientId,
      )}/fiscal-years`,
      { top: 20 },
    );
    if (fiscalYears.length === 0) return null;

    const sortedFiscalYears = [...fiscalYears].sort(compareFiscalYearsDesc);
    const sequenceLookup = await this.findLatestBookingSequence(
      profile.accountingClientId,
      sortedFiscalYears,
    );
    const selectedFiscalYear = sequenceLookup?.fiscalYear ?? sortedFiscalYears[0];
    const latestSequence = sequenceLookup?.sequence ?? null;
    const fiscalYearId = stringValue(selectedFiscalYear.id);
    const detailSummaries = fiscalYearId
      ? await this.loadAccountingDetailSummaries(
          profile.accountingClientId,
          fiscalYearId,
        )
      : {};

    const enrichedProfile = buildAccountingProfile({
      accountingClientId: profile.accountingClientId,
      masterDataClientId: profile.masterDataClientId,
      selectedFiscalYear,
      latestSequence,
      ...detailSummaries,
    });

    return {
      ...client,
      zeitraum: getAccountingPeriodLabel(enrichedProfile),
      datenstand: getAccountingDataStatus(enrichedProfile),
      accountingProfile: enrichedProfile,
    };
  }

  private async loadAccountingDetailSummaries(
    accountingClientId: string,
    fiscalYearId: string,
  ) {
    const basePath = `${ACCOUNTING_CLIENTS_PATH}/${encodeURIComponent(
      accountingClientId,
    )}/fiscal-years/${encodeURIComponent(fiscalYearId)}`;

    const [postings, receivables, payables, balances, statistics] =
      await Promise.all([
        this.requestRowsWithStatus(`${basePath}/account-postings`),
        this.requestRowsWithStatus(`${basePath}/accounts-receivable`, {
          top: 100,
        }),
        this.requestRowsWithStatus(`${basePath}/accounts-payable`, {
          top: 100,
        }),
        this.requestRowsWithStatus(`${basePath}/accounting-sums-and-balances`, {
          top: 100,
        }),
        this.requestRowsWithStatus(`${basePath}/accounting-statistics`, {
          top: 24,
        }),
      ]);

    return {
      postingSummary: summarizePostings(postings.rows, postings.available),
      openItemsSummary: summarizeOpenItems({
        receivables: receivables.rows,
        payables: payables.rows,
        receivableSourceAvailable: receivables.available,
        payableSourceAvailable: payables.available,
      }),
      sumsAndBalancesSummary: summarizeSumsAndBalances(
        balances.rows,
        balances.available,
      ),
      accountingStatisticsSummary: summarizeAccountingStatistics(
        statistics.rows,
        statistics.available,
      ),
    };
  }

  private async findLatestBookingSequence(
    accountingClientId: string,
    sortedFiscalYears: RawRecord[],
  ) {
    for (const fiscalYear of sortedFiscalYears.slice(0, this.sequenceLookbackYears)) {
      const fiscalYearId = stringValue(fiscalYear.id);
      if (!fiscalYearId) continue;

      const sequences = await this.requestRowsOrEmpty(
        `${ACCOUNTING_CLIENTS_PATH}/${encodeURIComponent(
          accountingClientId,
        )}/fiscal-years/${encodeURIComponent(
          fiscalYearId,
        )}/accounting-sequences-processed`,
        { top: 50 },
      );

      if (sequences.length > 0) {
        return { fiscalYear, sequence: pickLatestSequence(sequences) };
      }
    }

    return null;
  }

  private async listRowsPaged(
    path: string,
    options: { pageSize: number; maxRows: number },
  ) {
    const rows: RawRecord[] = [];

    for (let skip = 0; skip < options.maxRows; skip += options.pageSize) {
      const page = await this.requestRows(path, {
        top: options.pageSize,
        skip,
      });
      rows.push(...page);
      if (page.length < options.pageSize) break;
    }

    return rows.slice(0, options.maxRows);
  }

  private async requestRows(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ) {
    return normalizeRows(await this.requestJson(path, query));
  }

  private async requestRowsOrEmpty(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ) {
    try {
      return await this.requestRows(path, query);
    } catch {
      return [];
    }
  }

  private async requestRowsWithStatus(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ) {
    try {
      return { available: true, rows: await this.requestRows(path, query) };
    } catch {
      return { available: false, rows: [] };
    }
  }

  private async requestJson(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ) {
    let lastError: Error | null = null;
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

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

  private assertConfigured() {
    if (!this.accessToken || !this.clientInstanceId) {
      throw new Error("Klardaten Gateway ist nicht konfiguriert.");
    }
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
  return client.listFibuClients({ maxClients: options.maxClients });
}

export function getKlardatenSourceLabel() {
  return "Klardaten Accounting Gateway (aktive FiBu)";
}

function buildAccountingProfile(input: {
  accountingClientId: string;
  masterDataClientId: string;
  selectedFiscalYear: RawRecord | null;
  latestSequence: RawRecord | null;
  postingSummary?: PostingSummary;
  openItemsSummary?: OpenItemsSummary;
  sumsAndBalancesSummary?: SumsAndBalancesSummary;
  accountingStatisticsSummary?: AccountingStatisticsSummary;
}): AccountingProfile {
  const fiscalYearId = input.selectedFiscalYear
    ? stringValue(input.selectedFiscalYear.id)
    : null;
  const latestSequence = input.latestSequence;

  return {
    source: "klardaten-accounting",
    accountingClientId: input.accountingClientId,
    masterDataClientId: input.masterDataClientId,
    isActive: true,
    latestFiscalYear: fiscalYearId
      ? {
          id: fiscalYearId,
          begin: dateStringValue(input.selectedFiscalYear?.begin),
          end: dateStringValue(input.selectedFiscalYear?.end),
          isLocked: booleanValue(input.selectedFiscalYear?.is_locked),
        }
      : undefined,
    latestSequence: latestSequence
      ? {
          id:
            stringValue(latestSequence.id) ??
            stringValue(latestSequence.accounting_sequence_id) ??
            "unknown",
          dateFrom: dateStringValue(latestSequence.date_from),
          dateTo: dateStringValue(latestSequence.date_to),
          dateCommitted: dateStringValue(latestSequence.date_committed),
          isCommitted: booleanValue(latestSequence.is_committed),
          description: stringValue(latestSequence.description),
        }
      : undefined,
    bookingDataStatus: latestSequence ? "sequence" : "fiscal_year",
    dataQualityNote: latestSequence
      ? "Letzter Buchungsbestand aus verarbeiteter Accounting-Sequenz ermittelt."
      : fiscalYearId
        ? "Aktives FiBu-Mandat mit Rechnungswesen-Wirtschaftsjahr; Buchungssequenz wird in der Einzelmandatsauswertung vertieft geprüft."
        : "Aktives Accounting-Mandat; Wirtschaftsjahr und Buchungsbestand werden in der Einzelmandatsauswertung vertieft geprüft.",
    postingSummary: input.postingSummary,
    openItemsSummary: input.openItemsSummary,
    sumsAndBalancesSummary: input.sumsAndBalancesSummary,
    accountingStatisticsSummary: input.accountingStatisticsSummary,
  };
}

function summarizePostings(
  rows: RawRecord[],
  sourceAvailable: boolean,
): PostingSummary {
  const uniqueAccounts = new Set<string>();

  for (const row of rows) {
    const account = stringValue(row.account_number);
    if (account) uniqueAccounts.add(account);
  }

  return {
    sourceAvailable,
    sampleSize: rows.length,
    latestPostingDate: latestDate(rows.map((row) => row.date)),
    missingDocumentFieldCount: rows.filter(
      (row) => !hasTextValue(row.document_field1),
    ).length,
    missingPostingTextCount: rows.filter(
      (row) => !hasTextValue(row.posting_description),
    ).length,
    missingAccountCount: rows.filter((row) => !hasTextValue(row.account_number))
      .length,
    missingContraAccountCount: rows.filter(
      (row) => !hasTextValue(row.contra_account_number),
    ).length,
    missingTaxRateCount: rows.filter((row) => !hasTextValue(row.tax_rate))
      .length,
    uniqueAccountCount: uniqueAccounts.size,
  };
}

function summarizeOpenItems(input: {
  receivables: RawRecord[];
  payables: RawRecord[];
  receivableSourceAvailable: boolean;
  payableSourceAvailable: boolean;
}): OpenItemsSummary {
  const rows = [...input.receivables, ...input.payables];
  const openRows = rows.filter(isOpenItem);
  const overdueDays = openRows.map(getOverdueDays).filter((days) => days > 0);

  return {
    receivableSourceAvailable: input.receivableSourceAvailable,
    payableSourceAvailable: input.payableSourceAvailable,
    receivableSampleSize: input.receivables.length,
    payableSampleSize: input.payables.length,
    openItemsCount: openRows.length,
    overdueItemsCount: overdueDays.length,
    blockedItemsCount: openRows.filter(
      (row) =>
        booleanValue(row.has_dunning_block) === true ||
        booleanValue(row.has_interest_block) === true,
    ).length,
    maxOverdueDays: overdueDays.length > 0 ? Math.max(...overdueDays) : 0,
  };
}

function summarizeSumsAndBalances(
  rows: RawRecord[],
  sourceAvailable: boolean,
): SumsAndBalancesSummary {
  return {
    sourceAvailable,
    sampleSize: rows.length,
    accountsWithBalanceCount: rows.filter(
      (row) => Math.abs(numberValue(row.balance) ?? 0) > 0,
    ).length,
    accountsWithAnnualMovementCount: rows.filter(hasAnnualMovement).length,
  };
}

function summarizeAccountingStatistics(
  rows: RawRecord[],
  sourceAvailable: boolean,
): AccountingStatisticsSummary {
  const latest = [...rows].sort(
    (left, right) => dateRank(right.month) - dateRank(left.month),
  )[0];

  return {
    sourceAvailable,
    sampleSize: rows.length,
    latestMonth: latest ? dateStringValue(latest.month) : null,
    journalCount: latest ? numberValue(latest.count_of_accounting_journal) : null,
    primaNotaCount: latest
      ? numberValue(latest.count_of_accounting_prima_nota)
      : null,
  };
}

function isOpenItem(row: RawRecord) {
  const isCleared = booleanValue(row.is_cleared);
  const openBalance = Math.abs(numberValue(row.open_balance_of_item) ?? 0);
  return isCleared === false || openBalance > 0;
}

function getOverdueDays(row: RawRecord) {
  const dueDate = dateStringValue(row.due_date);
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - due.getTime()) / 86_400_000));
}

function hasAnnualMovement(row: RawRecord) {
  return Object.entries(row).some(
    ([key, value]) =>
      key.startsWith("annual_value") && Math.abs(numberValue(value) ?? 0) > 0,
  );
}

function latestDate(values: unknown[]) {
  const ranked = values
    .map((value) => dateStringValue(value))
    .filter(isPresent)
    .sort((left, right) => dateRank(right) - dateRank(left));
  return ranked[0] ?? null;
}

function hasTextValue(value: unknown) {
  return stringValue(value) !== null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRows(payload: unknown): RawRecord[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { value?: unknown }).value)
      ? (payload as { value: unknown[] }).value
      : Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : Array.isArray((payload as { items?: unknown }).items)
          ? (payload as { items: unknown[] }).items
          : [];

  return rows.filter(isRecord);
}

type MasterIndex = {
  byId: Map<string, RawRecord>;
  byNumber: Map<string, RawRecord>;
  byUniqueSuffix: Map<string, RawRecord | null>;
};

function createMasterIndex(records: RawRecord[]): MasterIndex {
  const byId = new Map<string, RawRecord>();
  const byNumber = new Map<string, RawRecord>();
  const byUniqueSuffix = new Map<string, RawRecord | null>();

  for (const record of records) {
    const id = stringValue(record.id);
    if (id) byId.set(id, record);

    const normalizedNumber = normalizeLookupValue(record.number);
    if (normalizedNumber) byNumber.set(normalizedNumber, record);

    const digits = digitsOnly(record.number);
    for (const length of [4, 5, 6]) {
      if (digits.length < length) continue;
      const suffix = normalizeLookupValue(digits.slice(-length));
      if (!suffix) continue;
      const existing = byUniqueSuffix.get(suffix);
      byUniqueSuffix.set(suffix, existing && existing !== record ? null : record);
    }
  }

  return { byId, byNumber, byUniqueSuffix };
}

function findMatchingMasterRecord(
  accountingRecord: RawRecord,
  index: MasterIndex,
) {
  const id = stringValue(accountingRecord.id);
  if (id && index.byId.has(id)) return index.byId.get(id) ?? null;

  const normalizedNumber = normalizeLookupValue(accountingRecord.number);
  if (normalizedNumber && index.byNumber.has(normalizedNumber)) {
    return index.byNumber.get(normalizedNumber) ?? null;
  }

  const digits = digitsOnly(accountingRecord.number);
  for (const length of [6, 5, 4]) {
    if (digits.length < length) continue;
    const suffix = normalizeLookupValue(digits.slice(-length));
    const candidate = suffix ? index.byUniqueSuffix.get(suffix) : null;
    if (candidate) return candidate;
  }

  return null;
}

function isActiveMasterRecord(record: RawRecord | null): record is RawRecord {
  return record !== null && stringValue(record.status)?.toLowerCase() === "active";
}

function pickLatestSequence(sequences: RawRecord[]) {
  return [...sequences].sort(compareSequencesDesc)[0] ?? null;
}

function compareFiscalYearsDesc(left: RawRecord, right: RawRecord) {
  return (
    dateRank(right.end) - dateRank(left.end) ||
    dateRank(right.begin) - dateRank(left.begin)
  );
}

function compareSequencesDesc(left: RawRecord, right: RawRecord) {
  return (
    dateRank(right.date_to) - dateRank(left.date_to) ||
    dateRank(right.date_committed) - dateRank(left.date_committed) ||
    dateRank(right.date_from) - dateRank(left.date_from)
  );
}

function getAccountingPeriodLabel(profile: AccountingProfile) {
  const sequence = profile.latestSequence;
  if (sequence?.dateFrom || sequence?.dateTo) {
    return formatDateRange(sequence.dateFrom, sequence.dateTo);
  }

  const fiscalYear = profile.latestFiscalYear;
  return formatDateRange(fiscalYear?.begin ?? null, fiscalYear?.end ?? null);
}

function getAccountingDataStatus(profile: AccountingProfile) {
  const sequence = profile.latestSequence;
  if (sequence) {
    const date =
      sequence.dateTo ??
      sequence.dateCommitted ??
      profile.latestFiscalYear?.end ??
      "kein Datum";
    const committedLabel =
      sequence.isCommitted === true
        ? "festgeschriebene Buchungssequenz"
        : "verarbeitete Buchungssequenz";
    return `${date} - ${committedLabel}`;
  }

  const fiscalYearEnd = profile.latestFiscalYear?.end ?? "kein Sequenzdatum";
  return `${fiscalYearEnd} - Wirtschaftsjahr vorhanden`;
}

function formatDateRange(from: string | null | undefined, to: string | null | undefined) {
  if (from && to) return `${formatDate(from)} bis ${formatDate(to)}`;
  if (to) return `bis ${formatDate(to)}`;
  if (from) return `ab ${formatDate(from)}`;
  return "Zeitraum aus API nicht geliefert";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("de-DE").format(date);
  }
  return value;
}

function dateRank(value: unknown) {
  const text = dateStringValue(value);
  if (!text) return 0;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function dateStringValue(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "ja"].includes(normalized)) return true;
    if (["false", "0", "no", "nein"].includes(normalized)) return false;
  }
  return null;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function digitsOnly(value: unknown) {
  return stringValue(value)?.replace(/[^0-9]/g, "") ?? "";
}

function normalizeLookupValue(value: unknown) {
  const text = stringValue(value);
  if (!text) return "";

  const digits = text.replace(/[^0-9]/g, "");
  if (digits) return digits.replace(/^0+/, "") || "0";
  return text.toLowerCase();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
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
  if (status === 404) {
    return "Klardaten Gateway: Endpunkt, Mandat oder Rechnungswesenbestand nicht gefunden.";
  }
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
