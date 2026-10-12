import { IndstillingerSectionTabs } from "./_components/section-tabs";

export default function IndstillingerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-stone-900">Indstillinger</h1>
        <p className="mt-1 text-sm text-stone-600">
          Administration af brugere og dataudtræk fra systemet.
        </p>
      </header>
      <IndstillingerSectionTabs />
      {children}
    </div>
  );
}
