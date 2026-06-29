export default function AccessDeniedPage() {
  return (
    <main className="access-page">
      <section className="access-panel">
        <p className="eyebrow">Workspace Zugriff</p>
        <h1>Zugriff nicht freigegeben</h1>
        <p>
          Dieses Cockpit ist derzeit auf Owner/Admins beschränkt. Bitte wenden
          Sie sich an die Workspace-Administration, wenn Sie Zugriff benötigen.
        </p>
      </section>
    </main>
  );
}
