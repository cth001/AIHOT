// 微博: one post with the kit's square cover through the open platform's statuses/share. That API takes at
// most 140 characters, no #话题# and must link a page of the app's own bound domain, so the post is the
// copy's opening, clipped, and the issue's link on this site (the site's domain must be the app's bound one).
// WEIBO_ACCESS_TOKEN is the posting account's OAuth token for an approved app.
import { config, credential } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import type { SocialKit } from "../../contracts.ts";
import { kitImage } from "../images.ts";
import { answer, clip, multipart, PublishError } from "./http.ts";

export const weiboReady = () => credential("integrations", "WEIBO_ACCESS_TOKEN") !== null;

/** The copy as share.json takes it: no #话题#, clipped, and the issue's link. */
export function weiboStatus(text: string, link: string): string {
  const plain = text.replace(/#[^#\n]{1,40}#/g, "").replace(/\s+/g, " ").trim();
  return `${clip(plain, 140 - [...link].length - 1)} ${link}`;
}

export async function publishWeibo(kit: SocialKit): Promise<{ url: string; remoteId: string; status: "published" }> {
  const token = credential("integrations", "WEIBO_ACCESS_TOKEN");
  if (!token) throw new PublishError("微博没有配置（WEIBO_ACCESS_TOKEN）");
  const pic = await kitImage(kit, "weibo-cover-square.png");
  const status = weiboStatus(kit.copy!.weibo.text, `${config.siteUrl}/hot-daily/${kit.date}`);
  const { body, contentType } = multipart([
    { name: "access_token", value: token },
    { name: "status", value: status },
    ...(pic ? [{ name: "pic", file: pic, filename: "cover.png", type: "image/png" }] : []),
  ]);
  const res = await guardedFetch("https://api.weibo.com/2/statuses/share.json", { method: "POST", headers: { "content-type": contentType }, body, timeoutMs: 60_000, redirectPolicy: "same-origin" });
  const json = answer(res, "微博");
  if (json.error_code) throw new PublishError(`微博: ${json.error_code} ${json.error ?? ""}`);
  const id = String(json.idstr ?? json.id ?? "");
  const uid = json.user?.idstr ?? json.user?.id;
  return { url: uid && id ? `https://weibo.com/${uid}/${id}` : "https://weibo.com", remoteId: id, status: "published" };
}
