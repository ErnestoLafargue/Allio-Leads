import { SectionTabs } from "./_components/section-tabs";

export default function ScriptsTrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Scripts & Træning</h1>
        <p className="mt-1 text-sm text-stone-600">
          Analyse af jeres samtaler: hvad virker, hvad kan gøres bedre, ugens script og personlig træning.
        </p>
      </header>
      <SectionTabs />
      {children}
    </div>
  );
}
