// 热度日报: an issue is the top of the hot ranking with the model's words held to what the events name;
// subscribing takes a confirmation from the mailbox, each issue reaches each subscriber once, and an event
// that is no longer current leaves the issue.
import { pointModels, stub, tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import hotdaily from "../server.ts";
import { composeHotDaily } from "../backend/compose.ts";
import { deliverEdition } from "../backend/deliver.ts";
import { editionFor } from "../backend/read.ts";
import { confirm, subscribe, SubscribeRejected, unsubscribe } from "../backend/subscribers.ts";

const T = `hotdaily-${tag()}`;
const NOW = new Date();
const DATE = "2099-06-01";
let model: Awaited<ReturnType<typeof stub>>;
let lead = "Acme 和 Globex 都有新进展。";

/** A minimal SMTP server that keeps every message it is given. */
const mails: Array<{ to: string; data: string }> = [];
let smtp: net.Server;

before(async () => {
  installModules([hotdaily]);
  model = await stub((_hit, req) => {
    const content = req.body.includes("行业分析师")
      ? {
          summary: "Acme 的新模型是今天的主线。股价单日上涨 12.5%。",
          market: "算力需求或将继续走强。建议逢低买入相关芯片股。",
          stocks: [
            { ticker: "nvda", direction: "利好", reason: "新模型训练和推理带动算力需求", risk: "需求不及预期" },
            { ticker: "FAKE", direction: "利空", reason: "清单里没有这家公司", risk: "" },
            { ticker: "MSFT", direction: "中性", reason: "云收入将增长 35%", risk: "" },
          ],
        }
      : { title: "Acme 新模型领跑", lead, takes: [{ rank: 1, take: "Acme 的新模型值得关注" }, { rank: 2, take: "提到 Initech 的看点" }] };
    return { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  process.env.HOTDAILY_MODEL = "deepseek-flash";
  smtp = net.createServer((socket) => {
    let to = "";
    let data: string | null = null;
    socket.write("220 test\r\n");
    socket.on("data", (chunk) => {
      for (const line of chunk.toString().split("\r\n")) {
        if (data !== null) {
          if (line === ".") { mails.push({ to, data }); data = null; socket.write("250 ok\r\n"); } else data += `${line}\n`;
          continue;
        }
        if (/^(EHLO|HELO)/i.test(line)) socket.write("250 test\r\n");
        else if (/^MAIL FROM/i.test(line)) socket.write("250 ok\r\n");
        else if (/^RCPT TO/i.test(line)) { to = /<(.+)>/.exec(line)?.[1] ?? ""; socket.write("250 ok\r\n"); }
        else if (/^DATA/i.test(line)) { data = ""; socket.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) { socket.write("221 bye\r\n"); socket.end(); }
        else if (/^RSET/i.test(line)) socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", () => resolve()));
  Object.assign(process.env, {
    SMTP_HOST: "127.0.0.1", SMTP_PORT: String((smtp.address() as net.AddressInfo).port), SMTP_SECURE: "false",
    SMTP_USER: "news@example.com", SMTP_PASS: "test-pass", EMAIL_SEND_ENABLED: "true",
  });
});
after(async () => {
  await model.close();
  smtp.close();
  await closeDb();
});

/** A story with one listed report, and a published hot ranking of `stories`. */
async function hotStory(title: string) {
  const sourceId = `${T}-${randomUUID().slice(0, 6)}`;
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${sourceId}, ${sourceId}, 'rss', '2100-01-01')`;
  const publicId = randomUUID();
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${publicId}, ${title}) RETURNING id`;
  const id = `${T}-${randomUUID().slice(0, 8)}`;
  const url = `https://example.com/${id}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at) VALUES (${id}, ${sourceId}, ${id}, ${url}, ${title}, ${NOW}, ${NOW})`;
  const [analysis] = await sql`INSERT INTO analyses (article_id, input_revision, origin, output) VALUES (${id}, 1, 'rule', ${sql.json({ scope: "single" })}) RETURNING id`;
  await sql`INSERT INTO publications (article_id, analysis_id, revision, visibility, eligible, selected, title, summary, source_id, channel, first_party, url, discovered_at, timeline_at, body_mode, sort_at, story_id)
    VALUES (${id}, ${analysis!.id}, 1, 'public', true, false, ${title}, ${`${title}，多家媒体报道。`}, ${sourceId}, 'news', false, ${url}, ${NOW}, ${NOW}, 'summary', ${NOW}, ${story!.id})`;
  const [fact] = await sql`INSERT INTO facts (public_id, story_id, title) VALUES (${id}, ${story!.id}, ${title}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${id}, 'primary')`;
  return { id: Number(story!.id), publicId, article: id, url, title, source: sourceId };
}

async function publishRanking(stories: Awaited<ReturnType<typeof hotStory>>[], at = NOW) {
  const entries = stories.map((s, i) => ({
    rank: i + 1, storyId: s.id, storyPublicId: s.publicId, title: s.title, heat: 10 - i, trend: "up", trendPct: null, badges: [],
    participantCount: 5 - i, sourceCount: 5 - i, signalCount: 0, reportCount: 1, sourceNames: [s.source], latestAt: NOW.toISOString(), firstReportAt: NOW.toISOString(),
    representativeItemId: s.article, representativeUrl: s.url, representativeSource: s.source, participants: [],
  }));
  await sql`INSERT INTO hot_rankings (computed_at, rule_version, entries, published) VALUES (${at}, 'test', ${sql.json(entries as never)}, true)`;
}

test("an issue takes the top of the ranking, and the model's words only where the events name what they name", async () => {
  const stories = [await hotStory("Acme 发布新模型"), await hotStory("Globex 完成融资"), await hotStory("监管细则公布")];
  await publishRanking(stories);
  await composeHotDaily(DATE, { force: true });
  const issue = await editionFor(DATE);
  assert.equal(issue?.title, "Acme 新模型领跑");
  assert.equal(issue?.lead, "Acme 和 Globex 都有新进展。");
  assert.deepEqual(issue?.entries.map((e) => [e.rank, e.take]), [[1, "Acme 的新模型值得关注"], [2, null], [3, null]]);
  // The closing analysis keeps no invented figure, no trading advice and no company off the list.
  assert.equal(issue?.analysis?.summary, "Acme 的新模型是今天的主线。");
  assert.equal(issue?.analysis?.market, "算力需求或将继续走强。");
  assert.deepEqual(issue?.analysis?.stocks.map((s) => [s.ticker, s.name, s.direction]), [["NVDA", "英伟达", "利好"]]);

  // A lead naming a company none of the events names is dropped. (The same events would reuse the paid
  // answer, so the ranking changes too.)
  lead = "Acme 和 Umbrella 都有新进展。";
  await publishRanking([...stories].reverse(), new Date(NOW.getTime() + 60_000));
  await composeHotDaily("2099-06-02", { force: true });
  assert.equal((await editionFor("2099-06-02"))?.lead, null);

  // An event whose only report is withdrawn leaves the issue.
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${stories[1]!.article}`;
  assert.deepEqual((await editionFor(DATE))?.entries.map((e) => e.title), ["Acme 发布新模型", "监管细则公布"]);
});

test("a subscription counts once confirmed, gets each issue once, and stops when unsubscribed", async () => {
  const email = `${T}@example.com`;
  mails.length = 0;
  await subscribe({ email: email.toUpperCase(), ip: "198.51.100.1" });
  await subscribe({ email, ip: "198.51.100.1" });
  assert.equal(mails.length, 1, "a second sign-up within minutes sends no second confirmation");
  const token = /token=([A-Za-z0-9_-]+)/.exec(mails[0]!.data.replace(/=\n/g, "").replace(/=3D/g, "="))?.[1];
  assert.ok(token);

  await deliverEdition(DATE);
  assert.equal(mails.filter((m) => m.to === email).length, 1, "an unconfirmed address gets no issue");

  assert.equal(await confirm(token), true);
  await deliverEdition(DATE);
  await deliverEdition(DATE);
  assert.equal(mails.filter((m) => m.to === email).length, 2, "the issue reaches the subscriber once");
  assert.match(mails.at(-1)!.data, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);

  assert.equal(await unsubscribe(token), true);
  await deliverEdition("2099-06-02");
  assert.equal(mails.filter((m) => m.to === email).length, 2);
  assert.equal(await unsubscribe("not-a-real-token-at-all-000"), false);
});

test("sign-ups are limited per address of origin, scripts and bad addresses are turned away", async () => {
  const ip = "203.0.113.9";
  for (let i = 0; i < 5; i++) await subscribe({ email: `${T}-${i}@example.com`, ip });
  await assert.rejects(subscribe({ email: `${T}-6@example.com`, ip }), (e) => e instanceof SubscribeRejected && e.status === 429);
  await assert.rejects(subscribe({ email: "not-an-email", ip: "203.0.113.10" }), (e) => e instanceof SubscribeRejected && e.status === 400);
  await subscribe({ email: `${T}-bot@example.com`, ip: "203.0.113.11", trap: "https://spam.example" });
  const [bot] = await sql`SELECT 1 FROM hotdaily_subscribers WHERE email = ${`${T}-bot@example.com`}`;
  assert.equal(bot, undefined);

  process.env.EMAIL_SEND_ENABLED = "false";
  try {
    await assert.rejects(subscribe({ email: `${T}-off@example.com`, ip: "203.0.113.12" }), (e) => e instanceof SubscribeRejected && e.status === 503);
  } finally {
    process.env.EMAIL_SEND_ENABLED = "true";
  }
});
