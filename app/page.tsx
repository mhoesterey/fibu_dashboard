import { CockpitClient } from "./components/CockpitClient";
import { requireCockpitAccess, requireWorkspaceUser } from "./lib/authz";
import {
  getDashboardMetrics,
  getHeatmap,
  getTopActionItems,
} from "./lib/scoring";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireWorkspaceUser("/");
  requireCockpitAccess(user);

  return (
    <CockpitClient
      user={user}
      initialMetrics={getDashboardMetrics()}
      initialHeatmap={getHeatmap()}
      initialActionItems={getTopActionItems()}
    />
  );
}
