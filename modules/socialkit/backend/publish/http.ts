// What the publishers share: a multipart body for image uploads, and reading a platform's JSON answer.
import { randomBytes } from "node:crypto";
import type { GuardedResponse } from "@aihot/backend/lib/http-fetch";

export type Part = { name: string; value: string } | { name: string; file: Buffer; filename: string; type: string };

export function multipart(parts: Part[]): { body: Buffer; contentType: string } {
  const boundary = `----myhot${randomBytes(12).toString("hex")}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const head = "file" in p
      ? `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.type}\r\n\r\n`
      : `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n`;
    chunks.push(Buffer.from(head), "file" in p ? p.file : Buffer.from(p.value), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

export class PublishError extends Error {}

/** The answer as JSON; a status other than 2xx is the platform's refusal, its body the reason. */
export function answer(res: GuardedResponse, what: string): any {
  const text = res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (res.status < 200 || res.status >= 300) throw new PublishError(`${what}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return json ?? {};
}

/** At most `max` characters, whole sentences first. */
export function clip(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join("");
  const head = chars.slice(0, max - 1).join("");
  const stop = Math.max(head.lastIndexOf("。"), head.lastIndexOf("！"), head.lastIndexOf("？"), head.lastIndexOf(". "));
  return stop > max * 0.5 ? head.slice(0, stop + 1) : `${head}…`;
}
