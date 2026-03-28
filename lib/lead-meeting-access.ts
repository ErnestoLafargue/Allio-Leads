type BasicLead = {
  status: string;
  bookedByUserId: string | null;
};

export function isMeetingBookedLead(lead: BasicLead): boolean {
  return String(lead.status).trim().toUpperCase() === "MEETING_BOOKED";
}

/** Fuld adgang til booket møde (inkl. noter): administrator eller den der bookede. */
export function canAccessBookedMeetingNotes(role: string, userId: string, lead: BasicLead): boolean {
  if (!isMeetingBookedLead(lead)) return true;
  if (role === "ADMIN") return true;
  return lead.bookedByUserId === userId;
}
