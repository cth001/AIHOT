// 热点评论: discussions are found by a report's address, shown only while that report is listed evidence of
// the story, and translated once per version of the comments; a changed comment loses its old translation.
import { pointModels, stub, tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import discuss from "../server.ts";
import { collectStory, summarizeStory } from "../backend/collect.ts";
import { PLATFORMS, sameAddress, type FoundComment } from "../backend/platforms.ts";
import { storyDiscussion } from "../backend/read.ts";

const T = `discuss-${tag()}`;
const NOW = new Date();
let model: Awaited<ReturnType<typeof stub>>;
let translations = 0;

before(async () => {
  installModules([discuss]);
  model = await stub((_hit, req) => {
    translations += 1;
    const ids = [...req.body.matchAll(/\[(\d+-[\w]+)\]/g)].map((m) => m[1]);
    const content = { summary: "大家认可新模型的速度，也担心价格。", comments: ids.map((id) => ({ id, zh: `译文 ${id}` })) };
    return { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  process.env.DISCUSS_MODEL = "deepseek-flash";
});
after(async () => {
  await model.close();
  await closeDb();
});

async function storyWith(urls: string[]) {
  const sourceId = `${T}-src-${randomUUID().slice(0, 6)}`;
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${sourceId}, ${sourceId}, 'rss', '2100-01-01')`;
  const publicId = randomUUID();
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${publicId}, 'Acme 发布新模型') RETURNING id`;
  const articles: string[] = [];
  for (const url of urls) {
    const id = `${T}-${randomUUID().slice(0, 8)}`;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at) VALUES (${id}, ${sourceId}, ${id}, ${url}, 'Acme', ${NOW}, ${NOW})`;
    const [analysis] = await sql`INSERT INTO analyses (article_id, input_revision, origin, output) VALUES (${id}, 1, 'rule', ${sql.json({ scope: "single" })}) RETURNING id`;
    await sql`INSERT INTO publications (article_id, analysis_id, revision, visibility, eligible, selected, title, source_id, channel, first_party, url, discovered_at, timeline_at, body_mode, sort_at, story_id)
      VALUES (${id}, ${analysis!.id}, 1, 'public', true, false, 'Acme', ${sourceId}, 'news', false, ${url}, ${NOW}, ${NOW}, 'summary', ${NOW}, ${story!.id})`;
    const [fact] = await sql`INSERT INTO facts (public_id, story_id, title) VALUES (${id}, ${story!.id}, 'Acme') RETURNING id`;
    await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${id}, 'report')`;
    articles.push(id);
  }
  return { id: Number(story!.id), publicId, articles };
}

const comment = (id: string, body: string): FoundComment => ({ externalId: id, author: "alice", body, score: 10, replies: 2, postedAt: NOW });

/** Stands in for the platforms: one HN thread per address, with these comments. */
function platforms(comments: FoundComment[]) {
  PLATFORMS.hn = {
    threads: async (url) => [{ platform: "hn", externalId: `${T}-${sameAddress(url)}`, url: "https://news.ycombinator.com/item?id=1", title: "Acme", community: null, points: 120, commentCount: 40, postedAt: NOW }],
    comments: async () => comments,
  };
  PLATFORMS.reddit = { threads: async () => [], comments: async () => [] };
}

test("the same page however it is linked", () => {
  assert.equal(sameAddress("https://www.example.com/news/acme/?utm_source=x#top"), "example.com/news/acme");
  assert.equal(sameAddress("http://example.com/news/acme"), "example.com/news/acme");
  assert.equal(sameAddress("https://example.com/a?id=3&ref=hn"), "example.com/a?id=3");
  assert.equal(sameAddress("not a url"), null);
});

test("discussions are shown while their report is listed, translated once per version", async () => {
  const s = await storyWith([`https://example.com/${T}/one`]);
  platforms([comment("c1", "Fast model."), comment("c2", "Too expensive.")]);
  await collectStory(s.id, NOW);
  assert.equal(await summarizeStory(s.id), "written");
  const shown = await storyDiscussion(s.publicId);
  assert.equal(shown?.summary, "大家认可新模型的速度，也担心价格。");
  const thread = await threadId(s.id);
  assert.deepEqual(shown?.threads[0]?.comments.map((c) => [c.text, c.original]), [[`译文 ${thread}-c1`, "Fast model."], [`译文 ${thread}-c2`, "Too expensive."]]);

  // Nothing changed: no second model call.
  const calls = translations;
  assert.equal(await summarizeStory(s.id), "unchanged");
  assert.equal(translations, calls);

  // An edited comment loses its translation until the next one; the other keeps its own.
  platforms([comment("c1", "Fast model."), comment("c2", "Too expensive, honestly.")]);
  await collectStory(s.id, NOW);
  const edited = await storyDiscussion(s.publicId);
  assert.deepEqual(edited?.threads[0]?.comments.map((c) => c.original === null), [false, true]);

  // A withdrawn report takes its discussion with it.
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${s.articles[0]!}`;
  assert.deepEqual((await storyDiscussion(s.publicId))?.threads, []);
});

test("a comment the model declines is not shown", async () => {
  const s = await storyWith([`https://example.com/${T}/two`]);
  platforms([comment("ok", "Useful."), comment("bad", "Abusive.")]);
  await collectStory(s.id, NOW);
  await sql`UPDATE discuss_comments SET body_zh = '' WHERE external_id = 'bad' AND thread_id = ${await threadId(s.id)}`;
  assert.deepEqual((await storyDiscussion(s.publicId))?.threads[0]?.comments.map((c) => c.id), ["ok"]);
});

test("an unknown or malformed story id is not found", async () => {
  assert.equal(await storyDiscussion(randomUUID()), null);
  assert.equal(await storyDiscussion("../../etc"), null);
});

async function threadId(storyId: number): Promise<number> {
  const [row] = await sql<{ id: number }[]>`SELECT id FROM discuss_threads WHERE story_id = ${storyId} ORDER BY id LIMIT 1`;
  return Number(row!.id);
}
