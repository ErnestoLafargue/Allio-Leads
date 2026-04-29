export type TicketAccessViewer = {
  id: string;
  role: string;
};

export type TicketAccessTicket = {
  createdByUserId: string;
  assignedUserId: string;
};

/** Opretter, tildelt bruger og admin må redigere ticket. */
export function canEditTicket(viewer: TicketAccessViewer, ticket: TicketAccessTicket): boolean {
  if (!viewer?.id) return false;
  if (viewer.role === "ADMIN") return true;
  return viewer.id === ticket.createdByUserId || viewer.id === ticket.assignedUserId;
}

/** Kun opretter og admin må slette ticket. */
export function canDeleteTicket(viewer: TicketAccessViewer, ticket: TicketAccessTicket): boolean {
  if (!viewer?.id) return false;
  if (viewer.role === "ADMIN") return true;
  return viewer.id === ticket.createdByUserId;
}
