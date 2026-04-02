/**
 * Renser virksomhedsnavn til søgning (fjerner ejer-/selskabs-suffix som «v/…», «ved …»).
 */
export function cleanBusinessName(name: string): string {
  if (!name || typeof name !== "string") return "";
  const first = name.split(/\s+v\/|\s+v\s*\/|\s+ved\s+/i)[0] ?? "";
  return first.trim().replace(/\s+/g, " ");
}

/** Facebook / Meta Ads Library — eksakt sætning, DK. */
export function buildFacebookAdsLibraryUrl(cleanedName: string): string | null {
  const q = cleanBusinessName(cleanedName);
  if (!q) return null;
  const params = new URLSearchParams();
  params.set("active_status", "active");
  params.set("ad_type", "all");
  params.set("country", "DK");
  params.set("is_targeted_country", "false");
  params.set("media_type", "all");
  params.set("q", `"${q}"`);
  params.set("search_type", "keyword_exact_phrase");
  params.append("sort_data[direction]", "desc");
  params.append("sort_data[mode]", "total_impressions");
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

/** Google Ads Transparency — søgning ud fra navn (region DK). */
export function buildGoogleAdsTransparencyUrl(cleanedName: string): string | null {
  const q = cleanBusinessName(cleanedName);
  if (!q) return null;
  const params = new URLSearchParams();
  params.set("region", "DK");
  params.set("query", q);
  return `https://adstransparency.google.com/search?${params.toString()}`;
}

/**
 * Instagram annoncer kører via Meta — samme bibliotek som Facebook.
 */
export function buildInstagramAdsLibraryUrl(cleanedName: string): string | null {
  return buildFacebookAdsLibraryUrl(cleanedName);
}
