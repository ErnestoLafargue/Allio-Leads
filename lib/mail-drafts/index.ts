export type MailDraft = {
  id: string;
  label: string;
  subject: string;
  message: string;
};

export const EMPTY_DRAFT_ID = "empty";

export {
  ADAM_FOCUS_DRAFT_ID,
  ADAM_FOCUS_SUBJECT,
  ADAM_FOCUS_MESSAGE,
  adamFocusMailDraft,
} from "./adam-focus-mail";

export {
  REACTIVATION_DRAFT_ID,
  REACTIVATION_SUBJECT,
  REACTIVATION_MESSAGE,
  reactivationMailDraft,
} from "./reactivation-mail";

import { adamFocusMailDraft } from "./adam-focus-mail";
import { reactivationMailDraft } from "./reactivation-mail";

export const DEFAULT_MAIL_DRAFT_ID = adamFocusMailDraft.id;

export const MAIL_DRAFTS: MailDraft[] = [
  { id: EMPTY_DRAFT_ID, label: "Tom mail", subject: "", message: "" },
  { ...adamFocusMailDraft },
  { ...reactivationMailDraft },
];
