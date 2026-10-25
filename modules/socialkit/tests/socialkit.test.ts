// 社媒素材包: the day's top events get a cover and a card per event in each platform's shape, and a post per
// platform; an event the model left out keeps a card with its own title.
import { pointModels, stub, tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import socialkit from "../server.ts";
import { composeKit } from "../backend/compose.ts";
import { kitImage } from "../backend/images.ts";
import { kitFor } from "../backend/read.ts";

const T = `socialkit-${tag()}`;
const NOW = new Date();
let model: Awaited<ReturnType<typeof stub>>;

before(async () => {
  installModules([socialkit]);
  model = await stub((_hit, req) => {
    const cards = req.body.includes("视觉编辑");
    const content = cards
      ? { cover: { headline: "今天最热的三件事", sub: "Acme 的新模型讨论最多" }, items: [{ rank: 1, tag: "模型发布", headline: "Acme 发布新模型", points: ["一", "二", "三", "四"] }] }
      : { xiaohongshu: { title: "今天的热点", body: "正文", tags: ["#AI", "科技"] }, wechat: { title: "标题", digest: "摘要", body: "## 一" }, weibo: { text: "【热点】" }, x: { thread: ["Top stories today"] } };
    return { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  process.env.SOCIAL_MODEL = "deepseek-flash";
});
after(async () => {
  await model.close();
  await closeDb();
});

async function hotStory(title: string) {
  const sourceId = `${T}-${randomUUID().slice(0, 6)}`;
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${sourceId}, ${sourceId}, 'rss', '2100-01-01')`;
  const publicId = randomUUID();
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${publicId}, ${title}) RETURNING id`;
  const id = `${T}-${randomUUID().slice(0, 8)}`;
  const url = `https://example.com/${id}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at) VALUES (${id}, ${sourceId}, ${id}, ${url}, ${title}, ${NOW}, ${NOW})`;
  const [analysis] = await sql`INSERT INTO analyses (article_id, input_revision, origin, output) VALUES (${id}, 1, 'rule', ${sql.json({ scope: "single" })}) RETURNING id`;
  await sql`INSERT INTO publications (article_id, analysis_id, revision, visibility, eligible, selected, title, source_id, channel, first_party, url, discovered_at, timeline_at, body_mode, sort_at, story_id)
    VALUES (${id}, ${analysis!.id}, 1, 'public', true, false, ${title}, ${sourceId}, 'news', false, ${url}, ${NOW}, ${NOW}, 'summary', ${NOW}, ${story!.id})`;
  const [fact] = await sql`INSERT INTO facts (public_id, story_id, title) VALUES (${id}, ${story!.id}, ${title}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${id}, 'primary')`;
  return { id: Number(story!.id), publicId, article: id, url, title, source: sourceId };
}

test("a kit has every platform's images and posts, and every event keeps its card", async () => {
  const stories = [await hotStory("Acme 发布新模型"), await hotStory("Globex 完成融资"), await hotStory("监管细则公布")];
  const entries = stories.map((s, i) => ({
    rank: i + 1, storyId: s.id, storyPublicId: s.publicId, title: s.title, heat: 10 - i, trend: "up", trendPct: null, badges: [],
    participantCount: 3, sourceCount: 3, signalCount: 0, reportCount: 1, sourceNames: [s.source], latestAt: NOW.toISOString(), firstReportAt: NOW.toISOString(),
    representativeItemId: s.article, representativeUrl: s.url, representativeSource: s.source, participants: [],
  }));
  await sql`INSERT INTO hot_rankings (computed_at, rule_version, entries, published) VALUES (${NOW}, 'test', ${sql.json(entries as never)}, true)`;

  await composeKit("2099-07-01", { force: true });
  const kit = await kitFor("2099-07-01");
  assert.ok(kit?.copy && kit.cards);
  assert.deepEqual(kit.copy.xiaohongshu.tags, ["AI", "科技"]);
  assert.deepEqual(kit.cards.items.map((c) => [c.headline, c.points.length]), [["Acme 发布新模型", 3], ["Globex 完成融资", 0], ["监管细则公布", 0]]);
  // 小红书, 微博 and X: a cover and three cards each; 公众号: two covers.
  assert.equal(kit.images.length, 3 * 4 + 2);

  const png = await kitImage(kit, "xiaohongshu-card-2.png");
  assert.deepEqual([...png!.subarray(1, 4)].map((b) => String.fromCharCode(b)).join(""), "PNG");
  assert.equal(await kitImage(kit, "../../etc/passwd"), null);
  assert.equal(await kitImage(kit, "x-card-9.png"), null);
});
