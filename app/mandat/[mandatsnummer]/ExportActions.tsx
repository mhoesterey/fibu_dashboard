"use client";

export function ExportActions({ mandatsnummer }: { mandatsnummer: string }) {
  return (
    <div className="export-actions">
      <button className="secondary-button" type="button" onClick={() => window.print()}>
        Druckansicht öffnen
      </button>
      <a className="primary-button" href={`/api/export/mandat/${mandatsnummer}`}>
        Markdown exportieren
      </a>
    </div>
  );
}
