// Publishing a reviewed kit, one platform at a time, from the admin. Nothing leaves unless
// SOCIAL_PUBLISH_ENABLED is true, like the engine's other outward valves; each platform also needs its own
// credentials. 小红书 has no posting API for accounts like this one: it is posted by hand and marked here.
// Every outcome is kept in socialkit_posts, and a published platform is not posted to again.
import { audit } from "@aihot/backend/audit";
import { sql } from "@aihot/backend/db";
import type { SocialKit, SocialPlatform } from "../../contracts.ts";
import { PublishError } from "./http.ts";
import { publishWechat, wechatReady } from "./wechat.ts";
import { publishWeibo, weiboReady } from "./weibo.ts";
import { publishX, xReady } from "./x.ts";

export const publishingEnabled = () => process.env.SOCIAL_PUBLISH_ENABLED === "true";

export function publishers(): Record<SocialPlatform, { ready: boolean; note: string }> {
  const valve = publishingEnabled();
  const state = (configured: boolean, missing: string) =>
    !configured ? { ready: false, note: `未配置 ${missing}` } : !valve ? { ready: false, note: "SOCIAL_PUBLISH_ENABLED 未打开" } : { ready: true, note: "可以发布" };
  return {
    x: state(xReady(), "X_API_KEY 等四项"),
    wechat: state(wechatReady(), "WECHAT_APP_ID、WECHAT_APP_SECRET"),
    weibo: state(weiboReady(), "WEIBO_ACCESS_TOKEN"),
    xiaohongshu: { ready: false, note: "没有发布接口，请下载素材手动发布" },
  };
}

const RUN = { x: publishX, wechat: publishWechat, weibo: publishWeibo } as const;

/** A publish refused before anything was sent: the admin shows the reason. */
export class PublishRefused extends Error {}

export async function publishKit(kit: SocialKit, platform: SocialPlatform, actor: string) {
  if (platform === "xiaohongshu") throw new PublishRefused("小红书没有发布接口，请下载素材手动发布，再点“标记已发布”");
  if (!kit.copy || !kit.cards) throw new PublishRefused("素材包还没生成完，不能发布");
  const state = publishers()[platform];
  if (!state.ready) throw new PublishRefused(`不能发布到这个平台：${state.note}`);
  // One publish per platform and day: a second click, or a published platform, is refused before any request.
  const [claimed] = await sql<{ status: string }[]>`
    INSERT INTO socialkit_posts (date, platform, status, actor) VALUES (${kit.date}, ${platform}, 'publishing', ${actor})
    ON CONFLICT (date, platform) DO UPDATE SET status = 'publishing', actor = EXCLUDED.actor, attempts = socialkit_posts.attempts + 1, error = NULL, updated_at = now()
      WHERE socialkit_posts.status IN ('failed', 'drafted') OR (socialkit_posts.status = 'publishing' AND socialkit_posts.updated_at < now() - interval '15 minutes')
    RETURNING status`;
  if (!claimed) throw new PublishRefused("这个平台已经发布过或正在发布");
  try {
    const result = await RUN[platform](kit);
    const note = "note" in result ? (result.note ?? null) : null;
    await sql`UPDATE socialkit_posts SET status = ${result.status}, url = ${result.url}, remote_id = ${result.remoteId}, error = ${note}, updated_at = now()
              WHERE date = ${kit.date} AND platform = ${platform}`;
    await audit(actor, "socialkit.publish", `socialkit:${kit.date}:${platform}`, null, null, { status: result.status, url: result.url, remoteId: result.remoteId });
    return { platform, status: result.status, url: result.url, note };
  } catch (error) {
    const message = (error instanceof PublishError ? error.message : `发布失败：${(error as Error).message}`).slice(0, 500);
    await sql`UPDATE socialkit_posts SET status = 'failed', error = ${message}, updated_at = now() WHERE date = ${kit.date} AND platform = ${platform}`;
    await audit(actor, "socialkit.publish_failed", `socialkit:${kit.date}:${platform}`, null, null, { error: message });
    throw new PublishRefused(message);
  }
}

/** 小红书 and anything posted by hand: recorded as published by the admin. */
export async function markPublished(date: string, platform: SocialPlatform, url: string | null, actor: string) {
  await sql`INSERT INTO socialkit_posts (date, platform, status, url, actor) VALUES (${date}, ${platform}, 'published', ${url}, ${actor})
            ON CONFLICT (date, platform) DO UPDATE SET status = 'published', url = EXCLUDED.url, actor = EXCLUDED.actor, error = NULL, updated_at = now()`;
  await audit(actor, "socialkit.mark_published", `socialkit:${date}:${platform}`, null, null, { url });
}
