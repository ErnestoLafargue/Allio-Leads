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
  CLIENT_EDITION_DRAFT_ID,
  CLIENT_EDITION_SUBJECT,
  CLIENT_EDITION_MESSAGE,
  clientEditionMailDraft,
} from "./client-edition-mail";

export {
  GROWTH_OVERVIEW_DRAFT_ID,
  GROWTH_OVERVIEW_SUBJECT,
  GROWTH_OVERVIEW_MESSAGE,
  growthOverviewMailDraft,
} from "./growth-overview-mail";

export {
  GROWTH_OVERVIEW_EN_DRAFT_ID,
  GROWTH_OVERVIEW_EN_SUBJECT,
  GROWTH_OVERVIEW_EN_MESSAGE,
  growthOverviewEnMailDraft,
} from "./growth-overview-mail-en";

export {
  BUSINESS_CARD_DRAFT_ID,
  BUSINESS_CARD_SUBJECT,
  BUSINESS_CARD_MESSAGE,
  businessCardMailDraft,
} from "./business-card-mail";

export {
  MAIL_PLACEHOLDERS,
  MAIL_PLACEHOLDERS_EN,
  mailSenderEmail,
  mailSenderName,
  personalizeMailDraft,
  type MailDraftContext,
  type MailSenderUser,
} from "./personalize";

export {
  REACTIVATION_DRAFT_ID,
  REACTIVATION_SUBJECT,
  REACTIVATION_MESSAGE,
  reactivationMailDraft,
} from "./reactivation-mail";

import { adamFocusMailDraft } from "./adam-focus-mail";
import { businessCardMailDraft } from "./business-card-mail";
import { clientEditionMailDraft } from "./client-edition-mail";
import { growthOverviewMailDraft } from "./growth-overview-mail";
import { growthOverviewEnMailDraft } from "./growth-overview-mail-en";
import { reactivationMailDraft } from "./reactivation-mail";

export const DEFAULT_MAIL_DRAFT_ID = growthOverviewMailDraft.id;

export const MAIL_DRAFTS: MailDraft[] = [
  { id: EMPTY_DRAFT_ID, label: "Tom mail", subject: "", message: "" },
  { ...clientEditionMailDraft },
  { ...growthOverviewMailDraft },
  { ...growthOverviewEnMailDraft },
  { ...businessCardMailDraft },
  { ...adamFocusMailDraft },
  { ...reactivationMailDraft },
];
