import { prisma } from "@/lib/prisma";

type AssigneeUser = {
  id: string;
  name: string;
  username: string;
  phone: string | null;
};

function hasPhone(u: AssigneeUser): boolean {
  return typeof u.phone === "string" && u.phone.trim().length > 0;
}

function isVictor(u: AssigneeUser): boolean {
  const uname = u.username.trim().toLowerCase();
  const name = u.name.trim().toLowerCase();
  return uname === "victor@allio.dk" || name === "victor lafargue";
}

export async function listMeetingAssignableUsers(): Promise<AssigneeUser[]> {
  const rows = await prisma.user.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, username: true, phone: true },
  });
  return rows.filter(hasPhone);
}

export async function getDefaultMeetingAssigneeId(): Promise<string | null> {
  const rows = await listMeetingAssignableUsers();
  const victor = rows.find(isVictor);
  return victor?.id ?? null;
}

export async function requireDefaultMeetingAssigneeId(): Promise<string> {
  const id = await getDefaultMeetingAssigneeId();
  if (!id) {
    throw new Error(
      "Standard mødeansvarlig (Victor Lafargue / victor@allio.dk) mangler eller har intet telefonnummer.",
    );
  }
  return id;
}

