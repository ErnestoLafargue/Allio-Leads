"use client";

import { useEffect, useId, useRef, useState } from "react";

export type MineSalgUserOption = {
  id: string;
  name: string;
  role?: string;
};

type Props = {
  value: string;
  displayName: string;
  options: MineSalgUserOption[];
  myUserId: string;
  disabled?: boolean;
  onChange: (userId: string) => void;
};

export function UserViewSwitcher({
  value,
  displayName,
  options,
  myUserId,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function pick(nextId: string) {
    onChange(nextId);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        className="flex min-w-[14rem] items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm shadow-sm outline-none ring-stone-400 hover:bg-stone-50 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="text-stone-900">
          <span className="text-stone-500">Viser: </span>
          <span className="font-medium">{displayName}</span>
        </span>
        <svg
          aria-hidden
          className={`h-4 w-4 shrink-0 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Vis Mine salg som bruger"
          className="absolute right-0 z-30 mt-1 max-h-72 min-w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {options.map((u) => {
            const selected = u.id === value;
            return (
              <li key={u.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(u.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 ${
                    selected ? "bg-stone-100 font-medium text-stone-900" : "text-stone-800"
                  }`}
                >
                  <span>
                    {u.name}
                    {u.id === myUserId ? " (dig)" : ""}
                  </span>
                  {u.role === "ADMIN" ? (
                    <span className="text-xs text-stone-500">Admin</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
