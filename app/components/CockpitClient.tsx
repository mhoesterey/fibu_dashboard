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

type IntakeState = {
  personType: string;
  topic: string;
  urgency: string;
  mandatsnummer: string;
  situation: string;
  name: string;
  email: string;
  phone: string;
  privacyAccepted: boolean;
};

type CockpitClientProps = {
  user: WorkspaceUser;
  initialMetrics: DashboardMetrics;
  initialHeatmap: HeatmapCell[];
  initialActionItems: ActionItem[];
};

const initialIntake: IntakeState = {
  personType: "unternehmen",
  topic: "laufende-fibu",
  urgency: "normal",
  mandatsnummer: "",
  situation: "",
  name: "",
  email: "",
  phone: "",
  privacyAccepted: false,
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
  const [mandateMessage, setMandateMessage] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [intakeStep, setIntakeStep] = useState(1);
  const [intake, setIntake] = useState<IntakeState>(initialIntake);
  const [intakeMessage, setIntakeMessage] = useState("");

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

  function updateIntake<K extends keyof IntakeState>(
    key: K,
    value: IntakeState[K],
  ) {
    setIntake((current) => ({ ...current, [key]: value }));
    setIntakeMessage("");
    setMandateMessage("");
  }

  function startMandatsanalyse() {
    document
      .getElementById("mandatsanalyse-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function nextIntakeStep() {
    const message = validateIntakeStep(intakeStep, intake);
    if (message) {
      setIntakeMessage(message);
      return;
    }
    setIntakeMessage("");
    setIntakeStep((step) => Math.min(step + 1, 3));
  }

  function previousIntakeStep() {
    setIntakeMessage("");
    setIntakeStep((step) => Math.max(step - 1, 1));
  }

  function submitIntake() {
    const message = validateIntakeStep(3, intake);
    if (message) {
      setIntakeMessage(message);
      return;
    }

    setIntakeMessage(
      "Vielen Dank. Ihre Angaben wurden für die fachliche Prüfung vorbereitet. Das Kanzleiteam stimmt den nächsten Schritt persönlich mit Ihnen ab.",
    );
  }

  async function openExistingMandate() {
    const value = intake.mandatsnummer.trim();
    setMandateMessage("");

    if (!value) {
      setMandateMessage("Bitte geben Sie eine Mandatsnummer ein.");
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
            <strong>HSP GRUPPE</strong>
            <small>QS Cockpit laufende FiBu</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Hauptnavigation">
          <a href="#kennzahlen">Lösungen</a>
          <a href="#mandatsanalyse">Mandate</a>
          <a href="#heatmap">QS-Wissen</a>
          <a href="#handlungsbedarf">Freigabe</a>
        </nav>
        <div className="topbar-actions">
          <button className="icon-button" type="button" aria-label="Suche öffnen">
            S
          </button>
          <div className="login-button" aria-label="Angemeldeter Benutzer">
            <span>{user.displayName}</span>
          </div>
          <a className="contact-button" href="#handlungsbedarf">
            Handlungsbedarf
          </a>
        </div>
      </header>

      <section className="hero-band hsp-home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Ihr Partner für digitale Kanzleiqualität</p>
          <h1>QS Cockpit laufende FiBu</h1>
          <p className="hero-subtitle">
            Qualität, Risiken und Handlungsbedarf je Mandat auf einen Blick.
            Für klare Prozesse, sichere Freigaben und nachvollziehbare
            Entscheidungen in der laufenden Finanzbuchhaltung.
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
              Mandat auswerten
            </a>
          </div>
          <div className="hero-proof-list" aria-label="QS Schwerpunkte">
            <span>Mandatsqualität</span>
            <span>Risikofrüherkennung</span>
            <span>Freigabeprozess</span>
          </div>
          <RefreshStatus
            refreshRun={refreshRun}
            refreshError={refreshError}
            isRefreshing={isRefreshing}
          />
        </div>

        <div className="hero-media-card" aria-label="QS Cockpit Visualisierung">
          <div className="hero-photo">
            <div className="workspace-scene" aria-hidden="true">
              <span className="person person-a" />
              <span className="person person-b" />
              <span className="person person-c" />
              <span className="laptop" />
            </div>
            <div className="floating-insight-card">
              <span className="insight-icon" aria-hidden="true">
                QS
              </span>
              <div>
                <strong>Effiziente QS-Prozesse</strong>
                <p>Regeln, Evidenz und Empfehlungen zentral im Blick.</p>
              </div>
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
          <strong>QS-Kennzahlen</strong>
          <p>Scores, kritische Mandate und nicht prüfbare Punkte sofort erkennen.</p>
          <small>Öffnen</small>
        </a>
        <a className="homepage-card" href="#mandatsanalyse">
          <span className="card-icon" aria-hidden="true">
            MA
          </span>
          <strong>Mandatsanalyse</strong>
          <p>Einzelne Mandate gezielt aufrufen und vollständig auswerten.</p>
          <small>Öffnen</small>
        </a>
        <a className="homepage-card" href="#heatmap">
          <span className="card-icon" aria-hidden="true">
            HM
          </span>
          <strong>QS-Heatmap</strong>
          <p>Risiken nach Kategorie scannen und Prioritäten ableiten.</p>
          <small>Öffnen</small>
        </a>
        <a className="homepage-card" href="#handlungsbedarf">
          <span className="card-icon" aria-hidden="true">
            FR
          </span>
          <strong>Freigabe & Maßnahmen</strong>
          <p>Offene Punkte nach Schweregrad und Fälligkeit steuern.</p>
          <small>Öffnen</small>
        </a>
      </section>

      <section className="dashboard-band" id="kennzahlen" aria-labelledby="kpi-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Unser Anspruch</p>
            <h2 id="kpi-title">Mehr Sicherheit für Kanzlei und Mandate</h2>
          </div>
          <p className="section-intro">
            Das Cockpit verbindet Finanzbuchhaltungsdaten, QS-Regeln und
            nachvollziehbare Evidenz zu einer kompakten Arbeitsoberfläche.
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
        intake={intake}
        intakeStep={intakeStep}
        intakeMessage={intakeMessage}
        mandateMessage={mandateMessage}
        isValidating={isValidating}
        onStart={startMandatsanalyse}
        onUpdate={updateIntake}
        onNext={nextIntakeStep}
        onPrevious={previousIntakeStep}
        onSubmit={submitIntake}
        onOpenExistingMandate={openExistingMandate}
      />

      <section className="action-band" id="handlungsbedarf">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Priorität</p>
            <h2>Top Handlungsbedarf</h2>
          </div>
          <p className="section-intro">
            Auffällige und kritische QS-Punkte werden nach Priorität,
            Verantwortung und Fälligkeit eingeordnet.
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
  intake,
  intakeStep,
  intakeMessage,
  mandateMessage,
  isValidating,
  onStart,
  onUpdate,
  onNext,
  onPrevious,
  onSubmit,
  onOpenExistingMandate,
}: {
  intake: IntakeState;
  intakeStep: number;
  intakeMessage: string;
  mandateMessage: string;
  isValidating: boolean;
  onStart: () => void;
  onUpdate: <K extends keyof IntakeState>(key: K, value: IntakeState[K]) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSubmit: () => void;
  onOpenExistingMandate: () => void;
}) {
  return (
    <section
      className="mandate-analysis-section"
      id="mandatsanalyse"
      aria-labelledby="mandatsanalyse-title"
    >
      <div className="mandate-hero">
        <div className="mandate-hero-copy">
          <p className="eyebrow">Mandatsanalyse</p>
          <h2 id="mandatsanalyse-title">
            Mandatsanalyse für eine passgenaue steuerliche Betreuung
          </h2>
          <p>
            Damit wir Ihr Anliegen fundiert einschätzen können, erfassen wir
            vorab die wichtigsten Informationen zu Ihrer persönlichen oder
            unternehmerischen Situation.
          </p>
          <button className="primary-button" type="button" onClick={onStart}>
            Mandatsanalyse starten
          </button>
          <small>
            Ihre Angaben werden vertraulich behandelt und durch unser Team
            fachlich geprüft.
          </small>
        </div>
        <div className="mandate-hero-note" aria-label="Vertrauenshinweis">
          <strong>HSP STEUER Hagen</strong>
          <span>
            Digitale Kanzleistruktur · Persönliche Beratung · Bundesweites
            HSP-Netzwerk
          </span>
          <div className="trust-badges" aria-label="Kanzlei Hinweise">
            <span>DATEV-orientierte Prozesse</span>
            <span>HSP-Gruppe</span>
            <span>Fachliche Prüfung</span>
          </div>
        </div>
      </div>

      <div className="mandate-benefits" aria-label="Nutzen der Mandatsanalyse">
        <article>
          <span>01</span>
          <strong>Sachverhalt verstehen</strong>
          <p>
            Wir ordnen die Ausgangslage strukturiert ein und erkennen, welche
            Unterlagen oder Klärungen für eine Beratung relevant sind.
          </p>
        </article>
        <article>
          <span>02</span>
          <strong>Beratungsbedarf einordnen</strong>
          <p>
            Ihr Anliegen wird fachlich eingeordnet, damit der passende
            Ansprechpartner und der richtige Beratungsrahmen vorbereitet werden.
          </p>
        </article>
        <article>
          <span>03</span>
          <strong>Nächsten Schritt vorbereiten</strong>
          <p>
            Auf Basis Ihrer Angaben kann die Kanzlei die Rückmeldung gezielt,
            nachvollziehbar und persönlich vorbereiten.
          </p>
        </article>
      </div>

      <div className="mandate-process" aria-label="Ablauf der Mandatsanalyse">
        {[
          "Angaben machen",
          "Anliegen wird geprüft",
          "Rückmeldung durch die Kanzlei",
          "Abstimmung des weiteren Vorgehens",
        ].map((step, index) => (
          <div key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>

      <div className="mandate-form-card" id="mandatsanalyse-form">
        <div className="form-heading">
          <div>
            <p className="eyebrow">Vertrauliche Angaben</p>
            <h3>Mandatsanalyse starten</h3>
          </div>
          <div className="form-progress" aria-label={`Schritt ${intakeStep} von 3`}>
            <span style={{ width: `${(intakeStep / 3) * 100}%` }} />
          </div>
        </div>

        <div className="step-tabs" aria-label="Formularfortschritt">
          <span className={intakeStep === 1 ? "active" : ""}>1. Situation</span>
          <span className={intakeStep === 2 ? "active" : ""}>2. Anliegen</span>
          <span className={intakeStep === 3 ? "active" : ""}>3. Kontakt</span>
        </div>

        {intakeStep === 1 ? (
          <div className="form-grid">
            <label>
              <span>Einordnung *</span>
              <select
                value={intake.personType}
                onChange={(event) => onUpdate("personType", event.target.value)}
              >
                <option value="unternehmen">Unternehmen / Selbständigkeit</option>
                <option value="privatperson">Privatperson</option>
                <option value="verein">Verein / Organisation</option>
                <option value="bestandsmandat">Bestehendes Mandat</option>
              </select>
            </label>
            <label>
              <span>Thema *</span>
              <select
                value={intake.topic}
                onChange={(event) => onUpdate("topic", event.target.value)}
              >
                <option value="laufende-fibu">Laufende Finanzbuchhaltung</option>
                <option value="steuererklaerung">Steuererklärung / Abschluss</option>
                <option value="gruendung">Gründung / Umstrukturierung</option>
                <option value="lohn">Lohn / Personal</option>
                <option value="sonstiges">Sonstiges Anliegen</option>
              </select>
            </label>
            <label>
              <span>Dringlichkeit</span>
              <select
                value={intake.urgency}
                onChange={(event) => onUpdate("urgency", event.target.value)}
              >
                <option value="normal">Normale Einordnung</option>
                <option value="zeitnah">Zeitnahe Rückmeldung gewünscht</option>
                <option value="frist">Frist oder Termin steht bevor</option>
              </select>
            </label>
            <label>
              <span>Mandatsnummer, falls vorhanden</span>
              <input
                inputMode="numeric"
                value={intake.mandatsnummer}
                onChange={(event) => onUpdate("mandatsnummer", event.target.value)}
                placeholder="z. B. 10024"
              />
            </label>
          </div>
        ) : null}

        {intakeStep === 2 ? (
          <div className="form-grid one-column">
            <label>
              <span>Kurze Beschreibung Ihres Anliegens *</span>
              <textarea
                value={intake.situation}
                onChange={(event) => onUpdate("situation", event.target.value)}
                placeholder="Beschreiben Sie bitte knapp, worum es geht, welche Fristen bestehen und welche Unterlagen bereits vorliegen."
              />
            </label>
            <div className="form-advice">
              <strong>Hinweis zur Vorbereitung</strong>
              <p>
                Bitte erfassen Sie nur die für die erste Einordnung notwendigen
                Informationen. Sensible Unterlagen werden erst nach Abstimmung
                über einen geeigneten Weg angefordert.
              </p>
            </div>
          </div>
        ) : null}

        {intakeStep === 3 ? (
          <div className="form-grid">
            <label>
              <span>Name / Unternehmen *</span>
              <input
                value={intake.name}
                onChange={(event) => onUpdate("name", event.target.value)}
                placeholder="Ihr Name oder Unternehmen"
              />
            </label>
            <label>
              <span>E-Mail *</span>
              <input
                type="email"
                value={intake.email}
                onChange={(event) => onUpdate("email", event.target.value)}
                placeholder="name@beispiel.de"
              />
            </label>
            <label>
              <span>Telefon</span>
              <input
                type="tel"
                value={intake.phone}
                onChange={(event) => onUpdate("phone", event.target.value)}
                placeholder="Rückrufnummer"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={intake.privacyAccepted}
                onChange={(event) =>
                  onUpdate("privacyAccepted", event.target.checked)
                }
              />
              <span>
                Ich bestätige, dass meine Angaben zur fachlichen Vorprüfung
                durch HSP STEUER Hagen verarbeitet werden dürfen. *
              </span>
            </label>
          </div>
        ) : null}

        {intakeMessage ? (
          <p
            className={
              intakeMessage.startsWith("Vielen Dank")
                ? "form-message success"
                : "form-message"
            }
            role="status"
          >
            {intakeMessage}
          </p>
        ) : null}

        {mandateMessage ? (
          <p className="form-message" role="status">
            {mandateMessage}
          </p>
        ) : null}

        <div className="form-actions">
          {intakeStep > 1 ? (
            <button className="secondary-button" type="button" onClick={onPrevious}>
              Zurück
            </button>
          ) : (
            <button
              className="secondary-button"
              type="button"
              onClick={onOpenExistingMandate}
              disabled={isValidating}
            >
              {isValidating ? "Mandat wird geprüft" : "Bestehendes Mandat öffnen"}
            </button>
          )}
          {intakeStep < 3 ? (
            <button className="primary-button" type="button" onClick={onNext}>
              Weiter
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={onSubmit}>
              Angaben vorbereiten
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function validateIntakeStep(step: number, intake: IntakeState) {
  if (step === 1 && (!intake.personType || !intake.topic)) {
    return "Bitte füllen Sie die Pflichtfelder zur Einordnung aus.";
  }
  if (step === 2 && intake.situation.trim().length < 20) {
    return "Bitte beschreiben Sie Ihr Anliegen mit mindestens 20 Zeichen.";
  }
  if (step === 3) {
    if (!intake.name.trim() || !intake.email.trim()) {
      return "Bitte geben Sie Name und E-Mail-Adresse an.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(intake.email.trim())) {
      return "Bitte geben Sie eine gültige E-Mail-Adresse an.";
    }
    if (!intake.privacyAccepted) {
      return "Bitte bestätigen Sie die vertrauliche fachliche Vorprüfung.";
    }
  }
  return "";
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
