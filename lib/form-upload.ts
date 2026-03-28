/**
 * FormData-filfelter er som regel File, men i nogle Next.js/Node-setup er det Blob — undgå kun File-check.
 */
export function getUploadedBlob(entry: FormDataEntryValue | null): Blob | null {
  if (!entry || typeof entry !== "object") return null;
  const b = entry as Blob;
  if (typeof b.arrayBuffer !== "function") return null;
  if (typeof b.size !== "number" || b.size <= 0) return null;
  return b;
}

export function uploadFilename(blob: Blob, fallback = "upload.bin"): string {
  if ("name" in blob && typeof (blob as File).name === "string" && (blob as File).name.trim()) {
    return (blob as File).name.trim();
  }
  return fallback;
}
