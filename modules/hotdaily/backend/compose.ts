// Composes the day's issue from the hot ranking as the public read layer shows it: the top events by heat,
// their digests, and a model's title, lead and one line per event. Text naming anything the events do not
// name is dropped (the engine's `grounded` rule for reports); without a model the issue still goes out.
// A second call writes the closing analysis: the day's summary, its market impact and the listed companies
// it may move, held to the events' own figures and to the module's list of companies (listed.ts).
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
import { latestHotRanking, rankingExtras } from "@aihot/backend/publication/hot";
import { fitted, grounded } from "@aihot/backend/reports/compose";
import { LISTED_COMPANIES } from "../listed.ts";
import { HOT_DAILY } from "../settings.ts";
import type { HotDailyAnalysis, HotDailyEntry, HotDailyStock } from "../contracts.ts";

const prompt = (name: string) => readFileSync(path.join(import.meta.dirname, `../prompts/${name}.md`), "utf8");
const version = (name: string, text: string) => `${name}@${createHash("sha256").update(text).digest("hex").slice(0, 12)}`;
const PROMPT = prompt("hotdaily");
const ANALYSIS_PROMPT = prompt("hotdaily-analysis");
export const HOTDAILY_PROMPT_VERSION = version("hotdaily", PROMPT);

/** An issue needs at least this many events; fewer means a quiet day and no issue. */
const MIN_ENTRIES = 3;

const Output = z.object({
  title: z.string(),
  lead: z.string(),
  takes: z.array(z.object({ rank: z.number(), take: z.string() })),
});

const Analysis = z.object({
  summary: z.string(),
  market: z.string(),
  stocks: z.array(z.object({ ticker: z.string(), direction: z.enum(["利好", "利空", "中性"]), reason: z.string(), risk: z.string() })),
});

/** Advice a public page must not give: trading instructions, price targets and ratings. */
const ADVICE = /买入|卖出|加仓|减仓|抄底|清仓|建仓|目标价|评级/;

/**
 * The sentences of `text` that state no figure the events do not (a price move, a percentage, an amount) and
 * give no trading advice. The figures are those `grounded` checks: three or more digits, a decimal or a percent.
 */
export function heldToEvents(text: string, corpus: string): string | null {
  const sentences = text.trim().match(/[^。！？]+(?:[。！？]+[」”’）]*|$)/g) ?? [];
  const kept = sentences.filter((s) => !ADVICE.test(s)
    && (s.match(/\d+(?:\.\d+)?%?/g) ?? []).filter((f) => f.length >= 3 || /[.%]/.test(f)).every((f) => corpus.includes(f)));
  return kept.join("").trim() || null;
}

/** The model's companies, kept only when the list has them, once each. */
function listedStocks(stocks: z.infer<typeof Analysis>["stocks"], corpus: string): HotDailyStock[] {
  const out: HotDailyStock[] = [];
  for (const s of stocks) {
    const company = LISTED_COMPANIES.find((c) => c.ticker.toLowerCase() === s.ticker.trim().toLowerCase());
    const reason = heldToEvents(s.reason, corpus);
    if (!company || !reason || out.some((o) => o.ticker === company.ticker)) continue;
    out.push({ ticker: company.ticker, exchange: company.exchange, name: company.name, direction: s.direction,
      reason: [...reason].slice(0, 80).join(""), risk: [...(heldToEvents(s.risk, corpus) ?? "")].slice(0, 60).join("") });
  }
  return out.slice(0, 8);
}

async function analysed(date: string, entries: HotDailyEntry[], rankingId: number): Promise<{ analysis: HotDailyAnalysis; receiptId: number } | null> {
  const corpus = entries.map((e) => `${e.title}\n${e.summary ?? ""}`).join("\n\n");
  const companies = LISTED_COMPANIES.map((c) => `${c.ticker} ${c.name}（${c.names.join("、")}）`).join("\n");
  const user = [
    entries.map((e) => `#${e.rank} ${e.title}\n摘要：${e.summary ?? "（无）"}\n参与报道的来源：${e.participantCount} 个`).join("\n\n"),
    `可以点名的上市公司（代码 名称（新闻里的叫法））：\n${companies}`,
  ].join("\n\n---\n\n");
  try {
    const res = await chatJson({
      model: await modelFor("hotdaily"), purpose: "hotdaily_analysis", subject: `hotdaily:${date}@${rankingId}`, promptVersion: version("hotdaily-analysis", ANALYSIS_PROMPT),
      system: promptFromText("hotdaily-analysis", ANALYSIS_PROMPT), user, schema: Analysis, temperature: 0.3, maxTokens: 3000,
    });
    return {
      analysis: { summary: heldToEvents(res.data.summary, corpus), market: heldToEvents(res.data.market, corpus), stocks: listedStocks(res.data.stocks, corpus) },
      receiptId: res.receiptId,
    };
  } catch (error) {
    if (error instanceof ModelUnavailableError) return null;
    throw error;
  }
}

