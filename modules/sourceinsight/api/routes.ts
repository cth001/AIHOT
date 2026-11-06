// /api/admin/sourceinsight/*: the sources' output, candidate sources and probing a candidate for a feed.
import type { FastifyInstance } from "fastify";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { q } from "@aihot/api/routes/admin";
import { candidateSources, probeFeeds } from "../backend/discover.ts";
import { sourceOutput, WINDOWS } from "../backend/report.ts";

const daysOf = (value: string | undefined) => (WINDOWS.includes(Number(value) as never) ? Number(value) : 7);

export function registerSourceInsight(app: FastifyInstance) {
  app.get("/api/admin/sourceinsight/output", adminHandler(async (req) => sourceOutput(daysOf(q(req).days))));
  app.get("/api/admin/sourceinsight/candidates", adminHandler(async (req) => candidateSources(daysOf(q(req).days))));
  app.get("/api/admin/sourceinsight/probe", adminHandler(async (req) => ({ feeds: await probeFeeds(String(q(req).domain ?? "").toLowerCase()) })));
}
