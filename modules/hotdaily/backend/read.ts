// Issues as readers see them: an event no longer current (merged away, or with no listed evidence left after
// a withdrawal) is left out of the issue it was in, on the site and in emails sent from then on.
import { isValidDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { evidenceCondition, listedCondition } from "@aihot/backend/publication/scope";
import type { HotDailyAnalysis, HotDailyEdition, HotDailyEntry, HotDailyIndexEntry } from "../contracts.ts";

async function current(entries: HotDailyEntry[], now: Date): Promise<HotDailyEntry[]> {
  if (!entries.length) return entries;
  const rows = await sql<{ public_id: string }[]>`
    SELECT st.public_id::text FROM stories st
    WHERE st.public_id = ANY(${entries.map((e) => e.storyPublicId)}::uuid[]) AND st.merged_into IS NULL AND EXISTS (
      SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.story_id = st.id AND ${evidenceCondition()} AND ${listedCondition(now)})`;
  const live = new Set(rows.map((r) => r.public_id));
  return entries.filter((e) => live.has(e.storyPublicId));
}

/** By date (YYYY-MM-DD) or "latest". */
export async function editionFor(date: string, now = new Date()): Promise<HotDailyEdition | null> {
  if (date !== "latest" && !isValidDate(date)) return null;
  const [row] = date === "latest"
    ? await sql<{ date: string; title: string; lead: string | null; entries: HotDailyEntry[]; analysis: HotDailyAnalysis | null; composed_at: Date }[]>`
        SELECT date::text, title, lead, entries, analysis, composed_at FROM hotdaily_editions ORDER BY date DESC LIMIT 1`
    : await sql<{ date: string; title: string; lead: string | null; entries: HotDailyEntry[]; analysis: HotDailyAnalysis | null; composed_at: Date }[]>`
        SELECT date::text, title, lead, entries, analysis, composed_at FROM hotdaily_editions WHERE date = ${date}`;
  if (!row) return null;
  return { date: row.date, title: row.title, lead: row.lead, entries: await current(row.entries, now), analysis: row.analysis, composedAt: row.composed_at.toISOString() };
}

export async function editionIndex(limit = 60): Promise<HotDailyIndexEntry[]> {
  const rows = await sql<{ date: string; title: string; count: number }[]>`
    SELECT date::text, title, jsonb_array_length(entries) AS count FROM hotdaily_editions ORDER BY date DESC LIMIT ${limit}`;
  return rows.map((r) => ({ date: r.date, title: r.title, count: r.count }));
}
