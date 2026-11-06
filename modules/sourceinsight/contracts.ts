// What /api/admin/sourceinsight/* answers, shared by the backend and the admin page.
export interface SourceOutput {
  id: string;
  name: string;
  kind: string;
  tier: string;
  mode: string;
  enabled: boolean;
  health: string;
  /** New material found in the window (archive imports left out). */
  collected: number;
  /** Of it, what entered the public pool, and what was selected. */
  listed: number;
  selected: number;
  /** Events it gave evidence to, and how many of them reached the hot ranking's top 10. */
  stories: number;
  hotStories: number;
  /** Failed fetch runs over all runs in the last 7 days; null without runs. */
  failRate: number | null;
  lastOkAt: string | null;
}

export interface SourceOutputReport {
  days: number;
  sources: SourceOutput[];
}

export interface CandidateDomain {
  domain: string;
  /** Distinct articles in the window that link to it. */
  citations: number;
  /** The sources whose articles link to it. */
  citedBy: string[];
  examples: string[];
}

export interface CandidateReport {
  days: number;
  articles: number;
  candidates: CandidateDomain[];
}

export interface FeedProbe {
  url: string;
  items: number;
  newest: string | null;
}
