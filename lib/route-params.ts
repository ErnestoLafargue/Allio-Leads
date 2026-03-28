/** Next.js `useParams` kan give string, string[] eller undefined for dynamiske segmenter. */
export function asSingleParam(value: string | string[] | undefined): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value[0] ?? "";
  return value;
}
