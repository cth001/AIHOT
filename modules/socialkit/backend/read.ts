// The kits as the admin page reads them.
import { isValidDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import type { KitCards, KitCopy, KitItem, SocialKit } from "../contracts.ts";
import { kitImages } from "./images.ts";

/** By date (YYYY-MM-DD) or "latest". */
export async function kitFor(date: string): Promise<SocialKit | null> {
  if (date !== "latest" && !isValidDate(date)) return null;
  type Row = { date: string; items: KitItem[]; cards: KitCards | null; copy: KitCopy | null; error: string | null; created_at: Date };
  const [row] = date === "latest"
    ? await sql<Row[]>`SELECT date::text, items, cards, copy, error, created_at FROM socialkit_kits ORDER BY date DESC LIMIT 1`
    : await sql<Row[]>`SELECT date::text, items, cards, copy, error, created_at FROM socialkit_kits WHERE date = ${date}`;
  if (!row) return null;
  const kit = { date: row.date, items: row.items, cards: row.cards, copy: row.copy, error: row.error, createdAt: row.created_at.toISOString() };
  return { ...kit, images: kitImages(kit) };
}

export async function kitDates(limit = 30): Promise<string[]> {
  const rows = await sql<{ date: string }[]>`SELECT date::text FROM socialkit_kits ORDER BY date DESC LIMIT ${limit}`;
  return rows.map((r) => r.date);
}
