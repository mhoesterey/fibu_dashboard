import { canAccessClient, requireWorkspaceUser } from "@/app/lib/authz";
import { recordAuditEvent } from "@/app/lib/audit";
import { getClientByNumber } from "@/app/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireWorkspaceUser("/");
  const url = new URL(request.url);
  const mandatsnummer = url.searchParams.get("mandatsnummer")?.trim() ?? "";

  if (!/^[0-9]{3,12}$/.test(mandatsnummer)) {
    return Response.json(
      { valid: false, message: "Bitte eine gültige Mandatsnummer eingeben." },
      { status: 400 },
    );
  }

  const client = getClientByNumber(mandatsnummer);
  await recordAuditEvent({
    user,
    action: "mandate_validate",
    targetType: "client",
    targetRef: mandatsnummer,
    metadata: { found: Boolean(client) },
  });

  if (!client || !canAccessClient(user, client)) {
    return Response.json(
      {
        valid: false,
        message:
          "Diese Mandatsnummer ist unbekannt oder für Ihren Zugriff nicht freigegeben.",
      },
      { status: 404 },
    );
  }

  return Response.json({ valid: true, path: `/mandat/${client.mandatsnummer}` });
}
