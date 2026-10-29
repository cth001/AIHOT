// Makes the day's kit from the day's hot daily (modules/hotdaily, read from its table): its events and its
// closing analysis. Text first — the words on the images, each platform's post and the scenes to draw — then
// the illustrations from the text-to-image model, if one is set. The kit waits for review in the admin, where
// it is published (publish/).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { beijingAt, beijingDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptFromText } from "@aihot/backend/editorial/prompts";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt, ModelUnavailableError } from "@aihot/backend/providers/receipts";
import { SITE } from "@aihot/site";
import type { KitAnalysis, KitCards, KitCopy, KitItem } from "../contracts.ts";
import { SOCIAL_KIT } from "../settings.ts";
import { drawImage, imageSettings } from "./imagegen.ts";

const prompt = (name: string) => readFileSync(path.join(import.meta.dirname, `../prompts/${name}.md`), "utf8");
const CARDS_PROMPT = prompt("social-cards");
const COPY_PROMPT = prompt("social-copy");
const version = (name: string, text: string) => `${name}@${createHash("sha256").update(text).digest("hex").slice(0, 12)}`;

const Cards = z.object({
  cover: z.object({ headline: z.string(), sub: z.string() }),
  items: z.array(z.object({ rank: z.number(), tag: z.string(), headline: z.string(), points: z.array(z.string()) })),
  art: z.object({ cover: z.string(), items: z.array(z.object({ rank: z.number(), scene: z.string() })) }).optional(),
});

const Copy = z.object({
  xiaohongshu: z.object({ title: z.string(), body: z.string(), tags: z.array(z.string()) }),
  wechat: z.object({ title: z.string(), digest: z.string(), body: z.string() }),
  weibo: z.object({ text: z.string() }),
  x: z.object({ thread: z.array(z.string()) }),
});

