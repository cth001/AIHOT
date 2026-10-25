// The emails: an issue, and the confirmation a new subscriber gets. Inline styles and tables, which is what
// mail clients render; every issue carries its unsubscribe link and the List-Unsubscribe headers.
import { config } from "@aihot/backend/config";
import { escapeXml } from "@aihot/backend/lib/text";
import { SITE } from "@aihot/site";
import type { HotDailyEdition } from "../contracts.ts";
import { HOT_DAILY } from "../settings.ts";
import type { Mail } from "./mail.ts";

const e = escapeXml;
const INK = "#0e191b";
const MUTED = "#66757a";
const ACCENT = "#176b75";

export const unsubscribePage = (token: string) => `${config.siteUrl}/hot-daily/unsubscribe?token=${encodeURIComponent(token)}`;
const oneClick = (token: string) => `${config.siteUrl}/api/hotdaily/unsubscribe/one-click?token=${encodeURIComponent(token)}`;

function frame(body: string, footer: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f6f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f5;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:12px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:${INK};">
<tr><td style="padding:28px 28px 8px;">${body}</td></tr>
<tr><td style="padding:16px 28px 28px;font-size:12px;line-height:1.7;color:${MUTED};border-top:1px solid #e6eaea;">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export function editionMail(edition: HotDailyEdition, to: string, token: string): Mail {
  const issue = `${config.siteUrl}/hot-daily/${edition.date}`;
  const rows = edition.entries.map((x) => `
<tr><td style="padding:14px 0;border-bottom:1px solid #eef1f1;">
  <div style="font-size:12px;color:${ACCENT};font-weight:700;">No.${x.rank} · ${x.participantCount} 个来源参与</div>
  <a href="${e(`${config.siteUrl}/story/${x.storyPublicId}`)}" style="display:block;margin-top:4px;font-size:16px;line-height:1.5;font-weight:700;color:${INK};text-decoration:none;">${e(x.title)}</a>
  ${x.take ? `<div style="margin-top:6px;font-size:14px;line-height:1.7;color:${INK};">看点：${e(x.take)}</div>` : ""}
  ${x.summary ? `<div style="margin-top:6px;font-size:13.5px;line-height:1.75;color:#3a484c;">${e(x.summary)}</div>` : ""}
</td></tr>`).join("");
  const body = `
<div style="font-size:13px;color:${MUTED};">${e(HOT_DAILY.name)} · ${e(edition.date)}</div>
<h1 style="margin:8px 0 0;font-size:22px;line-height:1.4;">${e(edition.title)}</h1>
${edition.lead ? `<p style="margin:14px 0 0;font-size:14.5px;line-height:1.8;color:#3a484c;">${e(edition.lead)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${rows}</table>
<p style="margin:18px 0 0;"><a href="${e(issue)}" style="color:${ACCENT};font-size:14px;">在网站上阅读这一期 →</a></p>`;
  const footer = `你收到这封邮件，是因为 ${e(to)} 订阅了 ${e(HOT_DAILY.name)}。排序依据过去 48 小时内独立来源的报道和讨论热度，看点由 AI 撰写。<br>
<a href="${e(unsubscribePage(token))}" style="color:${MUTED};">退订</a> · <a href="${e(config.siteUrl)}" style="color:${MUTED};">${e(SITE.name)}</a>`;
  const text = [
    `${HOT_DAILY.name} · ${edition.date}`,
    edition.title,
    edition.lead ?? "",
    ...edition.entries.map((x) => `${x.rank}. ${x.title}\n${x.take ? `看点：${x.take}\n` : ""}${config.siteUrl}/story/${x.storyPublicId}`),
    `在网站上阅读：${issue}`,
    `退订：${unsubscribePage(token)}`,
  ].filter(Boolean).join("\n\n");
  return {
    to,
    subject: `${HOT_DAILY.name}｜${edition.title}`,
    html: frame(body, footer),
    text,
    headers: { "List-Unsubscribe": `<${oneClick(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export function confirmMail(to: string, token: string): Mail {
  const url = `${config.siteUrl}/hot-daily/confirm?token=${encodeURIComponent(token)}`;
  const body = `
<h1 style="margin:0;font-size:20px;">请确认订阅 ${e(HOT_DAILY.name)}</h1>
<p style="margin:14px 0 0;font-size:14.5px;line-height:1.8;">有人（希望是你）用这个邮箱订阅了 ${e(HOT_DAILY.name)}：每天 ${e(HOT_DAILY.time)} 前后，把过去 48 小时最热的 ${HOT_DAILY.entries} 件事发到你的邮箱。</p>
<p style="margin:20px 0;"><a href="${e(url)}" style="display:inline-block;padding:10px 22px;border-radius:8px;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">确认订阅</a></p>
<p style="margin:0;font-size:12.5px;line-height:1.7;color:${MUTED};">按钮打不开时，复制这个地址到浏览器：<br>${e(url)}</p>`;
  return {
    to,
    subject: `请确认订阅 ${HOT_DAILY.name}`,
    html: frame(body, `不是你本人订阅的话，忽略这封邮件即可，我们不会再发信给你。`),
    text: `有人用这个邮箱订阅了 ${HOT_DAILY.name}。确认订阅请打开：\n${url}\n\n不是你本人订阅的话，忽略这封邮件即可。`,
  };
}
