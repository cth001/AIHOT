// What an event page shows of its discussions: only threads found by a report that is still listed
// evidence of the story, so a withdrawn or regrouped report takes its discussion with it.
import { sql } from "@aihot/backend/db";
import { evidenceCondition, listedCondition } from "@aihot/backend/publication/scope";
import type { Platform, StoryDiscussion } from "../contracts.ts";

const THREADS_SHOWN = 4;
const COMMENTS_SHOWN = 5;

/** By the story's public id; null when there is no such current story. */
export async function storyDiscussion(publicId: string, now = new Date()): Promise<StoryDiscussion | null> {
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) return null;
  const [story] = await sql<{ id: number; summary: string | null }[]>`
    SELECT st.id, ds.summary FROM stories st LEFT JOIN discuss_stories ds ON ds.story_id = st.id
    WHERE st.public_id = ${publicId}::uuid AND st.merged_into IS NULL`;
  if (!story) return null;
  const threads = await sql<{ id: number; platform: Platform; url: string; title: string; community: string | null; points: number; comment_count: number }[]>`
    SELECT t.id, t.platform, t.url, t.title, t.community, t.points, t.comment_count FROM discuss_threads t
    WHERE t.story_id = ${story.id} AND EXISTS (
      SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.story_id = t.story_id AND p.url = t.article_url AND ${evidenceCondition()} AND ${listedCondition(now)})
    ORDER BY t.comment_count DESC, t.id LIMIT ${THREADS_SHOWN}`;
  if (!threads.length) return { summary: null, threads: [] };
  const comments = await sql<{ thread_id: number; external_id: string; author: string | null; body: string; body_zh: string | null; score: number | null; replies: number; posted_at: Date | null }[]>`
    SELECT thread_id, external_id, author, body, body_zh, score, replies, posted_at FROM discuss_comments
    WHERE thread_id = ANY(${threads.map((t) => t.id)}::bigint[]) AND rank < ${COMMENTS_SHOWN}
      -- An empty translation is the model declining an abusive comment: it is not shown.
      AND body_zh IS DISTINCT FROM ''
    ORDER BY thread_id, rank`;
  return {
    summary: story.summary,
    threads: threads.map((t) => ({
      platform: t.platform,
      url: t.url,
      title: t.title,
      community: t.community,
      points: t.points,
      commentCount: t.comment_count,
      comments: comments.filter((c) => Number(c.thread_id) === Number(t.id)).map((c) => ({
        id: c.external_id,
        author: c.author,
        text: c.body_zh ?? c.body,
        original: c.body_zh ? c.body : null,
        score: c.score,
        replies: c.replies,
        postedAt: c.posted_at?.toISOString() ?? null,
      })),
    })),
  };
}
