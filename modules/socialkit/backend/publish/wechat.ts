// 微信公众号: the kit's article through the official API — the cover as permanent material, the event cards
// as body images, a draft, then publishing. Accounts whose API has no publishing right (often unverified
// subscription accounts) keep the draft: it waits in the 公众号 backend to be published by hand.
// The server's public IP must be on the account's IP whitelist (公众号后台 → 设置与开发 → 基本配置).
import { marked } from "marked";
import { config, credential } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { SITE } from "@aihot/site";
import type { SocialKit } from "../../contracts.ts";
import { kitImage } from "../images.ts";
import { answer, clip, multipart, PublishError } from "./http.ts";

const API = "https://api.weixin.qq.com/cgi-bin";

function app() {
  const appId = credential("integrations", "WECHAT_APP_ID");
  const secret = credential("integrations", "WECHAT_APP_SECRET");
  return appId && secret ? { appId, secret } : null;
}

export const wechatReady = () => app() !== null;

/** An API answer with errcode other than 0 is a refusal: errcode and errmsg say why. */
function ok(json: any, what: string) {
  if (json?.errcode && json.errcode !== 0) throw Object.assign(new PublishError(`${what}: ${json.errcode} ${json.errmsg ?? ""}`), { errcode: Number(json.errcode) });
  return json;
}

async function token(a: NonNullable<ReturnType<typeof app>>): Promise<string> {
  const res = await guardedFetch(`${API}/token?grant_type=client_credential&appid=${encodeURIComponent(a.appId)}&secret=${encodeURIComponent(a.secret)}`, { timeoutMs: 20_000, redirectPolicy: "same-origin" });
  const t = ok(answer(res, "公众号 access_token"), "公众号 access_token").access_token;
  if (!t) throw new PublishError("公众号 access_token: no token in the answer");
  return String(t);
}

async function uploadImage(path: string, png: Buffer, accessToken: string): Promise<any> {
  const { body, contentType } = multipart([{ name: "media", file: png, filename: "image.png", type: "image/png" }]);
  const res = await guardedFetch(`${API}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST", headers: { "content-type": contentType }, body, timeoutMs: 60_000, redirectPolicy: "same-origin",
  });
  return ok(answer(res, `公众号 ${path}`), `公众号 ${path}`);
}

async function postJson(path: string, payload: unknown, accessToken: string): Promise<any> {
  const res = await guardedFetch(`${API}${path}?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(payload), timeoutMs: 30_000, redirectPolicy: "same-origin",
  });
  return ok(answer(res, `公众号 ${path}`), `公众号 ${path}`);
}

/** The body as 公众号 HTML: the Markdown rendered, each event's card after its section heading. */
function articleHtml(markdown: string, cardUrls: string[]): string {
  let n = 0;
  const html = (marked.parse(markdown, { async: false }) as string).replace(/<\/h2>/g, (end) => {
    const url = cardUrls[n++];
    return url ? `${end}<p><img src="${url}" style="width:100%"/></p>` : end;
  });
  return `${html}<p style="color:#888;font-size:13px;">本文由 ${SITE.name} 根据当日热度日报自动生成，市场分析仅供参考，不构成任何投资建议。</p>`;
}

export async function publishWechat(kit: SocialKit): Promise<{ url: string | null; remoteId: string; status: "published" | "drafted"; note?: string }> {
  const a = app();
  if (!a) throw new PublishError("公众号没有配置（WECHAT_APP_ID、WECHAT_APP_SECRET）");
  const accessToken = await token(a);
  const copy = kit.copy!.wechat;
  const cover = await kitImage(kit, "wechat-cover-banner.png");
  if (!cover) throw new PublishError("没有公众号封面图");
  const thumb = await uploadImage("/material/add_material?type=image", cover, accessToken);
  const cardUrls: string[] = [];
  for (const item of kit.items) {
    const png = await kitImage(kit, `weibo-card-${item.rank}.png`);
    if (png) cardUrls.push(String((await uploadImage("/media/uploadimg", png, accessToken)).url));
  }
  const draft = await postJson("/draft/add", {
    articles: [{
      title: clip(copy.title, 32), author: SITE.name, digest: clip(copy.digest, 54), content: articleHtml(copy.body, cardUrls),
      content_source_url: `${config.siteUrl}/hot-daily/${kit.date}`, thumb_media_id: thumb.media_id, need_open_comment: 1, only_fans_can_comment: 0,
    }],
  }, accessToken);
  try {
    const published = await postJson("/freepublish/submit", { media_id: draft.media_id }, accessToken);
    return { url: null, remoteId: String(published.publish_id ?? draft.media_id), status: "published" };
  } catch (error) {
    // 48001: the account's API has no publishing right. The draft is there to publish by hand.
    if ((error as { errcode?: number }).errcode === 48001) return { url: null, remoteId: String(draft.media_id), status: "drafted", note: "账号没有接口发布权限，已存为草稿，请到公众号后台发布" };
    throw error;
  }
}
