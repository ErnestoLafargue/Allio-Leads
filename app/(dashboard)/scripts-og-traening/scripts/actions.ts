"use server";

import { revalidatePath } from "next/cache";
import { rollbackWeeklyScript } from "@/lib/sales-scripts/publish";
import { getViewer } from "@/lib/scripts-traening/queries";

/** Gør en tidligere version af ugens script aktiv igen (kun admin). */
export async function rollbackScriptAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Kun admins kan rulle ugens script tilbage.");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Mangler scriptversion.");
  await rollbackWeeklyScript(id);
  revalidatePath("/scripts-og-traening/scripts");
  revalidatePath("/scripts-og-traening");
}
