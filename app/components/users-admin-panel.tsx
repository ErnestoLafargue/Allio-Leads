"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EditUserModal, type EditableUser } from "@/app/components/edit-user-modal";
import { UserRow } from "@/app/components/user-row";

export function UsersAdminPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<EditableUser[]>([]);
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"SELLER" | "ADMIN">("SELLER");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "ADMIN") {
      router.replace("/leads");
      return;
    }
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/users");
      if (!res.ok) {
        if (!cancelled) setError("Ingen adgang");
        return;
      }
      const data = (await res.json()) as EditableUser[];
      if (!cancelled) {
        setUsers(data);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, status, router]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, name, password, role, phone }),
    });
    setCreating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke oprette bruger");
      return;
    }
    const u = (await res.json()) as EditableUser;
    setUsers((prev) => [u, ...prev]);
    setUsername("");
    setName("");
    setPassword("");
    setPhone("");
    setRole("SELLER");
  }

  if (status === "loading" || loading) {
    return <p className="text-stone-500">Henter…</p>;
  }

  if (session?.user.role !== "ADMIN") {
    return null;
  }

  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Brugere</h2>
        <p className="text-sm text-stone-500">Opret brugere, skift rolle, adgangskode eller slet kontoer</p>
      </div>

      <form onSubmit={onCreate} className="max-w-lg space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-medium text-stone-800">Ny bruger</h3>
        <div>
          <label className="block text-sm text-stone-700">Brugernavn (login)</label>
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm text-stone-700">Vist navn</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm text-stone-700">Adgangskode (min. 6 tegn)</label>
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm text-stone-700">Telefonnummer (valgfri)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="+45 12 34 56 78"
            className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm text-stone-700">Rolle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "SELLER" | "ADMIN")}
            className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
          >
            <option value="SELLER">Sælger</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
        >
          {creating ? "Opretter…" : "Opret bruger"}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Brugernavn</th>
              <th className="px-4 py-3 font-medium">Navn</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Rolle</th>
              <th className="px-4 py-3 font-medium">Oprettet</th>
              {isAdmin ? (
                <th className="w-14 px-4 py-3 text-right font-medium" aria-label="Rediger"></th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((u) => (
              <UserRow key={u.id} user={u} isAdmin={isAdmin} onEdit={setEditingUser} />
            ))}
          </tbody>
        </table>
      </div>

      <EditUserModal
        open={editingUser != null}
        user={editingUser}
        currentUserId={session.user.id ?? ""}
        onClose={() => setEditingUser(null)}
        onSaved={(updated) => {
          setUsers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        }}
        onDeleted={(id) => {
          setUsers((prev) => prev.filter((row) => row.id !== id));
        }}
      />
    </div>
  );
}
