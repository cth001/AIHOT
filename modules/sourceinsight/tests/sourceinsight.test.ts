// 信源洞察: a source's output counts what it found in the window and what of it went further, and the
// candidates are the sites several articles link to that no source already covers.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { candidateSources, domainOf, probeFeeds } from "../backend/discover.ts";
import { sourceOutput } from "../backend/report.ts";

const T = `insight-${tag()}`;
const NOW = new Date();

after(closeDb);

async function source(key: string, feedUrl: string) {
  const id = `${T}-${key}`;
  await sql`INSERT INTO sources (id, name, kind, config, next_fetch_at) VALUES (${id}, ${id}, 'rss', ${sql.json({ feedUrl })}, '2100-01-01')`;
  return id;
}

async function article(sourceId: string, url: string, opts: { body?: string; selected?: boolean; backfill?: boolean } = {}) {
  const id = `${T}-${randomUUID().slice(0, 8)}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, body_html, backfill)
            VALUES (${id}, ${sourceId}, ${id}, ${url}, 'title', ${NOW}, ${NOW}, ${opts.body ?? null}, ${opts.backfill ?? false})`;
  await sql`INSERT INTO publications (article_id, revision, visibility, eligible, selected, title, source_id, channel, first_party, url, discovered_at, timeline_at, body_mode, sort_at, backfill)
            VALUES (${id}, 1, 'public', true, ${opts.selected ?? false}, 'title', ${sourceId}, 'news', false, ${url}, ${NOW}, ${NOW}, 'summary', ${NOW}, ${opts.backfill ?? false})`;
  return id;
}

test("a source's output counts the window's finds, what went further, and its failures", async () => {
  const a = await source("a", `https://${T}-a.example/feed`);
  const one = await article(a, `https://${T}-a.example/1`, { selected: true });
  await article(a, `https://${T}-a.example/2`);
  await article(a, `https://${T}-a.example/old`, { backfill: true });
  const [hot] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, 'hot') RETURNING id`;
  const [cold] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, 'cold') RETURNING id`;
  await sql`INSERT INTO story_signals (story_id, article_id, participant_key, source_id, kind, observed_at) VALUES (${hot!.id}, ${one}, ${`source:${a}`}, ${a}, 'editorial', ${NOW})`;
  const two = await article(a, `https://${T}-a.example/3`);
  await sql`INSERT INTO story_signals (story_id, article_id, participant_key, source_id, kind, observed_at) VALUES (${cold!.id}, ${two}, ${`source:${a}`}, ${a}, 'editorial', ${NOW})`;
  await sql`INSERT INTO hot_rankings (computed_at, rule_version, entries, published) VALUES (${NOW}, 'test', ${sql.json([{ rank: 1, storyId: Number(hot!.id) }, { rank: 11, storyId: Number(cold!.id) }] as never)}, true)`;
  await sql`INSERT INTO fetch_runs (source_id, status) VALUES (${a}, 'ok'), (${a}, 'failed'), (${a}, 'failed'), (${a}, 'ok')`;

  const row = (await sourceOutput(7)).sources.find((s) => s.id === a)!;
  assert.deepEqual(
    { collected: row.collected, listed: row.listed, selected: row.selected, stories: row.stories, hotStories: row.hotStories, failRate: row.failRate },
    { collected: 3, listed: 3, selected: 1, stories: 2, hotStories: 1, failRate: 0.5 },
  );
});

test("candidates are sites several articles link to, not followed ones and not social networks", async () => {
  const b = await source("b", `https://${T}-b.example/feed`);
  const c = await source("c", `https://${T}-c.example/feed`);
  const lab = `${T}-lab.example`;
  const body = `<p><a href="https://${lab}/paper">paper</a> <a href="https://x.com/someone">post</a> <a href="https://${T}-c.example/x">followed</a> <a href="https://blog.${T}-b.example/y">own</a></p>`;
  await article(b, `https://${T}-b.example/1`, { body });
  await article(c, `https://${T}-c.example/1`, { body });
  await article(c, `https://${T}-c.example/2`, { body: `<a href="https://${T}-once.example/">once</a>` });

  const mine = (await candidateSources(7)).candidates.filter((x) => x.domain.includes(T));
  assert.deepEqual(mine.map((x) => [x.domain, x.citations, x.citedBy.length]), [[lab, 2, 2]]);
});

test("addresses and probes stay on public web hosts", async () => {
  assert.equal(domainOf("https://www.Example.com/a"), "example.com");
  assert.equal(domainOf("javascript:alert(1)"), null);
  assert.deepEqual(await probeFeeds("localhost"), []);
  assert.deepEqual(await probeFeeds("bad domain/../x"), []);
});
