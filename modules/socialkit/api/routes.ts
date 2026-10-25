// /api/admin/socialkit/*: the kits and their images, for the admin only.
import type { FastifyInstance } from "fastify";
import { audit } from "@aihot/backend/audit";
import { actorOf } from "@aihot/backend/admin/auth";
import { beijingDate } from "@aihot/contracts/time";
import { sendProblem } from "@aihot/api/http/respond";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { body, param, q } from "@aihot/api/routes/admin";
import { composeKit } from "../backend/compose.ts";
import { kitImage } from "../backend/images.ts";
import { kitDates, kitFor } from "../backend/read.ts";
import type { SocialKitAdmin } from "../contracts.ts";

export function registerSocialKit(app: FastifyInstance) {
  app.get("/api/admin/socialkit", adminHandler(async (req): Promise<SocialKitAdmin> => {
    const [kit, dates] = await Promise.all([kitFor(q(req).date ?? "latest"), kitDates()]);
    return { kit, dates };
  }));
  app.post("/api/admin/socialkit/compose", adminHandler(async (req, _reply, admin) => {
    const date = beijingDate(new Date());
    const result = await composeKit(date, { force: true });
    await audit(actorOf(admin), "socialkit.compose", `socialkit:${date}`, String(body(req).reason ?? "") || null, null, result, { requestId: String(req.headers["idempotency-key"] ?? "") });
    return result;
  }));
  app.get("/api/admin/socialkit/:date/:file", adminHandler(async (req, reply) => {
    const kit = await kitFor(param(req, "date"));
    const png = kit ? await kitImage(kit, param(req, "file")) : null;
    if (!png) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "Not found." });
    const download = q(req).download !== undefined;
    if (download) reply.header("Content-Disposition", `attachment; filename="${kit!.date}-${param(req, "file")}"`);
    return reply.type("image/png").send(png);
  }));
}
