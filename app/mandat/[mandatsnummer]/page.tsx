import { notFound } from "next/navigation";
import Link from "next/link";
import { ExportActions } from "./ExportActions";
import { canAccessClient, requireWorkspaceUser } from "@/app/lib/authz";
import { recordAuditEvent } from "@/app/lib/audit";
import { loadClientByMandatsnummer } from "@/app/lib/dashboard-data";
import {
  buildManagementSummary,
  calculateClientScore,
  getMatrixForClient,
  getStatusLabel,
} from "@/app/lib/scoring";
import type { QsMatrixRow, Severity } from "@/app/lib/types";

export const dynamic = "force-dynamic";

type DetailPageProps = {
  params: Promise<{ mandatsnummer: string }>;
};

export default async function MandateDetailPage({ params }: DetailPageProps) {
  const { mandatsnummer } = await params;
  const user = await requireWorkspaceUser(`/mandat/${mandatsnummer}`);
  const { client, sourceLabel } = await loadClientByMandatsnummer(mandatsnummer);

  if (!client || !canAccessClient(user, client)) {
    notFound();
  }

  await recordAuditEvent({
    user,
    action: "mandate_view",
    targetType: "client",
    targetRef: client.mandatsnummer,
    metadata: { ruleVersion: client.qsRegelversion, source: sourceLabel },
  });

  const score = calculateClientScore(client);
  const matrix = getMatrixForClient(client);
  const groupedActions = getGroupedActions(matrix);

  return (
    <main className="shell">
      <header className="topbar detail-topbar">
        <Link className="brand" href="/" aria-label="Zurück zum QS Cockpit">
          <span className="brand-mark" aria-hidden="true">
            HSP
          </span>
          <span>
            <strong>QS Cockpit</strong>
            <small>Mandatsauswertung</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Detailnavigation">
          <Link href="/">Cockpit</Link>
          <a href="#matrix">QS-Matrix</a>
          <a href="#empfehlungen">Empfehlungen</a>
          <a href="#export">Export</a>
        </nav>
        <div className="user-chip">
          <span>{user.displayName}</span>
          <small>{sourceLabel} · {client.datenstand}</small>
        </div>
      </header>

      <section className="detail-hero">
        <div>
          <p className="eyebrow">Mandatsdetail laufende FiBu</p>
          <h1>{client.mandantenname}</h1>
          <p className="hero-subtitle">
            Mandatsnummer {client.mandatsnummer} · Zeitraum {client.zeitraum}
          </p>
        </div>
        <div className={`detail-score traffic-light ${score.trafficLight}`}>
          <span>{score.score}</span>
          <small>Gesamtscore</small>
        </div>
      </section>

      <section className="detail-shell">
        <div className="master-data-grid" aria-label="Stammdaten">
          <InfoItem label="Mandatsnummer" value={client.mandatsnummer} />
          <InfoItem label="Mandantenname" value={client.mandantenname} />
          <InfoItem label="Zeitraum" value={client.zeitraum} />
          <InfoItem
            label="Verantwortlicher Mitarbeiter"
            value={client.verantwortlicherMitarbeiter}
          />
          <InfoItem label="Datenstand" value={client.datenstand} />
          <InfoItem label="QS-Regelversion" value={client.qsRegelversion} />
        </div>

        <div className="detail-grid">
          <section className="summary-panel" aria-labelledby="summary-title">
            <p className="eyebrow">Management Summary</p>
            <h2 id="summary-title">Belegter Kurzbefund</h2>
            <p>{buildManagementSummary(client)}</p>
          </section>

          <section className="score-panel" aria-labelledby="score-title">
            <p className="eyebrow">Score-Modul</p>
            <h2 id="score-title">QS-Wertung</h2>
            <div className="score-grid">
              <ScoreMetric label="Gesamtscore" value={`${score.score}/100`} />
              <ScoreMetric label="Ampelstatus" value={score.trafficLight === "red" ? "rot" : score.trafficLight === "amber" ? "gelb" : "grün"} />
              <ScoreMetric label="erfüllte QS" value={score.fulfilledCount} />
              <ScoreMetric label="Auffälligkeiten" value={score.warningCount} />
              <ScoreMetric label="kritische Punkte" value={score.criticalCount} />
              <ScoreMetric label="nicht prüfbar" value={score.notCheckableCount} />
            </div>
          </section>
        </div>

        <section className="matrix-panel" id="matrix" aria-labelledby="matrix-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Vollständige QS-Matrix</p>
              <h2 id="matrix-title">Alle QS-Punkte</h2>
            </div>
          </div>
          <div className="matrix-table" role="table" aria-label="Vollständige QS-Matrix">
            <div className="matrix-head" role="row">
              <span>QS-ID</span>
              <span>Kategorie</span>
              <span>Titel</span>
              <span>Status</span>
              <span>Schweregrad</span>
              <span>Befund</span>
              <span>Evidenz</span>
              <span>Empfehlung</span>
              <span>Verantwortungsrolle</span>
              <span>Fälligkeit</span>
            </div>
            {matrix.map((row) => (
              <div className="matrix-row" role="row" key={row.id}>
                <span>{row.id}</span>
                <span>{row.category}</span>
                <strong>{row.title}</strong>
                <span className={`status-pill ${row.result.status}`}>
                  {getStatusLabel(row.result.status)}
                </span>
                <span>{row.result.severity}</span>
                <span>{row.result.finding}</span>
                <span>{row.result.evidence}</span>
                <span>{row.result.recommendation}</span>
                <span>{row.result.ownerRole}</span>
                <span>{row.result.dueDate ?? "keine"}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="recommendation-panel"
          id="empfehlungen"
          aria-labelledby="recommendation-title"
        >
          <p className="eyebrow">Handlungsempfehlungen</p>
          <h2 id="recommendation-title">Nach Priorität gruppiert</h2>
          <div className="recommendation-grid">
            {(["P0", "P1", "P2", "P3"] as Severity[]).map((severity) => (
              <div className="recommendation-group" key={severity}>
                <h3>{severity}</h3>
                {groupedActions[severity].length > 0 ? (
                  groupedActions[severity].map((row) => (
                    <article key={`${severity}-${row.id}`}>
                      <span className={`status-pill ${row.result.status}`}>
                        {getStatusLabel(row.result.status)}
                      </span>
                      <strong>{row.title}</strong>
                      <p>{row.result.recommendation}</p>
                      <small>{row.result.ownerRole} · {row.result.dueDate ?? "ohne Fälligkeit"}</small>
                    </article>
                  ))
                ) : (
                  <p className="empty-note">Keine offenen Punkte.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="export-panel" id="export" aria-labelledby="export-title">
          <div>
            <p className="eyebrow">Export</p>
            <h2 id="export-title">Druck und Markdown</h2>
          </div>
          <ExportActions mandatsnummer={client.mandatsnummer} />
        </section>
      </section>
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="score-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getGroupedActions(matrix: QsMatrixRow[]) {
  const grouped: Record<Severity, QsMatrixRow[]> = {
    P0: [],
    P1: [],
    P2: [],
    P3: [],
  };

  matrix
    .filter((row) => ["critical", "warning"].includes(row.result.status))
    .forEach((row) => grouped[row.result.severity].push(row));

  return grouped;
}
