import { redirect } from "next/navigation";

/** Tidligere placering — viderestil til Administration → Export. */
export default function IndstillingerExportRedirect() {
  redirect("/export");
}
