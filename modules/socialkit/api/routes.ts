// /api/admin/socialkit/*: the kits, their images and publishing them, for the admin only.
import type { FastifyInstance } from "fastify";
import { audit } from "@aihot/backend/audit";
import { actorOf } from "@aihot/backend/admin/auth";
import { beijingDate } from "@aihot/contracts/time";
import { sendProblem } from "@aihot/api/http/respond";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { body, param, q } from "@aihot/api/routes/admin";
import { composeKit } from "../backend/compose.ts";
import { kitImage } from "../backend/images.ts";
import { imageSettings } from "../backend/imagegen.ts";
import { markPublished, publishers, publishKit, PublishRefused } from "../backend/publish/index.ts";
import { kitDates, kitFor } from "../backend/read.ts";
import type { SocialKitAdmin, SocialPlatform } from "../contracts.ts";

const PLATFORMS: SocialPlatform[] = ["xiaohongshu", "wechat", "weibo", "x"];
const platformOf = (value: unknown) => (PLATFORMS.includes(value as SocialPlatform) ? (value as SocialPlatform) : null);

export function registerSocialKit(app: FastifyInstance) {
  app.get("/api/admin/socialkit", adminHandler(async (req): Promise<SocialKitAdmin> => {
    const [kit, dates] = await Promise.all([kitFor(q(req).date ?? "latest"), kitDates()]);
    return { kit, dates, publishers: publishers(), imageModel: imageSettings()?.model ?? null };
  }));
  app.post("/api/admin/socialkit/compose", adminHandler(async (req, _reply, admin) => {
    const date = beijingDate(new Date());
    const result = await composeKit(date, { force: true });
    await audit(actorOf(admin), "socialkit.compose", `socialkit:${date}`, String(body(req).reason ?? "") || null, null, result, { requestId: String(req.headers["idempotency-key"] ?? "") });
    return result;
  }));
  app.post("/api/admin/socialkit/:date/publish", adminHandler(async (req, reply, admin) => {
    const platform = platformOf(body(req).platform);
    const kit = await kitFor(param(req, "date"));
    if (!platform || !kit) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "Not found." });
    try {
      return await publishKit(kit, platform, actorOf(admin));
    } catch (error) {
      if (error instanceof PublishRefused) return sendProblem(req, reply, { status: 409, code: "publish_refused", detail: error.message });
      throw error;
    }
  }));
  app.post("/api/admin/socialkit/:date/mark-published", adminHandler(async (req, reply, admin) => {
    const platform = platformOf(body(req).platform);
    const kit = await kitFor(param(req, "date"));
    if (!platform || !kit) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "Not found." });
    const url = typeof body(req).url === "string" && /^https?:\/\//.test(String(body(req).url)) ? String(body(req).url) : null;
    await markPublished(kit.date, platform, url, actorOf(admin));
    return { ok: true };
  }));
  app.get("/api/admin/socialkit/:date/:file", adminHandler(async (req, reply) => {
    const kit = await kitFor(param(req, "date"));
    const png = kit ? await kitImage(kit, param(req, "file")) : null;
    if (!png) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "Not found." });
    if (q(req).download !== undefined) reply.header("Content-Disposition", `attachment; filename="${kit!.date}-${param(req, "file")}"`);
    return reply.type("image/png").send(png);
  }));
}
