// What /api/hotdaily/* answers, shared by the backend and the web pages.
export interface HotDailyEntry {
  rank: number;
  storyPublicId: string;
  title: string;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  participantCount: number;
  sourceNames: string[];
  /** The event's digest or summary when the issue was composed. */
  summary: string | null;
  /** The model's one line on why it matters. */
  take: string | null;
  url: string | null;
  source: string | null;
  /** When the event was first reported (absent on issues composed before it was kept). */
  firstReportAt?: string;
}

/** A listed company the analysis says the day may move, from the module's list (listed.ts). */
export interface HotDailyStock {
  ticker: string;
  exchange: string;
  name: string;
  direction: "利好" | "利空" | "中性";
  reason: string;
  risk: string;
}

/** The issue's closing section, written by the model from the events alone. */
export interface HotDailyAnalysis {
  summary: string | null;
  market: string | null;
  stocks: HotDailyStock[];
}

export interface HotDailyEdition {
  date: string;
  title: string;
  lead: string | null;
  entries: HotDailyEntry[];
  analysis: HotDailyAnalysis | null;
  composedAt: string;
}

export interface HotDailyIndexEntry {
  date: string;
  title: string;
  count: number;
}

export interface HotDailyPage {
  edition: HotDailyEdition | null;
  index: HotDailyIndexEntry[];
  /** Whether the site takes email subscriptions now (SMTP set up and EMAIL_SEND_ENABLED=true). */
  subscribe: boolean;
}

export interface HotDailyAdmin {
  subscribers: { pending: number; active: number; unsubscribed: number };
  sending: { enabled: boolean; configured: boolean; from: string | null };
  editions: Array<{ date: string; title: string; entries: number; sent: number; failed: number; composedAt: string }>;
  rows: Array<{ id: number; email: string; status: string; createdAt: string; confirmedAt: string | null }>;
  page: number;
  pages: number;
}
