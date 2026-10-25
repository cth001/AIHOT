// Sends today's issue to every confirmed subscriber once. Runs from the schedule after composing; a failed
// address is tried again on the next runs, up to MAX_ATTEMPTS.
import { beijingDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { editionFor } from "./read.ts";
import { sendingEnabled, sendMail } from "./mail.ts";
import { editionMail } from "./templates.ts";

const MAX_ATTEMPTS = 3;
/** Emails per run, so one run stays well inside the schedule's half hour and the mailbox's sending limits. */
const PER_RUN = 300;

export async function deliverEdition(date: string) {
  if (!sendingEnabled()) return { date, skipped: "sending is off" };
  const edition = await editionFor(date);
  if (!edition) return { date, skipped: "no issue" };
  const due = await sql<{ id: number; email: string; token: string }[]>`
    SELECT s.id, s.email, s.token FROM hotdaily_subscribers s
    LEFT JOIN hotdaily_deliveries d ON d.subscriber_id = s.id AND d.edition_date = ${date}
    WHERE s.status = 'active' AND (d.subscriber_id IS NULL OR (d.status = 'failed' AND d.attempts < ${MAX_ATTEMPTS}))
    ORDER BY s.id LIMIT ${PER_RUN}`;
  let sent = 0;
  let failed = 0;
  for (const s of due) {
    try {
      await sendMail(editionMail(edition, s.email, s.token));
      await sql`INSERT INTO hotdaily_deliveries (edition_date, subscriber_id, status) VALUES (${date}, ${s.id}, 'sent')
                ON CONFLICT (edition_date, subscriber_id) DO UPDATE SET status = 'sent', attempts = hotdaily_deliveries.attempts + 1, error = NULL, at = now()`;
      sent++;
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      await sql`INSERT INTO hotdaily_deliveries (edition_date, subscriber_id, status, error) VALUES (${date}, ${s.id}, 'failed', ${message})
                ON CONFLICT (edition_date, subscriber_id) DO UPDATE SET status = 'failed', attempts = hotdaily_deliveries.attempts + 1, error = EXCLUDED.error, at = now()`;
      failed++;
    }
  }
  return { date, sent, failed };
}

export function deliverDue(now = new Date()) {
  return deliverEdition(beijingDate(now));
}

/** Admin: today's (or the latest) issue to one address, without recording a delivery. */
export async function sendTest(to: string, date?: string) {
  const edition = await editionFor(date ?? "latest");
  if (!edition) return { sent: false, reason: "还没有可以发送的一期" };
  await sendMail(editionMail(edition, to, "test-token-not-a-subscription"));
  return { sent: true, date: edition.date };
}
