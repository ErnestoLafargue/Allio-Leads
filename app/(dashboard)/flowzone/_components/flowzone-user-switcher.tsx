"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

export type FlowZoneUser = { id: string; name: string };

interface FlowZoneUserSwitcherProps {
  value: string;
  ownUserId: string;
  onChange: (user: FlowZoneUser) => void;
}

/** Vælg hvis FlowZone man ser. Vises kun når der er andre end en selv at vælge. */
export function FlowZoneUserSwitcher({ value, ownUserId, onChange }: FlowZoneUserSwitcherProps) {
  const [users, setUsers] = useState<FlowZoneUser[]>([]);

  useEffect(() => {
    fetch("/api/flowzone/users")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body: { users: FlowZoneUser[] }) => setUsers(body.users))
      .catch(() => setUsers([]));
  }, []);

  if (users.length < 2) return null;

  // Egen FlowZone øverst, resten i alfabetisk rækkefølge
  const sorted = [...users].sort((a, b) => Number(b.id === ownUserId) - Number(a.id === ownUserId));

  return (
    <label
      className={`flex h-[42px] items-center gap-2 rounded-lg p-1 pl-3 text-sm ${value === ownUserId ? "bg-stone-100 text-stone-600" : "bg-blue-50 text-blue-800 ring-1 ring-blue-200"}`}
      title="Se en anden admins FlowZone"
    >
      <Users className="h-4 w-4 shrink-0" />
      <select
        value={value}
        onChange={(e) => {
          const user = users.find((u) => u.id === e.target.value);
          if (user) onChange(user);
        }}
        className="h-full cursor-pointer rounded-md bg-white px-2 pr-7 text-sm font-medium text-stone-900 shadow-sm outline-none focus:ring-2 focus:ring-stone-300"
      >
        {sorted.map((u) => (
          <option key={u.id} value={u.id}>
            {u.id === ownUserId ? `${u.name} (mig)` : u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
