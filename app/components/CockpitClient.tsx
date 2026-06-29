"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStatusLabel } from "../lib/scoring";
import type {
  ActionItem,
  DashboardMetrics,
  HeatmapCell,
  RefreshRun,
  WorkspaceUser,
} from "../lib/types";

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

  useEffect(() => {
    const timers: number[] = [];

    function scrollToHash() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      const applyScroll = () => {
        const target = document.getElementById(decodeURIComponent(hash));
        const header = document.querySelector<HTMLElement>(".topbar");
        if (!target) return;

        const offset = (header?.getBoundingClientRect().height ?? 0) + 16;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(top, 0), behavior: "auto" });
      };

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(applyScroll);
      });
      timers.push(window.setTimeout(applyScroll, 180));
      timers.push(window.setTimeout(applyScroll, 520));
      timers.push(window.setTimeout(applyScroll, 900));
    }

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);

    return () => {
      window.removeEventListener("hashchange", scrollToHash);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  async function refreshDashboard() {
    setIsRefreshing(true);
    setRefreshError("");
    setRefreshRun(null);

    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const payload = (await response.json()) as RefreshResponse;

      if (!response.ok) {
        setRefreshError(
          payload.error ?? "Dashboard konnte nicht aktualisiert werden.",
        );
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

  function focusMandateLookup() {
    document
      .getElementById("mandat-lookup")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          : "QS-Auswertung konnte nicht geöffnet werden.",
      );
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="HSP QS Cockpit Startseite">
          <span className="brand-logo-wrap" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- Keep the Worker build independent of Next image optimization. */}
            <img
              className="brand-logo"
              src="/hsp-steuer-hagen-logo.png"
              alt=""
            />
          </span>
          <span>
            <strong>QS Cockpit laufende FiBu</strong>
            <small>Internes Controllingboard</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Hauptnavigation">
          <a href="#kennzahlen">Kennzahlen</a>
          <a href="#mandatsanalyse">Einzelmandat</a>
          <a href="#heatmap">Heatmap</a>
          <a href="#handlungsbedarf">Maßnahmen</a>
        </nav>
        <div className="topbar-actions">
          <div className="login-button" aria-label="Angemeldeter Benutzer">
            <span>{user.displayName}</span>
          </div>
          <a className="contact-button" href="#mandatsanalyse">
            Einzelmandat prüfen
          </a>
        </div>
      </header>

      <section className="hero-band hsp-home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Internes FiBu-QS-Controlling</p>
          <h1>Überblick für Kanzleileitung und Team</h1>
          <p className="hero-subtitle">
            Das Cockpit zeigt Qualität, Risiken und Handlungsbedarf in der
            laufenden Finanzbuchhaltung. Die Kanzleileitung sieht den
            Gesamtbestand, Mitarbeitende öffnen ihr Einzelmandat und ziehen
            daraus den QS-Report.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              type="button"
              onClick={refreshDashboard}
              disabled={isRefreshing}
            >
              <span aria-hidden="true">{isRefreshing ? "..." : "↻"}</span>
              {isRefreshing
                ? "Dashboard wird aktualisiert"
                : "Dashboard aktualisieren"}
            </button>
            <a className="secondary-button" href="#mandatsanalyse">
              Einzelmandat analysieren
            </a>
          </div>
          <div className="hero-proof-list" aria-label="QS Schwerpunkte">
            <span>Nur interne Nutzung</span>
            <span>QS der laufenden FiBu</span>
            <span>Report je Mandat</span>
          </div>
          <RefreshStatus
            refreshRun={refreshRun}
            refreshError={refreshError}
            isRefreshing={isRefreshing}
          />
        </div>

        <div className="hero-media-card control-board" aria-label="FiBu QS Steuerungsübersicht">
          <div className="control-panel">
            <div className="visual-header">
              <span>Gesamtbestand</span>
              <strong>{metrics.averageScore}%</strong>
            </div>
            <div className="visual-score" aria-label="Durchschnittlicher QS-Score">
              <div style={{ width: `${metrics.averageScore}%` }} />
            </div>
            <div className="control-metrics">
              <div>
                <span>geprüft</span>
                <strong>{metrics.checkedClients}</strong>
              </div>
              <div>
                <span>kritisch</span>
                <strong>{metrics.criticalClients}</strong>
              </div>
              <div>
                <span>Rückfragen</span>
                <strong>{metrics.openQuestions}</strong>
              </div>
              <div>
                <span>nicht prüfbar</span>
                <strong>{metrics.notCheckablePoints}</strong>
              </div>
            </div>
            <div className="visual-alert">
              <span>{criticalShare}%</span>
              <p>
                Anteil kritischer Mandate im aktuellen QS-Lauf der laufenden
                Finanzbuchhaltung.
              </p>
            </div>
          </div>
          <div className="hero-score-strip">
            <div>
              <span>QS-Score</span>
              <strong>{metrics.averageScore}%</strong>
            </div>
            <div>
              <span>Kritisch</span>
              <strong>{criticalShare}%</strong>
            </div>
            <div>
              <span>Datenstand</span>
              <strong>{metrics.lastDataStatus}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="homepage-cards" aria-label="Cockpit Bereiche">
        <a className="homepage-card" href="#kennzahlen">
          <span className="card-icon" aria-hidden="true">
            QS
          </span>
          <strong>Kanzleileitungsübersicht</strong>
          <p>Bestand, Scores, kritische Mandate und offene Rückfragen steuern.</p>
          <small>Öffnen</small>
        </a>
        <a className="homepage-card" href="#mandatsanalyse">
          <span className="card-icon" aria-hidden="true">
            MA
          </span>
          <strong>Einzelmandatsanalyse</strong>
          <p>Mandatsnummer eingeben, QS-Matrix öffnen und Report ziehen.</p>
          <small>Öffnen</small>
        </a>
        <a className="homepage-card" href="#heatmap">
          <span className="card-icon" aria-hidden="true">
            HM
          </span>
          <strong>QS-Heatmap</strong>
          <p>FiBu-Risiken nach QS-Kategorie erkennen und priorisieren.</p>
          <small>Öffnen</small>
        </a>
        <a className="homepage-card" href="#handlungsbedarf">
          <span className="card-icon" aria-hidden="true">
            FR
          </span>
          <strong>Maßnahmen & Report</strong>
          <p>Kritische Punkte nach Verantwortlichkeit und Fälligkeit bearbeiten.</p>
          <small>Öffnen</small>
        </a>
      </section>

      <section className="dashboard-band" id="kennzahlen" aria-labelledby="kpi-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Kanzleileitung</p>
            <h2 id="kpi-title">FiBu-QS im Gesamtüberblick</h2>
          </div>
          <p className="section-intro">
            Zentrale Steuerung der laufenden Finanzbuchhaltung: Qualität,
            Risiken, nicht prüfbare Punkte und offener Handlungsbedarf.
          </p>
        </div>
        <div className="kpi-grid">
          <KpiCard label="geprüfte Mandate" value={metrics.checkedClients} />
          <KpiCard
            label="durchschnittlicher QS-Score"
            value={`${metrics.averageScore}%`}
            tone="strong"
          />
          <KpiCard label="kritische Mandate" value={metrics.criticalClients} tone="danger" />
          <KpiCard label="offene Rückfragen" value={metrics.openQuestions} tone="warning" />
          <KpiCard
            label="nicht prüfbare QS-Punkte"
            value={metrics.notCheckablePoints}
            tone="muted"
          />
          <KpiCard label="letzter Datenstand" value={metrics.lastDataStatus} wide />
        </div>
      </section>

      <MandatsanalyseSection
        mandatsnummer={mandatsnummer}
        mandateMessage={mandateMessage}
        isValidating={isValidating}
        onFocusLookup={focusMandateLookup}
        onMandatsnummerChange={(value) => {
          setMandatsnummer(value);
          setMandateMessage("");
        }}
        onOpenMandateAnalysis={openMandateAnalysis}
      />

      <section className="action-band" id="handlungsbedarf">
        <div className="section-heading">
          <div>
            <p className="eyebrow">QS-Maßnahmen</p>
            <h2>Top Handlungsbedarf laufende FiBu</h2>
          </div>
          <p className="section-intro">
            Auffällige und kritische QS-Punkte aus den Mandatsauswertungen,
            geordnet nach Priorität, Verantwortungsrolle und Fälligkeit.
          </p>
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
      </section>

      <section className="dashboard-band" id="heatmap" aria-labelledby="heatmap-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">QS-Heatmap</p>
            <h2 id="heatmap-title">Risiko nach Kategorien</h2>
          </div>
          <p className="section-intro">
            Kategorieübergreifende Sicht auf erfüllte, auffällige, kritische
            und nicht prüfbare QS-Punkte.
          </p>
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

function MandatsanalyseSection({
  mandatsnummer,
  mandateMessage,
  isValidating,
  onFocusLookup,
  onMandatsnummerChange,
  onOpenMandateAnalysis,
}: {
  mandatsnummer: string;
  mandateMessage: string;
  isValidating: boolean;
  onFocusLookup: () => void;
  onMandatsnummerChange: (value: string) => void;
  onOpenMandateAnalysis: () => void;
}) {
  return (
    <section
      className="mandate-analysis-section"
      id="mandatsanalyse"
      aria-labelledby="mandatsanalyse-title"
    >
      <div className="mandate-hero">
        <div className="mandate-hero-copy">
          <p className="eyebrow">Mitarbeiteranalyse</p>
          <h2 id="mandatsanalyse-title">
            Einzelmandatsanalyse laufende FiBu
          </h2>
          <p>
            Mitarbeitende öffnen ihr Mandat über die Mandatsnummer, prüfen
            Score, QS-Matrix, Befunde und Evidenzen und ziehen daraus den
            Report für die laufende Finanzbuchhaltung.
          </p>
          <button className="primary-button" type="button" onClick={onFocusLookup}>
            Mandat prüfen
          </button>
          <small>
            Die Auswertung bleibt intern und zeigt nur QS-relevante Daten zur
            laufenden FiBu.
          </small>
        </div>
        <div className="mandate-hero-note" aria-label="Interner Nutzungsrahmen">
          <strong>HSP STEUER Hagen</strong>
          <span>
            Internes QS-Board · laufende Finanzbuchhaltung · Report je Mandat
          </span>
          <div className="trust-badges" aria-label="Kanzlei Hinweise">
            <span>Workspace Login</span>
            <span>Mandatsnummer statt Klardaten-URL</span>
            <span>Audit-Log vorgesehen</span>
          </div>
        </div>
      </div>

      <div className="mandate-benefits" aria-label="Nutzen der Mandatsanalyse">
        <article>
          <span>01</span>
          <strong>Mandat aufrufen</strong>
          <p>
            Die Mitarbeitenden geben die Mandatsnummer ein und öffnen direkt
            die berechtigte QS-Auswertung des Einzelmandats.
          </p>
        </article>
        <article>
          <span>02</span>
          <strong>QS-Befunde prüfen</strong>
          <p>
            Score, Ampelstatus, Auffälligkeiten, kritische Punkte und nicht
            prüfbare QS-Punkte werden mandatsbezogen dargestellt.
          </p>
        </article>
        <article>
          <span>03</span>
          <strong>Report ziehen</strong>
          <p>
            Die Detailseite enthält Management Summary, vollständige QS-Matrix
            und Exportfunktionen für den internen Report.
          </p>
        </article>
      </div>

      <div className="mandate-process" aria-label="Ablauf der Mandatsanalyse">
        {[
          "Mandatsnummer eingeben",
          "QS-Auswertung öffnen",
          "Befunde und Evidenz prüfen",
          "Report exportieren",
        ].map((step, index) => (
          <div key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>

      <div className="mandate-form-card mandate-lookup-card" id="mandat-lookup">
        <div className="form-heading">
          <div>
            <p className="eyebrow">Einzelmandat</p>
            <h3>QS-Auswertung und Report öffnen</h3>
          </div>
          <p>
            Für die Detailseite werden Mandatsstammdaten, QS-Score, Matrix,
            Handlungsempfehlungen und Exportansicht vorbereitet.
          </p>
        </div>

        <div className="mandate-lookup-row">
          <label htmlFor="mandatsnummer">Mandatsnummer</label>
          <div className="input-row">
            <input
              id="mandatsnummer"
              inputMode="numeric"
              value={mandatsnummer}
              onChange={(event) => onMandatsnummerChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void onOpenMandateAnalysis();
              }}
              placeholder="z. B. 10024"
            />
            <button
              type="button"
              className="primary-button small"
              onClick={onOpenMandateAnalysis}
              disabled={isValidating}
            >
              {isValidating ? "Prüfe Mandat" : "QS-Auswertung öffnen"}
            </button>
          </div>
        </div>

        {mandateMessage ? (
          <p className="form-message" role="status">
            {mandateMessage}
          </p>
        ) : null}

        <div className="form-advice">
          <strong>Reportfunktion</strong>
          <p>
            Nach dem Öffnen der Auswertung kann der interne QS-Report über die
            Mandatsdetailseite als druckfreundliche Ansicht oder Markdown
            exportiert werden.
          </p>
        </div>
      </div>
    </section>
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
    return (
      <p className="refresh-note" role="status">
        Refresh läuft. Daten werden geladen und QS-Regeln neu berechnet.
      </p>
    );
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
    return (
      <p className="refresh-note">
        Zuletzt aktualisiert am 29.06.2026, 21:45 durch Systemimport.
      </p>
    );
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
