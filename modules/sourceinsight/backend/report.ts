// What each source brought in over a window: material found, what of it reached the public pool and the
// selection, the events it gave evidence to and how many of those made the hot ranking's top 10, and how
// often its fetches failed. Read for the admin only; nothing here changes a source.
import { sql } from "@aihot/backend/db";
import type { SourceOutputReport } from "../contracts.ts";

export const WINDOWS = [7, 30] as const;

export async function sourceOutput(days: number): Promise<SourceOutputReport> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await sql<{
    id: string; name: string; kind: string; tier: string; participation_mode: string; enabled: boolean; health: string;
    collected: number; listed: number; selected: number; stories: number; hot_stories: number; runs: number; failed: number; last_ok_at: Date | null;
  }[]>`
    WITH hot AS (
      SELECT DISTINCT (e->>'storyId')::bigint AS story_id
      FROM hot_rankings h, jsonb_array_elements(h.entries) e
      WHERE h.published AND h.computed_at > ${since} AND (e->>'rank')::int <= 10
    )
    SELECT s.id, s.name, s.kind, s.tier, s.participation_mode, s.enabled, s.health, s.last_ok_at,
      coalesce(a.collected, 0)::int AS collected, coalesce(p.listed, 0)::int AS listed, coalesce(p.selected, 0)::int AS selected,
      coalesce(g.stories, 0)::int AS stories, coalesce(g.hot_stories, 0)::int AS hot_stories,
      coalesce(r.runs, 0)::int AS runs, coalesce(r.failed, 0)::int AS failed
    FROM sources s
    LEFT JOIN (SELECT source_id, count(*) AS collected FROM articles WHERE discovered_at > ${since} AND NOT backfill GROUP BY 1) a ON a.source_id = s.id
    LEFT JOIN (SELECT source_id, count(*) FILTER (WHERE eligible) AS listed, count(*) FILTER (WHERE selected) AS selected
               FROM publications WHERE discovered_at > ${since} AND NOT backfill GROUP BY 1) p ON p.source_id = s.id
    LEFT JOIN (SELECT ss.source_id, count(DISTINCT ss.story_id) AS stories, count(DISTINCT ss.story_id) FILTER (WHERE hot.story_id IS NOT NULL) AS hot_stories
               FROM story_signals ss LEFT JOIN hot ON hot.story_id = ss.story_id
               WHERE ss.observed_at > ${since} GROUP BY 1) g ON g.source_id = s.id
    LEFT JOIN (SELECT source_id, count(*) AS runs, count(*) FILTER (WHERE status = 'failed') AS failed
               FROM fetch_runs WHERE started_at > now() - interval '7 days' GROUP BY 1) r ON r.source_id = s.id
    ORDER BY coalesce(p.selected, 0) DESC, coalesce(g.hot_stories, 0) DESC, coalesce(a.collected, 0) DESC, s.id`;
  return {
    days,
    sources: rows.map((r) => ({
      id: r.id, name: r.name, kind: r.kind, tier: r.tier, mode: r.participation_mode, enabled: r.enabled, health: r.health,
      collected: r.collected, listed: r.listed, selected: r.selected, stories: r.stories, hotStories: r.hot_stories,
      failRate: r.runs ? r.failed / r.runs : null, lastOkAt: r.last_ok_at?.toISOString() ?? null,
    })),
  };
}
