// /api/hotdaily/*: the issues, subscribing and unsubscribing; /api/admin/hotdaily/*: the admin page.
import type { FastifyInstance } from "fastify";
import { audit } from "@aihot/backend/audit";
import { actorOf } from "@aihot/backend/admin/auth";
import { beijingDate } from "@aihot/contracts/time";
import { clientIp, sendJsonWithEtag, sendProblem } from "@aihot/api/http/respond";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { body, orNotFound, page, param, q } from "@aihot/api/routes/admin";
import { hotdailyAdmin } from "../backend/admin.ts";
import { composeHotDaily } from "../backend/compose.ts";
import { deliverEdition, sendTest } from "../backend/deliver.ts";
import { sendingEnabled } from "../backend/mail.ts";
import { editionFor, editionIndex } from "../backend/read.ts";
import { confirm, eraseSubscriber, normalEmail, subscribe, SubscribeRejected, unsubscribe } from "../backend/subscribers.ts";
import type { HotDailyPage } from "../contracts.ts";

const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";

export function registerHotDaily(app: FastifyInstance) {
  app.get("/api/hotdaily/editions/:date", async (req, reply) => {
    const [edition, index] = await Promise.all([editionFor(param(req, "date")), editionIndex()]);
    if (!edition && param(req, "date") !== "latest") return sendProblem(req, reply, { status: 404, code: "not_found", detail: "Not found." });
    const answer: HotDailyPage = { edition, index, subscribe: sendingEnabled() };
    return sendJsonWithEtag(req, reply, answer, { etagPrefix: "hotdaily", cacheControl: PUBLIC_CACHE });
  });

  app.post("/api/hotdaily/subscribe", async (req, reply) => {
    const b = body<{ email?: string; website?: string }>(req);
    try {
      await subscribe({ email: b.email, trap: b.website, ip: clientIp(req) });
      return reply.header("Cache-Control", "no-store").code(202).send({ ok: true });
    } catch (error) {
      if (error instanceof SubscribeRejected) return sendProblem(req, reply, { status: error.status, code: error.code, detail: error.message, retryAfter: error.retryAfter });
      req.log.error({ err: error }, "hotdaily subscribe failed");
      return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "暂时发不出确认邮件，请稍后再试。", retryAfter: 60 });
    }
  });

  app.post("/api/hotdaily/confirm", async (req, reply) => {
    const ok = await confirm(body<{ token?: string }>(req).token);
    return reply.header("Cache-Control", "no-store").code(ok ? 200 : 404).send({ ok });
  });

  app.post("/api/hotdaily/unsubscribe", async (req, reply) => {
    const ok = await unsubscribe(body<{ token?: string }>(req).token);
    return reply.header("Cache-Control", "no-store").code(ok ? 200 : 404).send({ ok });
  });

  // RFC 8058 one-click unsubscribe from the mail client: a form POST to the List-Unsubscribe address.
  app.register(async (form) => {
    form.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 1024 }, (_req, raw, done) => done(null, raw));
    form.post("/api/hotdaily/unsubscribe/one-click", async (req, reply) => {
      await unsubscribe(q(req).token);
      return reply.header("Cache-Control", "no-store").code(200).send({ ok: true });
    });
  });

  // Admin
  app.get("/api/admin/hotdaily", adminHandler(async (req) => hotdailyAdmin({ page: page(req), q: q(req).q })));
  app.post("/api/admin/hotdaily/compose", adminHandler(async (req, _reply, admin) => {
    const date = beijingDate(new Date());
    const result = await composeHotDaily(date, { force: true });
    await audit(actorOf(admin), "hotdaily.compose", `hotdaily:${date}`, String(body(req).reason ?? "") || null, null, result, { requestId: String(req.headers["idempotency-key"] ?? "") });
    return result;
  }));
  app.post("/api/admin/hotdaily/deliver", adminHandler(async () => deliverEdition(beijingDate(new Date()))));
  app.post("/api/admin/hotdaily/test", adminHandler(async (req, reply) => {
    const to = normalEmail(body(req).email);
    if (!to) return sendProblem(req, reply, { status: 400, code: "invalid_email", detail: "请填写有效的邮箱地址。" });
    if (!sendingEnabled()) return sendProblem(req, reply, { status: 409, code: "sending_off", detail: "邮件发送没有打开：需要 SMTP_* 设置和 EMAIL_SEND_ENABLED=true。" });
    return sendTest(to);
  }));
  app.post("/api/admin/hotdaily/subscribers/:id/erase", adminHandler(async (req, reply, admin) => {
    const id = Number(param(req, "id"));
    const erased = await eraseSubscriber(id);
    if (erased) await audit(actorOf(admin), "hotdaily.erase_subscriber", `hotdaily-subscriber:${id}`, String(body(req).reason ?? "") || null, null, null);
    return orNotFound(req, reply, erased ? { ok: true } : null);
  }));
}