async function written(date: string, entries: HotDailyEntry[], rankingId: number) {
  const corpus = entries.map((e) => `${e.title}\n${e.summary ?? ""}\n${e.sourceNames.join("、")}`).join("\n\n");
  const user = entries
    .map((e) => `#${e.rank} ${e.title}\n摘要：${e.summary ?? "（无）"}\n参与报道的来源：${e.participantCount} 个（${e.sourceNames.slice(0, 6).join("、")}）`)
    .join("\n\n");
  try {
    const res = await chatJson({
      model: await modelFor("hotdaily"), purpose: "hotdaily_issue", subject: `hotdaily:${date}@${rankingId}`, promptVersion: HOTDAILY_PROMPT_VERSION,
      system: promptFromText("hotdaily", PROMPT), user, schema: Output, temperature: 0.4, maxTokens: 2500,
    });
    const ok = (text: string, max: number) => {
      const fit = fitted(text, max) ?? (([...text.trim()].length <= max && text.trim()) || null);
      return fit && grounded(fit, corpus) ? fit : null;
    };
    const takes = new Map(res.data.takes.map((t) => [t.rank, ok(t.take, 60)]));
    return {
      title: ok(res.data.title, 30),
      lead: ok(res.data.lead, 200),
      takes,
      receiptId: res.receiptId,
    };
  } catch (error) {
    // Model calls switched off: the issue goes out with the events' own words.
    if (error instanceof ModelUnavailableError) return null;
    throw error;
  }
}

/** The issue for `date` (Beijing), unless it exists; `force` writes it again from the current ranking. */
export async function composeHotDaily(date: string, opts: { force?: boolean } = {}): Promise<{ date: string; entries: number } | { date: string; skipped: string }> {
  if (!opts.force) {
    const [existing] = await sql<{ n: number }[]>`SELECT jsonb_array_length(entries) AS n FROM hotdaily_editions WHERE date = ${date}`;
    if (existing) return { date, entries: existing.n };
  }
  const ranking = await latestHotRanking();
  if (!ranking || ranking.entries.length < MIN_ENTRIES) return { date, skipped: "the hot ranking has too few events" };
  const extras = await rankingExtras(ranking);
  const entries: HotDailyEntry[] = ranking.entries.slice(0, HOT_DAILY.entries).map((e, i) => ({
    rank: i + 1,
    storyPublicId: e.storyPublicId,
    title: e.title,
    heat: e.heat,
    trend: e.trend,
    participantCount: e.participantCount,
    sourceNames: e.sourceNames,
    summary: extras.text(e).summary,
    take: null,
    url: e.representativeUrl,
    source: e.representativeSource,
    firstReportAt: e.firstReportAt,
  }));
  const words = await written(date, entries, ranking.id);
  const closing = await analysed(date, entries, ranking.id);
  for (const e of entries) e.take = words?.takes.get(e.rank) ?? null;
  const title = words?.title ?? `${date.slice(5).replace("-", " 月 ")} 日热度榜：${entries[0]!.title}`;
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO hotdaily_editions (date, title, lead, entries, analysis, ranking_id, composed_at)
      VALUES (${date}, ${title}, ${words?.lead ?? null}, ${tx.json(entries as never)}, ${closing ? tx.json(closing.analysis as never) : null}, ${ranking.id}, now())
      ON CONFLICT (date) DO UPDATE SET title = EXCLUDED.title, lead = EXCLUDED.lead, entries = EXCLUDED.entries,
        analysis = EXCLUDED.analysis, ranking_id = EXCLUDED.ranking_id, composed_at = EXCLUDED.composed_at`;
    if (words) await completeReceipt(tx, words.receiptId);
    if (closing) await completeReceipt(tx, closing.receiptId);
  });
  return { date, entries: entries.length };
}

/** Today's issue once its time has come (Beijing), else nothing. */
export async function composeDue(now = new Date()) {
  const date = beijingDate(now);
  if (now < beijingAt(date, HOT_DAILY.time)) return { date, skipped: "not yet" };
  return composeHotDaily(date);
}
