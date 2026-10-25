// Finds the discussions of the stories people are reading now (the hot ranking and recent selections),
// keeps their top comments, and has the model translate them and summarise what people say. Runs in the
// worker; readers only read what is stored (read.ts).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { sql } from "@aihot/backend/db";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptFromText } from "@aihot/backend/editorial/prompts";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { latestHotRanking } from "@aihot/backend/publication/hot";
import { evidenceCondition, listedCondition, selectedCondition } from "@aihot/backend/publication/scope";
import type { Platform } from "../contracts.ts";
import { PLATFORMS, type FoundComment, type FoundThread } from "./platforms.ts";

/** Stories looked at per run; the schedule runs every 15 minutes. */
const STORIES_PER_RUN = 12;
/** Report addresses searched per story. */
const URLS_PER_STORY = 5;
/** Comments the model reads and translates per story. */
export const COMMENTS_PER_STORY = 12;
const HOT_STORIES = 20;
const RECENT_HOURS = 48;

const PROMPT = readFileSync(path.join(import.meta.dirname, "../prompts/discuss.md"), "utf8");
export const DISCUSS_PROMPT_VERSION = `discuss@${createHash("sha256").update(PROMPT).digest("hex").slice(0, 12)}`;

/** Hot stories first, then the recently selected, each looked at again when its last look is stale. */
async function dueStories(now: Date): Promise<number[]> {
  const ranking = await latestHotRanking();
  const hot = (ranking?.entries ?? []).slice(0, HOT_STORIES).map((e) => e.storyId);
  const recent = await sql<{ story_id: number }[]>`
    SELECT p.story_id, max(p.visible_after) AS at FROM publications p
    WHERE p.story_id IS NOT NULL AND ${selectedCondition(now)} AND p.visible_after > ${new Date(now.getTime() - RECENT_HOURS * 3600_000)}
    GROUP BY p.story_id ORDER BY at DESC LIMIT 60`;
  const candidates = [...new Set([...hot, ...recent.map((r) => Number(r.story_id))])];
  if (!candidates.length) return [];
  const hotSet = new Set(hot);
  // Hot stories are looked at every 2 hours, the others every 6.
  const checked = await sql<{ story_id: number; checked_at: Date }[]>`
    SELECT story_id, checked_at FROM discuss_stories WHERE story_id = ANY(${candidates}::bigint[])`;
  const last = new Map(checked.map((c) => [Number(c.story_id), c.checked_at.getTime()]));
  return candidates
    .filter((id) => {
      const at = last.get(id);
      return at === undefined || now.getTime() - at > (hotSet.has(id) ? 2 : 6) * 3600_000;
    })
    .slice(0, STORIES_PER_RUN);
}

/** The story's listed news reports: selected first, then the newest. */
export async function storyUrls(storyId: number, now: Date, limit = URLS_PER_STORY): Promise<string[]> {
  const rows = await sql<{ url: string }[]>`
    SELECT url FROM (
      SELECT DISTINCT ON (p.url) p.url, p.selected, coalesce(p.published_at, p.discovered_at) AS at
      FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.story_id = ${storyId} AND p.channel = 'news' AND ${evidenceCondition()} AND ${listedCondition(now)}
      ORDER BY p.url, p.selected DESC
    ) u ORDER BY selected DESC, at DESC LIMIT ${limit}`;
  return rows.map((r) => r.url);
}

