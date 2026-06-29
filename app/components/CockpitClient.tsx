"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  ActionItem,
  DashboardMetrics,
  HeatmapCell,
  RefreshRun,
  WorkspaceUser,
} from "../lib/types";
import { getStatusLabel } from "../lib/scoring";

type RefreshResponse = {
  refreshRun?: RefreshRun;
  updatedBy?: string;
  updatedAt?: string;
  metrics?: DashboardMetrics;
  heatmap?: HeatmapCell[];
  topActionItems?: ActionItem[];
  error?: string;
};

type CockpitClientProps = {
  user: WorkspaceUser;
  initialMetrics: DashboardMetrics;
  initialHeatmap: HeatmapCell[];
  initialActionItems: ActionItem[];
};

export function CockpitClient({
  user,
  initialMetrics,
  initialHeatmap,
  initialActionItems,
}: CockpitClientProps) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [heatmap, setHeatmap] = useState(initialHeatmap);
  const [actionItems, setActionItems] = useState(initialActionItems);
  const [refreshRun, setRefreshRun] = useState<RefreshRun | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mandatsnummer, setMandatsnummer] = useState("");
  const [mandateMessage, setMandateMessage] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const criticalShare = useMemo(() => {
    if (metrics.checkedClients === 0) return 0;
    return Math.round((metrics.criticalClients / metrics.checkedClients) * 100);
  }, [metrics.checkedClients, metrics.criticalClients]);

  async function refreshDashboard() {
    setIsRefreshing(true);
    setRefreshError("");
    setRefreshRun(null);

    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const payload = (await response.json()) as RefreshResponse;

      if (!response.ok) {
        setRefreshError(payload.error ?? "Dashboard konnte nicht aktualisiert werden.");
        if (payload.refreshRun) setRefreshRun(payload.refreshRun);
        return;
      }

      if (payload.metrics) setMetrics(payload.metrics);
      if (payload.heatmap) setHeatmap(payload.heatmap);
      if (payload.topActionItems) setActionItems(payload.topActionItems);
      if (payload.refreshRun) setRefreshRun(payload.refreshRun);
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : "Unerwarteter Fehler beim Aktualisieren.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function openMandateAnalysis() {
    const value = mandatsnummer.trim();
    setMandateMessage("");

    if (!value) {
      setMandateMessage("Bitte eine Mandatsnummer eingeben.");
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch(
        `/api/mandate/validate?mandatsnummer=${encodeURIComponent(value)}`,
      );
      const payload = (await response.json()) as {
        valid: boolean;
        path?: string;
        message?: string;
      };

      if (!response.ok || !payload.valid || !payload.path) {
        setMandateMessage(
          payload.message ??
            "Diese Mandatsnummer ist unbekannt oder nicht freigegeben.",
        );
        return;
      }

      window.location.assign(payload.path);
    } catch (error) {
      setMandateMessage(
        error instanceof Error
          ? error.message
          : "Mandatsauswertung konnte nicht geöffnet werden.",
      );
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="HSP QS Cockpit Startseite">
          <span className="brand-mark" aria-hidden="true">
            HSP
          </span>
          <span>
            <strong>HSP QS Cockpit</strong>
            <small>laufende FiBu</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Hauptnavigation">
          <a href="#kennzahlen">Kennzahlen</a>
          <a href="#mandatsanalyse">Mandatsanalyse</a>
          <a href="#heatmap">Heatmap</a>
          <a href="#handlungsbedarf">Handlungsbedarf</a>
        </nav>
        <div className="user-chip" aria-label="Angemeldeter Benutzer">
          <span>{user.displayName}</span>
          <small>Datenstand {metrics.lastDataStatus}</small>
        </div>
      </header>

      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Interne Qualitätssicherung Finanzbuchhaltung</p>
          <h1>QS Cockpit laufende FiBu</h1>
          <p className="hero-subtitle">
            Qualität, Risiken und Handlungsbedarf je Mandat auf einen Blick.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              type="button"
              onClick={refreshDashboard}
              disabled={isRefreshing}
            >
              <span aria-hidden="true">{isRefreshing ? "..." : "↻"}</span>
              {isRefreshing ? "Dashboard wird aktualisiert" : "Dashboard aktualisieren"}
            </button>
            <a className="secondary-button" href="#mandatsanalyse">
              Individuelle QS öffnen
            </a>
          </div>
          <RefreshStatus
            refreshRun={refreshRun}
            refreshError={refreshError}
            isRefreshing={isRefreshing}
          />
        </div>
        <div className="hero-visual" aria-label="QS-Verteilung">
          <div className="visual-header">
            <span>QS Status</span>
            <strong>{metrics.averageScore}</strong>
          </div>
          <div className="visual-score">
            <div style={{ width: `${metrics.averageScore}%` }} />
          </div>
          <div className="visual-grid">
            {heatmap.slice(0, 9).map((cell) => (
              <span
                key={cell.category}
                className={`heat-dot ${cell.riskLevel}`}
                title={`${cell.category}: ${cell.score}%`}
              />
            ))}
          </div>
          <div className="visual-alert">
            <span>{criticalShare}%</span>
            <p>kritische Mandate im aktuellen Lauf</p>
          </div>
        </div>
      </section>

      <section className="dashboard-band" id="kennzahlen" aria-labelledby="kpi-title">
        <div className="section-heading">
          <p className="eyebrow">Kennzahlen</p>
          <h2 id="kpi-title">Aktueller QS-Überblick</h2>
        </div>
        <div className="kpi-grid">
          <KpiCard label="geprüfte Mandate" value={metrics.checkedClients} />
          <KpiCard label="durchschnittlicher QS-Score" value={`${metrics.averageScore}%`} tone="strong" />
          <KpiCard label="kritische Mandate" value={metrics.criticalClients} tone="danger" />
          <KpiCard label="offene Rückfragen" value={metrics.openQuestions} tone="warning" />
          <KpiCard label="nicht prüfbare QS-Punkte" value={metrics.notCheckablePoints} tone="muted" />
          <KpiCard label="letzter Datenstand" value={metrics.lastDataStatus} wide />
        </div>
      </section>

      <section className="work-grid">
        <div className="analysis-panel" id="mandatsanalyse">
          <div className="section-heading compact">
            <p className="eyebrow">Mandatsanalyse</p>
            <h2>Einzelauswertung öffnen</h2>
          </div>
          <div className="mandate-form">
            <label htmlFor="mandatsnummer">Mandatsnummer</label>
            <div className="input-row">
              <input
                id="mandatsnummer"
                inputMode="numeric"
                value={mandatsnummer}
                onChange={(event) => setMandatsnummer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void openMandateAnalysis();
                }}
                placeholder="z. B. 10024"
              />
              <button
                type="button"
                className="primary-button small"
                onClick={openMandateAnalysis}
                disabled={isValidating}
              >
                {isValidating
                  ? "Prüfe Mandat"
                  : "Individuelle QS-Auswertung öffnen"}
              </button>
            </div>
            {mandateMessage ? (
              <p className="form-message" role="status">
                {mandateMessage}
              </p>
            ) : null}
          </div>
        </div>

        <div className="action-panel" id="handlungsbedarf">
          <div className="section-heading compact">
            <p className="eyebrow">Priorität</p>
            <h2>Top Handlungsbedarf</h2>
          </div>
          <div className="action-list">
            {actionItems.map((item) => (
              <Link
                className="action-row"
                key={`${item.clientNumber}-${item.title}`}
                href={`/mandat/${item.clientNumber}`}
              >
                <span className={`status-pill ${item.status}`}>
                  {item.severity} · {getStatusLabel(item.status)}
                </span>
                <strong>{item.clientName}</strong>
                <span>{item.title}</span>
                <small>{item.dueDate ? `fällig ${item.dueDate}` : item.ownerRole}</small>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-band" id="heatmap" aria-labelledby="heatmap-title">
        <div className="section-heading">
          <p className="eyebrow">QS-Heatmap</p>
          <h2 id="heatmap-title">Risiko nach Kategorien</h2>
        </div>
        <div className="heatmap-table" role="table" aria-label="QS-Heatmap nach Kategorien">
          <div className="heatmap-head" role="row">
            <span>Kategorie</span>
            <span>Erfüllt</span>
            <span>Auffällig</span>
            <span>Kritisch</span>
            <span>Nicht prüfbar</span>
            <span>Score</span>
          </div>
          {heatmap.map((cell) => (
            <div className="heatmap-row" role="row" key={cell.category}>
              <strong>{cell.category}</strong>
              <span>{cell.fulfilled}</span>
              <span>{cell.warning}</span>
              <span>{cell.critical}</span>
              <span>{cell.notCheckable}</span>
              <span className={`score-chip ${cell.riskLevel}`}>{cell.score}%</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
  wide = false,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "strong" | "danger" | "warning" | "muted";
  wide?: boolean;
}) {
  return (
    <article className={`kpi-card ${tone} ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function RefreshStatus({
  refreshRun,
  refreshError,
  isRefreshing,
}: {
  refreshRun: RefreshRun | null;
  refreshError: string;
  isRefreshing: boolean;
}) {
  if (isRefreshing) {
    return <p className="refresh-note" role="status">Refresh läuft. Daten werden geladen und QS-Regeln neu berechnet.</p>;
  }

  if (refreshError) {
    return (
      <div className="refresh-log error" role="alert">
        <strong>{refreshError}</strong>
        {refreshRun ? (
          <ul>
            {refreshRun.log.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (!refreshRun) {
    return <p className="refresh-note">Zuletzt aktualisiert am 29.06.2026, 21:45 durch Systemimport.</p>;
  }

  return (
    <div className="refresh-log" role="status">
      <strong>
        Zuletzt aktualisiert am {formatDateTime(refreshRun.finishedAt)} durch{" "}
        {refreshRun.triggeredBy}
      </strong>
      <ul>
        {refreshRun.log.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "unbekannt";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
