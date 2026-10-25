// Subscriptions with double opt-in: a sign-up gets a confirmation email and counts once confirmed from the
// mailbox. Answers never tell whether an address is already subscribed. One token per address confirms
// and unsubscribes it.
import { createHmac, randomBytes } from "node:crypto";
import { credential } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { confirmMail } from "./templates.ts";
import { sendMail, sendingEnabled } from "./mail.ts";

export class SubscribeRejected extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** Sign-ups per address of origin per hour. */
const PER_IP_HOUR = 5;
/** A pending address gets another confirmation email at most this often. */
const RESEND_MINUTES = 10;

const EMAIL = /^[^\s@<>()"',;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function normalEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

function ipHash(ip: string): string {
  return createHmac("sha256", credential("auth", "SESSION_SECRET") ?? "hotdaily").update(ip).digest("hex").slice(0, 32);
}

const newToken = () => randomBytes(24).toString("base64url");

export async function subscribe(input: { email: unknown; ip: string; trap?: unknown }): Promise<void> {
  if (!sendingEnabled()) throw new SubscribeRejected(503, "unavailable", "邮件订阅暂未开放。");
  // A field people never see: what fills it is a script.
  if (input.trap) return;
  const email = normalEmail(input.email);
  if (!email) throw new SubscribeRejected(400, "invalid_email", "请填写有效的邮箱地址。");
  const ip = ipHash(input.ip);
  const [{ recent }] = await sql<{ recent: number }[]>`
    SELECT count(*)::int AS recent FROM hotdaily_subscribers WHERE ip_hash = ${ip} AND confirm_sent_at > now() - interval '1 hour'`;
  if (recent >= PER_IP_HOUR) throw new SubscribeRejected(429, "rate_limited", "提交太频繁了，请一小时后再试。", 3600);
  const [row] = await sql<{ token: string; status: string; resend: boolean }[]>`
    INSERT INTO hotdaily_subscribers (email, token, ip_hash) VALUES (${email}, ${newToken()}, ${ip})
    ON CONFLICT (email) DO UPDATE SET
      status = CASE WHEN hotdaily_subscribers.status = 'unsubscribed' THEN 'pending' ELSE hotdaily_subscribers.status END,
      ip_hash = EXCLUDED.ip_hash
    RETURNING token, status, (confirm_sent_at IS NULL OR confirm_sent_at < now() - make_interval(mins => ${RESEND_MINUTES})) AS resend`;
  if (row!.status !== "pending" || !row!.resend) return;
  await sql`UPDATE hotdaily_subscribers SET confirm_sent_at = now() WHERE email = ${email}`;
  await sendMail(confirmMail(email, row!.token));
}

const tokenOk = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(token);

/** True when the token names a subscription (now active). */
export async function confirm(token: unknown): Promise<boolean> {
  if (!tokenOk(token)) return false;
  const rows = await sql`
    UPDATE hotdaily_subscribers SET status = 'active', confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = NULL
    WHERE token = ${token} AND status <> 'active' RETURNING id`;
  if (rows.length) return true;
  const [active] = await sql`SELECT 1 FROM hotdaily_subscribers WHERE token = ${token}`;
  return !!active;
}

/** True when the token names a subscription (now off). */
export async function unsubscribe(token: unknown): Promise<boolean> {
  if (!tokenOk(token)) return false;
  const rows = await sql`
    UPDATE hotdaily_subscribers SET status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
    WHERE token = ${token} RETURNING id`;
  return rows.length > 0;
}

/** Admin: removes an address and everything kept about it. */
export async function eraseSubscriber(id: number): Promise<boolean> {
  const rows = await sql`DELETE FROM hotdaily_subscribers WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** The daily retention run: sign-ups never confirmed within 7 days are forgotten. */
export async function hotdailyRetention() {
  const rows = await sql`DELETE FROM hotdaily_subscribers WHERE status = 'pending' AND created_at < now() - interval '7 days'`;
  return { hotdailyPendingForgotten: rows.count };
}
