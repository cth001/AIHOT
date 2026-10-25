// The admin page's data: subscriber counts, whether sending is on, recent issues and their deliveries.
import { sql } from "@aihot/backend/db";
import type { HotDailyAdmin } from "../contracts.ts";
import { mailConfigured, mailFrom } from "./mail.ts";

const PAGE_SIZE = 50;

export async function hotdailyAdmin(opts: { page: number; q?: string }): Promise<HotDailyAdmin> {
  const like = opts.q ? `%${opts.q.toLowerCase()}%` : "%";
  const [counts, editions, [{ total }], rows] = await Promise.all([
    sql<{ status: string; n: number }[]>`SELECT status, count(*)::int AS n FROM hotdaily_subscribers GROUP BY status`,
    sql<{ date: string; title: string; entries: number; sent: number; failed: number; composed_at: Date }[]>`
      SELECT e.date::text, e.title, jsonb_array_length(e.entries) AS entries, e.composed_at,
        count(d.*) FILTER (WHERE d.status = 'sent')::int AS sent, count(d.*) FILTER (WHERE d.status = 'failed')::int AS failed
      FROM hotdaily_editions e LEFT JOIN hotdaily_deliveries d ON d.edition_date = e.date
      GROUP BY e.date ORDER BY e.date DESC LIMIT 14`,
    sql<{ total: number }[]>`SELECT count(*)::int AS total FROM hotdaily_subscribers WHERE email LIKE ${like}`,
    sql<{ id: number; email: string; status: string; created_at: Date; confirmed_at: Date | null }[]>`
      SELECT id, email, status, created_at, confirmed_at FROM hotdaily_subscribers WHERE email LIKE ${like}
      ORDER BY id DESC LIMIT ${PAGE_SIZE} OFFSET ${(opts.page - 1) * PAGE_SIZE}`,
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  return {
    subscribers: { pending: by.pending ?? 0, active: by.active ?? 0, unsubscribed: by.unsubscribed ?? 0 },
    sending: { enabled: process.env.EMAIL_SEND_ENABLED === "true", configured: mailConfigured(), from: mailFrom() },
    editions: editions.map((e) => ({ date: e.date, title: e.title, entries: e.entries, sent: e.sent, failed: e.failed, composedAt: e.composed_at.toISOString() })),
    rows: rows.map((r) => ({ id: Number(r.id), email: r.email, status: r.status, createdAt: r.created_at.toISOString(), confirmedAt: r.confirmed_at?.toISOString() ?? null })),
    page: opts.page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