async function saveThread(storyId: number, articleUrl: string, t: FoundThread, comments: FoundComment[]) {
  await sql.begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO discuss_threads (platform, external_id, story_id, article_url, url, title, community, points, comment_count, posted_at, fetched_at)
      VALUES (${t.platform}, ${t.externalId}, ${storyId}, ${articleUrl}, ${t.url}, ${t.title}, ${t.community}, ${t.points}, ${t.commentCount}, ${t.postedAt}, now())
      ON CONFLICT (platform, external_id) DO UPDATE SET story_id = EXCLUDED.story_id, article_url = EXCLUDED.article_url, title = EXCLUDED.title,
        points = EXCLUDED.points, comment_count = EXCLUDED.comment_count, fetched_at = now()
      RETURNING id`;
    const ids = comments.map((c) => c.externalId);
    await tx`DELETE FROM discuss_comments WHERE thread_id = ${row!.id} AND external_id <> ALL(${ids}::text[])`;
    for (const [rank, c] of comments.entries()) {
      // A translation stays while the comment's text is unchanged.
      await tx`
        INSERT INTO discuss_comments (thread_id, external_id, rank, author, body, score, replies, posted_at)
        VALUES (${row!.id}, ${c.externalId}, ${rank}, ${c.author}, ${c.body}, ${c.score}, ${c.replies}, ${c.postedAt})
        ON CONFLICT (thread_id, external_id) DO UPDATE SET rank = EXCLUDED.rank, author = EXCLUDED.author, score = EXCLUDED.score, replies = EXCLUDED.replies,
          body_zh = CASE WHEN discuss_comments.body = EXCLUDED.body THEN discuss_comments.body_zh END, body = EXCLUDED.body`;
    }
  });
}

/** Looks for one story's discussions on every platform. A platform that fails is skipped until the next look. */
export async function collectStory(storyId: number, now = new Date()): Promise<{ threads: number; failed: string[] }> {
  const urls = await storyUrls(storyId, now);
  const failed: string[] = [];
  let threads = 0;
  for (const platform of Object.keys(PLATFORMS) as Platform[]) {
    const api = PLATFORMS[platform];
    for (const url of urls) {
      try {
        for (const t of await api.threads(url)) {
          await saveThread(storyId, url, t, await api.comments(t.externalId));
          threads++;
        }
      } catch (error) {
        failed.push(`${platform}: ${(error as Error).message}`);
        break;
      }
    }
  }
  await sql`INSERT INTO discuss_stories (story_id, checked_at) VALUES (${storyId}, ${now})
            ON CONFLICT (story_id) DO UPDATE SET checked_at = EXCLUDED.checked_at`;
  return { threads, failed };
}

export interface StoryComment {
  threadId: number;
  externalId: string;
  body: string;
  bodyZh: string | null;
}

/** The comments the model reads for a story: the threads with the most comments first, taking turns. */
export async function storyComments(storyId: number): Promise<StoryComment[]> {
  const rows = await sql<{ thread_id: number; external_id: string; body: string; body_zh: string | null; rank: number; comment_count: number }[]>`
    SELECT c.thread_id, c.external_id, c.body, c.body_zh, c.rank, t.comment_count
    FROM discuss_comments c JOIN discuss_threads t ON t.id = c.thread_id
    WHERE t.story_id = ${storyId}
    ORDER BY c.rank, t.comment_count DESC, t.id`;
  return rows.slice(0, COMMENTS_PER_STORY).map((r) => ({ threadId: Number(r.thread_id), externalId: r.external_id, body: r.body, bodyZh: r.body_zh }));
}

const inputsOf = (comments: StoryComment[]) =>
  createHash("sha256").update(DISCUSS_PROMPT_VERSION).update(JSON.stringify(comments.map((c) => [c.threadId, c.externalId, c.body]))).digest("hex").slice(0, 24);

const Output = z.object({
  summary: z.string().max(600),
  comments: z.array(z.object({ id: z.string(), zh: z.string().max(1200) })),
});

/** Translates a story's comments and summarises them, when the comments changed since the last time. */
export async function summarizeStory(storyId: number): Promise<"written" | "unchanged" | "empty"> {
  const comments = await storyComments(storyId);
  if (!comments.length) return "empty";
  const inputs = inputsOf(comments);
  const [state] = await sql<{ summary_inputs: string | null }[]>`SELECT summary_inputs FROM discuss_stories WHERE story_id = ${storyId}`;
  if (state?.summary_inputs === inputs) return "unchanged";
  const [story] = await sql<{ title: string }[]>`SELECT title FROM stories WHERE id = ${storyId}`;
  if (!story) return "empty";
  const key = (c: StoryComment) => `${c.threadId}-${c.externalId}`;
  const user = [`新闻标题：${story.title}`, "", ...comments.map((c) => `[${key(c)}]\n${c.body}`)].join("\n\n");
  const res = await chatJson({
    model: await modelFor("discuss"), purpose: "discuss_story", subject: `story:${storyId}@${inputs}`, promptVersion: DISCUSS_PROMPT_VERSION,
    system: promptFromText("discuss", PROMPT), user, schema: Output, temperature: 0.2, maxTokens: 4000,
  });
  const zh = new Map(res.data.comments.map((c) => [c.id, c.zh.trim()]));
  await sql.begin(async (tx) => {
    for (const c of comments) {
      const text = zh.get(key(c));
      if (text !== undefined) await tx`UPDATE discuss_comments SET body_zh = ${text} WHERE thread_id = ${c.threadId} AND external_id = ${c.externalId}`;
    }
    await tx`UPDATE discuss_stories SET summary = ${res.data.summary.trim() || null}, summary_inputs = ${inputs}, summarized_at = now() WHERE story_id = ${storyId}`;
    await completeReceipt(tx, res.receiptId);
  });
  return "written";
}

/** The schedule: look at the due stories, then write what changed. */
export async function collectDiscussions(now = new Date()) {
  const stories = await dueStories(now);
  const result = { stories: stories.length, threads: 0, written: 0, failed: [] as string[] };
  for (const id of stories) {
    const found = await collectStory(id, now);
    result.threads += found.threads;
    result.failed.push(...found.failed.map((f) => `story ${id} ${f}`));
    try {
      if ((await summarizeStory(id)) === "written") result.written++;
    } catch (error) {
      result.failed.push(`story ${id} summary: ${(error as Error).message}`);
    }
  }
  return result;
}

/** The daily retention run: discussions of stories nobody has looked at for 30 days. */
export async function discussRetention(now: Date) {
  const cutoff = new Date(now.getTime() - 30 * 86400_000);
  const threads = await sql`DELETE FROM discuss_threads WHERE story_id IN (SELECT story_id FROM discuss_stories WHERE checked_at < ${cutoff})`;
  const stories = await sql`DELETE FROM discuss_stories WHERE checked_at < ${cutoff}`;
  return { discussThreads: threads.count, discussStories: stories.count };
}
