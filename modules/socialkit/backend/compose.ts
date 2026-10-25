// Makes the day's kit: the top of the hot ranking as the public read layer shows it, then two model calls,
// one for the words on the images and one for each platform's post. The kit is for the admin to review and
// post by hand; nothing is published from here.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { beijingAt, beijingDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptFromText } from "@aihot/backend/editorial/prompts";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { latestHotRanking, rankingExtras } from "@aihot/backend/publication/hot";
import { SITE } from "@aihot/site";
import type { KitCards, KitCopy, KitItem } from "../contracts.ts";
import { SOCIAL_KIT } from "../settings.ts";

const prompt = (name: string) => readFileSync(path.join(import.meta.dirname, `../prompts/${name}.md`), "utf8");
const CARDS_PROMPT = prompt("social-cards");
const COPY_PROMPT = prompt("social-copy");
const version = (name: string, text: string) => `${name}@${createHash("sha256").update(text).digest("hex").slice(0, 12)}`;

const Cards = z.object({
  cover: z.object({ headline: z.string(), sub: z.string() }),
  items: z.array(z.object({ rank: z.number(), tag: z.string(), headline: z.string(), points: z.array(z.string()) })),
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

function material(items: KitItem[]): string {
  return items.map((i) => `#${i.rank} ${i.title}\n摘要：${i.summary ?? "（无）"}\n参与报道的来源：${i.participantCount} 个（${i.sourceNames.slice(0, 6).join("、")}）`).join("\n\n");
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
  };
}

export async function composeKit(date: string, opts: { force?: boolean } = {}): Promise<{ date: string; items: number } | { date: string; skipped: string }> {
  if (!opts.force) {
    const [existing] = await sql<{ n: number; copy: unknown }[]>`SELECT jsonb_array_length(items) AS n, copy FROM socialkit_kits WHERE date = ${date}`;
    if (existing?.copy) return { date, items: existing.n };
  }
  const ranking = await latestHotRanking();
  if (!ranking || ranking.entries.length < 3) return { date, skipped: "the hot ranking has too few events" };
  const extras = await rankingExtras(ranking);
  const items: KitItem[] = ranking.entries.slice(0, SOCIAL_KIT.items).map((e, i) => ({
    rank: i + 1,
    storyPublicId: e.storyPublicId,
    title: e.title,
    summary: extras.text(e).summary,
    participantCount: e.participantCount,
    sourceNames: e.sourceNames,
    url: e.representativeUrl,
  }));
  // The events are saved first, so the admin sees what the kit is about even when writing fails.
  await sql`
    INSERT INTO socialkit_kits (date, ranking_id, items, cards, copy, error) VALUES (${date}, ${ranking.id}, ${sql.json(items as never)}, NULL, NULL, NULL)
    ON CONFLICT (date) DO UPDATE SET ranking_id = EXCLUDED.ranking_id, items = EXCLUDED.items, cards = NULL, copy = NULL, error = NULL, created_at = now()`;
  const user = material(items);
  const values = { subject: SITE.subject };
  const subject = `socialkit:${date}@${ranking.id}`;
  try {
    const model = await modelFor("social");
    const cards = await chatJson({
      model, purpose: "social_cards", subject, promptVersion: version("social-cards", CARDS_PROMPT),
      system: promptFromText("social-cards", CARDS_PROMPT, values), user, schema: Cards, temperature: 0.4, maxTokens: 2500,
    });
    const copy = await chatJson({
      model, purpose: "social_copy", subject, promptVersion: version("social-copy", COPY_PROMPT),
      system: promptFromText("social-copy", COPY_PROMPT, values), user, schema: Copy, temperature: 0.6, maxTokens: 7000,
    });
    const written: KitCopy = { ...copy.data, xiaohongshu: { ...copy.data.xiaohongshu, tags: copy.data.xiaohongshu.tags.map((t) => t.replace(/^#/, "")) } };
    await sql.begin(async (tx) => {
      await tx`UPDATE socialkit_kits SET cards = ${tx.json(fit(cards.data, items) as never)}, copy = ${tx.json(written as never)} WHERE date = ${date}`;
      await completeReceipt(tx, cards.receiptId);
      await completeReceipt(tx, copy.receiptId);
    });
  } catch (error) {
    await sql`UPDATE socialkit_kits SET error = ${(error as Error).message.slice(0, 500)} WHERE date = ${date}`;
    throw error;
  }
  return { date, items: items.length };
}

/** Today's kit once its time has come (Beijing), else nothing. */
export async function composeDue(now = new Date()) {
  const date = beijingDate(now);
  if (now < beijingAt(date, SOCIAL_KIT.time)) return { date, skipped: "not yet" };
  return composeKit(date);
}

/** The daily retention run: kits older than 60 days. */
export async function socialkitRetention(now: Date) {
  const rows = await sql`DELETE FROM socialkit_kits WHERE date < ${beijingDate(new Date(now.getTime() - 60 * 86400_000))}`;
  return { socialkitKits: rows.count };
}
