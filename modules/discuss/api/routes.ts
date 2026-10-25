// /api/discuss/*: the event page's discussions, read from what the worker stored.
import type { FastifyInstance } from "fastify";
import { sendJsonWithEtag, sendProblem } from "@aihot/api/http/respond";
import { storyDiscussion } from "../backend/read.ts";

export function registerDiscuss(app: FastifyInstance) {
  app.get("/api/discuss/stories/:publicId", async (req, reply) => {
    const found = await storyDiscussion((req.params as { publicId: string }).publicId);
    if (!found) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "Not found." });
    return sendJsonWithEtag(req, reply, found, { etagPrefix: "discuss", cacheControl: "public, max-age=60, stale-while-revalidate=300" });
  });
}
