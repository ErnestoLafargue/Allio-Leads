import { isValidDashboardPublicToken } from "@/lib/dashboard/public-token";
import { PublicDashboardTv } from "@/app/components/public-dashboard-tv";

type Props = { params: Promise<{ token: string }> };

export default async function PublicDashboardPage({ params }: Props) {
  const { token } = await params;
  if (!isValidDashboardPublicToken(token)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 px-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-stone-100">Ugyldigt link</h1>
          <p className="mt-2 text-stone-400">Dette dashboard-link er ikke gyldigt.</p>
        </div>
      </div>
    );
  }

  return <PublicDashboardTv token={token} />;
}
