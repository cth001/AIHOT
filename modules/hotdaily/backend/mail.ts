// Sending email over SMTP (QQ, 163, Gmail, a company mailbox …). Nothing leaves unless EMAIL_SEND_ENABLED is
// true, like the engine's other outward valves; without SMTP settings the site takes no subscriptions.
import nodemailer, { type Transporter } from "nodemailer";
import { credential } from "@aihot/backend/config";

function smtp() {
  const host = credential("integrations", "SMTP_HOST");
  const user = credential("integrations", "SMTP_USER");
  const pass = credential("integrations", "SMTP_PASS");
  if (!host || !user || !pass) return null;
  const port = Number(credential("integrations", "SMTP_PORT") ?? 465);
  const secure = (credential("integrations", "SMTP_SECURE") ?? String(port === 465)) === "true";
  return { host, port, secure, auth: { user, pass }, from: credential("integrations", "MAIL_FROM") ?? user };
}

export function mailConfigured(): boolean {
  return smtp() !== null;
}

export function sendingEnabled(): boolean {
  return process.env.EMAIL_SEND_ENABLED === "true" && mailConfigured();
}

export function mailFrom(): string | null {
  return smtp()?.from ?? null;
}

let transport: Transporter | null = null;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export class SendingOff extends Error {}

export async function sendMail(mail: Mail): Promise<void> {
  const settings = smtp();
  if (process.env.EMAIL_SEND_ENABLED !== "true" || !settings) throw new SendingOff("Email sending is off (EMAIL_SEND_ENABLED or SMTP_* not set)");
  transport ??= nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, auth: settings.auth });
  await transport.sendMail({ from: settings.from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers });
}
