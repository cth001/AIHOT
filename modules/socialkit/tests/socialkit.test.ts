// 社媒素材包: a kit is written from the day's hot daily and its analysis — words first, then an illustration
// per slot from the text-to-image model — and published only through the valve, once per platform.
import { pointModels, stub, tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import socialkit from "../server.ts";
import { composeKit } from "../backend/compose.ts";
import { kitImage } from "../backend/images.ts";
import { markPublished, PublishRefused, publishKit } from "../backend/publish/index.ts";
import { weiboStatus } from "../backend/publish/weibo.ts";
import { kitFor } from "../backend/read.ts";

const DATE = "2099-07-01";
let model: Awaited<ReturnType<typeof stub>>;
let drawn = 0;
let png: string;

before(async () => {
  installModules([socialkit]);
  png = (await sharp({ create: { width: 64, height: 64, channels: 3, background: "#176b75" } }).jpeg().toBuffer()).toString("base64");
  model = await stub((_hit, req) => {
    if (req.url.endsWith("/images/generations")) {
      drawn += 1;
      return { data: [{ b64_json: png }] };
    }
    const cards = req.body.includes("视觉编辑");
    const content = cards
      ? {
          cover: { headline: "今天最热的三件事", sub: "Acme 的新模型讨论最多" },
          items: [{ rank: 1, tag: "模型发布", headline: "Acme 发布新模型", points: ["一", "二", "三", "四"] }],
          art: { cover: "an abstract data landscape", items: [{ rank: 1, scene: "a glowing chip" }, { rank: 2, scene: "a city of servers" }, { rank: 3, scene: "a balance scale" }] },
        }
      : { xiaohongshu: { title: "今天的热点", body: "正文", tags: ["#AI", "科技"] }, wechat: { title: "标题", digest: "摘要", body: "## 一\n\n正文" }, weibo: { text: "【热点】" }, x: { thread: ["Top stories today"] } };
    return { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  Object.assign(process.env, { SOCIAL_MODEL: "deepseek-flash", IMAGE_BASE_URL: `${model.url}/v1`, IMAGE_API_KEY: "test-key", IMAGE_MODEL: "test-image" });
});
after(async () => {
  await model.close();
  await closeDb();
});

async function hotDaily(date: string) {
  const entries = ["Acme 发布新模型", "Globex 完成融资", "监管细则公布"].map((title, i) => ({
    rank: i + 1, storyPublicId: randomUUID(), title, heat: 10 - i, trend: "up", participantCount: 3, sourceNames: [`${tag()}-src`],
    summary: `${title}，多家媒体报道。`, take: i === 0 ? "值得关注" : null, url: `https://example.com/${i}`, source: "示例",
  }));
  const analysis = { summary: "Acme 是今天的主线。", market: "算力需求或将走强。", stocks: [{ ticker: "NVDA", exchange: "NASDAQ", name: "英伟达", direction: "利好", reason: "算力需求", risk: "" }] };
  await sql`INSERT INTO hotdaily_editions (date, title, lead, entries, analysis) VALUES (${date}, '热度日报', NULL, ${sql.json(entries as never)}, ${sql.json(analysis as never)})`;
}

test("no hot daily for the day, no kit", async () => {
  assert.deepEqual(await composeKit("2099-07-02", { force: true }), { date: "2099-07-02", skipped: "no hot daily for this day yet" });
});

test("a kit is written from the day's hot daily, words first, then an illustration per slot", async () => {
  await hotDaily(DATE);
  const result = await composeKit(DATE, { force: true });
  assert.deepEqual(result, { date: DATE, items: 3, art: 4 });
  assert.equal(drawn, 4);
  const kit = await kitFor(DATE);
  assert.ok(kit?.copy && kit.cards);
  assert.equal(kit.analysis?.summary, "Acme 是今天的主线。");
  assert.deepEqual(Object.keys(kit.art ?? {}).sort(), ["1", "2", "3", "cover"]);
  assert.deepEqual(kit.cards.items.map((c) => [c.headline, c.points.length]), [["Acme 发布新模型", 3], ["Globex 完成融资", 0], ["监管细则公布", 0]]);
  // 小红书, 微博 and X: a cover and three cards each; 公众号: two covers.
  assert.equal(kit.images.length, 3 * 4 + 2);
  const card = await kitImage(kit, "xiaohongshu-card-2.png");
  assert.equal(card!.subarray(1, 4).toString(), "PNG");
  assert.equal(await kitImage(kit, "../../etc/passwd"), null);
});

test("publishing waits for the valve, 小红书 is marked by hand, and a published platform stays published", async () => {
  const kit = (await kitFor(DATE))!;
  delete process.env.SOCIAL_PUBLISH_ENABLED;
  await assert.rejects(publishKit(kit, "x", "admin"), (e) => e instanceof PublishRefused && /未配置|SOCIAL_PUBLISH_ENABLED/.test(e.message));
  await assert.rejects(publishKit(kit, "xiaohongshu", "admin"), PublishRefused);
  const [none] = await sql`SELECT 1 FROM socialkit_posts WHERE date = ${DATE} AND platform = 'x'`;
  assert.equal(none, undefined, "a refused publish records nothing");

  await markPublished(DATE, "xiaohongshu", "https://www.xiaohongshu.com/explore/1", "admin");
  assert.deepEqual((await kitFor(DATE))!.posts.map((p) => [p.platform, p.status]), [["xiaohongshu", "published"]]);
  // Writing the kit again keeps what was already published.
  await composeKit(DATE, { force: true });
  assert.deepEqual((await kitFor(DATE))!.posts.map((p) => p.platform), ["xiaohongshu"]);
});

test("a 微博 share is at most 140 characters, without #topics#, and links the issue", () => {
  const link = "https://example.com/hot-daily/2099-07-01";
  const status = weiboStatus(`【今日热点】#AI# ${"Acme 发布了新模型。".repeat(30)}`, link);
  assert.ok([...status].length <= 140);
  assert.ok(status.endsWith(link));
  assert.doesNotMatch(status, /#AI#/);
});
