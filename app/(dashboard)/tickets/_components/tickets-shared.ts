import type { TicketDto as LibTicketDto } from "@/lib/tickets";

/** Re-eksport så komponenter kan importere én sammenhængende type. */
export type TicketDto = LibTicketDto;

export type AssignableUser = {
  id: string;
  name: string;
  username: string;
};

export type TicketsViewer = {
  id: string;
  role: string;
  name: string;
};
