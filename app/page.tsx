import { CockpitClient } from "./components/CockpitClient";
import { loadDashboardData } from "./lib/dashboard-data";
import { requireCockpitAccess, requireWorkspaceUser } from "./lib/authz";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireWorkspaceUser("/");
  requireCockpitAccess(user);
  const data = await loadDashboardData();

  return (
    <CockpitClient
      user={user}
      initialMetrics={data.metrics}
      initialHeatmap={data.heatmap}
      initialActionItems={data.topActionItems}
      initialDataSource={data.sourceLabel}
    />
  );
}
