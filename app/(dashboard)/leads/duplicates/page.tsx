import { DashboardTabs } from "@/app/components/dashboard-tabs";
import { LeadsDuplicatesPanel } from "./_components/leads-duplicates-panel";

export default function LeadsDuplicatesPage() {
  return (
    <div className="space-y-6">
      <DashboardTabs />
      <LeadsDuplicatesPanel />
    </div>
  );
}
