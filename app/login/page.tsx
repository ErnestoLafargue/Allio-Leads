"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      username: username.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Forkert brugernavn eller adgangskode");
      return;
    }
    router.push("/leads");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-stone-100 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-stone-900">Allio Leads</h1>
        <p className="mt-1 text-center text-sm text-stone-500">Log ind med dit brugernavn</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-stone-700">
              Brugernavn
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-stone-700">
              Adgangskode
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-stone-800 py-2.5 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
          >
            {loading ? "Logger ind…" : "Log ind"}
          </button>
        </form>
      </div>
    </div>
  );
}
