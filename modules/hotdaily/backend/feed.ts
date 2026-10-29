// /hot-daily/feed.xml: the issues as RSS, a way to subscribe that needs no mail server. Each item carries the
// issue's events and its closing analysis, read like the page reads them (read.ts).
import { config } from "@aihot/backend/config";
import { escapeXml } from "@aihot/backend/lib/text";
import { SITE } from "@aihot/site";
import { HOT_DAILY } from "../settings.ts";
import { editionFor, editionIndex } from "./read.ts";

const ISSUES = 20;

export async function hotDailyFeed(): Promise<string> {
  const index = await editionIndex(ISSUES);
  const editions = (await Promise.all(index.map((i) => editionFor(i.date)))).filter((e) => e !== null);
  const e = escapeXml;
  const items = editions.map((ed) => {
    const link = `${config.siteUrl}/hot-daily/${ed.date}`;
    const a = ed.analysis;
    const html = [
      ed.lead ? `<p>${e(ed.lead)}</p>` : "",
      `<ol>${ed.entries.map((x) => `<li><a href="${e(`${config.siteUrl}/story/${x.storyPublicId}`)}">${e(x.title)}</a>${x.take ? `<br>看点：${e(x.take)}` : ""}</li>`).join("")}</ol>`,
      a?.summary ? `<h3>今日总结</h3><p>${e(a.summary)}</p>` : "",
      a?.market ? `<h3>市场影响</h3><p>${e(a.market)}</p>` : "",
      a?.stocks.length ? `<ul>${a.stocks.map((s) => `<li>${e(s.name)}（${e(s.ticker)}）${e(s.direction)}：${e(s.reason)}</li>`).join("")}</ul><p>以上分析由 AI 自动生成，仅供参考，不构成任何投资建议。</p>` : "",
    ].join("");
    return `<item><title>${e(ed.title)}</title><link>${e(link)}</link><guid isPermaLink="true">${e(link)}</guid><pubDate>${new Date(ed.composedAt).toUTCString()}</pubDate><description>${e(html)}</description></item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${e(HOT_DAILY.name)}</title><link>${e(`${config.siteUrl}/hot-daily`)}</link><description>${e(`${SITE.name} 每天按热度选出最受关注的 ${HOT_DAILY.entries} 件事，附总结与市场影响分析。`)}</description><language>${e(SITE.locale)}</language>${items.join("")}</channel></rss>`;
}
