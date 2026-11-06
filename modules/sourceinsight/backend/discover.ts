// Sources the site does not follow yet, found where its own sources point: the sites that the articles
// of the window link to, by how many articles cite them. A site already followed (by its listing address or
// the addresses its articles live at) and the usual non-sources (social networks, code hosts, shorteners)
// are left out. The probe looks a candidate's home page over for a feed the admin can add.
import * as cheerio from "cheerio";
import { sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import type { CandidateReport, FeedProbe } from "../contracts.ts";

/** Articles read per report: the newest of the window. */
const ARTICLES = 3000;
const SHOWN = 40;

/** Linked everywhere, and not news sources: social networks, video, code hosts, shorteners, stores, reference. */
const NOT_SOURCES = new Set([
  "x.com", "twitter.com", "t.co", "facebook.com", "instagram.com", "linkedin.com", "threads.net", "bsky.app", "reddit.com", "news.ycombinator.com",
  "youtube.com", "youtu.be", "vimeo.com", "tiktok.com", "bilibili.com", "weibo.com", "zhihu.com", "mp.weixin.qq.com", "xiaohongshu.com",
  "github.com", "gitlab.com", "huggingface.co", "arxiv.org", "doi.org", "wikipedia.org", "bit.ly", "goo.gl", "lnkd.in", "buff.ly",
  "apps.apple.com", "play.google.com", "amazon.com", "google.com", "docs.google.com", "drive.google.com", "discord.gg", "discord.com", "t.me",
]);

export function domainOf(url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** A domain or any of its parents is in the set (blog.example.com is example.com's). */
const within = (domain: string, set: Set<string>) => {
  const parts = domain.split(".");
  return parts.some((_, i) => i < parts.length - 1 && set.has(parts.slice(i).join(".")));
};

export async function candidateSources(days: number): Promise<CandidateReport> {
  const since = new Date(Date.now() - days * 86400_000);
  const [sources, articles] = await Promise.all([
    sql<{ id: string; name: string; config: Record<string, any> }[]>`SELECT id, name, config FROM sources`,
    sql<{ source_id: string; url: string; body_html: string }[]>`
      SELECT a.source_id, a.url, a.body_html FROM articles a JOIN sources s ON s.id = a.source_id
      WHERE a.discovered_at > ${since} AND a.body_html IS NOT NULL AND s.participation_mode = 'editorial'
      ORDER BY a.discovered_at DESC LIMIT ${ARTICLES}`,
  ]);
  const followed = new Set<string>();
  for (const s of sources) for (const address of [s.config?.feedUrl, s.config?.url]) {
    const d = typeof address === "string" ? domainOf(address.replace(/^https:\/\/r\.jina\.ai\//, "")) : null;
    if (d) followed.add(d);
  }
  const names = new Map(sources.map((s) => [s.id, s.name]));
  // The addresses a source's own articles live at count as followed too (a feed served from another host).
  for (const a of articles) {
    const d = domainOf(a.url);
    if (d) followed.add(d);
  }
  const found = new Map<string, { articles: Set<string>; sources: Set<string>; examples: Set<string> }>();
  for (const a of articles) {
    const own = domainOf(a.url);
    const $ = cheerio.load(a.body_html);
    const seen = new Set<string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const d = domainOf(href);
      if (!d || d === own || seen.has(d) || within(d, followed) || within(d, NOT_SOURCES) || NOT_SOURCES.has(d)) return;
      seen.add(d);
      const entry = found.get(d) ?? { articles: new Set(), sources: new Set(), examples: new Set() };
      entry.articles.add(a.url);
      entry.sources.add(names.get(a.source_id) ?? a.source_id);
      if (entry.examples.size < 3) entry.examples.add(href);
      found.set(d, entry);
    });
  }
  const candidates = [...found]
    .map(([domain, e]) => ({ domain, citations: e.articles.size, citedBy: [...e.sources].slice(0, 6), examples: [...e.examples] }))
    // One citing source is noise more often than not; a site several sources point to is worth a look.
    .filter((c) => c.citations >= 2)
    .sort((a, b) => b.citedBy.length - a.citedBy.length || b.citations - a.citations || a.domain.localeCompare(b.domain))
    .slice(0, SHOWN);
  return { days, articles: articles.length, candidates };
}

const COMMON_FEEDS = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/blog/feed", "/blog/rss.xml", "/news/rss.xml"];

async function feedAt(url: string): Promise<FeedProbe | null> {
  try {
    const res = await guardedFetch(url, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5" }, timeoutMs: 12_000, maxBytes: 4 * 1024 * 1024 });
    if (res.status !== 200) return null;
    const text = res.text();
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 2000))) return null;
    const items = (text.match(/<item[\s>]/g) ?? []).length + (text.match(/<entry[\s>]/g) ?? []).length;
    const dates = [...text.matchAll(/<(?:pubDate|updated|published|dc:date)>([^<]+)</g)].map((m) => Date.parse(m[1]!.trim())).filter(Number.isFinite);
    return items ? { url: res.url, items, newest: dates.length ? new Date(Math.max(...dates)).toISOString() : null } : null;
  } catch {
    return null;
  }
}

/** The feeds a site offers: those its home page declares, else the usual addresses. */
export async function probeFeeds(domain: string): Promise<FeedProbe[]> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return [];
  const home = `https://${domain}/`;
  const declared: string[] = [];
  try {
    const res = await guardedFetch(home, { timeoutMs: 12_000, maxBytes: 4 * 1024 * 1024 });
    const $ = cheerio.load(res.text());
    $('link[rel="alternate"]').each((_, el) => {
      const type = ($(el).attr("type") ?? "").toLowerCase();
      const href = $(el).attr("href");
      if (href && /rss|atom/.test(type)) declared.push(new URL(href, res.url).toString());
    });
  } catch {
    // The home page is unreachable: the usual addresses may still answer.
  }
  const tries = [...new Set([...declared, ...COMMON_FEEDS.map((p) => new URL(p, home).toString())])].slice(0, 12);
  const found: FeedProbe[] = [];
  for (const url of tries) {
    const feed = await feedAt(url);
    if (feed && !found.some((f) => f.url === feed.url)) found.push(feed);
    if (found.length >= 3) break;
  }
  return found;
}
