"use client";

import Image from "next/image";
import { ENRICHMENT_ICON_BUTTON_CLASS } from "@/app/components/external-search-button";
import {
  buildFacebookAdsLibraryUrl,
  buildGoogleAdsTransparencyUrl,
  buildInstagramAdsLibraryUrl,
  cleanBusinessName,
} from "@/lib/ad-library-urls";
import { openExternalUrl } from "@/lib/external-search-urls";

const ICON_IMG = "h-7 w-7 object-contain";

type IconBtnProps = {
  src: string;
  alt: string;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
};

function AdIconButton({ src, alt, tooltip, disabled, onClick }: IconBtnProps) {
  return (
    <button
      type="button"
      className={ENRICHMENT_ICON_BUTTON_CLASS}
      title={tooltip}
      aria-label={tooltip}
      disabled={disabled}
      onClick={onClick}
    >
      <Image src={src} alt={alt} width={28} height={28} className={ICON_IMG} unoptimized />
    </button>
  );
}

type Props = {
  /** Rå værdi fra feltet Virksomhedsnavn */
  companyName: string;
  className?: string;
};

/**
 * Annonce-bibliotek (Google / Meta) baseret på renset virksomhedsnavn — under mødekontakt.
 */
export function AdLibraryCard({ companyName, className = "" }: Props) {
  const cleaned = cleanBusinessName(companyName);
  const enabled = cleaned.length > 0;

  return (
    <div
      className={[
        "w-full space-y-3 rounded-xl border border-stone-200/90 bg-stone-50/50 p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-700">Annoncering</p>
      <p className="text-xs text-stone-600">
        Tjek om virksomheden annoncerer — baseret på <strong>Virksomhedsnavn</strong> (renset for fx{" "}
        <code className="rounded bg-stone-200/80 px-1 font-mono text-[11px]">v/…</code>).
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
        <AdIconButton
          src="/enrichment/google.png"
          alt="Google Ads Transparency"
          tooltip="Søg i Google Ads Transparency"
          disabled={!enabled}
          onClick={() => {
            const url = buildGoogleAdsTransparencyUrl(cleaned);
            if (url) openExternalUrl(url);
          }}
        />
        <AdIconButton
          src="/enrichment/facebook.png"
          alt="Facebook Ads Library"
          tooltip="Søg i Facebook Ads Library"
          disabled={!enabled}
          onClick={() => {
            const url = buildFacebookAdsLibraryUrl(cleaned);
            if (url) openExternalUrl(url);
          }}
        />
        <AdIconButton
          src="/enrichment/instagram.png"
          alt="Instagram Ads Library"
          tooltip="Søg i Instagram Ads Library"
          disabled={!enabled}
          onClick={() => {
            const url = buildInstagramAdsLibraryUrl(cleaned);
            if (url) openExternalUrl(url);
          }}
        />
      </div>
    </div>
  );
}
