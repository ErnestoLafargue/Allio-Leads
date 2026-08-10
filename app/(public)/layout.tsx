import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Allio Dashboard",
  robots: { index: false, follow: false },
};

/** Offentlige sider uden dashboard-sidebar (root layout giver stadig html/body). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
