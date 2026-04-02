"use client";

import Image from "next/image";
import { buildKrakUrl, buildVirkUrl, openExternalUrl } from "@/lib/external-search-urls";

const BTN_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white p-1 shadow-sm outline-none ring-stone-400 transition hover:bg-stone-50 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40";

type Props = {
  type: "krak" | "virk";
  /** Rå feltværdi (navn eller CVR) */
  value: string;
  /** false = render intet */
  visible: boolean;
  tooltip: string;
};

export function ExternalSearchButton({ type, value, visible, tooltip }: Props) {
  if (!visible) return null;
  const url = type === "krak" ? buildKrakUrl(value) : buildVirkUrl(value);
  if (!url) return null;

  const src = type === "krak" ? "/enrichment/krak.png" : "/enrichment/virk.png";
  const alt = type === "krak" ? "Krak" : "VIRK";

  return (
    <button
      type="button"
      className={BTN_CLASS}
      title={tooltip}
      aria-label={tooltip}
      onClick={() => openExternalUrl(url)}
    >
      <Image src={src} alt={alt} width={28} height={28} className="h-7 w-7 object-contain" unoptimized />
    </button>
  );
}
