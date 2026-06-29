import { canAccessClient, requireWorkspaceUser } from "@/app/lib/authz";
import {
  buildManagementSummary,
  calculateClientScore,
  getClientByNumber,
  getMatrixForClient,
  getStatusLabel,
} from "@/app/lib/scoring";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ mandatsnummer: string }>;
};

export async function GET(_request: Request, context: ExportRouteContext) {
  const { mandatsnummer } = await context.params;
  const user = await requireWorkspaceUser(`/mandat/${mandatsnummer}`);
  const client = getClientByNumber(mandatsnummer);

  if (!client || !canAccessClient(user, client)) {
    return Response.json({ error: "Mandat nicht gefunden." }, { status: 404 });
  }

  const score = calculateClientScore(client);
  const matrix = getMatrixForClient(client);
  const markdown = [
    `# QS-Auswertung ${client.mandatsnummer} - ${client.mandantenname}`,
    "",
    `Zeitraum: ${client.zeitraum}`,
    `Datenstand: ${client.datenstand}`,
    `QS-Regelversion: ${client.qsRegelversion}`,
    `Gesamtscore: ${score.score}/100`,
    `Ampelstatus: ${score.trafficLight}`,
    "",
    "## Management Summary",
    "",
    buildManagementSummary(client),
    "",
    "## QS-Matrix",
    "",
    "| QS-ID | Kategorie | Titel | Status | Schweregrad | Befund | Evidenz | Empfehlung | Rolle | Fälligkeit |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...matrix.map((row) =>
      [
        row.id,
        row.category,
        row.title,
        getStatusLabel(row.result.status),
        row.result.severity,
        row.result.finding,
        row.result.evidence,
        row.result.recommendation,
        row.result.ownerRole,
        row.result.dueDate ?? "keine",
      ]
        .map(escapeMarkdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    ),
    "",
  ].join("\n");

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="qs-auswertung-${client.mandatsnummer}.md"`,
    },
  });
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
