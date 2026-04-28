"use client";

import { GearIconButton } from "@/app/components/edit-user-modal";
import type { EditableUser } from "@/app/components/edit-user-modal";

type Props = {
  user: EditableUser;
  /** Kun administratorer ser gear og kan åbne redigering */
  isAdmin: boolean;
  onEdit: (user: EditableUser) => void;
};

export function UserRow({ user, isAdmin, onEdit }: Props) {
  return (
    <tr className="hover:bg-stone-50/80">
      <td className="px-4 py-3 text-stone-900">{user.username}</td>
      <td className="px-4 py-3 text-stone-700">{user.name}</td>
      <td className="px-4 py-3 text-stone-700">{user.phone?.trim() ? user.phone : "—"}</td>
      <td className="px-4 py-3 text-stone-700">{user.role === "ADMIN" ? "Admin" : "Sælger"}</td>
      <td className="px-4 py-3 text-stone-500">{new Date(user.createdAt).toLocaleDateString("da-DK")}</td>
      {isAdmin ? (
        <td className="px-4 py-3 text-right">
          <GearIconButton onClick={() => onEdit(user)} />
        </td>
      ) : null}
    </tr>
  );
}
