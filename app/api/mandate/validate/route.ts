import { canAccessClient, requireWorkspaceUser } from "@/app/lib/authz";
import { recordAuditEvent } from "@/app/lib/audit";
import { loadClientByMandatsnummer } from "@/app/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireWorkspaceUser("/");
  const url = new URL(request.url);
  const mandatsnummer = url.searchParams.get("mandatsnummer")?.trim() ?? "";

  if (!/^[0-9A-Za-z._-]{1,32}$/.test(mandatsnummer)) {
    return Response.json(
      { valid: false, message: "Bitte eine gültige Mandatsnummer eingeben." },
      { status: 400 },
    );
  }

  try {
    const { client, sourceLabel } = await loadClientByMandatsnummer(mandatsnummer);
    await recordAuditEvent({
      user,
      action: "mandate_validate",
      targetType: "client",
      targetRef: mandatsnummer,
      metadata: { found: Boolean(client), source: sourceLabel },
    });

    if (!client || !canAccessClient(user, client)) {
      return Response.json(
        {
          valid: false,
          message:
            "Diese Mandatsnummer ist kein aktives laufendes FiBu-Mandat mit abrufbarem Rechnungswesenbestand oder für Ihren Zugriff nicht freigegeben.",
        },
        { status: 404 },
      );
    }

    return Response.json({
      valid: true,
      path: `/mandat/${client.mandatsnummer}`,
      dataSource: sourceLabel,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Mandatsprüfung konnte nicht ausgeführt werden.";
    return Response.json(
      {
        valid: false,
        message,
      },
      { status: 502 },
    );
  }
}
