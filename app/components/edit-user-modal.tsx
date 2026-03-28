"use client";

import { useEffect, useState } from "react";

export type EditableUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  createdAt: string;
};

type Props = {
  open: boolean;
  user: EditableUser | null;
  onClose: () => void;
  /** Opdateret bruger efter PATCH */
  onSaved: (user: EditableUser) => void;
  /** id når bruger er slettet */
  onDeleted: (id: string) => void;
  /** Nuværende admins session user id — kan ikke slette sig selv */
  currentUserId: string;
};

export function GearIconButton({
  onClick,
  label = "Rediger bruger",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
    >
      <span className="text-lg leading-none" aria-hidden>
        ⚙️
      </span>
    </button>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function EditUserModal({
  open,
  user,
  onClose,
  onSaved,
  onDeleted,
  currentUserId,
}: Props) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"ADMIN" | "SELLER">("SELLER");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open && user) {
      setUsername(user.username);
      setName(user.name);
      setRole(user.role === "ADMIN" ? "ADMIN" : "SELLER");
      setPassword("");
      setError(null);
      setDeleteConfirm(false);
    }
  }, [open, user?.id, user?.username, user?.name, user?.role]);

  if (!open || !user) return null;

  const target = user;
  const canDelete = target.id !== currentUserId;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body: Record<string, string> = {
      username: username.trim().toLowerCase(),
      name: name.trim(),
      role,
    };
    const pw = password.trim();
    if (pw) {
      body.password = pw;
    }
    const res = await fetch(`/api/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme");
      return;
    }
    const updated = (await res.json()) as EditableUser;
    onSaved(updated);
    setPassword("");
    onClose();
  }

  async function handleConfirmDelete() {
    setError(null);
    setDeleting(true);
    const res = await fetch(`/api/users/${target.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke slette");
      setDeleteConfirm(false);
      return;
    }
    onDeleted(target.id);
    setDeleteConfirm(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-[1px]"
        aria-label="Luk"
        onClick={() => !saving && !deleting && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-xl"
      >
        <div className="border-b border-stone-100 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-lg text-stone-600" aria-hidden>
              ⚙️
            </div>
            <div>
              <h2 id="edit-user-title" className="text-base font-semibold text-stone-900">
                Rediger bruger
              </h2>
              <p className="mt-0.5 text-sm text-stone-500">{target.username}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <div className="space-y-5">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Brugerinfo</h3>
              <div className="mt-3 space-y-4">
                <div>
                  <label htmlFor="edit-username" className="block text-sm font-medium text-stone-700">
                    Brugernavn (login)
                  </label>
                  <input
                    id="edit-username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-name" className="block text-sm font-medium text-stone-700">
                    Profilnavn
                  </label>
                  <input
                    id="edit-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-role" className="block text-sm font-medium text-stone-700">
                    Rolle
                  </label>
                  <select
                    id="edit-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "ADMIN" | "SELLER")}
                    className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                  >
                    <option value="SELLER">Sælger</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Adgangskode</h3>
              <div className="mt-3">
                <label htmlFor="edit-password" className="block text-sm font-medium text-stone-700">
                  Ny adgangskode
                </label>
                <input
                  id="edit-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Valgfri — udfyld kun ved skift"
                  className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                />
                <p className="mt-1 text-xs text-stone-500">Mindst 6 tegn hvis du angiver en ny kode.</p>
              </div>
            </section>

            {canDelete && (
              <section className="rounded-xl border border-red-100 bg-red-50/50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-red-900/80">Farezone</h3>
                {!deleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Slet bruger
                  </button>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm font-medium text-red-950">
                      Er du sikker på, at du vil slette denne bruger?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => setDeleteConfirm(false)}
                        className="flex-1 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
                      >
                        Annuller
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => void handleConfirmDelete()}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        <TrashIcon className="h-4 w-4" />
                        {deleting ? "Sletter…" : "Slet bruger"}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-5">
            <button
              type="button"
              disabled={saving || deleting}
              onClick={() => onClose()}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              Luk
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
            >
              {saving ? "Gemmer…" : "Gem ændringer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
