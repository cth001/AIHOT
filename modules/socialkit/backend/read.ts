// The kits as the admin page reads them.
import { isValidDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import type { KitAnalysis, KitCards, KitCopy, KitItem, KitPost, SocialKit } from "../contracts.ts";
import { kitImages } from "./images.ts";

/** By date (YYYY-MM-DD) or "latest". */
export async function kitFor(date: string): Promise<SocialKit | null> {
  if (date !== "latest" && !isValidDate(date)) return null;
  type Row = { date: string; items: KitItem[]; analysis: KitAnalysis | null; cards: KitCards | null; copy: KitCopy | null; art: Record<string, string> | null; error: string | null; created_at: Date };
  const [row] = date === "latest"
    ? await sql<Row[]>`SELECT date::text, items, analysis, cards, copy, art, error, created_at FROM socialkit_kits ORDER BY date DESC LIMIT 1`
    : await sql<Row[]>`SELECT date::text, items, analysis, cards, copy, art, error, created_at FROM socialkit_kits WHERE date = ${date}`;
  if (!row) return null;
  const posts = await sql<{ platform: KitPost["platform"]; status: KitPost["status"]; url: string | null; error: string | null; updated_at: Date }[]>`
    SELECT platform, status, url, error, updated_at FROM socialkit_posts WHERE date = ${row.date}`;
  const kit = { date: row.date, items: row.items, analysis: row.analysis, cards: row.cards, copy: row.copy, art: row.art, error: row.error, createdAt: row.created_at.toISOString() };
  return { ...kit, images: kitImages(kit), posts: posts.map((p) => ({ platform: p.platform, status: p.status, url: p.url, error: p.error, updatedAt: p.updated_at.toISOString() })) };
}

export async function kitDates(limit = 30): Promise<string[]> {
  const rows = await sql<{ date: string }[]>`SELECT date::text FROM socialkit_kits ORDER BY date DESC LIMIT ${limit}`;
  return rows.map((r) => r.date);
}
