import type { AllioEmployee } from "@/lib/allio-native/client";

/**
 * Hvilken Allio-kalender hører til hvilken sælger i Allio-Leads. Leads-brugere har ingen e-mail, så der matches
 * på telefon (sidste 8 cifre), fuldt navn og til sidst fornavn — og kun når der er præcis ét bud, så en kalender
 * aldrig kobles til den forkerte.
 */

export type SellerForMatch = {
  id: string;
  name: string;
  phone: string | null;
  allioNativeEmployeeId: string | null;
};

export type EmployeeForMatch = Pick<AllioEmployee, "id" | "name" | "phone">;

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstName(name: string): string {
  return normalizeName(name).split(" ")[0] ?? "";
}

function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : null;
}

/** Det eneste element, der opfylder betingelsen — ellers null (ingen eller flere). */
function onlyOne<T>(items: T[], predicate: (item: T) => boolean): T | null {
  const hits = items.filter(predicate);
  return hits.length === 1 ? hits[0] : null;
}

function pairs(a: { name: string; phone?: string | null }, b: { name: string; phone?: string | null }) {
  const phoneA = phoneKey(a.phone);
  return {
    phone: phoneA !== null && phoneA === phoneKey(b.phone),
    fullName: normalizeName(a.name) === normalizeName(b.name),
    firstName: firstName(a.name) !== "" && firstName(a.name) === firstName(b.name),
  };
}

/** Den sælger uden kalender, som en Allio-kalender passer på. */
export function matchSellerForEmployee(sellers: SellerForMatch[], employee: EmployeeForMatch): SellerForMatch | null {
  const free = sellers.filter((s) => !s.allioNativeEmployeeId);
  return (
    onlyOne(free, (s) => pairs(s, employee).phone) ??
    onlyOne(free, (s) => pairs(s, employee).fullName) ??
    onlyOne(free, (s) => pairs(s, employee).firstName)
  );
}

/** Den Allio-kalender (som ingen anden sælger har), der passer på sælgeren. */
export function matchEmployeeForSeller(
  employees: EmployeeForMatch[],
  seller: SellerForMatch,
  takenIds: Set<string>,
): EmployeeForMatch | null {
  const free = employees.filter((e) => !takenIds.has(e.id));
  return (
    onlyOne(free, (e) => pairs(seller, e).phone) ??
    onlyOne(free, (e) => pairs(seller, e).fullName) ??
    onlyOne(free, (e) => pairs(seller, e).firstName)
  );
}
