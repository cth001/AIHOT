// X (Twitter): the kit's thread through the official API v2, signed with OAuth 1.0a user context (an app's
// consumer key and secret, and the posting account's access token and secret). The first post carries the
// cover, each next one its event's card.
import { createHmac, randomBytes } from "node:crypto";
import { credential } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import type { SocialKit } from "../../contracts.ts";
import { kitImage } from "../images.ts";
import { answer, clip, multipart, PublishError } from "./http.ts";

const API = "https://api.x.com/2";

function keys() {
  const consumerKey = credential("integrations", "X_API_KEY");
  const consumerSecret = credential("integrations", "X_API_SECRET");
  const token = credential("integrations", "X_ACCESS_TOKEN");
  const tokenSecret = credential("integrations", "X_ACCESS_SECRET");
  return consumerKey && consumerSecret && token && tokenSecret ? { consumerKey, consumerSecret, token, tokenSecret } : null;
}

export const xReady = () => keys() !== null;

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The Authorization header for a request whose body (JSON or multipart) is not part of the signature. */
export function oauthHeader(method: string, url: string, k: NonNullable<ReturnType<typeof keys>>, nonce = randomBytes(16).toString("hex"), timestamp = Math.floor(Date.now() / 1000)): string {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: k.consumerKey, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp), oauth_token: k.token, oauth_version: "1.0",
  };
  const params = [...Object.entries(oauth), ...u.searchParams.entries()].map(([a, b]) => [enc(a), enc(b)]).sort(([a, x], [b, y]) => (a === b ? (x! < y! ? -1 : 1) : a! < b! ? -1 : 1));
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(params.map(([a, b]) => `${a}=${b}`).join("&"))].join("&");
  oauth.oauth_signature = createHmac("sha1", `${enc(k.consumerSecret)}&${enc(k.tokenSecret)}`).update(base).digest("base64");
  return `OAuth ${Object.entries(oauth).map(([a, b]) => `${enc(a)}="${enc(b)}"`).join(", ")}`;
}

async function upload(png: Buffer, k: NonNullable<ReturnType<typeof keys>>): Promise<string> {
  const url = `${API}/media/upload`;
  const { body, contentType } = multipart([{ name: "media", file: png, filename: "image.png", type: "image/png" }, { name: "media_category", value: "tweet_image" }]);
  const res = await guardedFetch(url, { method: "POST", headers: { authorization: oauthHeader("POST", url, k), "content-type": contentType }, body, timeoutMs: 60_000, redirectPolicy: "same-origin" });
  const id = answer(res, "X media upload")?.data?.id;
  if (!id) throw new PublishError("X media upload: no media id in the answer");
  return String(id);
}

async function post(text: string, mediaId: string | null, replyTo: string | null, k: NonNullable<ReturnType<typeof keys>>): Promise<string> {
  const url = `${API}/tweets`;
  const payload = { text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}), ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}) };
  const res = await guardedFetch(url, {
    method: "POST", headers: { authorization: oauthHeader("POST", url, k), "content-type": "application/json" }, body: JSON.stringify(payload), timeoutMs: 30_000, redirectPolicy: "same-origin",
  });
  const id = answer(res, "X post")?.data?.id;
  if (!id) throw new PublishError("X post: no post id in the answer");
  return String(id);
}

export async function publishX(kit: SocialKit): Promise<{ url: string; remoteId: string; status: "published" }> {
  const k = keys();
  if (!k) throw new PublishError("X 的密钥没有配置（X_API_KEY、X_API_SECRET、X_ACCESS_TOKEN、X_ACCESS_SECRET）");
  const thread = kit.copy!.x.thread.map((t) => clip(t, 270)).filter(Boolean);
  if (!thread.length) throw new PublishError("X 文案为空");
  let first: string | null = null;
  let previous: string | null = null;
  for (const [i, text] of thread.entries()) {
    const image = i === 0 ? await kitImage(kit, "x-cover-landscape.png") : await kitImage(kit, `x-card-${i}.png`);
    const media = image ? await upload(image, k) : null;
    previous = await post(text, media, previous, k);
    first ??= previous;
  }
  return { url: `https://x.com/i/web/status/${first}`, remoteId: first!, status: "published" };
}
