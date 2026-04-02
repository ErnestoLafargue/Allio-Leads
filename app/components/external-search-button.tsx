"use client";

import Image from "next/image";
import {
  buildGoogleSearchUrl,
  buildKrakUrl,
  buildVirkUrl,
  openExternalUrl,
} from "@/lib/external-search-urls";

/** Samme styling som Krak/Virk/Google — også til annonce-bibliotek-knapper. */
export const ENRICHMENT_ICON_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white p-1 shadow-sm outline-none ring-stone-400 transition hover:bg-stone-50 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40";

const ICON_IMG = "h-7 w-7 object-contain";

const SEARCH_ICONS: Record<"krak" | "virk" | "google", { src: string; alt: string }> = {
  krak: { src: "/enrichment/krak.png", alt: "Krak" },
  virk: { src: "/enrichment/virk.png", alt: "VIRK" },
  google: { src: "/enrichment/google.png", alt: "Google" },
};

type Props = {
  type: "krak" | "virk" | "google";
  /** Rå feltværdi (navn, CVR eller søgestreng) */
  value: string;
  /** false = render intet */
  visible: boolean;
  tooltip: string;
};

export function ExternalSearchButton({ type, value, visible, tooltip }: Props) {
  if (!visible) return null;
  const url =
    type === "krak"
      ? buildKrakUrl(value)
      : type === "virk"
        ? buildVirkUrl(value)
        : buildGoogleSearchUrl(value);
  if (!url) return null;

  const { src, alt } = SEARCH_ICONS[type];

  return (
    <button
      type="button"
      className={ENRICHMENT_ICON_BUTTON_CLASS}
      title={tooltip}
      aria-label={tooltip}
      onClick={() => openExternalUrl(url)}
    >
      <Image src={src} alt={alt} width={28} height={28} className={ICON_IMG} unoptimized />
    </button>
  );
}