const cut = (text: string, max: number) => {
  const chars = [...text.trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
};

interface DailyEntry { rank: number; storyPublicId: string; title: string; summary: string | null; take: string | null; participantCount: number; sourceNames: string[]; url: string | null }

/**
 * The day's hot daily as its own table keeps it. The module's own read checks withdrawals on the site; the
 * kit is reviewed before anything is published, so it takes the issue as stored.
 */
async function dailyIssue(date: string): Promise<{ items: KitItem[]; analysis: KitAnalysis | null } | null> {
  const [row] = await sql<{ entries: DailyEntry[]; analysis: KitAnalysis | null }[]>`SELECT entries, analysis FROM hotdaily_editions WHERE date = ${date}`;
  if (!row || !row.entries.length) return null;
  const items = row.entries.slice(0, SOCIAL_KIT.items).map((e): KitItem => ({
    rank: e.rank, storyPublicId: e.storyPublicId, title: e.title, summary: e.summary, take: e.take ?? null,
    participantCount: e.participantCount, sourceNames: e.sourceNames, url: e.url,
  }));
  const analysis = row.analysis
    ? { summary: row.analysis.summary, market: row.analysis.market, stocks: row.analysis.stocks.map((s) => ({ ticker: s.ticker, name: s.name, direction: s.direction, reason: s.reason })) }
    : null;
  return { items, analysis };
}

function material(items: KitItem[], analysis: KitAnalysis | null): string {
  const events = items.map((i) => `#${i.rank} ${i.title}\n摘要：${i.summary ?? "（无）"}${i.take ? `\n看点：${i.take}` : ""}\n参与报道的来源：${i.participantCount} 个`).join("\n\n");
  if (!analysis) return events;
  const stocks = analysis.stocks.map((s) => `${s.name}（${s.ticker}）${s.direction}：${s.reason}`).join("\n");
  return `${events}\n\n---\n\n日报总结：${analysis.summary ?? "（无）"}\n\n市场影响：${analysis.market ?? "（无）"}${stocks ? `\n\n可能受影响的上市公司：\n${stocks}` : ""}`;
}

/** The words on the images, held to what fits on them; every event keeps a card even if the model skipped it. */
function fit(cards: z.infer<typeof Cards>, items: KitItem[]): KitCards {
  const by = new Map(cards.items.map((c) => [c.rank, c]));
  return {
    cover: { headline: cut(cards.cover.headline, 16), sub: cut(cards.cover.sub, 26) },
    items: items.map((i) => {
      const c = by.get(i.rank);
      return { rank: i.rank, tag: cut(c?.tag ?? "热点", 6), headline: cut(c?.headline ?? i.title, 26), points: (c?.points ?? []).slice(0, 3).map((p) => cut(p, 30)) };
    }),
    ...(cards.art ? { art: { cover: cut(cards.art.cover, 600), items: cards.art.items.filter((a) => items.some((i) => i.rank === a.rank)).map((a) => ({ rank: a.rank, scene: cut(a.scene, 600) })) } } : {}),
  };
}

/** The style every illustration shares, so a kit's pictures look like one set. */
const STYLE = "Editorial illustration, clean modern tech aesthetic, deep teal and warm coral accents, soft lighting, generous negative space, no text, no letters, no numbers, no logos, no watermarks, no real people's faces.";

/** Draws the kit's illustrations (cover first, then each event) and stores them; a failure leaves the rest. */
async function drawArt(date: string, cards: KitCards): Promise<{ drawn: number; failed: string[] }> {
  if (!cards.art || !imageSettings()) return { drawn: 0, failed: [] };
  const scenes: Array<[string, string]> = [["cover", cards.art.cover], ...cards.art.items.map((a): [string, string] => [String(a.rank), a.scene])];
  const failed: string[] = [];
  let drawn = 0;
  for (const [slot, scene] of scenes) {
    try {
      const { file, receiptId } = await drawImage(`${scene}\n\n${STYLE}`, { purpose: "social_art", subject: `socialkit:${date}:${slot}` });
      await sql.begin(async (tx) => {
        await tx`UPDATE socialkit_kits SET art = coalesce(art, '{}'::jsonb) || ${tx.json({ [slot]: file })} WHERE date = ${date}`;
        await completeReceipt(tx, receiptId);
      });
      drawn++;
    } catch (error) {
      if (error instanceof ModelUnavailableError) return { drawn, failed };
      failed.push(`${slot}: ${(error as Error).message.slice(0, 200)}`);
    }
  }
  return { drawn, failed };
}

export async function composeKit(date: string, opts: { force?: boolean } = {}): Promise<{ date: string; items: number; art?: number } | { date: string; skipped: string }> {
  if (!opts.force) {
    const [existing] = await sql<{ n: number; copy: unknown }[]>`SELECT jsonb_array_length(items) AS n, copy FROM socialkit_kits WHERE date = ${date}`;
    if (existing?.copy) return { date, items: existing.n };
  }
  const issue = await dailyIssue(date);
  if (!issue) return { date, skipped: "no hot daily for this day yet" };
  const { items, analysis } = issue;
  // The events are saved first, so the admin sees what the kit is about even when writing fails. A new
  // kit starts unpublished: the platforms' records of an earlier version go with it.
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO socialkit_kits (date, items, analysis, cards, copy, art, error) VALUES (${date}, ${tx.json(items as never)}, ${analysis ? tx.json(analysis as never) : null}, NULL, NULL, NULL, NULL)
      ON CONFLICT (date) DO UPDATE SET items = EXCLUDED.items, analysis = EXCLUDED.analysis, cards = NULL, copy = NULL, art = NULL, error = NULL, created_at = now()`;
    await tx`DELETE FROM socialkit_posts WHERE date = ${date} AND status <> 'published'`;
  });
  const user = material(items, analysis);
  const values = { subject: SITE.subject };
  const subject = `socialkit:${date}@${createHash("sha256").update(user).digest("hex").slice(0, 12)}`;
  let cards: KitCards;
  try {
    const model = await modelFor("social");
    const wrote = await chatJson({
      model, purpose: "social_cards", subject, promptVersion: version("social-cards", CARDS_PROMPT),
      system: promptFromText("social-cards", CARDS_PROMPT, values), user, schema: Cards, temperature: 0.4, maxTokens: 3500,
    });
    const copy = await chatJson({
      model, purpose: "social_copy", subject, promptVersion: version("social-copy", COPY_PROMPT),
      system: promptFromText("social-copy", COPY_PROMPT, values), user, schema: Copy, temperature: 0.6, maxTokens: 7000,
    });
    cards = fit(wrote.data, items);
    const written: KitCopy = { ...copy.data, xiaohongshu: { ...copy.data.xiaohongshu, tags: copy.data.xiaohongshu.tags.map((t) => t.replace(/^#/, "")) } };
    await sql.begin(async (tx) => {
      await tx`UPDATE socialkit_kits SET cards = ${tx.json(cards as never)}, copy = ${tx.json(written as never)} WHERE date = ${date}`;
      await completeReceipt(tx, wrote.receiptId);
      await completeReceipt(tx, copy.receiptId);
    });
  } catch (error) {
    await sql`UPDATE socialkit_kits SET error = ${(error as Error).message.slice(0, 500)} WHERE date = ${date}`;
    throw error;
  }
  // Pictures after words: the scenes come from the text, and a kit with words is usable even without them.
  const art = await drawArt(date, cards);
  if (art.failed.length) await sql`UPDATE socialkit_kits SET error = ${`配图生成失败：${art.failed.join("；")}`.slice(0, 500)} WHERE date = ${date}`;
  return { date, items: items.length, art: art.drawn };
}

/** Today's kit once its time has come (Beijing) and the day's hot daily is out, else nothing. */
export async function composeDue(now = new Date()) {
  const date = beijingDate(now);
  if (now < beijingAt(date, SOCIAL_KIT.time)) return { date, skipped: "not yet" };
  return composeKit(date);
}

/** The daily retention run: kits and their records older than 60 days. */
export async function socialkitRetention(now: Date) {
  const cutoff = beijingDate(new Date(now.getTime() - 60 * 86400_000));
  const posts = await sql`DELETE FROM socialkit_posts WHERE date < ${cutoff}`;
  const rows = await sql`DELETE FROM socialkit_kits WHERE date < ${cutoff}`;
  return { socialkitKits: rows.count, socialkitPosts: posts.count };
}
