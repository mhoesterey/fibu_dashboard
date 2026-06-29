import { requireWorkspaceUser, canAccessCockpit } from "@/app/lib/authz";
import { recordAuditEvent, recordRefreshRun } from "@/app/lib/audit";
import { loadDashboardData } from "@/app/lib/dashboard-data";
import { createRefreshRun } from "@/app/lib/scoring";

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

  if (url.searchParams.get("fail") === "1") {
    const failedRun = createRefreshRun(user.email, {
      source: "mock",
      checkedClients: 0,
      status: "failed",
      errorMessage: "Der Test-Refresh wurde bewusst mit Fehler ausgelöst.",
    });
    await recordRefreshRun(failedRun);

    return Response.json(
      {
        error: "Dashboard konnte nicht aktualisiert werden. Bitte Refresh-Log prüfen.",
        refreshRun: failedRun,
      },
      { status: 500 },
    );
  }

  try {
    const data = await loadDashboardData();
    const refreshRun = createRefreshRun(user.email, {
      source: data.source,
      checkedClients: data.metrics.checkedClients,
    });
    await recordRefreshRun(refreshRun);
    await recordAuditEvent({
      user,
      action: "dashboard_refresh",
      targetType: "dashboard",
      metadata: {
        refreshRunId: refreshRun.id,
        source: data.sourceLabel,
        checkedClients: data.metrics.checkedClients,
      },
    });

    return Response.json({
      refreshRun,
      updatedBy: user.displayName,
      updatedAt: refreshRun.finishedAt,
      dataSource: data.sourceLabel,
      metrics: data.metrics,
      heatmap: data.heatmap,
      topActionItems: data.topActionItems,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unerwarteter Fehler beim API-Refresh.";
    const failedRun = createRefreshRun(user.email, {
      source: "klardaten",
      checkedClients: 0,
      status: "failed",
      errorMessage: message,
    });
    await recordRefreshRun(failedRun);

    return Response.json(
      {
        error: "Dashboard konnte nicht aus der API aktualisiert werden.",
        refreshRun: failedRun,
      },
      { status: 502 },
    );
  }
}
