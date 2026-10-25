// Where a report is discussed, and its top comments: Hacker News (Algolia search to find the thread by the
// report's address, the official API for comments in HN's own ranking) and Reddit (posts linking to the
// address, comments sorted by top). Both are free public APIs; Reddit uses an app's OAuth token when
// REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are set, which Reddit expects from servers.
import { credential } from "@aihot/backend/config";
import { guardedFetch, requireOk } from "@aihot/backend/lib/http-fetch";
import { decodeEntities, stripTagMarkup } from "@aihot/backend/lib/text";
import type { Platform } from "../contracts.ts";


export interface FoundThread {
  platform: Platform;
  externalId: string;
  url: string;
  title: string;
  community: string | null;
  points: number;
  commentCount: number;
  postedAt: Date | null;
}

export interface FoundComment {
  externalId: string;
  author: string | null;
  body: string;
  score: number | null;
  replies: number;
  postedAt: Date | null;
}

/** Comments kept per thread, in the platform's order. */
export const COMMENTS_PER_THREAD = 8;
/** Threads with fewer comments than this are not worth showing. */
export const MIN_COMMENTS = 3;
const MAX_BODY = 1200;

const TRACKING = /^(utm_[a-z]+|ref|ref_src|source|fbclid|gclid|mc_[a-z]+|cmpid|guccounter)$/i;

/** The same page however it is linked: no scheme, www., fragment, tracking parameters or trailing slash. */
export function sameAddress(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  const query = u.searchParams.toString();
  return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${query ? `?${query}` : ""}`;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = requireOk(await guardedFetch(url, { headers: { accept: "application/json", ...headers }, timeoutMs: 15_000, maxBytes: 4 * 1024 * 1024 }), url);
  return JSON.parse(res.text());
}

function plain(html: string): string {
  return decodeEntities(stripTagMarkup(html.replace(/<p>/gi, "\n\n"), "")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_BODY);
}

// Hacker News

export async function hnThreads(articleUrl: string): Promise<FoundThread[]> {
  const want = sameAddress(articleUrl);
  if (!want) return [];
  const data = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(articleUrl)}&restrictSearchableAttributes=url&tags=story&hitsPerPage=10`);
  return (data.hits ?? [])
    .filter((h: any) => h.url && sameAddress(h.url) === want && (h.num_comments ?? 0) >= MIN_COMMENTS)
    .map((h: any): FoundThread => ({
      platform: "hn",
      externalId: String(h.objectID),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: String(h.title ?? ""),
      community: null,
      points: Number(h.points ?? 0),
      commentCount: Number(h.num_comments ?? 0),
      postedAt: h.created_at ? new Date(h.created_at) : null,
    }));
}

const HN_ITEM = (id: string | number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

export async function hnComments(threadId: string): Promise<FoundComment[]> {
  const story = await getJson(HN_ITEM(threadId));
  // `kids` is in HN's ranking order; a few spare ids cover deleted and flagged comments.
  const kids: number[] = (story?.kids ?? []).slice(0, COMMENTS_PER_THREAD + 4);
  const items = await Promise.all(kids.map((id) => getJson(HN_ITEM(id)).catch(() => null)));
  return items
    .filter((c) => c && !c.deleted && !c.dead && c.text)
    .slice(0, COMMENTS_PER_THREAD)
    .map((c): FoundComment => ({
      externalId: String(c.id),
      author: c.by ?? null,
      body: plain(String(c.text)),
      score: null,
      replies: (c.kids ?? []).length,
      postedAt: c.time ? new Date(c.time * 1000) : null,
    }))
    .filter((c) => c.body.length > 0);
}

// Reddit

let token: { value: string; until: number } | null = null;

async function redditAuth(): Promise<{ base: string; headers: Record<string, string> }> {
  const id = credential("collectors", "REDDIT_CLIENT_ID");
  const secret = credential("collectors", "REDDIT_CLIENT_SECRET");
  if (!id || !secret) return { base: "https://www.reddit.com", headers: {} };
  if (!token || token.until < Date.now() + 60_000) {
    const res = requireOk(await guardedFetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      timeoutMs: 15_000,
    }), "reddit token");
    const body = JSON.parse(res.text());
    token = { value: String(body.access_token), until: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  }
  return { base: "https://oauth.reddit.com", headers: { authorization: `Bearer ${token.value}` } };
}

export async function redditThreads(articleUrl: string): Promise<FoundThread[]> {
  const { base, headers } = await redditAuth();
  const data = await getJson(`${base}/api/info${base.includes("oauth") ? "" : ".json"}?url=${encodeURIComponent(articleUrl)}&limit=25&raw_json=1`, headers);
  return (data?.data?.children ?? [])
    .map((c: any) => c.data)
    .filter((p: any) => p && !p.over_18 && !p.removed_by_category && (p.num_comments ?? 0) >= MIN_COMMENTS)
    .sort((a: any, b: any) => b.num_comments - a.num_comments)
    .slice(0, 3)
    .map((p: any): FoundThread => ({
      platform: "reddit",
      externalId: String(p.id),
      url: `https://www.reddit.com${p.permalink}`,
      title: String(p.title ?? ""),
      community: p.subreddit ? `r/${p.subreddit}` : null,
      points: Number(p.score ?? 0),
      commentCount: Number(p.num_comments ?? 0),
      postedAt: p.created_utc ? new Date(p.created_utc * 1000) : null,
    }));
}

export async function redditComments(threadId: string): Promise<FoundComment[]> {
  const { base, headers } = await redditAuth();
  const data = await getJson(`${base}/comments/${encodeURIComponent(threadId)}${base.includes("oauth") ? "" : ".json"}?sort=top&limit=${COMMENTS_PER_THREAD + 6}&depth=1&raw_json=1`, headers);
  const listing = Array.isArray(data) ? data[1] : null;
  return (listing?.data?.children ?? [])
    .filter((c: any) => c.kind === "t1")
    .map((c: any) => c.data)
    .filter((c: any) => !c.stickied && !c.distinguished && c.body && !/^\[(deleted|removed)\]$/.test(c.body) && c.author !== "AutoModerator")
    .slice(0, COMMENTS_PER_THREAD)
    .map((c: any): FoundComment => ({
      externalId: String(c.id),
      author: c.author && c.author !== "[deleted]" ? c.author : null,
      body: String(c.body).replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_BODY),
      score: typeof c.score === "number" ? c.score : null,
      replies: c.replies?.data?.children?.length ?? 0,
      postedAt: c.created_utc ? new Date(c.created_utc * 1000) : null,
    }));
}

export const PLATFORMS: Record<Platform, { threads: (url: string) => Promise<FoundThread[]>; comments: (id: string) => Promise<FoundComment[]> }> = {
  hn: { threads: hnThreads, comments: hnComments },
  reddit: { threads: redditThreads, comments: redditComments },
};
