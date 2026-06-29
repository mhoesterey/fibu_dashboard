import { requireWorkspaceUser, canAccessCockpit } from "@/app/lib/authz";
import { recordAuditEvent, recordRefreshRun } from "@/app/lib/audit";
import {
  createSimulatedRefreshRun,
  getDashboardMetrics,
  getHeatmap,
  getTopActionItems,
} from "@/app/lib/scoring";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireWorkspaceUser("/");
  if (!canAccessCockpit(user)) {
    return Response.json(
      { error: "Keine Berechtigung zum Aktualisieren des Dashboards." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  await wait(900);

  if (url.searchParams.get("fail") === "1") {
    const failedRun = {
      ...createSimulatedRefreshRun(user.email),
      status: "failed" as const,
      errorMessage:
        "Die simulierte Datenquelle hat keine vollständige Antwort geliefert.",
      log: [
        "Workspace-Identität geprüft",
        "Mock-Datenquelle geladen",
        "Fehler beim simulierten QS-Regellauf",
      ],
    };
    await recordRefreshRun(failedRun);

    return Response.json(
      {
        error:
          "Dashboard konnte nicht aktualisiert werden. Bitte Refresh-Log prüfen.",
        refreshRun: failedRun,
      },
      { status: 500 },
    );
  }

  const refreshRun = createSimulatedRefreshRun(user.email);
  await recordRefreshRun(refreshRun);
  await recordAuditEvent({
    user,
    action: "dashboard_refresh",
    targetType: "dashboard",
    metadata: { refreshRunId: refreshRun.id },
  });

  return Response.json({
    refreshRun,
    updatedBy: user.displayName,
    updatedAt: refreshRun.finishedAt,
    metrics: getDashboardMetrics(),
    heatmap: getHeatmap(),
    topActionItems: getTopActionItems(),
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
