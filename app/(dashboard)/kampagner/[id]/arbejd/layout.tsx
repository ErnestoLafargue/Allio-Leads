/**
 * Bryder ud af dashboardets smalle `max-w-6xl`, så 50/50-layout får mere plads.
 */
export default function KampagneArbejdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen max-w-none px-4 sm:px-6">
      <div className="mx-auto w-full max-w-[1400px]">{children}</div>
    </div>
  );
}
